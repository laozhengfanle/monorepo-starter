import { Typography } from 'antd';
import { HealthStatus } from '../../health/health-status';

export function DashboardPage(): React.JSX.Element {
  return (
    <div>
      <Typography.Title level={1}>monorepo-starter</Typography.Title>
      <HealthStatus />
    </div>
  );
}
