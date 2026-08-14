import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import * as apiClient from '@starter/api-client';
import { UsersPage } from './users-page';

// 部分 mock：只替换生成的 hooks，保留 schema/ApiClientError 等真实导出
vi.mock('@starter/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@starter/api-client')>();
  return {
    ...actual,
    useUsersControllerList: vi.fn<() => unknown>(),
    useUsersControllerCreate: vi.fn<() => unknown>(),
    useUsersControllerUpdate: vi.fn<() => unknown>(),
    useUsersControllerRemove: vi.fn<() => unknown>(),
  };
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersPage />
    </QueryClientProvider>
  );
}

const mockUsers = [
  {
    id: '1',
    username: 'alice',
    email: 'alice@example.com',
    role: 'admin' as const,
    status: 'active' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '2',
    username: 'bob',
    email: 'bob@example.com',
    role: 'member' as const,
    status: 'locked' as const,
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];

const mockListResult = {
  data: { items: mockUsers, total: 2, page: 1, pageSize: 10 },
  isLoading: false,
  isError: false,
} as unknown as ReturnType<typeof apiClient.useUsersControllerList>;

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.useUsersControllerList).mockReturnValue(mockListResult);
    vi.mocked(apiClient.useUsersControllerCreate).mockReturnValue({
      mutateAsync: vi.fn<() => Promise<void>>(),
    } as unknown as ReturnType<typeof apiClient.useUsersControllerCreate>);
    vi.mocked(apiClient.useUsersControllerUpdate).mockReturnValue({
      mutateAsync: vi.fn<() => Promise<void>>(),
    } as unknown as ReturnType<typeof apiClient.useUsersControllerUpdate>);
    vi.mocked(apiClient.useUsersControllerRemove).mockReturnValue({
      mutateAsync: vi.fn<() => Promise<void>>(),
    } as unknown as ReturnType<typeof apiClient.useUsersControllerRemove>);
  });

  it('渲染用户表格与状态标签', () => {
    renderPage();

    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('locked')).toBeInTheDocument();
  });

  it('空列表显示空态', () => {
    vi.mocked(apiClient.useUsersControllerList).mockReturnValue({
      ...mockListResult,
      data: { items: [], total: 0, page: 1, pageSize: 10 },
    } as ReturnType<typeof apiClient.useUsersControllerList>);

    renderPage();

    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('创建表单：无效输入展示 zod 校验错误且不调用创建接口', { timeout: 15000 }, async () => {
    const createMutateAsync = vi.fn<() => Promise<void>>();
    vi.mocked(apiClient.useUsersControllerCreate).mockReturnValue({
      mutateAsync: createMutateAsync,
    } as unknown as ReturnType<typeof apiClient.useUsersControllerCreate>);

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '新建用户' }));
    // jsdom 中 antd Modal 的出现动画（rc-motion）需要约 1-2s 完成，等待超时放宽
    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: '确 定' })).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'ab' } });
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: '确 定' }));

    await waitFor(
      () => {
        expect(screen.getByText('用户名至少 3 个字符')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
    expect(createMutateAsync).not.toHaveBeenCalled();
  });
});
