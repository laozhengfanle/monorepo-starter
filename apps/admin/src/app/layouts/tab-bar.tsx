import { MoreOutlined } from '@ant-design/icons';
import { Button, Dropdown, theme } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTabBar } from './tab-bar-provider.js';

/** 多标签页栏：滑块指示器 + 关闭当前/其它/全部 + 刷新 */
export function TabBar(): React.JSX.Element {
  const { tabs, activeKey, onTabClick, onTabClose, onCloseCurrent, onCloseOthers, onCloseAll, onReload } =
    useTabBar();
  const { token } = theme.useToken();
  const scrollRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState({ left: '0px', width: '0px', opacity: 0 });

  const menuItems = [
    { key: 'current', label: '关闭当前' },
    { key: 'other', label: '关闭其它' },
    { key: 'all', label: '全部关闭' },
    { type: 'divider' as const },
    { key: 'reload', label: '重新加载' },
  ];

  const onMenuClick = ({ key }: { key: string }): void => {
    switch (key) {
      case 'current':
        onCloseCurrent();
        break;
      case 'other':
        onCloseOthers();
        break;
      case 'all':
        onCloseAll();
        break;
      case 'reload':
        onReload();
        break;
    }
  };

  const updateIndicator = useCallback((): void => {
    const container = scrollRef.current;
    const btn = btnRefs.current.get(activeKey);
    if (!container || !btn) {
      setIndicatorStyle((prev) => ({ ...prev, opacity: 0 }));
      return;
    }
    const cr = container.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    setIndicatorStyle({
      left: `${br.left - cr.left + container.scrollLeft}px`,
      width: `${br.width}px`,
      opacity: 1,
    });
  }, [activeKey]);

  useEffect(() => {
    updateIndicator();
  }, [activeKey, tabs, updateIndicator]);

  const bgColor = token.colorBgContainer;
  const borderColor = token.colorBorderSecondary;
  const activeColor = token.colorPrimary;

  return (
    <div
      className="flex items-center border-b shrink-0"
      style={{ paddingLeft: 16, borderColor, background: bgColor }}
    >
      <div className="relative flex-1 min-w-0">
        <div
          ref={scrollRef}
          className="tab-scroll relative flex items-center gap-1.5 py-1.5 overflow-x-auto"
        >
          <div
            className="absolute top-1/2 -translate-y-1/2 h-8 pointer-events-none transition-all duration-300 ease-out"
            style={{
              left: indicatorStyle.left,
              width: indicatorStyle.width,
              opacity: indicatorStyle.opacity,
              borderRadius: token.borderRadius,
              background: `${activeColor}1a`,
            }}
          />

          {tabs.map((tab) => {
            const active = tab.key === activeKey;
            return (
              <div
                key={tab.key}
                ref={(el) => {
                  if (el) btnRefs.current.set(tab.key, el);
                  else btnRefs.current.delete(tab.key);
                }}
                className={`group relative flex items-center shrink-0 ${tab.closable ? 'pr-1.5' : ''} ${
                  active ? '' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <button
                  type="button"
                  className={`flex items-center px-3 h-8 text-[13px] cursor-pointer select-none whitespace-nowrap transition-colors duration-300 ${
                    active ? '' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  style={{
                    borderRadius: token.borderRadius,
                    ...(active ? { color: activeColor } : {}),
                  }}
                  onClick={() => onTabClick(tab.key)}
                >
                  <span>{tab.label}</span>
                </button>
                {tab.closable && (
                  <button
                    type="button"
                    aria-label={`关闭 ${tab.label}`}
                    className={`flex items-center justify-center w-3.5 h-3.5 rounded text-xs leading-none cursor-pointer transition-opacity duration-150 ${
                      active ? 'opacity-40 hover:opacity-100' : 'opacity-0 group-hover:opacity-40'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTabClose(tab.key);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-10"
          style={{ background: `linear-gradient(to left, ${bgColor}, transparent)` }}
        />
      </div>

      <div className="flex items-center shrink-0 pl-2 pr-1">
        <Dropdown trigger={['hover']} menu={{ items: menuItems, onClick: onMenuClick }}>
          <Button type="text" size="small" icon={<MoreOutlined />} />
        </Dropdown>
      </div>
    </div>
  );
}
