import { Card, Col, Row, Statistic, theme } from 'antd';
import { RiseOutlined, SafetyCertificateOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useAuth } from '../../../app/auth/auth-context.js';
import { usePermission } from '../../../app/auth/use-permission.js';
import {
  useDashboardAccountsTotalQuery,
  useDashboardRolesTotalQuery,
} from '../../../generated/graphql';
import { HealthStatus } from '../../health/health-status';

/** 仪表盘：统计卡片（管理账户/角色数/我的权限点）+ 健康检查 */
export function DashboardPage(): React.JSX.Element {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const canAccounts = usePermission('account:list');
  const canRoles = usePermission('role:list');

  const { data: accountsData } = useDashboardAccountsTotalQuery({ skip: !canAccounts });
  const { data: rolesData } = useDashboardRolesTotalQuery({ skip: !canRoles });

  const totalAccounts = accountsData?.adminAccounts.total ?? 0;
  const totalRoles = rolesData?.adminRoles.length ?? 0;
  const totalPermissions = user?.permissions.length ?? 0;

  return (
    <>
      <Row gutter={[token.marginMD, token.marginMD]}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic title="管理账户" value={totalAccounts} prefix={<ShoppingCartOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic title="角色数" value={totalRoles} prefix={<SafetyCertificateOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
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

      <Card title="健康检查" style={{ marginTop: token.marginMD }}>
        <HealthStatus />
      </Card>
    </>
  );
}
