/** JWT Payload：只存不可变信息 + 撤销/版本控制字段 */
export interface JwtPayload {
  sub: string;
  userType: string;
  /** token 版本号（签发时的 account.tokenVersion，改密/踢人后失效） */
  tokenVersion?: number;
  /** JWT ID（唯一，用于精确撤销与 refresh 重用检测） */
  jti?: string;
}

/** 认证后的账户信息（挂到 request.account） */
export interface AuthAccount {
  accountId: string;
  userType: string;
}
