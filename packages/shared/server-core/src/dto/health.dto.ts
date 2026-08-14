import { createZodDto } from 'nestjs-zod';
import { HealthSchema } from '@starter/contracts';

/** 健康检查响应视图对象 */
export class HealthVo extends createZodDto(HealthSchema) {}
