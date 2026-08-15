import { createZodDto } from 'nestjs-zod';
import {
  CreateDictItemSchema,
  CreateDictTypeSchema,
  UpdateDictItemSchema,
  UpdateDictTypeSchema,
} from '@starter/contracts';

/** 创建字典类型入参（REST） */
export class CreateDictTypeDto extends createZodDto(CreateDictTypeSchema) {}

/** 更新字典类型入参（REST，全字段可选） */
export class UpdateDictTypeDto extends createZodDto(UpdateDictTypeSchema) {}

/** 创建字典项入参（REST） */
export class CreateDictItemDto extends createZodDto(CreateDictItemSchema) {}

/** 更新字典项入参（REST，全字段可选） */
export class UpdateDictItemDto extends createZodDto(UpdateDictItemSchema) {}
