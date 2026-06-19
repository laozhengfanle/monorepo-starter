import { Controller, Get, Param, NotFoundException, BadRequestException } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator.js';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 单条文档元信息 */
interface DocMeta {
    /** URL 友好的标识符（文件名去掉 .md 后缀） */
    slug: string;
    /** 原始文件名（含 .md 后缀） */
    name: string;
    /** 展示标题（文件名去掉 .md 后缀） */
    title: string;
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
const ROOT_DIR = resolve(dirname(CURRENT_FILE), '../../../../../../');
const DOCS_DIR = resolve(ROOT_DIR, 'docs');
/** 根目录 README.md */
const ROOT_README = resolve(ROOT_DIR, 'README.md');

/** 校验 slug 是否安全（防止路径穿越攻击） */
function isValidSlug(slug: string): boolean {
    if (slug.includes('..')) return false;
    if (slug.includes('/')) return false;
    if (slug.includes('\\')) return false;
    if (slug.length === 0) return false;
    return true;
}

/**
 * 文档控制器
 * - GET /api/docs       — 所有 .md 文件列表（按字母排序）
 * - GET /api/docs/:slug — 指定文件的 raw markdown 内容
 *
 * 所有端点均 @Public()，无需登录。
 * 前端通过 Vite dev proxy（/api/* → localhost:3000）访问。
 */
@Controller('project-docs')
@Public()
export class DocsController {
    /**
     * 获取所有 .md 文件列表
     * @returns 按 title 字母排序的文档元信息数组
     */
    @Get()
    async list(): Promise<DocMeta[]> {
        const result: DocMeta[] = [];

        // 根目录 README.md（通过尝试读取判断是否存在）
        try {
            await readFile(ROOT_README, 'utf-8');
            result.push({ slug: 'README', name: 'README.md', title: 'README' });
        } catch {
            // README.md 不存在，跳过
        }

        // docs/ 目录下的所有 .md 文件
        try {
            const files = await readdir(DOCS_DIR);
            for (const name of files) {
                if (extname(name) === '.md') {
                    result.push({
                        slug: name.replace(/\.md$/, ''),
                        name,
                        title: name.replace(/\.md$/, ''),
                    });
                }
            }
        } catch {
            // docs/ 不存在，忽略
        }

        return result.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
    }

    /**
     * 获取指定文件的 markdown 内容
     * @param slug URL 中的 slug 参数（文件名去掉 .md 后缀）
     * @returns 文件 raw content
     * @throws BadRequestException — slug 包含非法字符（路径穿越防护）
     * @throws NotFoundException — 文件不存在
     */
    @Get(':slug')
    async content(@Param('slug') slug: string): Promise<{ slug: string; content: string }> {
        if (!isValidSlug(slug)) {
            throw new BadRequestException('无效的文档标识符');
        }

        // README 从根目录读，其余从 docs/ 读
        const filePath = slug === 'README' ? ROOT_README : resolve(DOCS_DIR, `${slug}.md`);

        // 路径穿越二次校验
        if (!filePath.startsWith(ROOT_DIR)) {
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
