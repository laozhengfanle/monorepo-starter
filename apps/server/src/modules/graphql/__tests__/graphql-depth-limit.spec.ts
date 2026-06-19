/**
 * GraphQL 查询深度限制 验证测试
 *
 * 测试目标：
 * - depthLimit(7) 正确拦截超过 7 层嵌套的查询
 * - 浅查询（≤ 7 层）正常通过
 * - 各种深度边界情况
 *
 * 覆盖率目标：≥ 80%
 *
 * 说明：
 * - 使用 graphql 的 validate() 函数 + depthLimit 验证规则来测试
 * - depthLimit 的"深度"定义：从根 Query 开始，每进入一层嵌套对象字段，深度 +1
 * - 例如：query { user { name } } 深度为 1（只有一层 user 嵌套）
 *   更准确地说：depthLimit 计算的是 selection set 的最大嵌套深度
 *
 * 深度计算规则（来自 graphql-depth-limit 源码）：
 * - 深度从 0 开始（根 depth=0）
 * - 进入一个字段（Field node）深度 +1
 * - 对于内联片段和具名片段，depth 不增加（只增加 fragment 内字段的 depth）
 */
import { describe, it, expect } from 'vitest';
import { buildSchema, parse, validate, type GraphQLError } from 'graphql';
// graphql-depth-limit 提供的是 ESM default export
import depthLimit from 'graphql-depth-limit';

// 测试用 schema — 支持深层嵌套（递归类型）
const testSchema = buildSchema(`
    type Query {
        user: User
        users: [User]
        hello: String
    }

    type User {
        id: ID!
        name: String
        friend: User
        friends: [User]
        posts: [Post]
    }

    type Post {
        id: ID!
        title: String
        author: User
        comments: [Comment]
    }

    type Comment {
        id: ID!
        body: String
        author: User
    }
`);

/** 辅助函数：验证查询是否被深度限制拒绝 */
function validateDepth(query: string, maxDepth: number): GraphQLError[] {
    const document = parse(query);
    const errors = validate(testSchema, document, [depthLimit(maxDepth)]);
    return errors;
}

/** 辅助函数：构造 N 层嵌套查询（通过 friend 自引用） */
function buildDeepQuery(depth: number): string {
    if (depth <= 1) {
        return '{ user { name } }';
    }
    // depth=2: user { friend { name } }
    // depth=3: user { friend { friend { name } } }
    // ...
    let inner = 'name';
    for (let i = 1; i < depth; i++) {
        inner = `friend { ${inner} }`;
    }
    return `{ user { ${inner} } }`;
}

