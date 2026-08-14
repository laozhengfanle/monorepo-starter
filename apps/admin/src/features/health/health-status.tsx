import { Tag } from 'antd';
import { useHealthControllerCheck } from '@starter/api-client';

/** 服务健康状态展示：调用生成的 health hook，展示服务名/版本与状态 */
export function HealthStatus(): React.JSX.Element {
  const { data, isLoading, isError } = useHealthControllerCheck();

  if (isLoading) {
    return <Tag>检查中…</Tag>;
  }
  if (isError || !data) {
    return <Tag color="red">服务不可用</Tag>;
  }
  const color = data.status === 'ok' ? 'green' : 'orange';
  return (
    <Tag color={color}>
      {data.service} v{data.version}（{data.status}）
    </Tag>
  );
}
