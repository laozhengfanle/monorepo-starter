import { newId } from '@packages/shared';

/** Prisma 客户端扩展查询回调参数 */
interface QueryParams {
    args: Record<string, unknown>;
    query: (args: Record<string, unknown>) => Promise<unknown>;
    /** Prisma 7 传入的模型名称为字符串 */
    model?: string;
}

/**
 * UUID v7 自动注入 Extension
 * - create / createMany 时自动填充 id 字段
 * - 应用层生成 UUID v7，保证主键时间有序
 */
export const autoIdExtension = {
    name: 'autoId' as const,
    query: {
        $allModels: {
            /** create 时自动注入 UUID v7 主键 */
            async create({ args, query }: QueryParams) {
                const data = args.data as Record<string, unknown>;
                if (!data.id) {
                    data.id = newId();
                }
                return query(args);
            },
            /** createMany 时自动注入 UUID v7 主键 */
            async createMany({ args, query }: QueryParams) {
                const data = args.data as Record<string, unknown>[] | Record<string, unknown>;
                if (Array.isArray(data)) {
                    data.forEach((row: Record<string, unknown>) => {
                        if (!row.id) {
                            row.id = newId();
                        }
                    });
                }
                return query(args);
            },
        },
    },
};

/**
 * 有 deleted_at 字段的模型名称集合
 * - 只有这些模型会应用软删除过滤
 * - 其他模型（如 AccountIdentity、关联表、AuditLog）没有 deleted_at 字段
 */
const SOFT_DELETE_MODELS = new Set([
    'Account',
    'AdminProfile',
    'MemberProfile',
    'UploadFile',
    'SystemConfig', // SystemConfig 有 deletedAt 字段，需要软删除过滤
]);

/**
 * Model update operations used by the soft-delete extension.
 */
interface ModelUpdateOps {
    update: (args: Record<string, unknown>) => Promise<unknown>;
    updateMany: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * 软删除 Extension
 * - findUnique / findFirst / findMany 自动过滤 deletedAt IS NULL
 * - delete → update deletedAt（软删除）
 * - deleteMany → updateMany deletedAt（软删除）
 * - 只对 SOFT_DELETE_MODELS 中的模型生效
 */
export const createSoftDeleteExtension = (extendedClient: unknown) => ({
    name: 'softDelete' as const,
    query: {
        $allModels: {
            /** findUnique 自动过滤已删除记录 */
            async findUnique({ args, query, model }: QueryParams) {
                if (model && SOFT_DELETE_MODELS.has(model)) {
                    const where = args.where as Record<string, unknown>;
                    args.where = { ...where, deletedAt: null };
                }
                return query(args);
            },
            /** findFirst 自动过滤已删除记录 */
            async findFirst({ args, query, model }: QueryParams) {
                if (model && SOFT_DELETE_MODELS.has(model)) {
                    const where = args.where as Record<string, unknown>;
                    args.where = { ...where, deletedAt: null };
                }
                return query(args);
            },
            /** findMany 自动过滤已删除记录 */
            async findMany({ args, query, model }: QueryParams) {
                if (model && SOFT_DELETE_MODELS.has(model)) {
                    const where = args.where as Record<string, unknown>;
                    args.where = { ...where, deletedAt: null };
                }
                return query(args);
            },
            /** delete → 改为 update 设置 deleted_at（软删除） */
            async delete({ args, model, query }: QueryParams) {
                if (model && SOFT_DELETE_MODELS.has(model)) {
                    const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
                    const ec = extendedClient as Record<string, ModelUpdateOps>;
                    return ec[modelKey].update({
                        where: args.where,
                        data: { deletedAt: new Date() },
                    });
                }
                return query(args);
            },
            /** deleteMany → 改为 updateMany 设置 deleted_at（软删除） */
            async deleteMany({ args, model, query }: QueryParams) {
                if (model && SOFT_DELETE_MODELS.has(model)) {
                    const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
                    const ec = extendedClient as Record<string, ModelUpdateOps>;
                    return ec[modelKey].updateMany({
                        where: args.where,
                        data: { deletedAt: new Date() },
                    });
                }
                return query(args);
            },
        },
    },
});