describe('GraphQL 深度限制（depthLimit）', () => {
    // ── 合法查询 ──

    describe('浅查询（应通过）', () => {
        it('深度 1 的查询通过', () => {
            const errors = validateDepth('{ hello }', 7);
            expect(errors).toHaveLength(0);
        });

        it('深度 2 的查询通过', () => {
            const errors = validateDepth('{ user { name } }', 7);
            expect(errors).toHaveLength(0);
        });

        it('深度 3 的查询通过', () => {
            const errors = validateDepth('{ user { friend { name } } }', 7);
            expect(errors).toHaveLength(0);
        });

        it('深度正好为 7 的查询通过（边界值）', () => {
            const query = buildDeepQuery(7);
            const errors = validateDepth(query, 7);
            expect(errors).toHaveLength(0);
        });

        it('多条浅查询即使字段多也通过', () => {
            const errors = validateDepth('{ user { id name friend { id name } } hello }', 7);
            expect(errors).toHaveLength(0);
        });

        it('通过不同路径的嵌套（User→Post→Comment→User）', () => {
            const errors = validateDepth('{ user { posts { author { name } } } }', 7);
            expect(errors).toHaveLength(0);
        });
    });

    // ── 超出深度 ──

    describe('深查询（应被拦截）', () => {
        it('深度 8（超出 1 层）被拦截', () => {
            const query = buildDeepQuery(8);
            const errors = validateDepth(query, 7);
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].message).toMatch(/exceeds maximum operation depth/i);
        });

        it('深度 10 被拦截', () => {
            const query = buildDeepQuery(10);
            const errors = validateDepth(query, 7);
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].message).toMatch(/exceeds maximum operation depth/i);
        });

        it('深度 20 被拦截（极端深查询防御）', () => {
            const query = buildDeepQuery(20);
            const errors = validateDepth(query, 7);
            expect(errors.length).toBeGreaterThan(0);
        });

        it('通过列表路径的深层查询被拦截', () => {
            // User→friends→User→friends→User→friends→User→friends→User→friends→User (depth=9)
            // depth=9 > limit=7，应被拦截
            const query =
                '{ user { friends { friend { friends { friend { friends { friend { friends { friend { name } } } } } } } } } }';
            const errors = validateDepth(query, 7);
            expect(errors.length).toBeGreaterThan(0);
        });
    });

    // ── 边界情况 ──

    describe('边界情况', () => {
        it('depthLimit(0) 拒绝任何含对象字段的查询', () => {
            // depthLimit(0) 意味着最大深度 0 — 标量字段 depth 为 0，对象字段 depth ≥ 1
            // 所以标量 { hello } 会通过（depth=0），但 { user { name } } 被拒绝
            const errors = validateDepth('{ user { name } }', 0);
            expect(errors.length).toBeGreaterThan(0);
        });

        it('depthLimit(1) 拒绝超过 1 层的嵌套', () => {
            // user { friend { name } } 深度为 2（user→friend），2 > 1 → 拒绝
            const errors = validateDepth('{ user { friend { name } } }', 1);
            expect(errors.length).toBeGreaterThan(0);
        });

        it('不同 depthLimit 值正确生效（depthLimit=3）', () => {
            // 深度 3 通过
            expect(validateDepth(buildDeepQuery(3), 3)).toHaveLength(0);
            // 深度 4 拒绝
            expect(validateDepth(buildDeepQuery(4), 3).length).toBeGreaterThan(0);
        });

        it('不同 depthLimit 值正确生效（depthLimit=5）', () => {
            expect(validateDepth(buildDeepQuery(5), 5)).toHaveLength(0);
            expect(validateDepth(buildDeepQuery(6), 5).length).toBeGreaterThan(0);
        });

        it('含内联片段的深度查询', () => {
            const query = `
                {
                    user {
                        ... on User {
                            friend {
                                ... on User {
                                    friend {
                                        ... on User {
                                            friend {
                                                ... on User { name }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            `;
            // friend 嵌套 3 层 + user = 深度 4
            const errors = validateDepth(query, 4);
            expect(errors).toHaveLength(0);
        });

        it('具名片段深度查询', () => {
            const query = `
                query {
                    user {
                        ...F1
                    }
                }
                fragment F1 on User {
                    friend {
                        ...F2
                    }
                }
                fragment F2 on User {
                    name
                }
            `;
            // user → friend → name = 深度 3
            const errors = validateDepth(query, 7);
            expect(errors).toHaveLength(0);
        });
    });

    // ── 当前配置验证 ──

    describe('当前生产配置（depthLimit=7）', () => {
        it('管理后台典型查询（3-5 层）通过', () => {
            // 典型的管理后台查询：adminAccount → roles → role → menus → menu → children
            const typicalAdminQuery = `
                {
                    user {
                        id
                        name
                        friend {
                            id
                            name
                            friend {
                                name
                            }
                        }
                    }
                }
            `;
            const errors = validateDepth(typicalAdminQuery, 7);
            expect(errors).toHaveLength(0);
        });

        it('批量查询攻击（宽而非深）— 深度在限制内，但字段多', () => {
            // 构造一个深度浅但很宽的查询 — 深度限制不应该拦截它
            const fields = Array.from({ length: 20 }, (_, i) => `f${i}: user { id name }`);
            const wideQuery = `{ ${fields.join(' ')} }`;
            const errors = validateDepth(wideQuery, 7);
            // 深度 < 7，不应被深度限制拦截（复杂度限制另有机制）
            expect(errors).toHaveLength(0);
        });

        it('超出 7 层的嵌套攻击被拦截', () => {
            // 超过 7 层的嵌套 friend 链
            const attackQuery = `
                {
                    user {
                        friend {
                            friend {
                                friend {
                                    friend {
                                        friend {
                                            friend {
                                                friend {
                                                    friend { name }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            `;
            // user(1) → friend(2) → friend(3) → ... → friend(8) → name(9) = 深度 9
            const errors = validateDepth(attackQuery, 7);
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].message).toContain('maximum operation depth of 7');
        });
    });
});
