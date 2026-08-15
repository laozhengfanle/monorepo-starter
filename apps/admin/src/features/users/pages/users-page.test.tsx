import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import * as graphql from '../../../generated/graphql';
import { UsersPage } from './users-page';

// 部分 mock：只替换生成的 Apollo hooks，保留类型/enum 等真实导出
vi.mock('../../../generated/graphql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../generated/graphql')>();
  return {
    ...actual,
    useUsersQuery: vi.fn<() => unknown>(),
    useCreateUserMutation: vi.fn<() => unknown>(),
    useUpdateUserMutation: vi.fn<() => unknown>(),
    useDeleteUserMutation: vi.fn<() => unknown>(),
  };
});

// 权限检查 mock：单测不覆盖权限逻辑，直接放行
vi.mock('../../../app/auth/use-permission.js', () => ({
  usePermission: () => true,
}));

function renderPage() {
  return render(<UsersPage />);
}

const mockUsers = [
  {
    id: '1',
    username: 'alice',
    email: 'alice@example.com',
    role: 'admin' as const,
    status: 'active' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    __typename: 'User' as const,
  },
  {
    id: '2',
    username: 'bob',
    email: 'bob@example.com',
    role: 'member' as const,
    status: 'locked' as const,
    createdAt: '2026-01-02T00:00:00.000Z',
    __typename: 'User' as const,
  },
];

const mockListResult = {
  data: { users: { items: mockUsers, total: 2, page: 1, pageSize: 10 } },
  loading: false,
  refetch: vi.fn<() => Promise<unknown>>(),
} as unknown as ReturnType<typeof graphql.useUsersQuery>;

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(graphql.useUsersQuery).mockReturnValue(mockListResult);
    vi.mocked(graphql.useCreateUserMutation).mockReturnValue([
      vi.fn<() => Promise<unknown>>(),
      { loading: false },
    ] as unknown as ReturnType<typeof graphql.useCreateUserMutation>);
    vi.mocked(graphql.useUpdateUserMutation).mockReturnValue([
      vi.fn<() => Promise<unknown>>(),
      { loading: false },
    ] as unknown as ReturnType<typeof graphql.useUpdateUserMutation>);
    vi.mocked(graphql.useDeleteUserMutation).mockReturnValue([
      vi.fn<() => Promise<unknown>>(),
      { loading: false },
    ] as unknown as ReturnType<typeof graphql.useDeleteUserMutation>);
  });

  it('渲染用户表格与状态标签', () => {
    renderPage();

    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('locked')).toBeInTheDocument();
  });

  it('空列表显示空态', () => {
    vi.mocked(graphql.useUsersQuery).mockReturnValue({
      ...mockListResult,
      data: { users: { items: [], total: 0, page: 1, pageSize: 10 } },
    } as ReturnType<typeof graphql.useUsersQuery>);

    renderPage();

    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('创建表单：无效输入展示 zod 校验错误且不调用创建接口', { timeout: 15000 }, async () => {
    const createMutation = vi.fn<() => Promise<unknown>>();
    vi.mocked(graphql.useCreateUserMutation).mockReturnValue([
      createMutation,
      { loading: false },
    ] as unknown as ReturnType<typeof graphql.useCreateUserMutation>);

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /新建用户/ }));
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
    expect(createMutation).not.toHaveBeenCalled();
  });
});
