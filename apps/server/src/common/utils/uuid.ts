import { newId } from '@packages/shared';

/**
 * 生成 UUID v7 主键
 * - UUID v7 是时间有序的，适合数据库索引性能
 * - 由应用层生成，不依赖数据库扩展
 * - 实际实现位于 @packages/shared，此处为服务端入口
 */
export { newId };
