import type {
  CreateUserInput,
  PaginatedData,
  UpdateUserInput,
  UserVo,
} from '@starter/contracts';

export interface PageQuery {
  page: number;
  pageSize: number;
}

/**
 * 用户仓储接口（仓储模式）：业务层只依赖此抽象。
 * 当前提供 InMemoryUserRepository 实现；接入 Prisma 时新增实现并替换 DI 绑定即可。
 */
export abstract class UserRepository {
  abstract findAll(query: PageQuery): Promise<PaginatedData<UserVo>>;

  abstract findById(id: string): Promise<UserVo | null>;

  abstract create(input: CreateUserInput): Promise<UserVo>;

  /** 返回更新后的记录；id 不存在时返回 null */
  abstract update(id: string, input: UpdateUserInput): Promise<UserVo | null>;

  /** 返回被删除的记录；id 不存在时返回 null */
  abstract delete(id: string): Promise<UserVo | null>;

  /** 已删除用户列表（回收站；绕过软删过滤） */
  abstract listDeleted(query: PageQuery): Promise<PaginatedData<UserVo>>;

  /** 恢复已软删用户；未删除/不存在返回 null */
  abstract restore(id: string): Promise<UserVo | null>;

  /** 彻底删除（硬删）；不存在返回 null */
  abstract hardDelete(id: string): Promise<UserVo | null>;
}
