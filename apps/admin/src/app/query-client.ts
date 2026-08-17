import { QueryClient } from '@tanstack/react-query';

/**
 * 全局 QueryClient 单例：
 * - app.tsx 用它包 QueryClientProvider（保证 Provider 与 logout 清理的是同一实例）
 * - auth-context logout 时调用 queryClient.clear()，防止跨账号的 TanStack Query 数据残留
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});
