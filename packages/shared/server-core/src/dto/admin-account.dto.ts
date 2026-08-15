import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  AdminAccountSchema,
  CreateAdminAccountSchema,
  SaveAccountMenusSchema,
  UpdateAdminAccountSchema,
  paginationQuerySchema,
} from '@starter/contracts';

/** 创建管理员入参 */
export class CreateAdminAccountDto extends createZodDto(CreateAdminAccountSchema) {}

/** 更新管理员入参（全字段可选） */
export class UpdateAdminAccountDto extends createZodDto(UpdateAdminAccountSchema) {}

/** 保存账户特例授权入参 */
export class SaveAccountMenusDto extends createZodDto(SaveAccountMenusSchema) {}

/** 账户列表查询参数（分页 + 可选 includeDeleted 软删除视图） */
export class QueryAdminAccountsDto extends createZodDto(
  paginationQuerySchema.extend({
    // 查询串为字符串，兼容 'true'/'false'
    includeDeleted: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  }),
) {}

/** 管理端账户视图对象（出参） */
export class AdminAccountVo extends createZodDto(AdminAccountSchema) {}
