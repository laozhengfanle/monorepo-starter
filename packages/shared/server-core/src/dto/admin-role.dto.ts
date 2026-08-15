import { createZodDto } from 'nestjs-zod';
import { CreateRoleSchema, UpdateRoleSchema } from '@starter/contracts';

/** 创建角色入参 */
export class CreateRoleDto extends createZodDto(CreateRoleSchema) {}

/** 更新角色入参（全字段可选） */
export class UpdateRoleDto extends createZodDto(UpdateRoleSchema) {}
