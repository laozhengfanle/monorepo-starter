import { Injectable } from '@nestjs/common';
import { BizException } from '@starter/server-core';
import type {
  CreateUserInput,
  PaginatedData,
  UpdateUserInput,
  UserVo,
} from '@starter/contracts';
import { UserRepository, type PageQuery } from './user.repository.js';

const USER_NOT_FOUND = 'USER_NOT_FOUND';

/**
 * 用户业务逻辑。
 * 响应约定：成功路径直接返回领域数据（与 OpenAPI spec 的 200 schema 一致，
 * 前端 SDK 无需解包）；失败路径抛 BizException → 全局过滤器统一映射为
 * `{ success: false, error }` envelope。
 */
@Injectable()
export class UsersService {
  constructor(private readonly repository: UserRepository) {}

  async list(query: PageQuery): Promise<PaginatedData<UserVo>> {
    return this.repository.findAll(query);
  }

  async findById(id: string): Promise<UserVo> {
    const user = await this.repository.findById(id);
    if (!user) {
      throw new BizException({ code: USER_NOT_FOUND, message: '用户不存在' });
    }
    return user;
  }

  create(input: CreateUserInput): Promise<UserVo> {
    return this.repository.create(input);
  }

  async update(id: string, input: UpdateUserInput): Promise<UserVo> {
    const updated = await this.repository.update(id, input);
    if (!updated) {
      throw new BizException({ code: USER_NOT_FOUND, message: '用户不存在' });
    }
    return updated;
  }

  async remove(id: string): Promise<UserVo> {
    const removed = await this.repository.delete(id);
    if (!removed) {
      throw new BizException({ code: USER_NOT_FOUND, message: '用户不存在' });
    }
    return removed;
  }

  /** 已删除用户列表（回收站） */
  async listDeleted(query: PageQuery): Promise<PaginatedData<UserVo>> {
    return this.repository.listDeleted(query);
  }

  /** 恢复已软删用户 */
  async restore(id: string): Promise<UserVo> {
    const restored = await this.repository.restore(id);
    if (!restored) {
      throw new BizException({ code: USER_NOT_FOUND, message: '用户不存在或未删除' });
    }
    return restored;
  }

  /** 彻底删除（硬删） */
  async hardRemove(id: string): Promise<UserVo> {
    const removed = await this.repository.hardDelete(id);
    if (!removed) {
      throw new BizException({ code: USER_NOT_FOUND, message: '用户不存在' });
    }
    return removed;
  }
}
