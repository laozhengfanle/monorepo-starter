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
}: {
  option: EChartsCoreOption;
  height?: number | string;
  className?: string;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // init / dispose
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // option 更新（setOption 触发渐变过渡）
  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={containerRef} className={className} style={{ width: '100%', height }} />;
}
