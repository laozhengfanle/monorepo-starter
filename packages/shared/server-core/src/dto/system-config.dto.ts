import { createZodDto } from 'nestjs-zod';
import { BatchUpdateConfigsSchema, UpdateConfigSchema } from '@starter/contracts';

/** 更新单个配置入参（PUT /admin/configs/:key） */
export class UpdateConfigDto extends createZodDto(UpdateConfigSchema) {}

/** 批量更新配置入参（POST /admin/configs/batch） */
export class BatchUpdateConfigsDto extends createZodDto(BatchUpdateConfigsSchema) {}
