import { Card, Col, Row, Statistic, Table, Tag, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { RiseOutlined, SafetyCertificateOutlined, ShoppingCartOutlined, UserOutlined } from '@ant-design/icons';
import { StatusTag } from '@starter/ui';
import { useAuth } from '../../../app/auth/auth-context.js';
import { usePermission } from '../../../app/auth/use-permission.js';
import {
  useDashboardUsersTotalQuery,
  useDashboardAccountsTotalQuery,
  useDashboardRolesTotalQuery,
  useDashboardRecentUsersQuery,
} from '../../../generated/graphql';
import type { User, UserRole } from '../../../generated/graphql';
import { HealthStatus } from '../../health/health-status';

const roleLabels: Record<UserRole, string> = {
  admin: '管理员',
  member: '普通成员',
};

/** 最近用户表列（对标 antd-admin 最近订单表） */
const columns: ColumnsType<User> = [
  { title: '用户名', dataIndex: 'username', key: 'username' },
  { title: '邮箱', dataIndex: 'email', key: 'email' },
  {
    title: '角色',
    dataIndex: 'role',
    key: 'role',
    render: (role: UserRole) => <Tag>{roleLabels[role] ?? role}</Tag>,
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    render: (status: User['status']) => <StatusTag status={status} />,
  },
  { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
];

/** 仪表盘（对标 antd-admin DashboardWelcome）：统计卡片 + 最近用户 + 健康检查 */
export function DashboardPage(): React.JSX.Element {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const canUsers = usePermission('user:list');
  const canAccounts = usePermission('account:list');
  const canRoles = usePermission('role:list');

  const { data: usersData } = useDashboardUsersTotalQuery({ skip: !canUsers });
  const { data: accountsData } = useDashboardAccountsTotalQuery({ skip: !canAccounts });
  const { data: rolesData } = useDashboardRolesTotalQuery({ skip: !canRoles });
  const { data: recentData } = useDashboardRecentUsersQuery({ skip: !canUsers });

  const totalUsers = usersData?.users.total ?? 0;
  const totalAccounts = accountsData?.adminAccounts.total ?? 0;
  const totalRoles = rolesData?.adminRoles.length ?? 0;
  const totalPermissions = user?.permissions.length ?? 0;
  const recentUsers = recentData?.users.items ?? [];

  return (
    <>
      <Row gutter={[token.marginMD, token.marginMD]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="用户总数" value={totalUsers} prefix={<UserOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="管理账户" value={totalAccounts} prefix={<ShoppingCartOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="角色数" value={totalRoles} prefix={<SafetyCertificateOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="我的权限点"
              value={totalPermissions}
              prefix={<RiseOutlined />}
              styles={{ content: { color: totalPermissions > 0 ? '#3f8600' : '#cf1322' } }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="最近用户" style={{ marginTop: token.marginMD }}>
        <Table
          dataSource={recentUsers}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="small"
          locale={{ emptyText: '暂无数据' }}
        />
      </Card>

      <Card title="健康检查" style={{ marginTop: token.marginMD }}>
        <HealthStatus />
      </Card>
    </>
  );
}
