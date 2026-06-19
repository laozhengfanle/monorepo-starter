/**
 * GraphQL Module（应用级）
 *
 * 职责：
 * - 挂载 Apollo Server 驱动（Code-First 模式：装饰器自动生成 schema.gql）
 * - 注入全局安全策略：查询深度限制 + 别名上限 + 复杂度分析 + 内省控制 + 字段建议屏蔽
 * - 把 Express 的 req / res 透传到 GraphQL context，确保 JWT Guard 能读取 token
 *
 * 关键安全设计（参考 docs/安全防护.md 第 4-6 项 + 第 18 项）：
 * 1. validationRules: depthLimit(7) 防深层嵌套 DoS；createComplexityLimitRule(1000) 防宽查询 DoS
 * 2. introspection + graphiql: 生产环境关闭，避免攻击者通过内省反推 schema
 * 3. bodyParserConfig: false: 禁用 Apollo 自带 body parser，由 main.ts 的 express.json() + sanitizeObject 中间件统一接管（原型链污染防护 + 1MB 限制）
 * 4. formatError: 生产环境脱敏，禁止 "Did you mean ..." 字段建议泄露
 * 5. context 超时：单次 GraphQL 请求超过 30 秒主动抛错，防止长时间占用数据库连接
 */
import { Module, Logger } from '@nestjs/common';
import { GraphQLModule as NestGraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import depthLimit from 'graphql-depth-limit';
import { GraphQLError, type ASTVisitor, type ValidationContext } from 'graphql';
import { calculateComplexity } from '../../common/utils/graphql-complexity.js';
import { JsonScalar } from '../../common/scalars/json.scalar.js';
import { buildDataLoaders, type DataLoaders } from '../../common/dataloader/index.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/** GraphQL 单次请求超时时间：30 秒（与 docs/安全防护.md 第 18 项一致） */
const GRAPHQL_QUERY_TIMEOUT_MS = 30_000;

/** 最大查询深度（公共 API 3-5 层，内部 API 5-7 层，管理端 7-10 层） */
const MAX_QUERY_DEPTH = 7;

/** 最大查询复杂度（基于字段数量，每个字段计 1） */
const MAX_QUERY_COMPLEXITY = 1000;

/** 最大别名数量：防攻击者用大量别名绕过深度限制（如 batch 攻击） */
const MAX_ALIASES = 50;

/**
 * 自定义验证规则：限制查询中的别名数量
 * - 攻击者可通过大量别名（如 { a1: field, a2: field, ... }）绕过深度限制
 * - 限制单次查询中所有别名的总数
 */
function maxAliasesLimitRule(maxAliases: number) {
    return (context: ValidationContext): ASTVisitor => {
        let aliasCount = 0;
        return {
            Field(node) {
                if (node.alias) {
                    aliasCount++;
                    if (aliasCount > maxAliases) {
                        context.reportError(
                            new GraphQLError(`Too many aliases: ${aliasCount}. Maximum: ${maxAliases}.`, {
                                extensions: { code: '10999' },
                            }),
                        );
                    }
                }
            },
        };
    };
}

@Module({
    imports: [
        NestGraphQLModule.forRootAsync<ApolloDriverConfig>({
            driver: ApolloDriver,
            useFactory: (configService: ConfigService, prisma: PrismaService) => {
                const logger = new Logger('GraphQLModule');
                /** 是否生产环境 — 用来关闭 introspection / graphiql / 字段建议 */
                const isProduction = configService.get('NODE_ENV') === 'production';

                return {
                    /**
                     * 自动生成 schema.gql 到 graphql 目录，方便 review 时直接看完整 schema
                     * - 放在 apps/server/graphql/ 目录，和 src/ 源码分离
                     * - 这个文件是自动生成的，不要手动编辑
                     */
                    autoSchemaFile: join(process.cwd(), 'graphql/schema.gql'),
                    /** 排序：让生成的 schema 字段按字母序排列，便于 review */
                    sortSchema: true,
                    /**
                     * JsonScalar 自动发现：
                     * - JsonScalar（common/scalars/json.scalar.ts）已在下面 providers 列表中注册
                     * - ScalarsExplorerService.getScalarsMap() 会从所有 module 的 providers 中
                     *   扫描带 @Scalar 装饰器的 class，自动包装为 GraphQLScalarType
                     * - 所以这里不需要在 buildSchemaOptions.scalarsMap 手动指定
                     *   （之前手动指定是错的：scalar 字段需要 GraphQLScalarType 实例，不是 class）
                     */
                    /** 开发环境开启 GraphiQL；生产环境关闭（离线可用，无 CDN 依赖） */
                    graphiql: !isProduction,
                    /** 开发环境允许内省；生产环境关闭 */
                    introspection: !isProduction,
                    /**
                     * 禁用 Apollo 自带 body parser
                     * - express.json() 已在 main.ts 解析 body，sanitizeObject 已清理危险键
                     * - 显式声明 > 依赖 Apollo 的"检测到 req.body 已有值就跳过"隐式行为
                     * - 如果中间件顺序出问题导致 req.body 未设置，Apollo 会直接报错而非静默
                     *   fallback 到自己的 parser（无 sanitize），Fail loud > Fail silent
                     */
                    bodyParserConfig: false,
                    /**
                     * 注入 req / res 到 GraphQL context
                     * - JWT Guard 通过 context.req.user 读取账户信息
                     * - 错误响应需要 context.res 设置 HTTP 状态码
                     * - 给 req 补一个 logIn 方法（passport-jwt 需要）
                     */
                    context: ({ req, res }) => {
                        /**
                         * 单次请求超时控制
                         * - 使用 AbortController 在 30 秒后中断请求
                         * - Apollo Server 4 支持 requestDidStart 插件方式，
                         *   但在 NestJS 集成中通过 context 传递 signal 更简单
                         * - resolver 中可通过 context.abortSignal.aborted 检查
                         */
                        const abortController = new AbortController();
                        const timeout = setTimeout(() => {
                            logger.error('GraphQL query timeout, aborting');
                            abortController.abort();
                        }, GRAPHQL_QUERY_TIMEOUT_MS);

                        /**
                         * 资源清理：把 abortController 挂到 req 上
                         * - 由下方 Apollo 插件的 willSendResponse / response 钩子统一清理
                         * - 不再依赖 res.on('close')（不可靠：res 可能为 undefined / on 不存在 / 提前触发）
                         * - 同时把 dataloaders 引用挂到 req 上，钩子里能拿到做兜底清空
                         */
                        type RequestWithCleanup = {
                            __gqlCleanup?: {
                                timeout: NodeJS.Timeout;
                                abortController: AbortController;
                                dataloaders: DataLoaders;
                            };
                        };
                        const reqWithCleanup = req as RequestWithCleanup;
                        reqWithCleanup.__gqlCleanup = {
                            timeout,
                            abortController,
                            dataloaders: buildDataLoaders(prisma),
                        };

                        /**
                         * 兼容 passport-jwt
                         * - passport-jwt 内部会调用 req.logIn(user) 完成 session 登录
                         * - GraphQL context 的 req 缺少这个方法（未走 passport 中间件）
                         * - 我们补一个 noop，避免 passport 抛 "Cannot read properties of undefined (reading 'logIn')"
                         * - 我们用 JWT Strategy 即可，不需要 session 持久化
                         */
                        if (req && typeof (req as { logIn?: unknown }).logIn !== 'function') {
                            (req as { logIn?: unknown }).logIn = (_user: unknown, cb?: (err: Error | null) => void) => {
                                /** session-less：无操作，直接回调成功 */
                                cb?.(null);
                            };
                        }

                        return {
                            req,
                            res,
                            abortSignal: abortController.signal,
                            dataloaders: reqWithCleanup.__gqlCleanup.dataloaders,
                        };
                    },
                    /**
                     * 错误格式化
                     * - 把所有 GraphQLError 转换为统一的 { message, extensions: { code, fields } } 结构
                     * - 业务错误码由 GraphQLExceptionFilter 写入 extensions.code
                     * - 字段级验证错误（ZodArgsPipe 抛出的）写入 extensions.fields
                     * - 默认兜底 10999（GraphQL 内部错误）
                     */
                    formatError: (error) => {
                        const original = error.extensions ?? {};
                        let message = error.message;

                        /**
                         * 生产环境脱敏（安全防护.md 第 6 项）：
                         * - 屏蔽 "Did you mean ..." 字段建议，防止攻击者通过建议反推 schema
                         * - 屏蔽语法错误详情，防止泄露内部结构
                         */
                        if (isProduction) {
                            if (message.includes('Did you mean')) {
                                message = 'Field not found';
                            }
                            // 屏蔽 GraphQL 语法错误详情
                            if (error.locations && error.locations.length > 0) {
                                message = 'Invalid query';
                            }
                        }

                        return {
                            message,
                            extensions: {
                                code: typeof original['code'] === 'string' ? original['code'] : '10999',
                                fields: original['fields'] ?? null,
                            },
                        };
                    },
                    /**
                     * 查询验证规则
                     * - depthLimit: 限制嵌套层数（7 层封顶，防 10 层 × 10 节点 = 100 亿次操作）
                     * - createComplexityRule: 限制单次查询的"成本"
                     *   - scalarCost: 标量字段成本
                     *   - objectCost: 对象字段基础成本
                     *   - listFactor: 列表字段乘数
                     */
                    /**
                     * 查询验证规则
                     * - depthLimit: 限制嵌套层数（7 层封顶，防 10 层 × 10 节点 = 100 亿次操作）
                     *
                     * 注意：createComplexityRule 不能作为 validationRules 使用！
                     * - graphql-query-complexity 的 createComplexityRule 在 validation 阶段
                     *   会调用 getVariableValues()，但此时 variables 尚未传入，
                     *   导致必填变量报 "was not provided" 错误
                     * - 改用 plugins 方式在 didResolveOperation 钩子中计算复杂度（见下方 plugins）
                     */
                    validationRules: [depthLimit(MAX_QUERY_DEPTH), maxAliasesLimitRule(MAX_ALIASES)],

                    /**
                     * Apollo Server 插件
                     * - 复杂度检查插件：在 didResolveOperation 钩子中计算查询复杂度
                     *   此时 variables 已经可用，可以正确估算列表字段等依赖变量的复杂度
                     * - 使用自定义 calculateComplexity 替代 graphql-query-complexity，
                     *   避免 pnpm 严格模式下的 graphql 实例冲突
                     */
                    plugins: [
                        {
                            async requestDidStart() {
                                return {
                                    /**
                                     * 复杂度检查：在 didResolveOperation 钩子中计算查询复杂度
                                     * - 此时 variables 已经可用，可以正确估算列表字段等依赖变量的复杂度
                                     * - 使用自定义 calculateComplexity 替代 graphql-query-complexity，
                                     *   避免 pnpm 严格模式下的 graphql 实例冲突
                                     */
                                    async didResolveOperation(requestContext) {
                                        const complexity = calculateComplexity(
                                            requestContext.schema,
                                            requestContext.document,
                                        );
                                        if (complexity > MAX_QUERY_COMPLEXITY) {
                                            throw new GraphQLError(
                                                `Query is too complex: ${complexity}. Maximum allowed complexity: ${MAX_QUERY_COMPLEXITY}.`,
                                                { extensions: { code: '10999' } },
                                            );
                                        }
                                    },
                                    /**
                                     * 资源清理兜底：在 willSendResponse 钩子中清理 timeout + abortController
                                     * - 这是 Apollo Server 4 的可靠生命周期钩子（每个请求都触发）
                                     * - 之前依赖 res.on('close') 在异常路径下不可靠（res 可能为 undefined）
                                     * - 通过 req.__gqlCleanup 拿到 context 创建时的引用，做幂等清理
                                     * - 幂等：用 clearTimeout 内部检查句柄是否有效，重复调用安全
                                     */
                                    async willSendResponse(requestContext) {
                                        const ctxReq = requestContext.contextValue?.req;
                                        const cleanup = ctxReq?.__gqlCleanup;
                                        if (cleanup) {
                                            clearTimeout(cleanup.timeout);
                                            // 标记 abortController 为已完成（即使 abort 已被调用也无副作用）
                                            if (!cleanup.abortController.signal.aborted) {
                                                cleanup.abortController.abort();
                                            }
                                            // 释放 req 上的引用，让 GC 回收 DataLoader / setTimeout
                                            ctxReq!.__gqlCleanup = undefined;
                                        }
                                    },
                                };
                            },
                        },
                    ],
                };
            },
            inject: [ConfigService, PrismaService],
        }),
    ],
    /** 自定义 Scalar 提供者：注册 JSON scalar（用于系统配置的 value 字段） */
    providers: [JsonScalar],
})
export class GraphQLModule {}
