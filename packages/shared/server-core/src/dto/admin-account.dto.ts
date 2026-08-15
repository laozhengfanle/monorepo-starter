import { createZodDto } from 'nestjs-zod';
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

/** 账户列表查询参数（分页） */
export class QueryAdminAccountsDto extends createZodDto(paginationQuerySchema) {}

/** 管理端账户视图对象（出参） */
export class AdminAccountVo extends createZodDto(AdminAccountSchema) {}
