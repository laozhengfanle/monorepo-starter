/**
 * GraphQL 查询复杂度计算 单元测试
 *
 * 测试目标：
 * - calculateComplexity 正确计算字段节点数量
 * - 简单查询、嵌套查询、片段查询、内联片段等各种 AST 形态
 *
 * 覆盖率目标：≥ 80%
 */
import { describe, it, expect } from 'vitest';
import { buildSchema, parse } from 'graphql';
import { calculateComplexity } from '../graphql-complexity.js';

// 测试用 schema（尽可能简单，只验证 AST 遍历逻辑）
const testSchema = buildSchema(`
    type Query {
        user(id: ID!): User
        users: [User!]!
        post(id: ID!): Post
        posts: [Post!]!
    }

    type User {
        id: ID!
        name: String!
        email: String
        posts: [Post!]!
    }

    type Post {
        id: ID!
        title: String!
        author: User!
        comments: [Comment!]!
    }

    type Comment {
        id: ID!
        body: String!
        author: User!
    }
`);

describe('calculateComplexity', () => {
    /** 仅 __typename 查询 → 复杂度 1 */
    it('仅 __typename 查询返回复杂度 1', () => {
        const doc = parse('{ __typename }');
        expect(calculateComplexity(testSchema, doc)).toBe(1);
    });

    /** 单字段查询 → 复杂度 1 */
    it('简单单字段查询返回复杂度 1', () => {
        const doc = parse('{ user(id: "1") { id } }');
        // user + id = 2 个字段
        expect(calculateComplexity(testSchema, doc)).toBe(2);
    });

    /** 多字段查询 */
    it('多字段扁平查询正确计数', () => {
        const doc = parse('{ user(id: "1") { id name email } }');
        // user + id + name + email = 4
        expect(calculateComplexity(testSchema, doc)).toBe(4);
    });

    /** 嵌套查询 */
    it('嵌套查询正确计数字段（包括嵌套对象内字段）', () => {
        const doc = parse(`
            {
                user(id: "1") {
                    name
                    posts {
                        title
                        comments {
                            body
                        }
                    }
                }
            }
        `);
        // user + name + posts + title + comments + body = 6
        expect(calculateComplexity(testSchema, doc)).toBe(6);
    });

    /** 多个根字段查询 */
    it('多个根字段查询正确累加计数', () => {
        const doc = parse(`
            {
                user(id: "1") { id name }
                post(id: "1") { id title }
            }
        `);
        // user + id + name + post + id + title = 6
        expect(calculateComplexity(testSchema, doc)).toBe(6);
    });

    /** 片段查询 */
    it('具名片段内的字段应被正确计入', () => {
        const doc = parse(`
            query {
                user(id: "1") {
                    ...UserFields
                }
            }
            fragment UserFields on User {
                id
                name
                email
            }
        `);
        // user + (fragment spreads) id + name + email = 4
        expect(calculateComplexity(testSchema, doc)).toBe(4);
    });

    /** 内联片段 */
    it('内联片段内的字段应被正确计入', () => {
        const doc = parse(`
            {
                user(id: "1") {
                    id
                    ... on User {
                        name
                        email
                    }
                }
            }
        `);
        // user + id + name + email = 4
        expect(calculateComplexity(testSchema, doc)).toBe(4);
    });

    /** 列表查询（每个列表内字段也计 1） */
    it('列表字段及其子字段正确计数', () => {
        const doc = parse(`
            {
                users {
                    id
                    name
                }
            }
        `);
        // users + id + name = 3
        expect(calculateComplexity(testSchema, doc)).toBe(3);
    });

    /** 复杂查询接近 1000 阈值 — 验证大查询可以正确计算 */
    it('大查询（> 50 字段）正确计数', () => {
        // 构造一个含许多字段的查询
        const fields = Array.from({ length: 30 }, (_, i) => `f${i}: user(id: "${i}") { id name }`);
        const doc = parse(`{ ${fields.join(' ')} }`);
        // 30 × (user + id + name) = 30 × 3 = 90
        expect(calculateComplexity(testSchema, doc)).toBe(90);
    });

    /** 复杂度为 1 */
    it('仅标量字段返回 1', () => {
        const schema = buildSchema('type Query { hello: String! }');
        const doc = parse('{ hello }');
        expect(calculateComplexity(schema, doc)).toBe(1);
    });

    /** 带参数的字段 */
    it('带参数的字段仍计为 1', () => {
        const doc = parse('{ user(id: "abc") { name } }');
        // user + name = 2
        expect(calculateComplexity(testSchema, doc)).toBe(2);
    });

    /** 验证复杂度不重复计算别名（每个别名字段是一个独立的字段节点） */
    it('别名字段各计 1', () => {
        const doc = parse('{ a: user(id: "1") { x: name } b: user(id: "2") { y: name } }');
        // a(user) + x(name) + b(user) + y(name) = 4
        expect(calculateComplexity(testSchema, doc)).toBe(4);
    });
});
