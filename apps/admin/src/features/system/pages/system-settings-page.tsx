import { Card, Empty } from 'antd';

/** 系统设置 → 后台设置（占位页，对齐老项目 配置中心/后台设置） */
export function SystemSettingsPage(): React.JSX.Element {
  return (
    <Card title="后台设置">
      <Empty
        description="功能开发中，敬请期待"
        style={{ padding: '48px 0' }}
      />
    </Card>
  );
}
