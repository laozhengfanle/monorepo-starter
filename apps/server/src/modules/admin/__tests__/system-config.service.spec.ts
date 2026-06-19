/**
 * SystemConfigService 单元测试
 *
 * 覆盖场景：
 * - findAll: 列表查询（过滤软删除）
 * - findByKey: 缓存命中 / 缓存 miss → DB 回填 / 缓存 miss → 不存在
 * - create: 成功 / key 重复
 * - update: 成功 + 缓存失效 / key 不存在
 * - delete: 成功 + 缓存失效 / key 不存在
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SystemConfigService } from '../system-config/system-config.service.js';

function makeConfig(overrides: Record<string, unknown> = {}) {
    return {
        id: overrides.id ?? 'cfg-1',
        key: overrides.key ?? 'sms.provider',
        value: overrides.value ?? '{"driver":"mock"}',
        remark: (overrides.remark as string) ?? null,
        updatedBy: (overrides.updatedBy as string) ?? null,
        createdAt: overrides.createdAt ?? new Date('2025-01-01'),
        updatedAt: overrides.updatedAt ?? new Date('2025-06-01'),
    };
}

describe('SystemConfigService', () => {
    let service: SystemConfigService;
    let mockCache: {
        get: any;
        set: any;
        del: any;
        delMany: any;
        delByPattern: any;
        setTtlByPattern: any;
        mget: any;
        exists: any;
        incr: any;
        setex: any;
        ttl: any;
        evalLua: any;
    };
    let mockPrisma: { client: Record<string, any> };
    let mockAudit: { record: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        mockCache = {
            get: vi.fn(),
            set: vi.fn().mockResolvedValue(undefined),
            del: vi.fn().mockResolvedValue(undefined),
            delMany: vi.fn(),
            delByPattern: vi.fn(),
            setTtlByPattern: vi.fn(),
            mget: vi.fn(),
            exists: vi.fn(),
            incr: vi.fn(),
            setex: vi.fn(),
            ttl: vi.fn(),
            evalLua: vi.fn(),
        };

        mockPrisma = {
            client: {
                systemConfig: {
                    findMany: vi.fn(),
                    findUnique: vi.fn(),
                    create: vi.fn(),
                    update: vi.fn(),
                    upsert: vi.fn(),
                },
            },
        };

        mockAudit = { record: vi.fn().mockResolvedValue(undefined) };

        service = new SystemConfigService(mockPrisma as any, mockCache as any, mockAudit as any);
    });

    // ── findAll ──

    describe('findAll', () => {
        it('应返回未删除的配置列表（按 key 升序）', async () => {
            mockPrisma.client.systemConfig.findMany.mockResolvedValue([
                makeConfig({ key: 'app.name', value: 'MyApp' }),
                makeConfig({ key: 'sms.provider', value: '{"driver":"aliyun"}' }),
            ]);

            const result = await service.findAll();

            expect(result).toHaveLength(2);
            expect(result[0].key).toBe('app.name');
            expect(mockPrisma.client.systemConfig.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { deletedAt: null },
                    orderBy: [{ key: 'asc' }],
                }),
            );
        });

        it('应返回空列表（无配置项时）', async () => {
            mockPrisma.client.systemConfig.findMany.mockResolvedValue([]);

            const result = await service.findAll();

            expect(result).toHaveLength(0);
        });
    });

    // ── findByKey ──

    describe('findByKey', () => {
        it('应在缓存命中时直接返回', async () => {
            const cached = { key: 'sms.provider', value: '{"driver":"mock"}', updatedAt: new Date('2025-06-01') };
            mockCache.get.mockResolvedValue(cached);

            const result = await service.findByKey('sms.provider');

            expect(result.key).toBe('sms.provider');
            expect(result.value).toBe('{"driver":"mock"}');
            // 缓存命中，不应查 DB
            expect(mockPrisma.client.systemConfig.findUnique).not.toHaveBeenCalled();
        });

        it('应在缓存 miss 时查 DB 并回填缓存', async () => {
            mockCache.get.mockResolvedValue(null);
            mockPrisma.client.systemConfig.findUnique.mockResolvedValue(
                makeConfig({ key: 'sms.provider', value: '{"driver":"mock"}' }),
            );

            const result = await service.findByKey('sms.provider');

            expect(result.key).toBe('sms.provider');
            expect(mockPrisma.client.systemConfig.findUnique).toHaveBeenCalledWith({
                where: { key: 'sms.provider' },
            });
            // 应回填缓存（TTL 1800 秒）
            expect(mockCache.set).toHaveBeenCalledWith(
                'mono:data:system_config:sms.provider',
                expect.objectContaining({ key: 'sms.provider' }),
                1800,
            );
        });

        it('应在缓存不可用时降级到 DB（不阻塞主流程）', async () => {
            mockCache.get.mockRejectedValue(new Error('Redis connection failed'));
            mockPrisma.client.systemConfig.findUnique.mockResolvedValue(
                makeConfig({ key: 'sms.provider', value: '{"driver":"mock"}' }),
            );

            const result = await service.findByKey('sms.provider');

            expect(result.key).toBe('sms.provider');
            expect(mockPrisma.client.systemConfig.findUnique).toHaveBeenCalled();
        });

        it('应在 key 不存在时抛出 NotFoundException', async () => {
            mockCache.get.mockResolvedValue(null);
            mockPrisma.client.systemConfig.findUnique.mockResolvedValue(null);

            await expect(service.findByKey('nonexistent')).rejects.toThrow(NotFoundException);
        });
    });

    // ── create ──

    describe('create', () => {
        it('应成功创建配置', async () => {
            mockPrisma.client.systemConfig.findUnique.mockResolvedValue(null); // 不重复
            mockPrisma.client.systemConfig.create.mockResolvedValue(makeConfig({ key: 'app.name', value: 'MyApp' }));

            const result = await service.create({ key: 'app.name', value: 'MyApp' });

            expect(result.key).toBe('app.name');
        });

        it('应在 key 已存在时抛出 BadRequestException', async () => {
            mockPrisma.client.systemConfig.findUnique.mockResolvedValue(makeConfig({ key: 'app.name' }));

            await expect(service.create({ key: 'app.name', value: 'MyApp' })).rejects.toThrow(BadRequestException);
        });
    });

    // ── update ──

    describe('update', () => {
        it('应成功更新配置并失效缓存', async () => {
            mockPrisma.client.systemConfig.upsert.mockResolvedValue(
                makeConfig({ key: 'sms.provider', value: '{"driver":"aliyun"}' }),
            );

            const result = await service.update('sms.provider', { value: '{"driver":"aliyun"}' });

            expect(result.value).toBe('{"driver":"aliyun"}');
            expect(mockCache.del).toHaveBeenCalledWith('mono:data:system_config:sms.provider');
        });

        it('应在更新成功后记录细粒度审计日志（CONFIG_UPDATED）', async () => {
            mockPrisma.client.systemConfig.upsert.mockResolvedValue(
                makeConfig({ key: 'sms.provider', value: '{"driver":"aliyun"}' }),
            );

            await service.update('sms.provider', { value: '{"driver":"aliyun"}' });

            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'config_updated',
                    resourceType: 'system_config',
                    resourceId: 'sms.provider',
                }),
            );
        });

        it('应在 key 不存在时仍能通过 upsert 创建并记录审计', async () => {
            // 当前 service 使用 upsert 语义，key 不存在时也会被创建
            // 因此不抛 NotFoundException，但需要保证审计日志被正确记录
            mockPrisma.client.systemConfig.upsert.mockResolvedValue(makeConfig({ key: 'new.config', value: 'value' }));

            const result = await service.update('new.config', { value: '"value"' });

            expect(result.key).toBe('new.config');
            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'config_updated',
                    resourceId: 'new.config',
                }),
            );
        });
    });

    // ── delete ──

    describe('delete', () => {
        it('应成功软删除并失效缓存', async () => {
            mockPrisma.client.systemConfig.findUnique.mockResolvedValue(makeConfig({ key: 'sms.provider' }));
            mockPrisma.client.systemConfig.update.mockResolvedValue({});

            const result = await service.delete('sms.provider');

            expect(result.deleted).toBe(true);
            expect(mockCache.del).toHaveBeenCalledWith('mono:data:system_config:sms.provider');
        });

        it('应在 key 不存在时抛出 NotFoundException', async () => {
            mockPrisma.client.systemConfig.findUnique.mockResolvedValue(null);

            await expect(service.delete('nonexistent')).rejects.toThrow(NotFoundException);
        });
    });

    // ── findAllAsAdmin（新接口 adminConfigs）──

    describe('findAllAsAdmin', () => {
        it('应返回完整管理字段（id/remark/updatedBy/createdAt）', async () => {
            mockPrisma.client.systemConfig.findMany.mockResolvedValue([
                makeConfig({ id: 'cfg-1', key: 'app.name', value: { name: 'MyApp' } }),
            ]);

            const result = await service.findAllAsAdmin();

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('cfg-1');
            expect(result[0].key).toBe('app.name');
            // value 应是已解析的对象，不是字符串
            expect(typeof result[0].value).toBe('object');
            expect(result[0].value).toEqual({ name: 'MyApp' });
            // 不查缓存
            expect(mockCache.get).not.toHaveBeenCalled();
        });

        it('应正确解析字符串类型的 DB 值（JSON.parse）', async () => {
            mockPrisma.client.systemConfig.findMany.mockResolvedValue([
                makeConfig({ key: 'app.settings', value: '{"theme":"dark","lang":"zh"}' }),
            ]);

            const result = await service.findAllAsAdmin();

            expect(result[0].value).toEqual({ theme: 'dark', lang: 'zh' });
        });

        it('应在 DB 中 value 为非对象时降级为空对象', async () => {
            mockPrisma.client.systemConfig.findMany.mockResolvedValue([
                makeConfig({ key: 'app.simple', value: 'just-a-string' }),
            ]);

            const result = await service.findAllAsAdmin();

            expect(result[0].value).toEqual({});
        });
    });

    // ── updateOne（新接口 updateConfig）──

    describe('updateOne', () => {
        it('应成功更新并返回 AdminConfig', async () => {
            mockPrisma.client.systemConfig.upsert.mockResolvedValue(
                makeConfig({ key: 'app.settings', value: { theme: 'dark' } }),
            );

            const result = await service.updateOne('app.settings', { theme: 'dark' });

            expect(result.key).toBe('app.settings');
            expect(result.value).toEqual({ theme: 'dark' });
            // 失效缓存
            expect(mockCache.del).toHaveBeenCalledWith('mono:data:system_config:app.settings');
            // 写审计
            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'config_updated',
                    resourceId: 'app.settings',
                }),
            );
        });

        it('应在 value 不是对象时抛 BadRequestException（拒绝 string）', async () => {
            await expect(service.updateOne('app.x', 'just-a-string')).rejects.toThrow(BadRequestException);
            // 不应触发 DB 写入
            expect(mockPrisma.client.systemConfig.upsert).not.toHaveBeenCalled();
        });

        it('应在 value 是数组时抛 BadRequestException（只接受对象）', async () => {
            await expect(service.updateOne('app.x', [1, 2, 3])).rejects.toThrow(BadRequestException);
        });

        it('应在 value 是 null 时抛 BadRequestException', async () => {
            await expect(service.updateOne('app.x', null)).rejects.toThrow(BadRequestException);
        });
    });

    // ── batchUpdate（新接口 batchUpdateConfigs）──

    describe('batchUpdate', () => {
        it('应成功批量更新并按顺序返回结果', async () => {
            // 两次 upsert 返回不同记录
            mockPrisma.client.systemConfig.upsert
                .mockResolvedValueOnce(makeConfig({ key: 'a', value: { v: 1 } }))
                .mockResolvedValueOnce(makeConfig({ key: 'b', value: { v: 2 } }));

            const result = await service.batchUpdate([
                { key: 'a', value: { v: 1 } },
                { key: 'b', value: { v: 2 } },
            ]);

            expect(result).toHaveLength(2);
            expect(result[0].key).toBe('a');
            expect(result[1].key).toBe('b');
            // 应一次失效两条缓存
            expect(mockCache.delMany).toHaveBeenCalledWith(['mono:data:system_config:a', 'mono:data:system_config:b']);
            // 应写一条聚合审计
            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'config_updated',
                    detail: expect.objectContaining({
                        updates: expect.arrayContaining([
                            { key: 'a', value: { v: 1 } },
                            { key: 'b', value: { v: 2 } },
                        ]),
                    }),
                }),
            );
        });

        it('应在空数组时抛 BadRequestException', async () => {
            await expect(service.batchUpdate([])).rejects.toThrow(BadRequestException);
            expect(mockPrisma.client.systemConfig.upsert).not.toHaveBeenCalled();
        });

        it('应在任一条 value 不是对象时抛 BadRequestException（短路，不写入已成功项）', async () => {
            await expect(
                service.batchUpdate([
                    { key: 'a', value: { v: 1 } },
                    { key: 'b', value: 'invalid' },
                ]),
            ).rejects.toThrow(BadRequestException);
            // 短路：第一条也没写
            expect(mockPrisma.client.systemConfig.upsert).not.toHaveBeenCalled();
        });
    });
});
