import { paginatedSchema, paginationQuerySchema } from './common.js';
import { z } from 'zod';

describe('paginationQuerySchema', () => {
  it('未传参时使用默认分页', () => {
    const result = paginationQuerySchema.parse({});
    expect(result).toEqual({ page: 1, pageSize: 20 });
  });

  it('字符串数字会被 coerce 为数字', () => {
    const result = paginationQuerySchema.parse({ page: '3', pageSize: '50' });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
  });

  it('pageSize 超过 100 被拒绝', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it('非正数页码被拒绝', () => {
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });
});

describe('paginatedSchema', () => {
  const itemSchema = z.object({ id: z.uuid() });

  it('校验分页负载结构', () => {
    const result = paginatedSchema(itemSchema).parse({
      items: [{ id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(result.total).toBe(1);
  });

  it('items 元素不符合 schema 时被拒绝', () => {
    expect(paginatedSchema(itemSchema).safeParse({ items: [{ id: 'bad' }], total: 0, page: 1, pageSize: 20 }).success).toBe(false);
  });
});
