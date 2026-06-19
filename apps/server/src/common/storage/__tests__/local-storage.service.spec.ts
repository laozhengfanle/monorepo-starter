/**
 * LocalStorageService 单元测试
 *
 * 覆盖场景（Task 最低要求 ≥ 2 cases）：
 * - upload：写文件 → 文件应出现在 rootDir/{folder}/ 目录下
 * - getUrl：拼接公开访问 URL
 * - delete：删除已存在的文件
 * - delete：删除不存在的文件应幂等成功（不抛错）
 *
 * 实现策略：
 * - 用 os.tmpdir() + 随机子目录作为 rootDir，避免污染项目目录
 * - 真实调用 fs.promises，不 mock 文件系统（与生产路径完全一致）
 * - 用 vi.fn() 构造 ConfigService，按 key 返回测试值
 *
 * 注意：Task 描述中提到的 write/read/delete 并不完全对应真实 API，
 *      实际公开方法为 upload / delete / getUrl，故按真实方法编写。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { LocalStorageService } from '../local-storage.service.js';

/**
 * 构造一个最小的 ConfigService mock
 * - LocalStorageService 构造时读 STORAGE_LOCAL_DIR / STORAGE_PUBLIC_BASE_URL 两个 key
 * - 其它 key 不应被访问（这里不抛错即可）
 */
function createMockConfig(rootDir: string, publicBaseUrl: string) {
    return {
        get: vi.fn((key: string) => {
            if (key === 'storage.STORAGE_LOCAL_DIR') return rootDir;
            if (key === 'storage.STORAGE_PUBLIC_BASE_URL') return publicBaseUrl;
            return undefined;
        }),
    };
}

describe('LocalStorageService', () => {
    /** 测试用临时根目录（每个测试一个，避免互相干扰） */
    let rootDir: string;
    let service: LocalStorageService;

    beforeEach(async () => {
        // 用 os.tmpdir() + 16 字节随机 hex 构造隔离目录
        rootDir = join(tmpdir(), `storage-test-${randomBytes(8).toString('hex')}`);
        await fs.mkdir(rootDir, { recursive: true });
        service = new LocalStorageService(createMockConfig(rootDir, 'https://cdn.example.com') as any);
    });

    afterEach(async () => {
        // 测试结束后清理临时目录（best-effort，失败不抛错）
        try {
            await fs.rm(rootDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    });

    // ── upload ──

    describe('upload', () => {
        it('应写入文件到 rootDir/{folder}/ 目录并返回正确元数据', async () => {
            // 准备输入
            const buffer = Buffer.from('hello-storage-world');
            const result = await service.upload({
                originalName: 'photo.png',
                mimeType: 'image/png',
                buffer,
                folder: 'avatars',
                accountId: 'acc-1',
            });

            // 关键断言 1：返回结构正确
            expect(result.storedName).toMatch(/\.png$/);
            expect(result.size).toBe(buffer.length);
            expect(result.mimeType).toBe('image/png');
            expect(result.url).toBe(`https://cdn.example.com/avatars/${result.storedName}`);

            // 关键断言 2：文件真的写到磁盘了，且内容与传入 buffer 一致
            const filePath = join(rootDir, 'avatars', result.storedName);
            const onDisk = await fs.readFile(filePath);
            expect(onDisk.equals(buffer)).toBe(true);
        });

        it('写入前应自动创建 folder 子目录（递归 mkdir）', async () => {
            // 准备：rootDir 下还没有任何子目录
            const entries = await fs.readdir(rootDir);
            expect(entries).toEqual([]);

            await service.upload({
                originalName: 'doc.pdf',
                mimeType: 'application/pdf',
                buffer: Buffer.from('pdf-content'),
                folder: 'files',
                accountId: 'acc-1',
            });

            // 断言：files 子目录已创建
            const after = await fs.readdir(rootDir);
            expect(after).toContain('files');
        });
    });

    // ── getUrl ──

    describe('getUrl', () => {
        it('应拼接 publicBaseUrl + folder + storedName 形式的 URL', () => {
            const url = service.getUrl('abc-uuid.png', 'avatars');
            expect(url).toBe('https://cdn.example.com/avatars/abc-uuid.png');
        });

        it('应忽略 folder 中不合法的字符（白名单过滤）', () => {
            // 含 ../ 试图逃逸：sanitizeFolder 应过滤掉
            const url = service.getUrl('safe-name', '../../etc');
            expect(url).toBe('https://cdn.example.com/etc/safe-name');
        });
    });

    // ── delete ──

    describe('delete', () => {
        it('应删除已存在的文件', async () => {
            // 先 upload 一个文件
            const result = await service.upload({
                originalName: 'a.png',
                mimeType: 'image/png',
                buffer: Buffer.from('x'),
                folder: 'avatars',
                accountId: 'acc-1',
            });
            const filePath = join(rootDir, 'avatars', result.storedName);
            // 确认文件存在
            await expect(fs.access(filePath)).resolves.toBeUndefined();

            // 执行 delete
            await service.delete({ storedName: result.storedName, folder: 'avatars' });

            // 关键断言：文件已被删除
            await expect(fs.access(filePath)).rejects.toThrow();
        });

        it('删除不存在的文件应幂等成功（不抛错）', async () => {
            // 直接 delete 一个从未创建过的文件名 → 不应抛错
            await expect(
                service.delete({ storedName: 'never-existed.png', folder: 'avatars' }),
            ).resolves.toBeUndefined();
        });
    });
});
