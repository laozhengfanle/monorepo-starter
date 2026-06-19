import { Controller, Get, Param, NotFoundException, BadRequestException } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator.js';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 单条文档元信息 */
interface DocMeta {
    /** URL 友好的标识符（含子目录路径，如 "用户指南/01-快速上手"） */
    slug: string;
    /** 原始文件名（含 .md 后缀） */
    name: string;
    /** 展示标题（文件名去掉 .md 后缀） */
    title: string;
    /** 所属分组（子目录名，根目录为空字符串） */
    group: string;
}

/**
 * 路径常量 — 基于当前模块文件位置计算，不依赖 process.cwd()
 *
 * 层级关系：
 *   monorepo/                          ← ROOT_DIR（目标）
 *     apps/server/src/bff/public/docs/docs.controller.ts  ← CURRENT_FILE
 *
 *   从文件所在目录到 monorepo 根：docs → public → bff → src → server → apps → monorepo（6 层）
 */
const CURRENT_FILE = fileURLToPath(import.meta.url);
const ROOT_DIR = resolve(CURRENT_FILE, '../../../../../../');
const DOCS_DIR = resolve(ROOT_DIR, 'docs');
/** 根目录 README.md */
const ROOT_README = resolve(ROOT_DIR, 'README.md');

/** 校验 slug 路径片段是否安全（防止路径穿越攻击） */
function isValidSlug(slug: string): boolean {
    if (slug.includes('..')) return false;
    if (slug.includes('\\')) return false;
    if (slug.length === 0) return false;
    return true;
}

/** 文档分组友好名称 */
const GROUP_LABELS: Record<string, string> = {
    '用户指南': '用户指南',
    '开发文档': '开发文档',
};

/**
 * 递归扫描 docs/ 目录，返回所有 .md 文件
 */
async function scanDocsDir(
    dir: string,
    group: string,
): Promise<{ name: string; slug: string; group: string }[]> {
    const result: { name: string; slug: string; group: string }[] = [];
    let entries: string[];
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return result;
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            const subDir = join(dir, entry.name);
            const subGroup = entry.name;
            const children = await scanDocsDir(subDir, subGroup);
            result.push(...children);
        } else if (entry.isFile() && extname(entry.name) === '.md') {
            const name = entry.name;
            const slug = group ? `${group}/${name.replace(/\.md$/, '')}` : name.replace(/\.md$/, '');
            result.push({ name, slug, group });
        }
    }
    return result;
}

/**
 * 文档控制器
 * - GET /api/project-docs         — 所有 .md 文件列表（按分组排列）
 * - GET /api/project-docs/:slug   — 指定文件的 raw markdown 内容（slug 含子目录路径）
 *
 * 文档目录结构：
 *   docs/
 *   ├── 用户指南/      ← fork 使用者文档
 *   ├── 开发文档/      ← 内部设计决策文档
 *   └── ARCHITECTURE.md ← 架构流程图
 *
 * 所有端点均 @Public()，无需登录。
 * 前端通过 Vite dev proxy（/api/* → localhost:3000）访问。
 */
@Controller('project-docs')
@Public()
export class DocsController {
    /**
     * 获取所有 .md 文件列表（含分组信息）
     * @returns 按分组 + 文件名排序的文档元信息数组
     */
    @Get()
    async list(): Promise<DocMeta[]> {
        const result: DocMeta[] = [];

        // 根目录 README.md
        try {
            await readFile(ROOT_README, 'utf-8');
            result.push({ slug: 'README', name: 'README.md', title: 'README', group: '' });
        } catch {
            // README.md 不存在，跳过
        }

        // 递归扫描 docs/ 下所有 .md 文件
        const files = await scanDocsDir(DOCS_DIR, '');
        for (const f of files) {
            result.push({
                slug: f.slug,
                name: f.name,
                title: f.name.replace(/\.md$/, ''),
                group: f.group,
            });
        }

        // 按分组 + title 排序
        return result.sort((a, b) => {
            const ga = GROUP_LABELS[a.group] ?? a.group;
            const gb = GROUP_LABELS[b.group] ?? b.group;
            if (ga !== gb) return ga.localeCompare(gb, 'zh-CN');
            return a.title.localeCompare(b.title, 'zh-CN');
        });
    }

    /**
     * 获取指定文件的 markdown 内容
     * @param slug URL 中的 slug 参数（支持子目录：用户指南/01-快速上手）
     * @returns 文件 raw content
     * @throws BadRequestException — slug 包含非法字符（路径穿越防护）
     * @throws NotFoundException — 文件不存在
     */
    @Get(':slug(.*)')
    async content(@Param('slug') slug: string): Promise<{ slug: string; content: string }> {
        // slug 可能包含 "/"（子目录），逐段校验
        const segments = slug.split('/');
        if (!segments.every((s) => isValidSlug(s))) {
            throw new BadRequestException('无效的文档标识符');
        }

        // README 从根目录读，其余从 docs/ 读
        let filePath: string;
        if (slug === 'README') {
            filePath = ROOT_README;
        } else {
            filePath = resolve(DOCS_DIR, `${slug}.md`);
        }

        // 路径穿越二次校验
        if (!filePath.startsWith(DOCS_DIR) && filePath !== ROOT_README) {
            throw new BadRequestException('无效的文档标识符');
        }

        let content: string;
        try {
            content = await readFile(filePath, 'utf-8');
        } catch {
            throw new NotFoundException(`文档「${slug}」不存在`);
        }

        return { slug, content };
    }
}
