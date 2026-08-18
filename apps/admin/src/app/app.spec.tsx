import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

import App from './app';

// P1-7 改造后 AuthProvider 挂载时总是调 fetchMe()（凭证在 httpOnly cookie，以 /auth/me 探测登录态）。
// jsdom 下 axios 请求不会真实发出，需 mock auth-api，否则测试卡在登录态加载的 Spin 上。
vi.mock('./auth/auth-api', () => ({
  fetchMe: vi
    .fn<() => Promise<never>>()
    .mockRejectedValue(new Error('未登录（jsdom 无会话）')),
  loginApi: vi.fn<() => Promise<never>>(),
  logoutApi: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

describe('App', () => {
  it('should render the shell heading', async () => {
    const { findByRole } = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    // 未登录时 ProtectedRoute 应重定向到 /login（登录页渲染 shell heading 前的标题）
    expect(
      await findByRole('heading', { name: 'monorepo-starter' }),
    ).toBeInTheDocument();
  });
});
