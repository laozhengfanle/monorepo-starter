import { createZodDto } from 'nestjs-zod';
import { CreateMenuSchema, UpdateMenuSchema } from '@starter/contracts';

/** 创建菜单入参（REST） */
export class CreateMenuDto extends createZodDto(CreateMenuSchema) {}

/** 更新菜单入参（REST） */
export class UpdateMenuDto extends createZodDto(UpdateMenuSchema) {}
