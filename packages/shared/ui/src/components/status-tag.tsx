import { Tag } from 'antd';
import type { UserVo } from '@starter/contracts';

const STATUS_COLORS: Record<UserVo['status'], string> = {
  active: 'green',
  disabled: 'orange',
  locked: 'red',
};

/** 用户状态标签：色值映射集中在 STATUS_COLORS，业务规则变化只改这里 */
export function StatusTag({ status }: { status: UserVo['status'] }): React.JSX.Element {
  return <Tag color={STATUS_COLORS[status]}>{status}</Tag>;
}
