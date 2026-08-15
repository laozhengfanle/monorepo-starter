#!/usr/bin/env node
/**
 * 版本升级脚本（仓库规定：每次提交到仓库前运行一次）。
 *
 * 用法：
 *   pnpm bump              # patch → 0.1.0 → 0.1.1
 *   pnpm bump minor        # → 0.2.0
 *   pnpm bump major        # → 1.0.0
 *
 * 行为：
 *   1. 读取 apps/admin/src/app/version.ts 的当前版本（单一来源）
 *   2. 按 semver 升级，同步写回 version.ts 与根 package.json
 *   3. git add 两个版本文件 + pnpm-lock.yaml（如有变更）
 *   4. 提交 "chore(release): vX.Y.Z" 并打注释标签 vX.Y.Z
 *
 * 注意：提交前请先提交/暂存你的功能改动，脚本只提交版本相关文件。
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const versionFile = join(root, 'apps/admin/src/app/version.ts');
const pkgFile = join(root, 'package.json');

/** 读取 version.ts 里的版本号 */
function readCurrentVersion() {
  const src = readFileSync(versionFile, 'utf8');
  const match = src.match(/APP_VERSION\s*=\s*'([^']+)'/);
  if (!match) {
    console.error('✗ 无法从 version.ts 解析版本号');
    process.exit(1);
  }
  return match[1];
}

/** semver 递增：major/minor/patch */
function bump(current, type) {
  const parts = current.split('.').map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    console.error(`✗ 非法版本号: ${current}`);
    process.exit(1);
  }
  let [major, minor, patch] = parts;
  if (type === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (type === 'minor') {
    minor += 1;
    patch = 0;
  } else if (type === 'patch') {
    patch += 1;
  } else {
    console.error('✗ 参数需为 major | minor | patch（默认 patch）');
    process.exit(1);
  }
  return `${major}.${minor}.${patch}`;
}

const type = process.argv[2] ?? 'patch';
const current = readCurrentVersion();
const next = bump(current, type);
const tag = `v${next}`;

// 1. 写 version.ts
const newVersionSrc = readFileSync(versionFile, 'utf8').replace(
  /(APP_VERSION\s*=\s*)'[^']*'/,
  `$1'${next}'`,
);
writeFileSync(versionFile, newVersionSrc);

// 2. 写根 package.json
const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
pkg.version = next;
writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);

// 3. 提交 + 打标签
const files = [versionFile, pkgFile];
try {
  execSync(`git add ${files.map((f) => `"${f}"`).join(' ')}`, { cwd: root, stdio: 'inherit' });
} catch {
  // pnpm-lock 等可能变化，一并带上
  execSync(`git add "pnpm-lock.yaml"`, { cwd: root, stdio: 'inherit' });
}
execSync(`git commit -m "chore(release): ${tag}"`, { cwd: root, stdio: 'inherit' });
execSync(`git tag -a ${tag} -m "release ${tag}"`, { cwd: root, stdio: 'inherit' });

console.log(`\n✅ ${current} → ${next}（标签 ${tag}）`);
console.log(`   版本已写入 version.ts 与 package.json，提交并打标签完成。`);
