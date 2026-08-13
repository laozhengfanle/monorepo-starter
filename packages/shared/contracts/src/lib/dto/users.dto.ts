import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { paginatedSchema, paginationQuerySchema } from '../schemas/common.js';
import { CreateUserSchema, UpdateUserSchema, UserVoSchema } from '../schemas/users.js';

/** 创建用户入参（原始输入型：role/status 可选，默认值由校验层填充） */
export type CreateUserInput = z.input<typeof CreateUserSchema>;
/** 更新用户入参（原始输入型） */
export type UpdateUserInput = z.input<typeof UpdateUserSchema>;

/** 创建用户入参（经校验管道后的完整 DTO，用于 Swagger 文档） */
export class CreateUserDto extends createZodDto(CreateUserSchema) {}

/** 更新用户入参（全字段可选） */
export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}

/** 用户列表查询参数（分页） */
export class QueryUsersDto extends createZodDto(paginationQuerySchema) {}

/** 用户视图对象（出参） */
export class UserVo extends createZodDto(UserVoSchema) {}

/** 用户分页响应负载 */
export class PaginatedUsersResponseDto extends createZodDto(paginatedSchema(UserVoSchema)) {}
