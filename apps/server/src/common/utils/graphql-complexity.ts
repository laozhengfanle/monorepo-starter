/**
 * GraphQL 查询复杂度计算
 *
 * 用途：在 Apollo Server Plugin 中计算单次查询的"成本"，拦截超过阈值的复杂查询。
 *
 * 为什么不用 graphql-query-complexity？
 * - 该库内部 require('graphql') 创建 TypeInfo / ValidationContext，
 *   在 pnpm 严格模式下与 Apollo Server 的 graphql 实例冲突，
 *   导致 "Cannot use GraphQLObjectType from another module or realm" 错误
 * - 改用直接从主 graphql 包导入的 visit / TypeInfo 遍历 AST，
 *   确保与 Apollo Server 使用同一个 graphql 实例
 *
 * 算法：每个字段节点计 1 分。
 * - 对于当前 schema 规模（管理端 CRUD），字段数量是合理的复杂度度量
 * - 如需更精细的控制（列表字段乘数、标量成本），可在此函数中扩展
 */
import { Kind, visit, visitWithTypeInfo, TypeInfo } from 'graphql';
import type { DocumentNode, GraphQLSchema } from 'graphql';

/**
 * 计算 GraphQL 查询的复杂度（基于字段节点数量）
 *
 * @param schema - GraphQL Schema（用于 TypeInfo 类型推断）
 * @param document - 解析后的 AST 文档节点
 * @returns 总复杂度（字段节点数量）
 */
export function calculateComplexity(schema: GraphQLSchema, document: DocumentNode): number {
    let complexity = 0;
    const typeInfo = new TypeInfo(schema);

    visit(
        document,
        visitWithTypeInfo(typeInfo, {
            /** 每进入一个字段节点，复杂度 +1 */
            enter(node) {
                if (node.kind === Kind.FIELD) {
                    complexity += 1;
                }
            },
        }),
    );

    return complexity;
}
