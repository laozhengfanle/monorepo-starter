import type { FormInstance } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';

/** zod safeParse 失败结果的窄化类型（供 applyZodErrors 消费） */
interface ZodFailResult {
  success: false;
  error: { issues: { path: PropertyKey[]; message: string }[] };
}

/** 默认兜底错误文案（与原各页面一致） */
const DEFAULT_ERROR_MESSAGE = '操作失败，请稍后重试';

/**
 * 把 zod 校验失败映射为 antd 表单字段错误。
 * 统一 admin-accounts / admin-roles / admin-menus / account/settings 四处的重复实现。
 */
export function applyZodErrors(
  form: FormInstance,
  result: ZodFailResult,
): void {
  form.setFields(
    result.error.issues.map((issue) => ({
      name: issue.path.map(String),
      errors: [issue.message],
    })),
  );
}

/**
 * 未知错误 → 用户可读文案：
 * Apollo v3 ApolloError / v4 CombinedGraphQLErrors 均为 Error 子类，
 * message 即服务端 GraphQL 错误文案，其余走兜底文案。
 */
export function toErrorMessage(
  error: unknown,
  fallback = DEFAULT_ERROR_MESSAGE,
): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

/** GraphQL 错误 → 用户提示（message 必须来自 App.useApp()，静态方法无法消费动态主题） */
export function showMutationError(
  message: MessageInstance,
  error: unknown,
): void {
  void message.error(toErrorMessage(error));
}
