import { createZodDto } from 'nestjs-zod';
import { UpdateSelfSchema, ChangePasswordSchema } from '@starter/contracts';

/** 个人中心：更新自己资料（REST） */
export class UpdateSelfDto extends createZodDto(UpdateSelfSchema) {}

/** 个人中心：修改密码（REST） */
export class ChangePasswordDto extends createZodDto(ChangePasswordSchema) {}
