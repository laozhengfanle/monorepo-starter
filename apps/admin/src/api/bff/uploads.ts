/**
 * 上传 API（RESTful）
 *
 * 与 GraphQL 的区别：
 * - 上传走 RESTful，因为 GraphQL 的 multipart/form-data 走 Apollo Upload 较重，
 *   后端基座已经用 NestJS 的 FileInterceptor + Multer 实现了标准 multipart 端点
 * - 端点：POST /api/admin/uploads/avatar（需登录 + config:file:create 权限 + CSRF）
 *
 * 返回结构：{ code: 0, message: 'ok', data: { id, url, ... } }
 * - 业务码 0 = 成功，非 0 = 错误
 * - data.url 是服务端最终可访问的相对路径（如 /uploads/avatars/xxx.webp）
 *
 * 后续如果需要上传通用文件（POST /api/admin/uploads/file），复用 uploadFile() 即可
 */
import { ApiError } from '@/shared/request/request';
import { BASE_URL } from '@/shared/request/request-config';
import { getCsrfToken } from '@/shared/request/csrf';

/** 上传成功后的服务端文件元数据 */
export interface UploadResult {
    id: string;
    accountId: string;
    originalName: string;
    storedName: string;
    mimeType: string;
    size: number;
    storage: string;
    folder: string;
    /** 服务端可访问的 URL（开发期走 Vite proxy 直连，生产期走反代） */
    url: string;
    createdAt: string;
}

/** 后端统一响应结构 */
interface ApiEnvelope<T> {
    code: number;
    message: string;
    data: T;
}

/**
 * 上传头像
 *
 * 流程：
 * 1. 调 getCsrfToken() 拿 token（命中缓存，不发额外请求）
 * 2. 用 FormData 包一个 'file' 字段，POST 到 /api/admin/uploads/avatar
 * 3. 后端在 /api 全局前缀下，CSRF Guard 校验 header + cookie
 * 4. 成功后取 data.url 回填前端表单
 *
 * 错误：
 * - 401 → request.ts 的 401 重试机制自动尝试 refresh + retry
 * - 403 → CSRF 缺失或无效（前端 token 缓存失效），调用方应清缓存后重试
 * - 4xx 文件相关 → 抛出 ApiError(status, message)
 *
 * @param file 用户选中的文件（input.files[0]）
 * @returns 上传后的服务端文件 URL（相对路径）
 */
export async function uploadAvatar(file: File): Promise<string> {
    // 1. 拿 CSRF token（写请求必带，未带会被后端 csrfGuard 直接 403）
    const csrfToken = await getCsrfToken();

    // 2. 构造 FormData（Multer 通过 'file' 字段名接收）
    const formData = new FormData();
    formData.append('file', file);

    // 3. 发请求：不能用 request() 工具，因为 request() 会强 JSON Content-Type
    //    multipart/form-data 的 boundary 由浏览器自动生成，我们只需带 credential
    //    注意：BASE_URL 默认就是 "/api"，所以这里只拼 "/admin/uploads/avatar"
    //          否则会变成 "/api/api/admin/..." 双前缀 → 404
    const response = await fetch(`${BASE_URL}/admin/uploads/avatar`, {
        method: 'POST',
        body: formData, // 不显式设 Content-Type，让浏览器自动加 boundary
        credentials: 'include',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
        signal: AbortSignal.timeout(30_000), // 上传比普通请求慢，独立超时
    });

    // 4. 解析响应：后端统一 { code, message, data } 信封
    if (!response.ok) {
        let body: unknown = undefined;
        try {
            body = await response.json();
        } catch {
            // 响应体不是 JSON（极端情况）
        }
        throw new ApiError(response.status, (body as { message?: string })?.message || response.statusText, body);
    }

    const envelope = (await response.json()) as ApiEnvelope<UploadResult>;
    if (envelope.code !== 0) {
        // 业务错误码：bubble 业务消息，状态码用 422 提示调用方是业务失败而非 HTTP 失败
        throw new ApiError(422, envelope.message || '上传失败', envelope);
    }

    return envelope.data.url;
}
