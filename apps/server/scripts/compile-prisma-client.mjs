/**
 * 编译 prisma 生成的 TypeScript client → 同目录的 .js 副本
 *
 * 为什么需要这个脚本：
 * - Prisma 7 的 prisma-client generator 只产出 .ts（不再生成 .js + .d.ts）
 * - nest build 默认只编译 src 目录下的 .ts，prisma/generated/ 在 src 之外，不会被处理
 * - prod 运行时（node dist/main.js）会从 dist/common/prisma/prisma.service.js
 *   解析 `../../../prisma/generated/client.js` → apps/server/prisma/generated/client.js
 *   这个文件不存在（只有 .ts）
 *
 * 编译策略（与"编译到 dist/prisma/generated"相比的优劣）：
 * - 编译到 dist/prisma/generated/：要同时改源码相对路径（层数变了），维护成本高
 * - 编译到 prisma/generated/ 同位置：源码相对路径编译前后都不变（dev/prod 一致）✓
 *   缺点：污染了 .gitignore 的源码目录，但该目录本身就被 .gitignore 排除
 *
 * 最终决定：编译到同位置。理由是
 *   1. 路径层数在编译前后完全一致（src/ 镜像到 dist/，相对路径层数不变）
 *   2. 不用改 prisma import 路径（已用 `../../../prisma/generated/client.js`，正确指向 apps/server/prisma/）
 *   3. 未来 prisma 改回产出 .js 时，可直接删除此脚本，build 链路零改动
 *
 * 与 nest build 共享 .swcrc 配置，无需额外配置。
 */
import { readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { transform } from '@swc/core';

const ROOT = resolve(process.cwd());
const SRC = resolve(ROOT, 'prisma/generated');

/** 递归收集所有 .ts 文件（不含 .d.ts） */
async function walkTs(dir) {
    const out = [];
    for (const ent of await readdir(dir, { withFileTypes: true })) {
        const p = resolve(dir, ent.name);
        if (ent.isDirectory()) {
            out.push(...(await walkTs(p)));
        } else if (ent.isFile() && p.endsWith('.ts') && !p.endsWith('.d.ts')) {
            out.push(p);
        }
    }
    return out;
}

if (!existsSync(SRC)) {
    console.error(`[compile-prisma] source not found: ${SRC}`);
    console.error(`[compile-prisma] run 'pnpm prisma generate' first`);
    process.exit(1);
}

/** swc 配置：与 .swcrc 一致（ES2022 + decorators + decoratorMetadata） */
const swcOptions = {
    jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        keepClassNames: true,
    },
    module: { type: 'es6' },
};

const tsFiles = await walkTs(SRC);
let compiled = 0;
for (const f of tsFiles) {
    const src = readFileSync(f, 'utf8');
    const { code } = await transform(src, { ...swcOptions, filename: f });
    const out = f.replace(/\.ts$/, '.js');
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, code, 'utf8');
    compiled++;
}

console.log(`[compile-prisma] compiled ${compiled} .ts files to .js (same dir, for prod runtime)`);
