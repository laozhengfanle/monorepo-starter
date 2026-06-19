/**
 * API 工具函数
 *
 * 提供分页相关的通用类型，供各 API 模块使用。
 */

/** 通用的分页结果 */
export interface PaginatedResult<T> {
    data: T[];
    total: number;
}

/** 分页请求参数 */
export type PaginatedParams = { page: number; pageSize: number };

/** 管理员列表筛选参数（与服务端 GraphQL QueryAdminAccountInput 对齐） */
export interface UserFilterParams {
    username?: string;
    email?: string;
    roleId?: string;
    /**
     * 按启用状态筛选（对应后端 Account.enabled）
     * - undefined / null：全部
     * - true：只查「正常」账户
     * - false：只查「禁用」账户
     */
    enabled?: boolean;
    /**
     * 是否包含已软删账户（对应后端 QueryAdminAccountInput.includeDeleted）
     * - undefined / false：仅看活跃账户（默认）
     * - true：含已软删账户（用于「恢复 / 彻底删除」流程）
     *
     * 之前软删除视图用单独的 getAllAccounts() 走全量不分页，会让分页器消失。
     * 现在统一走分页接口 + includeDeleted=true，分页器一直存在，
     * 避免「勾选软删除后点查询页码消失」的副作用。
     */
    includeDeleted?: boolean;
}
