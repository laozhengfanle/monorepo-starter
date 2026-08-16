import { useEffect, useRef, useState } from 'react';
import { Spin } from 'antd';

/** Cloudflare Turnstile 脚本（explicit rendering，SPA 场景官方推荐） */
const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          theme?: 'light' | 'dark' | 'auto';
          /** flexible: 自适应容器宽度（min 300px，官方支持，与表单输入框等宽） */
          size?: 'normal' | 'flexible' | 'compact';
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

/** 脚本加载 Promise（模块级单例，避免重复注入） */
let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Turnstile 脚本加载失败'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * Cloudflare Turnstile 人机验证组件（explicit rendering）
 *
 * - siteKey 变化/组件卸载时重建或移除 widget
 * - 验证成功回调 onToken；过期自动 reset（表单可再次提交）
 * - 脚本加载失败显示占位（不阻塞登录，后端未启用时无感）
 */
export function TurnstileWidget({
  siteKey,
  onToken,
  dark = false,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  dark?: boolean | 'light' | 'dark';
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // 用 ref 保存最新 onToken 回调，避免回调变化触发 widget 重建
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        // 容器内可能残留旧 widget（重建前清掉）
        containerRef.current.innerHTML = '';
        try {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            theme: dark === true ? 'dark' : dark === false ? 'light' : dark,
            // 弹性宽度：自动适配容器宽度（min 300px，官方支持，与输入框等宽）
            size: 'flexible',
            callback: (token) => {
              onTokenRef.current(token);
            },
            'expired-callback': () => {
              onTokenRef.current('');
            },
          });
        } catch (err) {
          console.error('Turnstile render failed:', err);
          setFailed(true);
          return;
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // siteKey / dark 变化时重建（onToken 经 ref 引用，不进依赖数组）
  }, [siteKey, dark]);

  if (failed) {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}
      >
        <span style={{ fontSize: 12, color: '#999' }}>
          人机验证加载失败（不影响登录）
        </span>
      </div>
    );
  }
  return (
    <div style={{ width: '100%', minHeight: 44, position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%' }} />
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Spin size="small" />
        </div>
      )}
    </div>
  );
}
