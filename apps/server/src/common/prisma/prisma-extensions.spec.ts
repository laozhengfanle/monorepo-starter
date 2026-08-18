import { vi, describe, expect, it } from 'vitest';
import {
  autoIdExtension,
  createSoftDeleteExtension,
} from './prisma-extensions.js';

/** 提取扩展的 query.$allModels 操作 */
function ops() {
  return autoIdExtension.query.$allModels;
}

describe('autoIdExtension', () => {
  it('create：无 id 时自动注入 UUID v7', async () => {
    const data: Record<string, unknown> = { name: 'x' };
    const query = vi
      .fn<(args: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValue({});

    await ops().create({ args: { data }, query, model: 'Account' });

    expect(typeof data.id).toBe('string');
    expect((data.id as string).length).toBeGreaterThan(10);
    expect(query).toHaveBeenCalledWith({ data });
  });

  it('create：已有 id 时不覆盖', async () => {
    const data: Record<string, unknown> = { id: 'custom-id', name: 'x' };
    const query = vi
      .fn<(args: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValue({});

    await ops().create({ args: { data }, query, model: 'Account' });

    expect(data.id).toBe('custom-id');
  });

  it('createMany：数组逐行注入 id', async () => {
    const data: Array<Record<string, unknown>> = [{ name: 'a' }, { name: 'b' }];
    const query = vi
      .fn<(args: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValue({});

    await ops().createMany({ args: { data }, query, model: 'Account' });

    expect(data[0].id).toBeTruthy();
    expect(data[1].id).toBeTruthy();
    expect(data[0].id).not.toBe(data[1].id);
  });
});

describe('createSoftDeleteExtension', () => {
  it('findMany：软删模型自动补 deletedAt: null', async () => {
    const query = vi
      .fn<(args: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValue([]);
    const ext = createSoftDeleteExtension({});

    await ext.query.$allModels.findMany({
      args: { where: { userType: 'admin' } },
      query,
      model: 'Account',
    });

    expect(query).toHaveBeenCalledWith({
      where: { userType: 'admin', deletedAt: null },
    });
  });

  it('findMany：调用方显式传 deletedAt 时尊重显式条件（includeDeleted 场景）', async () => {
    const query = vi
      .fn<(args: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValue([]);
    const ext = createSoftDeleteExtension({});

    await ext.query.$allModels.findMany({
      args: { where: { deletedAt: { not: null } } },
      query,
      model: 'Account',
    });

    expect(query).toHaveBeenCalledWith({
      where: { deletedAt: { not: null } },
    });
  });

  it('findMany：非软删模型不加过滤', async () => {
    const query = vi
      .fn<(args: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValue([]);
    const ext = createSoftDeleteExtension({});

    await ext.query.$allModels.findMany({
      args: { where: { code: 'x' } },
      query,
      model: 'TokenRevocation',
    });

    expect(query).toHaveBeenCalledWith({ where: { code: 'x' } });
  });

  it('delete：软删模型转 update（置 deletedAt）', async () => {
    const update = vi
      .fn<(args: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValue({});
    const ext = createSoftDeleteExtension({
      account: { update },
    });

    await ext.query.$allModels.delete({
      args: { where: { id: 'acc-1' } },
      query: vi.fn<(args: Record<string, unknown>) => Promise<unknown>>(),
      model: 'Account',
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('delete：非软删模型走原生 delete', async () => {
    const query = vi
      .fn<(args: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValue({});
    const ext = createSoftDeleteExtension({});

    await ext.query.$allModels.delete({
      args: { where: { id: 't-1' } },
      query,
      model: 'TokenRevocation',
    });

    expect(query).toHaveBeenCalledWith({ where: { id: 't-1' } });
  });
});
