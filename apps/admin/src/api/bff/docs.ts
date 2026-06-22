/**
 * 文档 API
 *
 * 对应后端端点：
 *   - GET /api/project-docs                     → 所有 .md 文件列表
 *   - GET /api/project-docs/content?slug=...    → 指定文件的 raw markdown 内容
 *
 * 均为 @Public() 端点，无需认证。
 * Vite dev proxy 将 /api/* 转发到 http://localhost:3000。
 *
 * 内容接口用 query 而非 path 传 slug，是因为 slug 可能含 "/"（如 "用户指南/01-快速上手"），
 * 走 path 会被 Express 5 + path-to-regexp v8 的通配符解析成数组。
 */
import { get } from '@/shared/request/request';

/** 单条文档元信息 */
export interface DocMeta {
    /** URL 友好的标识符（含子目录路径，如 "用户指南/01-快速上手"） */
    slug: string;
    /** 原始文件名（含 .md 后缀） */
    name: string;
    /** 展示标题（文件名去掉 .md 后缀） */
    title: string;
    /** 所属分组（子目录名，如 "用户指南" / "开发文档"） */
    group: string;
}

/** 文档内容 */
export interface DocContent {
    /** 文档 slug */
    slug: string;
    /** raw markdown 内容 */
    content: string;
}

/**
 * 获取所有 .md 文件列表
 * @returns 按标题排序的文档元信息数组
 */
export async function getDocsList(): Promise<DocMeta[]> {
    return get<DocMeta[]>('/project-docs');
}

/**
 * 获取指定文件的 markdown 内容
 * @param slug 文件名去掉 .md 后缀的标识符
 * @returns 包含 slug 和 raw content 的对象
 */
export async function getDocContent(slug: string): Promise<DocContent> {
    return get<DocContent>(`/project-docs/content?slug=${encodeURIComponent(slug)}`);
}
