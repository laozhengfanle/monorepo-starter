import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom 未实现 matchMedia，antd 响应式组件（如 Sider breakpoint）需要
const matchMediaMock = vi
  .fn<(query: string) => MediaQueryList>()
  .mockImplementation(
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn<() => void>(),
        removeListener: vi.fn<() => void>(),
        addEventListener: vi.fn<() => void>(),
        removeEventListener: vi.fn<() => void>(),
        dispatchEvent: vi.fn<() => boolean>(),
      }) as MediaQueryList
  );

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: matchMediaMock,
});
