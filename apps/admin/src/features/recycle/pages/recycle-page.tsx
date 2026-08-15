import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Col, Popconfirm, Row, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { AdminAccount, UserVo } from '@starter/api-client';
import { usePermission } from '../../../app/auth/use-permission.js';
import {
  hardRemoveAccountApi,
  hardRemoveUserApi,
  listDeletedAccountsApi,
  listDeletedUsersApi,
  restoreAccountApi,
  restoreUserApi,
} from '../api.js';

const DEFAULT_PAGE_SIZE = 10;

/** 回收站（对标老项目软删除页）：已删除账户 + 已删除用户，可恢复或彻底删除 */
export function RecyclePage(): React.JSX.Element {
  const { message } = App.useApp();
  const canUpdateAccount = usePermission('account:update');
  const canDeleteAccount = usePermission('account:delete');
  const canUpdateUser = usePermission('user:update');
  const canDeleteUser = usePermission('user:delete');

  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [users, setUsers] = useState<UserVo[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [accRes, userRes] = await Promise.all([
        listDeletedAccountsApi(1, 50),
        listDeletedUsersApi(1, 50),
      ]);
      setAccounts(accRes.items);
      setUsers(userRes.items);
    } catch {
      void message.error('加载回收站失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  // 挂载时加载回收站数据
  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (
    fn: () => Promise<unknown>,
    successText: string,
  ): Promise<void> => {
    setActionLoading(true);
    try {
      await fn();
      void message.success(successText);
      await load();
    } catch {
      void message.error('操作失败，请重试');
    } finally {
      setActionLoading(false);
    }
  };

  const accountColumns: ColumnsType<AdminAccount> = [
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '昵称', dataIndex: 'nickname', key: 'nickname' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '角色',
      dataIndex: 'roleCodes',
      key: 'roleCodes',
      render: (roleCodes: string[]) => roleCodes.join(', '),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_value, account) => (
        <Space>
          {canUpdateAccount && (
            <Button
              type="link"
              size="small"
              loading={actionLoading}
              onClick={() => void runAction(() => restoreAccountApi(account.accountId), '已恢复该账户')}
            >
              恢复
            </Button>
          )}
          {canDeleteAccount && (
            <Popconfirm
              title="彻底删除？该账户的所有关联数据（身份/档案/角色/上传等）将永久删除且不可恢复"
              onConfirm={() => runAction(() => hardRemoveAccountApi(account.accountId), '已彻底删除')}
            >
              <Button type="link" size="small" danger loading={actionLoading}>
                彻底删除
              </Button>
            </Popconfirm>
          )}
          {!canUpdateAccount && !canDeleteAccount && (
            <Typography.Text type="secondary">无权限</Typography.Text>
          )}
        </Space>
      ),
    },
  ];

  const userColumns: ColumnsType<UserVo> = [
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    { title: '角色', dataIndex: 'role', key: 'role' },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_value, user) => (
        <Space>
          {canUpdateUser && (
            <Button
              type="link"
              size="small"
              loading={actionLoading}
              onClick={() => void runAction(() => restoreUserApi(user.id), '已恢复该用户')}
            >
              恢复
            </Button>
          )}
          {canDeleteUser && (
            <Popconfirm
              title="彻底删除该用户？不可恢复"
              onConfirm={() => runAction(() => hardRemoveUserApi(user.id), '已彻底删除')}
            >
              <Button type="link" size="small" danger loading={actionLoading}>
                彻底删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title="已删除账户"
            extra={
              <Button size="small" onClick={() => void load()} loading={loading}>
                刷新
              </Button>
            }
          >
            <Table<AdminAccount>
              rowKey="accountId"
              columns={accountColumns}
              dataSource={accounts}
              loading={loading}
              size="small"
              pagination={{ pageSize: DEFAULT_PAGE_SIZE, showTotal: (t) => `共 ${t} 条` }}
              locale={{ emptyText: '暂无已删除账户' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="已删除用户"
            extra={
              <Button size="small" onClick={() => void load()} loading={loading}>
                刷新
              </Button>
            }
          >
            <Table<UserVo>
              rowKey="id"
              columns={userColumns}
              dataSource={users}
              loading={loading}
              size="small"
              pagination={{ pageSize: DEFAULT_PAGE_SIZE, showTotal: (t) => `共 ${t} 条` }}
              locale={{ emptyText: '暂无已删除用户' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
