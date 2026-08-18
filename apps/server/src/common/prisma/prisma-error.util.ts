/**
 * Prisma 唯一约束冲突检测（P2002）。
 * 单一事实源：admin-account / admin-role / system-dict / admin-menu 等业务层
 * 将 P2002 映射为各自业务错误码（USERNAME_EXISTS / ROLE_CODE_EXISTS / ...）时统一引用本函数，
 * 避免四处复制「typeof error === 'object' && 'code' in error」样板。
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}
