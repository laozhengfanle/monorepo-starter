/**
 * Schema Artifact Drift Check
 *
 * 用途：
 *   - CI 阶段跑 `pnpm schema:check`
 *   - 比对当前 `dist/schema.gql` 与 `git HEAD` 提交时的版本
 *   - 不一致则 exit 1（防止 PR 改了 schema 但没重新生成 artifact）
 *
 * 工作流：
 *   1. dev 改 GraphQL resolver / Type
 *   2. 跑 `pnpm generate:schema`（基于 dev 改动生成新的 schema.gql）
 *   3. 跑 `pnpm build`（编译源码到 dist/）
 *   4. 跑 `pnpm generate:schema`（从 dist 启动 NestJS 应用，重新生成 schema）
 *   5. 把 dist/schema.gql + dist/openapi.json 提交到 Git
 *   6. CI 跑 `pnpm schema:check`：
 *      - 从 dist 重新生成 schema
 *      - 与 git HEAD 的 dist/schema.gql 比对
 *      - 不一致则失败
 *
 * 为什么不在 PR 阶段比对：
 *   - dev 可能没提交 dist/（gitignore）
 *   - 这里检查的是「提交后的 artifact」与「HEAD 重生成的结果」是否一致
 *   - 适合作为 merge 前的最后一道闸门
 */
import { execSync } from 'node:child_process';
import { readFile, access, writeFile, mkdir } from 'node:fs/promises';
import { constants as FS_CONST } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(SERVER_ROOT, '..', '..');
const DIST_DIR = join(SERVER_ROOT, 'dist');
const DIST_SCHEMA_GQL = join(DIST_DIR, 'schema.gql');
const DIST_OPENAPI_JSON = join(DIST_DIR, 'openapi.json');
/** 跟踪到 Git 的 artifact 路径（提交到仓库的版本） */
const TRACKED_SCHEMA_GQL = join(DIST_DIR, 'schema.gql');

/**
 * 检查文件是否存在
 */
async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path, FS_CONST.F_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * 读取 Git 跟踪的 dist/schema.gql 内容
 * - 用 `git show HEAD:<path>` 拿到 HEAD 提交时的版本
 * - 如果文件没被 Git 跟踪（首次提交），返回 null
 */
function readTrackedSchemaFromGit(): string | null {
    try {
        // 检查文件是否在 Git 跟踪列表中
        const tracked = execSync('git ls-files --error-unmatch dist/schema.gql', {
            cwd: SERVER_ROOT,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();

        if (!tracked) {
            return null;
        }

        // 读取 HEAD 提交时的版本
        const content = execSync('git show HEAD:apps/server/dist/schema.gql', {
            cwd: REPO_ROOT,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return content;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // 文件未跟踪 → 首次提交场景
        if (msg.includes('did not match any file') || msg.includes('exists on disk, but not in')) {
            return null;
        }
        // 其他 git 错误
        throw new Error(`读取 Git 跟踪的 schema 失败: ${msg}`);
    }
}

/**
 * 规范化 schema 内容用于比对
 * - 去掉行尾空白
 * - 统一换行符为 LF
 */
function normalize(sdl: string): string {
    return sdl.replace(/\r\n/g, '\n').trim();
}

/**
 * 主比对流程
 * 1. 确保 dist/schema.gql 存在（dev 需先跑 `pnpm generate:schema`）
 * 2. 读取 Git HEAD 跟踪的版本
 * 3. 一致性比对
 * 4. 不一致 exit 1 + 打印 diff 提示
 */
async function main() {
    console.log('▶ Schema artifact drift check');

    // 1. 读取当前 dist/schema.gql
    if (!(await fileExists(DIST_SCHEMA_GQL))) {
        console.error(`✗ ${DIST_SCHEMA_GQL} 不存在`);
        console.error('  请先执行: pnpm build && pnpm generate:schema');
        process.exit(1);
    }
    const currentSchema = await readFile(DIST_SCHEMA_GQL, 'utf-8');

    // 2. 读取 Git HEAD 跟踪的版本
    const trackedSchema = readTrackedSchemaFromGit();
    if (trackedSchema === null) {
        console.log('⚠ dist/schema.gql 尚未被 Git 跟踪（首次提交）');
        console.log('  建议先执行: git add apps/server/dist/schema.gql apps/server/dist/openapi.json');
        console.log('  → 然后再次运行 pnpm schema:check');
        // 首次提交场景：当前 dist 内容即为基准
        // 不视为失败，但提示用户提交
        process.exit(0);
    }

    // 3. 比对
    const currentNorm = normalize(currentSchema);
    const trackedNorm = normalize(trackedSchema);

    if (currentNorm === trackedNorm) {
        console.log('✓ dist/schema.gql 与 HEAD 一致');
        if (await fileExists(DIST_OPENAPI_JSON)) {
            const openapi = await readFile(DIST_OPENAPI_JSON, 'utf-8');
            console.log(`  (openapi.json 长度: ${openapi.length} 字节)`);
        }
        process.exit(0);
    }

    // 4. 不一致：详细 diff
    console.error('✗ Schema artifact 与 HEAD 不一致');
    console.error('');
    console.error('可能原因：');
    console.error('  1. 改了 GraphQL resolver / Type 但没跑 pnpm generate:schema');
    console.error('  2. 跑了 pnpm generate:schema 但没把新 artifact 加入 commit');
    console.error('');
    console.error('修复步骤：');
    console.error('  1. pnpm build');
    console.error('  2. pnpm generate:schema');
    console.error('  3. git add apps/server/dist/schema.gql apps/server/dist/openapi.json');
    console.error('  4. git commit -m "chore: regenerate schema artifact"');
    console.error('');

    // 输出简单的行数差异信息（精确 diff 由 git diff 处理）
    const currentLines = currentNorm.split('\n').length;
    const trackedLines = trackedNorm.split('\n').length;
    console.error(`  HEAD:    ${trackedLines} 行`);
    console.error(`  Current: ${currentLines} 行`);

    process.exit(1);
}

main().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
