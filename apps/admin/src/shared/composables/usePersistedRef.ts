/**
 * usePersistedRef — 自动持久化到 localStorage 的 ref
 *
 * 工厂函数，替代手动 `ref() + watch()` 模式。新增状态时只需一行代码，
 * 避免遗漏 watch 导致的状态不同步。
 *
 * 用法：
 *   const theme = usePersistedRef<string>('theme', 'auto');
 *   const color = usePersistedRef<string>('primaryColor', '#18a058', {
 *       validate: isValidHexColor,
 *       onChange: (v) => console.log('color changed:', v),
 *   });
 */
import { ref, watch, type Ref } from 'vue';

/** 从 localStorage 读取值，解析失败时返回默认值 */
function loadSetting<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (raw !== null) return JSON.parse(raw) as T;
    } catch (err) {
        // localStorage 数据损坏时退回默认值
        console.warn(`[usePersistedRef] 读取 localStorage key="${key}" 失败，使用默认值:`, err);
    }
    return fallback;
}

/** 将值序列化后写入 localStorage */
function persistSetting<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
}

/** usePersistedRef 配置项 */
export interface PersistedRefOptions<T> {
    /** 写入前校验，返回 false 时不持久化 */
    validate?: (v: T) => boolean;
    /** 值变更后的副作用回调 */
    onChange?: (v: T) => void;
}

/**
 * 创建自动持久化到 localStorage 的 ref
 *
 * @param key       localStorage 键名
 * @param fallback  默认值
 * @param options   可选配置：validate 校验 + onChange 副作用
 * @returns         响应式 ref，值变更时自动同步到 localStorage
 */
export function usePersistedRef<T>(key: string, fallback: T, options?: PersistedRefOptions<T>): Ref<T> {
    const r = ref<T>(loadSetting<T>(key, fallback)) as Ref<T>;

    watch(r, (v) => {
        // 校验通过才持久化（如颜色值必须是合法 hex）
        if (!options?.validate || options.validate(v)) {
            persistSetting(key, v);
        }
        // 触发副作用回调
        options?.onChange?.(v);
    });

    return r;
}
