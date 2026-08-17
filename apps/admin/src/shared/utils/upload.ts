import axios from 'axios';
import type { UploadResult } from '@starter/api-client';
import { authHeaders } from './http.js';

/**
 * 通用文件上传（走存储驱动，默认本地落盘）
 * @param file 文件
 * @param folder 存储文件夹（avatars / logos / files，白名单由后端校验）
 * @returns 上传结果（含可访问 url）
 */
export async function uploadFileApi(
  file: File,
  folder: string,
): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  if (folder) {
    form.append('folder', folder);
  }
  const { data } = await axios.post<UploadResult>('/api/upload', form, {
    headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
