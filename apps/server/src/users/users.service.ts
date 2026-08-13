import { Injectable } from '@nestjs/common';
import { BizException } from '@starter/server-core';
import type {
  ApiEnvelope,
  CreateUserInput,
  PaginatedData,
  UpdateUserInput,
  UserVo,
} from '@starter/contracts';
import { UserRepository, type PageQuery } from './user.repository.js';

const USER_NOT_FOUND = 'USER_NOT_FOUND';

@Injectable()
export class UsersService {
  constructor(private readonly repository: UserRepository) {}

  async list(query: PageQuery): Promise<ApiEnvelope<PaginatedData<UserVo>>> {
    const data = await this.repository.findAll(query);
    return {
      success: true,
      data,
      error: null,
      meta: { total: data.total, page: data.page, pageSize: data.pageSize },
    };
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
}
