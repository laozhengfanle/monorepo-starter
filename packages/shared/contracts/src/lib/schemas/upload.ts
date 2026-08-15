import { z } from 'zod';

/** 上传结果（返回给前端） */
export const UploadResultSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  /** 可访问 URL（/uploads/{storedName}） */
  url: z.string(),
});

export type UploadResult = z.infer<typeof UploadResultSchema>;
