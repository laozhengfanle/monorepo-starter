import { describe, it, expect, vi } from 'vitest';
import { autoIdExtension, createSoftDeleteExtension } from '../prisma-extensions';

// ─── UUID auto-inject extension ──────────────────────────────────────

describe('autoIdExtension', () => {
    it('create 时应自动注入 UUID v7 主键（无 id 时）', async () => {
        const query = vi.fn().mockResolvedValue({ id: 'generated-uuid', name: 'test' });
        const args = { data: { name: 'test' } };

        await autoIdExtension.query.$allModels.create({ args, query });

        expect(args.data.id).toBeDefined();
        expect(args.data.id).toMatch(/^[0-9a-f-]+$/);
        // 确保查询被调用，且 id 在 data 中
        expect(query).toHaveBeenCalledWith(args);
    });

    it('create 时应保留已有的 id（不覆盖）', async () => {
        const query = vi.fn().mockResolvedValue({ id: 'custom-id' });
        const args = {
            data: { id: 'custom-id', name: 'test' },
        };

        await autoIdExtension.query.$allModels.create({ args, query });

        expect(args.data.id).toBe('custom-id');
        expect(query).toHaveBeenCalledWith(args);
    });

    it('createMany 时应为每个无 id 的行自动注入 UUID v7', async () => {
        const query = vi.fn().mockResolvedValue({ count: 2 });
        const args = {
            data: [{ name: 'row1' }, { name: 'row2' }],
        };

        await autoIdExtension.query.$allModels.createMany({ args, query });

        expect(args.data[0].id).toMatch(/^[0-9a-f-]+$/);
        expect(args.data[1].id).toMatch(/^[0-9a-f-]+$/);
        // 两个 ID 应不同
        expect(args.data[0].id).not.toBe(args.data[1].id);
        expect(query).toHaveBeenCalledWith(args);
    });

    it('createMany 应保留已有 id 的行（不覆盖）', async () => {
        const query = vi.fn().mockResolvedValue({ count: 2 });
        const args = {
            data: [{ id: 'custom-id', name: 'row1' }, { name: 'row2' }],
        };

        await autoIdExtension.query.$allModels.createMany({ args, query });

        expect(args.data[0].id).toBe('custom-id');
        expect(args.data[1].id).toMatch(/^[0-9a-f-]+$/);
        expect(query).toHaveBeenCalledWith(args);
    });

    it('createMany 非数组 data 不做处理', async () => {
        const query = vi.fn().mockResolvedValue({ count: 1 });
        const args = { data: { name: 'single' } };

        await autoIdExtension.query.$allModels.createMany({ args, query });

        // data 为对象时 forEach 不执行，id 也不注入
        expect(args.data.id).toBeUndefined();
        expect(query).toHaveBeenCalledWith(args);
    });
});

// ─── Soft-delete extension ───────────────────────────────────────────

