import { Card, Col, Row, Statistic, Typography } from 'antd';
import { CheckCircleOutlined, CloudServerOutlined, SafetyCertificateOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { PageHeader } from '@starter/ui';
import { useAuth } from '../../../app/auth/auth-context.js';
import { HealthStatus } from '../../health/health-status';

/** 仪表盘：欢迎 + 服务概览卡片 + 健康检查 */
export function DashboardPage(): React.JSX.Element {
  const { user } = useAuth();

  return (
    <div>
      <PageHeader title="仪表盘" description={`欢迎回来，${user?.nickname || user?.username}`} />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="服务状态"
              value="运行中"
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="API 协议" value="GraphQL + REST" prefix={<ThunderboltOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="服务架构" value="NestJS" prefix={<CloudServerOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="当前角色"
              value={user?.roleCodes.join(', ') || '-'}
              prefix={<SafetyCertificateOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card title="健康检查" size="small">
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          /health（服务存活）与 /health/readiness（DB + 内存探活）实时状态：
        </Typography.Paragraph>
        <HealthStatus />
      </Card>
    </div>
  );
}
