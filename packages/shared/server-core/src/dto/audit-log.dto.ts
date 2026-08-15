import { createZodDto } from 'nestjs-zod';
import { AuditLogQuerySchema } from '@starter/contracts';

/** 审计日志分页查询参数（page/pageSize + action/resourceType/startDate/endDate 筛选） */
export class QueryAuditLogsDto extends createZodDto(AuditLogQuerySchema) {}
