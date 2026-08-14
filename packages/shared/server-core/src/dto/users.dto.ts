import { createZodDto } from 'nestjs-zod';
import {
  CreateUserSchema,
  UpdateUserSchema,
  UserVoSchema,
  paginatedSchema,
  paginationQuerySchema,
} from '@starter/contracts';

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
