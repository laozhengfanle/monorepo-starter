import { Injectable } from '@nestjs/common';
import { CreateUserSchema, UpdateUserSchema } from '@starter/contracts';
import type {
  CreateUserInput,
  PaginatedData,
  UpdateUserInput,
  UserVo,
} from '@starter/contracts';
import { BizException } from '@starter/server-core';
import type { Prisma } from '../generated/prisma-client/client.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { UserRepository, type PageQuery } from './user.repository.js';

/** Prisma 唯一约束冲突检测（P2002） */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}

/** Prisma User 行 → UserVo（去除内部字段 updatedAt/deletedAt） */
function toUserVo(row: {
  id: string;
  username: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
}): UserVo {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role as UserVo['role'],
    status: row.status as UserVo['status'],
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Prisma 版用户仓储（阶段 1：验证数据层链路）。
 * - UUID v7 由 autoIdExtension 自动注入
 * - 软删除由 softDeleteExtension 拦截（delete → 置 deletedAt）
 */
@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PageQuery): Promise<PaginatedData<UserVo>> {
    // 注意：softDeleteExtension 只拦截 find* 与 delete*，count 需手动过滤 deletedAt
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.user.findMany({
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.user.count({ where: { deletedAt: null } }),
    ]);
    return {
      items: rows.map(toUserVo),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findById(id: string): Promise<UserVo | null> {
    const row = await this.prisma.client.user.findUnique({ where: { id } });
    return row ? toUserVo(row) : null;
  }

  async create(input: CreateUserInput): Promise<UserVo> {
    const data = CreateUserSchema.parse(input);
    // id 由 autoIdExtension 运行时注入（UUID v7）；Prisma 类型层面 id 仍必填，故断言
    try {
      const row = await this.prisma.client.user.create({
        data: {
          username: data.username,
          email: data.email,
          role: data.role,
          status: data.status,
        } as unknown as Prisma.UserCreateInput,
      });
      return toUserVo(row);
    } catch (error) {
      // 唯一约束冲突（username/email 已存在，含软删记录）：映射为业务错误而非 500
      if (isUniqueConstraintError(error)) {
        throw new BizException({ code: 'USERNAME_OR_EMAIL_EXISTS', message: '用户名或邮箱已存在' });
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateUserInput): Promise<UserVo | null> {
    const existing = await this.prisma.client.user.findUnique({ where: { id } });
    if (!existing) {
      return null;
    }
    const data = UpdateUserSchema.parse(input);
    const row = await this.prisma.client.user.update({
      where: { id },
      data: {
        username: data.username,
        email: data.email,
        role: data.role,
        status: data.status,
      } as unknown as Prisma.UserUpdateInput,
    });
    return toUserVo(row);
  }

  async delete(id: string): Promise<UserVo | null> {
    const existing = await this.prisma.client.user.findUnique({ where: { id } });
    if (!existing) {
      return null;
    }
    // softDeleteExtension 将 delete 改写为 update deletedAt
    const row = await this.prisma.client.user.delete({ where: { id } });
    return toUserVo(row);
  }

  async listDeleted(query: PageQuery): Promise<PaginatedData<UserVo>> {
    const [rows, total] = await this.prisma.rawClient.$transaction([
      this.prisma.rawClient.user.findMany({
        where: { deletedAt: { not: null } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { deletedAt: 'desc' },
      }),
      this.prisma.rawClient.user.count({ where: { deletedAt: { not: null } } }),
    ]);
    return {
      items: rows.map(toUserVo),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async restore(id: string): Promise<UserVo | null> {
    const existing = await this.prisma.rawClient.user.findUnique({ where: { id } });
    if (!existing || !existing.deletedAt) {
      return null;
    }
    await this.prisma.rawClient.user.update({ where: { id }, data: { deletedAt: null } });
    return toUserVo(existing);
  }

  async hardDelete(id: string): Promise<UserVo | null> {
    const existing = await this.prisma.rawClient.user.findUnique({ where: { id } });
    if (!existing) {
      return null;
    }
    await this.prisma.rawClient.user.delete({ where: { id } });
    return toUserVo(existing);
  }
}
