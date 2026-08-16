import axios from 'axios';
import type { UploadResult } from '@starter/api-client';
import { authStorage } from '../../app/auth/auth-storage.js';

/** 认证头（必须 REST 场景用，走 /api 前缀由 Vite 代理转发） */
function authHeaders(): Record<string, string> {
  const token = authStorage.getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * 通用文件上传（走存储驱动，默认本地落盘）
 * @param file 文件
 * @param folder 存储文件夹（avatars / logos / files，白名单由后端校验）
 * @returns 上传结果（含可访问 url）
 */
export async function uploadFileApi(file: File, folder: string): Promise<UploadResult> {
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
