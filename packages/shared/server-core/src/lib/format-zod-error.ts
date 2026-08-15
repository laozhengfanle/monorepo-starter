import type { ZodError } from 'zod';

/** 字段级错误（field 用点号连接路径，如 "roleIds.0"） */
export interface FieldError {
  field: string;
  message: string;
}

/** ZodError → 字段级错误列表（供 GraphQL extensions.fields 使用） */
export function formatZodError(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}
