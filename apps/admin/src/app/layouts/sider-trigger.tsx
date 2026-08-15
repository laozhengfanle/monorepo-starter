import { theme } from 'antd';

interface SiderTriggerProps {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * 侧栏折叠触发器（自绘 SVG 单箭头）：
 * - 展开态指向左（‹），收起态指向右（›）
 * - 用 scaleX(-1) 水平翻转切换方向，箭头角度不受旋转影响
 * - 悬浮在侧栏右边缘，圆角按钮 + 轻投影
 */
export function SiderTrigger({ collapsed, onToggle }: SiderTriggerProps): React.JSX.Element {
  const { token } = theme.useToken();

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
      className="absolute top-1/2 -translate-y-1/2 translate-x-1/2 right-0 z-10 flex items-center justify-center w-7 h-7 rounded-full cursor-pointer transition-colors duration-200 hover:border-blue-400 hover:text-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
      style={{
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        color: token.colorTextSecondary,
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.08)',
      }}
    >
      {/* 单箭头：指向左（收起侧栏） / 水平翻转后指向右（展开侧栏） */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        aria-hidden
        style={{
          transform: collapsed ? 'scaleX(-1)' : 'none',
          transition: 'transform 0.2s ease',
        }}
      >
        <path
          d="M14.5 5 L8 12 L14.5 19"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
