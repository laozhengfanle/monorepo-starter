/**
 * GraphQL 错误处理 — 解析 graphql-request 抛出的错误
 *
 * graphql-request 在请求失败时会抛出 ClientError，
 * 包含 response.errors（GraphQL 层错误）和 response.status（HTTP 层状态码）。
 *
 * 本模块提供：
 *   - parseGraphQLError: 从 ClientError 中提取用户友好的错误消息
 *   - isAuthError: 判断是否为认证错误（401）
 *
 * 错误码 → 中文消息：
 *   - 后端抛 BusinessException(code, message) 时，前端优先用后端 message
 *   - 后端 message 缺失时，从 ERROR_CODES 字典查表
 *   - 未知 code / 无 message → 用 translateErrorCode() 兜底
 */
import { translateErrorCode } from '../shared/composables/useErrorMessage';

/** GraphQL 单条错误结构 */
interface GraphQLErrorExtension {
    /** 错误码 */
    code?: string | number;
    /** 字段级错误 */
    fields?: Array<{ field: string; message: string }>;
    [key: string]: unknown;
}

interface GraphQLErrorItem {
    /** 错误消息 */
    message: string;
    /** 扩展信息 */
    extensions?: GraphQLErrorExtension;
}

/** graphql-request 的 ClientError 结构（简化版） */
interface ClientErrorLike {
    response?: {
        errors?: GraphQLErrorItem[];
        status?: number;
    };
    message?: string;
}

/**
 * 从 graphql-request 错误中提取用户友好的错误消息
 *
 * 优先级：
 *   1. GraphQL errors[0].message（后端返回的 message 通常是 i18n 友好的）
 *   2. 后端 message 缺失时，按 errors[0].extensions.code 查 ERROR_CODES 字典
 *   3. 错误对象的 message 属性
 *   4. 兜底："操作失败，请稍后重试"
 *
 * @param error graphql-request 抛出的错误
 * @returns 用户友好的错误消息字符串
 */
export function parseGraphQLError(error: unknown): string {
    // 尝试作为 ClientError 解析
    const clientError = error as ClientErrorLike;

    // 优先取 GraphQL errors 数组中的消息
    if (clientError?.response?.errors?.length) {
        const firstError = clientError.response.errors[0];
        if (firstError) {
            if (firstError.message && firstError.message.trim().length > 0) {
                return firstError.message;
            }
            /**
             * 后端 message 缺失：从 extensions.code 查 ERROR_CODES 字典
             * - 后端有些业务异常不传 message（如 Zod 校验失败由全局 filter 兜底）
             * - 此时拿 code 查表给用户友好提示
             */
            const code = firstError.extensions?.code;
            if (code !== undefined && code !== null) {
                return translateErrorCode(code);
            }
        }
    }

    // 其次取错误对象的 message
    if (clientError?.message) {
        return clientError.message;
    }

    // 兜底
    return '操作失败，请稍后重试';
}

/**
 * 判断是否为认证错误（HTTP 401）
 *
 * @param error graphql-request 抛出的错误
 * @returns 是否为 401 认证错误
 */
export function isAuthError(error: unknown): boolean {
    const clientError = error as ClientErrorLike;
    return clientError?.response?.status === 401;
}