describe('createSoftDeleteExtension', () => {
    const createMockClient = () => {
        const mock = {
            account: {
                update: vi.fn().mockResolvedValue({ id: 'u1', deletedAt: new Date() }),
                updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
        };
        return mock;
    };

    it('findUnique 应对软删除模型自动添加 deletedAt: null 过滤', async () => {
        const mockClient = createMockClient();
        const ext = createSoftDeleteExtension(mockClient);
        const query = vi.fn().mockResolvedValue({ id: 'u1' });
        const args = { where: { id: 'u1' } };
        const model = 'Account';

        await ext.query.$allModels.findUnique({ args, query, model });

        expect(args.where).toEqual({ id: 'u1', deletedAt: null });
        expect(query).toHaveBeenCalledWith(args);
    });

    it('findUnique 对非软删除模型不应添加过滤', async () => {
        const mockClient = createMockClient();
        const ext = createSoftDeleteExtension(mockClient);
        const query = vi.fn().mockResolvedValue({ id: 'a1' });
        const args = { where: { id: 'a1' } };
        const model = 'AccountIdentity';

        await ext.query.$allModels.findUnique({ args, query, model });

        expect(args.where).toEqual({ id: 'a1' });
        expect(query).toHaveBeenCalledWith(args);
    });

    it('findFirst 应对软删除模型自动添加 deletedAt: null', async () => {
        const mockClient = createMockClient();
        const ext = createSoftDeleteExtension(mockClient);
        const query = vi.fn().mockResolvedValue({ id: 'u1' });
        const args = { where: { name: 'test' } };
        const model = 'AdminProfile';

        await ext.query.$allModels.findFirst({ args, query, model });

        expect(args.where).toEqual({ name: 'test', deletedAt: null });
        expect(query).toHaveBeenCalledWith(args);
    });

    it('findMany 应对软删除模型自动添加 deletedAt: null', async () => {
        const mockClient = createMockClient();
        const ext = createSoftDeleteExtension(mockClient);
        const query = vi.fn().mockResolvedValue([{ id: 'u1' }]);
        const args = { where: { status: 'active' } };
        const model = 'Account';

        await ext.query.$allModels.findMany({ args, query, model });

        expect(args.where).toEqual({ status: 'active', deletedAt: null });
        expect(query).toHaveBeenCalledWith(args);
    });

    it('findMany 对非软删除模型不应添加过滤', async () => {
        const mockClient = createMockClient();
        const ext = createSoftDeleteExtension(mockClient);
        const query = vi.fn().mockResolvedValue([{ id: 'a1' }]);
        const args = { where: {} };
        const model = { name: 'AuditLog' };

        await ext.query.$allModels.findMany({ args, query, model });

        expect(args.where).toEqual({});
        expect(query).toHaveBeenCalledWith(args);
    });

    it('delete 应转换为 update 设置 deletedAt（软删除模型）', async () => {
        const mockClient = createMockClient();
        const ext = createSoftDeleteExtension(mockClient);
        const query = vi.fn();
        const args = { where: { id: 'u1' } };
        const model = 'Account';

        await ext.query.$allModels.delete({ args, model, query });

        // 不应调原始 delete query
        expect(query).not.toHaveBeenCalled();
        // 应调用 mockClient.account.update
        expect(mockClient.account.update).toHaveBeenCalledWith({
            where: { id: 'u1' },
            data: { deletedAt: expect.any(Date) },
        });
    });

    it('delete 对非软删除模型应走原始查询', async () => {
        const mockClient = createMockClient();
        const ext = createSoftDeleteExtension(mockClient);
        const query = vi.fn().mockResolvedValue({ id: 'a1' });
        const args = { where: { id: 'a1' } };
        const model = { name: 'AuditLog' };

        await ext.query.$allModels.delete({ args, model, query });

        expect(query).toHaveBeenCalledWith(args);
    });

    it('deleteMany 应转换为 updateMany 设置 deletedAt（软删除模型）', async () => {
        const mockClient = createMockClient();
        const ext = createSoftDeleteExtension(mockClient);
        const query = vi.fn();
        const args = { where: { status: 'inactive' } };
        const model = 'Account';

        await ext.query.$allModels.deleteMany({ args, model, query });

        expect(query).not.toHaveBeenCalled();
        expect(mockClient.account.updateMany).toHaveBeenCalledWith({
            where: { status: 'inactive' },
            data: { deletedAt: expect.any(Date) },
        });
    });

    it('deleteMany 对非软删除模型应走原始查询', async () => {
        const mockClient = createMockClient();
        const ext = createSoftDeleteExtension(mockClient);
        const query = vi.fn().mockResolvedValue({ count: 1 });
        const args = { where: {} };
        const model = { name: 'AuditLog' };

        await ext.query.$allModels.deleteMany({ args, model, query });

        expect(query).toHaveBeenCalledWith(args);
    });

    it('所有 5 个软删除模型均应正确过滤', () => {
        const softDeleteModels = ['Account', 'AdminProfile', 'MemberProfile', 'UploadFile', 'SystemConfig'];

        // 通过 findUnique 验证每个指定模型都会被过滤
        for (const modelName of softDeleteModels) {
            const mockClient = createMockClient();
            const ext = createSoftDeleteExtension(mockClient);
            const query = vi.fn().mockResolvedValue({});
            const args = { where: { id: 'x' } };
            const model = modelName;

            ext.query.$allModels.findUnique({ args, query, model });

            expect(args.where).toEqual({ id: 'x', deletedAt: null });
        }
    });

    it('model 不存在时应安全处理 deleteMany', async () => {
        const mockClient = createMockClient();
        const ext = createSoftDeleteExtension(mockClient);
        const query = vi.fn().mockResolvedValue({ count: 0 });
        const args = { where: {} };
        const model = undefined;

        await ext.query.$allModels.deleteMany({ args, model, query });

        // model 为 undefined → 走原始查询
        expect(query).toHaveBeenCalledWith(args);
    });
});
