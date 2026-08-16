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

/** 上传文件元数据项（管理端列表） */
export const UploadFileSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  storedName: z.string(),
  mimeType: z.string(),
  /** 字节数 */
  size: z.number().int().nonnegative(),
  url: z.string(),
  accountId: z.string().nullable(),
  createdAt: z.string(),
  /** 软删除时间（未删为 null） */
  deletedAt: z.string().nullable(),
});

export type UploadFile = z.infer<typeof UploadFileSchema>;
