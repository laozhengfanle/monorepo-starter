import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

// ECharts 按需注册（只引入用到的模块，控制体积）
echarts.use([
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

export type { EChartsCoreOption };

/**
 * ECharts 轻封装（React 19）：
 * - 挂载时 init，option 变化时 setOption（不重建实例，保留动画过渡）
 * - ResizeObserver 自适应容器尺寸
 * - 卸载时 dispose 释放实例
 */
export function EChart({
  option,
  height = 240,
  className,
  replayKey,
}: {
  option: EChartsCoreOption;
  height?: number | string;
  className?: string;
  /** 变化时强制重放入场动画：页面被缓存复用时（keep-alive/tab 切换），
   *   echarts 实例与 option 均不变，动画不会自动重播——外部传入激活计数即可重放 */
  replayKey?: number;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // init / dispose
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;
    // dev 调试：暴露实例便于检查动画配置（生产无此逻辑）
    if (import.meta.env.DEV) {
      const debugWindow = window as unknown as Record<string, unknown>;
      const debugCharts = debugWindow.__charts as unknown[] | undefined;
      const charts = debugCharts ?? [];
      if (!debugCharts) {
        debugWindow.__charts = charts;
      }
      charts.push(chart);
    }
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // option 更新（setOption 触发渐变过渡）
  // 注意：不用 notMerge —— 全量替换会跳过 echarts 的初始/过渡动画；
  // merge 模式下首次渲染与数据更新都能播放动画。
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (replayKey !== undefined && replayKey > 0) {
      // 重放：clear 清空画布后再 setOption，从空态画到目标 → 入场动画重播
      chart.clear();
    }
    chart.setOption(option);
  }, [option, replayKey]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height }}
    />
  );
}
