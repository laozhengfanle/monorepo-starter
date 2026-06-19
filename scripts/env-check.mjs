#!/usr/bin/env node
/**
 * ENV 同步校验脚本
 *
 * 用途：检查 apps/server/.env.example 与 docs/ENV.md 之间的 key 集合是否一致。
 *       防止某一方新增/删除变量后忘记同步另一方。
 *
 * 工作原理：
 *   1. 解析 .env.example 中所有 KEY=VALUE 形式的 key
 *   2. 解析 docs/ENV.md 中以 `### `VAR` 形式出现的标题
 *   3. 比对两个集合，输出差异
 *
 * 用法：
 *   pnpm env:check
 *   或：node scripts/env-check.mjs
 *
 * 退出码：
 *   0 - 同步
 *   1 - 不同步
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 当前脚本所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 仓库根目录（脚本在 scripts/ 下）
const REPO_ROOT = resolve(__dirname, "..");

// 待校验的两个文件
const ENV_EXAMPLE = resolve(REPO_ROOT, "apps/server/.env.example");
const ENV_DOC = resolve(REPO_ROOT, "开发文档/ENV.md");

/**
 * 从 .env.example 中提取所有 KEY
 * 匹配规则：行首（可能被 # 注释）KEY=VALUE
 * 说明：注释行 `# TURNSTILE_SITE_KEY=` 也算合法变量（被注释掉的可用配置项）
 */
function parseEnvExample(content) {
    const keys = new Set();
    for (const line of content.split(/\r?\n/)) {
        // 去掉前导 # 和空白后再匹配
        const stripped = line.replace(/^\s*#?\s*/, "");
        // 匹配 KEY=VALUE
        const match = stripped.match(/^([A-Z][A-Z0-9_]*)\s*=/);
        if (match) {
            keys.add(match[1]);
        }
    }
    return keys;
}

/**
 * 从 docs/ENV.md 中提取所有 KEY
 * 匹配规则：### `KEY`（反引号包裹的 key） 或 ### `KEY`（其它注释）
 */
function parseEnvDoc(content) {
    const keys = new Set();
    // 匹配 ### `KEY` 或 ### `KEY`（xxx） 形式
    const regex = /^###\s+`([A-Z][A-Z0-9_]*)`/gm;
    let match;
    while ((match = regex.exec(content)) !== null) {
        keys.add(match[1]);
    }
    return keys;
}

/**
 * 主流程
 */
async function main() {
    console.log("ENV 同步校验");
    console.log("=".repeat(60));
    console.log(`源文件: ${ENV_EXAMPLE}`);
    console.log(`文档:   ${ENV_DOC}`);
    console.log("");

    // 读取文件
    const [envContent, docContent] = await Promise.all([
        readFile(ENV_EXAMPLE, "utf-8"),
        readFile(ENV_DOC, "utf-8"),
    ]);

    // 解析 key 集合
    const envKeys = parseEnvExample(envContent);
    const docKeys = parseEnvDoc(docContent);

    // 计算差异
    const onlyInEnv = [...envKeys].filter((k) => !docKeys.has(k)).sort();
    const onlyInDoc = [...docKeys].filter((k) => !envKeys.has(k)).sort();

    // 输出对比结果
    console.log(`.env.example: ${envKeys.size} 个 key`);
    console.log(`docs/ENV.md:  ${docKeys.size} 个 key`);
    console.log("");

    if (onlyInEnv.length > 0) {
        console.error(`[miss] .env.example 有，docs/ENV.md 缺失 (${onlyInEnv.length}):`);
        for (const k of onlyInEnv) {
            console.error(`  - ${k}`);
        }
        console.log("");
    }

    if (onlyInDoc.length > 0) {
        console.error(`[extra] docs/ENV.md 有，.env.example 没有 (${onlyInDoc.length}):`);
        for (const k of onlyInDoc) {
            console.error(`  - ${k}`);
        }
        console.log("");
    }

    if (onlyInEnv.length === 0 && onlyInDoc.length === 0) {
        console.log("=".repeat(60));
        console.log("同步校验通过");
        console.log("=".repeat(60));
        process.exit(0);
    } else {
        console.log("=".repeat(60));
        console.error("同步校验失败，请补齐差异后再提交");
        console.log("=".repeat(60));
        process.exit(1);
    }
}

main().catch((err) => {
    console.error("env-check 执行失败:", err);
    process.exit(1);
});
