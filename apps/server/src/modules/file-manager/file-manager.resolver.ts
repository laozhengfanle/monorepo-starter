import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { FilePageSchema, FilePageSizeSchema } from '@starter/contracts';
import { ZodArgsPipe } from '@starter/server-core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import type { AuthAccount } from '../auth/auth.types.js';
import { FileManagerService } from './file-manager.service.js';
import {
  PaginatedUploadFilesType,
  UploadFileType,
} from './file-manager.type.js';

/** 文件管理 GraphQL Resolver（权限 config:file:*） */
@Resolver(() => UploadFileType)
@UseGuards(JwtAuthGuard, PermissionGuard)
export class FileManagerResolver {
  constructor(private readonly fileManagerService: FileManagerService) {}

  @Query(() => PaginatedUploadFilesType)
  @RequirePermission('config:file:view')
  async uploadFiles(
    @Args(
      'page',
      { type: () => Int, nullable: true, defaultValue: 1 },
      new ZodArgsPipe(FilePageSchema),
    )
    page: number,
    // pageSize ≤ 100（与 admin-account/audit-log 分页上限对齐，ZodArgsPipe 拒绝超限）
    @Args(
      'pageSize',
      { type: () => Int, nullable: true, defaultValue: 20 },
      new ZodArgsPipe(FilePageSizeSchema),
    )
    pageSize: number,
    @Args('includeDeleted', {
      type: () => Boolean,
      nullable: true,
      defaultValue: false,
    })
    includeDeleted?: boolean,
  ): Promise<PaginatedUploadFilesType> {
    const result = await this.fileManagerService.list({
      page,
      pageSize,
      includeDeleted,
    });
    return {
      items: result.items as UploadFileType[],
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  @Mutation(() => UploadFileType)
  @RequirePermission('config:file:delete')
  async deleteUploadFile(
    @Args('id', { type: () => ID }) id: string,
    @CurrentAccount() account: AuthAccount,
  ): Promise<UploadFileType> {
    return this.fileManagerService.remove(id, account.accountId);
  }
}
