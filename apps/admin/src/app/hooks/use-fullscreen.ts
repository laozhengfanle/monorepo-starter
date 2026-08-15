import { useCallback, useEffect, useState } from 'react';

/** 当前是否处于全屏 */
function getFullscreenElement(): Element | null {
  return (
    document.fullscreenElement ??
    (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement ??
    (document as unknown as { mozFullScreenElement?: Element }).mozFullScreenElement ??
    null
  );
}

/** 申请全屏（兼容前缀） */
function requestFullscreen(el: Element): Promise<void> {
  const req =
    el.requestFullscreen ??
    (el as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen ??
    (el as unknown as { mozRequestFullScreen?: () => Promise<void> }).mozRequestFullScreen;
  return req ? req.call(el) : Promise.resolve();
}

/** 退出全屏（兼容前缀） */
function exitFullscreen(): Promise<void> {
  const exit =
    document.exitFullscreen ??
    (document as unknown as { webkitExitFullscreen?: () => Promise<void> }).webkitExitFullscreen ??
    (document as unknown as { mozCancelFullScreen?: () => Promise<void> }).mozCancelFullScreen;
  return exit ? exit.call(document) : Promise.resolve();
}

/**
 * 全屏切换 hook：toggle 切换，监听 fullscreenchange 自动同步状态。
 */
export function useFullscreen(): { isFullscreen: boolean; toggle: () => Promise<void> } {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => getFullscreenElement() !== null);

  useEffect(() => {
    const handler = (): void => setIsFullscreen(getFullscreenElement() !== null);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggle = useCallback(async () => {
    if (getFullscreenElement() !== null) {
      await exitFullscreen();
    } else {
      await requestFullscreen(document.documentElement);
    }
  }, []);

  return { isFullscreen, toggle };
}
