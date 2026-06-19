import { uuidv7 } from 'uuidv7';

/**
 * 生成 UUID v7 主键
 * - UUID v7 是时间有序的，适合数据库索引性能
 * - 由应用层生成，不依赖数据库扩展
 */
export const newId = (): string => uuidv7();
