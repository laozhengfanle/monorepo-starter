/**
 * 系统配置 API
 *
 * 接口拆分：
 *   - GraphQL：配置列表查询、单条更新、批量更新
 *
 * 后端路由对照：
 *   GraphQL query { publicConfigs }           → 公开配置（无需鉴权，仅白名单 key）
 *   GraphQL query { privateConfigs }          → 私有配置（需要登录 + config:admin:list 权限，含敏感凭据）
 *   GraphQL query { adminConfigs }            → 私有配置（兼容旧接口，与 privateConfigs 一致）
 *   GraphQL mutation { updateConfig(input) }  → 更新单条配置（key + JSON 对象）
 *   GraphQL mutation { batchUpdateConfigs(input) } → 批量更新配置
 *
 * 使用建议：
 *   - 登录页/浏览器 title/未登录场景：getPublicConfigs()
 *   - 登录后管理端：getPrivateConfigs()
 */
import { gqlQuery } from '@/shared/request/graphql-client';

// ============================================================
// 类型
// ============================================================

/** 单条配置记录 */
export interface ConfigRow {
    id: string;
    key: string;
    value: Record<string, unknown>;
    remark: string;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
}

/** 批量更新请求参数 */
export interface ConfigUpdateInput {
    key: string;
    value: Record<string, unknown>;
}

/** 批量更新响应项 */
export interface ConfigUpdateResult {
    id: string;
    key: string;
    value: Record<string, unknown>;
    remark: string;
    updatedAt: string;
}

// ============================================================
// GraphQL API（查询 + 变更）
// ============================================================

/**
 * 公开配置列表（无需鉴权）
 * - 后端按 PUBLIC_CONFIG_KEYS 白名单过滤，仅返回非敏感 key
 * - 适用场景：登录页加载系统名/logo/footer、浏览器 title、未登录用户能看到的 UI 元素
 *
 * 安全说明：返回的 value 不会含 clientSecret/appSecret/secretKey/apiKey 等敏感凭据
 * 任何含敏感字段的 key 都**不能**进入后端白名单
 */
export async function getPublicConfigs(): Promise<ConfigRow[]> {
    const data = await gqlQuery<{ publicConfigs: ConfigRow[] }>(`
        query PublicConfigs {
            publicConfigs {
                id key value remark updatedBy createdAt updatedAt
            }
        }
    `);
    return data.publicConfigs;
}

/**
 * 私有配置列表（需要登录 + config:admin:list 权限）
 * - 含全部配置项（含敏感凭据）
 * - 适用场景：登录后的管理端页面（配置中心、缓存管理等）
 *
 * 警告：返回结果中**含明文敏感凭据**，前端**禁止**在 console.log / devtools 暴露给未授权用户
 */
export async function getPrivateConfigs(): Promise<ConfigRow[]> {
    const data = await gqlQuery<{ privateConfigs: ConfigRow[] }>(`
        query PrivateConfigs {
            privateConfigs {
                id key value remark updatedBy createdAt updatedAt
            }
        }
    `);
    return data.privateConfigs;
}

/**
 * 当前管理员偏好设置（仅需登录，无需 config:admin:view 权限）
 * - 登录后 reloadAdminPreferences() 调用
 * - 返回 admin_preferences 单条配置（无则为 null）
 */
export async function getMyPreferences(): Promise<ConfigRow | null> {
    const data = await gqlQuery<{ myPreferences: ConfigRow | null }>(`
        query MyPreferences {
            myPreferences {
                id key value remark updatedBy createdAt updatedAt
            }
        }
    `);
    return data.myPreferences;
}

/**
 * 查询全部配置列表（兼容旧接口，等价于 getPrivateConfigs）
 * 保留向后兼容；新代码应使用 getPrivateConfigs（语义更清晰）
 * @deprecated 请改用 getPrivateConfigs
 */
export async function getConfigs(): Promise<ConfigRow[]> {
    return getPrivateConfigs();
}

/** 更新单条配置 */
export async function updateConfig(key: string, value: Record<string, unknown>): Promise<ConfigUpdateResult> {
    const data = await gqlQuery<{ updateConfig: ConfigUpdateResult }>(
        `
        mutation UpdateConfig($input: UpdateConfigInputType!) {
            updateConfig(input: $input) {
                id key value remark updatedAt
            }
        }
    `,
        { variables: { input: { key, value } } },
    );
    return data.updateConfig;
}

/** 批量更新配置 */
export async function batchUpdateConfigs(updates: ConfigUpdateInput[]): Promise<ConfigUpdateResult[]> {
    const data = await gqlQuery<{ batchUpdateConfigs: ConfigUpdateResult[] }>(
        `
        mutation BatchUpdateConfigs($input: BatchUpdateConfigsInputType!) {
            batchUpdateConfigs(input: $input) {
                id key value remark updatedAt
            }
        }
    `,
        { variables: { input: { updates } } },
    );
    return data.batchUpdateConfigs;
}
