import { randomUUID } from 'node:crypto';
import { CreateUserSchema, UpdateUserSchema } from '@starter/contracts';
import type {
  CreateUserInput,
  PaginatedData,
  UpdateUserInput,
  UserVo,
} from '@starter/contracts';
import { UserRepository, type PageQuery } from './user.repository.js';

/**
 * 内存版用户仓储（演示实现）：
 * - 更新遵循不可变模式（返回新对象，不修改原记录）
 * - id 由应用层生成（UUID），不依赖数据库扩展
 * - 输入经 zod schema 归一化（应用默认值），任何入口都满足不变量
 */
export class InMemoryUserRepository implements UserRepository {
  private readonly records = new Map<string, UserVo>();

  async findAll(query: PageQuery): Promise<PaginatedData<UserVo>> {
    const all = [...this.records.values()];
    const start = (query.page - 1) * query.pageSize;
    return {
      items: all.slice(start, start + query.pageSize),
      total: all.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findById(id: string): Promise<UserVo | null> {
    return this.records.get(id) ?? null;
  }

  async create(input: CreateUserInput): Promise<UserVo> {
    const data = CreateUserSchema.parse(input);
    const record: UserVo = {
      id: randomUUID(),
      username: data.username,
      email: data.email,
      role: data.role,
      status: data.status,
      createdAt: new Date().toISOString(),
    };
    this.records.set(record.id, record);
    return record;
  }

  async update(id: string, input: UpdateUserInput): Promise<UserVo | null> {
    const existing = this.records.get(id);
    if (!existing) {
      return null;
    }
    const data = UpdateUserSchema.parse(input);
    const updated = { ...existing, ...data };
    this.records.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<UserVo | null> {
    const existing = this.records.get(id);
    if (!existing) {
      return null;
    }
    this.records.delete(id);
    return existing;
  }
}
