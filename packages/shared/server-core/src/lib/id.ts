import { uuidv7 } from 'uuidv7';

/**
 * 生成 UUID v7（时间有序）主键。
 * - 应用层生成（Prisma Client Extension 注入），保证主键按时间单调递增，
 *   对 B-tree 索引和按时间范围查询更友好。
 */
export const newId = (): string => uuidv7();
