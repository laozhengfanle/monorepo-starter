import { useCallback, useState } from 'react';

/**
 * localStorage 持久化状态 Hook（对标旧版 usePersistedState）。
 * 刷新/重开浏览器后偏好保持；写入失败静默忽略。
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setPersistedState = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // 静默忽略写入失败（隐私模式等）
        }
        return next;
      });
    },
    [key],
  );

  return [state, setPersistedState];
}
