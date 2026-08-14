import { z } from 'zod';

/** 健康检查响应 */
export const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.string().min(1),
  version: z.string().min(1),
});

export type HealthVo = z.infer<typeof HealthSchema>;
