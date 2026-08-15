import { newId } from '@starter/server-core';

/** Prisma 客户端扩展查询回调参数 */
interface QueryParams {
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
  /** Prisma 7 传入的模型名称为字符串 */
  model?: string;
}

/**
 * UUID v7 自动注入 Extension
 * - create / createMany 时自动填充 id 字段（应用层生成 UUID v7，时间有序）
 */
export const autoIdExtension = {
  name: 'autoId' as const,
  query: {
    $allModels: {
      async create({ args, query }: QueryParams) {
        const data = args.data as Record<string, unknown>;
        if (!data.id) {
          data.id = newId();
        }
        return query(args);
      },
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

/** 有 deleted_at 字段的模型名称集合（只有这些模型应用软删除过滤） */
const SOFT_DELETE_MODELS = new Set(['User', 'Account', 'AdminProfile']);

interface ModelUpdateOps {
  update: (args: Record<string, unknown>) => Promise<unknown>;
  updateMany: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * 软删除 Extension
 * - findUnique / findFirst / findMany 自动过滤 deletedAt IS NULL
 * - delete → update deletedAt（软删除）；deleteMany → updateMany deletedAt
 * - 只对 SOFT_DELETE_MODELS 中的模型生效
 */
export const createSoftDeleteExtension = (extendedClient: unknown) => ({
  name: 'softDelete' as const,
  query: {
    $allModels: {
      async findUnique({ args, query, model }: QueryParams) {
        if (model && SOFT_DELETE_MODELS.has(model)) {
          const where = args.where as Record<string, unknown>;
          args.where = { ...where, deletedAt: null };
        }
        return query(args);
      },
      async findFirst({ args, query, model }: QueryParams) {
        if (model && SOFT_DELETE_MODELS.has(model)) {
          const where = args.where as Record<string, unknown>;
          args.where = { ...where, deletedAt: null };
        }
        return query(args);
      },
      async findMany({ args, query, model }: QueryParams) {
        if (model && SOFT_DELETE_MODELS.has(model)) {
          const where = args.where as Record<string, unknown>;
          args.where = { ...where, deletedAt: null };
        }
        return query(args);
      },
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
