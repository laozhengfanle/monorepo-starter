import type { ZodError } from 'zod';

/**
 * ZodError 格式化字段错误
 * - 将 ZodError 的 issues 转换为 [{ field, message }] 格式
 * - field 使用点号连接路径（如 "roleIds.0"）
 */
export interface FieldError {
    field: string;
    message: string;
}

export function formatZodError(error: ZodError): FieldError[] {
    return error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
    }));
}
