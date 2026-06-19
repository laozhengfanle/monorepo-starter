/**
 * useFormSubmit
 *
 * 表单提交防抖 composable
 * 解决用户快速连点提交按钮导致的重复请求问题
 *
 * 核心行为：
 *   - 默认 500ms 防抖窗口
 *   - 重复点击只发 1 次 API 请求
 *   - loading 状态：true 时不响应新调用
 *   - 错误后允许重试（loading 自动重置）
 *
 * 用法：
 * ```ts
 * const { submit, loading } = useFormSubmit(async (data) => {
 *   await api.save(data);
 * });
 *
 * async function onClick() {
 *   await submit(formData);
 * }
 * ```
 */
import { ref, type Ref } from 'vue';

/** useFormSubmit 配置项 */
export interface UseFormSubmitOptions {
    /** 防抖毫秒数（默认 500ms） */
    debounceMs?: number;
}

/** useFormSubmit 返回值 */
export interface UseFormSubmitReturn<TArgs extends unknown[], TResult> {
    /** 触发提交（带防抖 + loading 保护） */
    submit: (...args: TArgs) => Promise<TResult | undefined>;
    /** loading 状态（true 表示正在提交或防抖窗口内） */
    loading: Ref<boolean>;
    /** 重置 loading 状态（异常时手动调用） */
    reset: () => void;
}

/**
 * 创建一个防抖的表单提交函数
 *
 * @param asyncFn 实际要执行的异步函数（接收任意参数，返回 Promise）
 * @param options 配置项
 * @returns submit 函数 + loading 状态 ref
 */
export function useFormSubmit<TArgs extends unknown[], TResult>(
    asyncFn: (...args: TArgs) => Promise<TResult>,
    options: UseFormSubmitOptions = {},
): UseFormSubmitReturn<TArgs, TResult> {
    const { debounceMs = 500 } = options;

    // 加载中状态
    const loading = ref(false);
    // 防抖定时器
    let timer: ReturnType<typeof setTimeout> | null = null;
    // 上一次调用的参数（防抖窗口结束时实际执行）
    let pendingArgs: TArgs | null = null;

    /**
     * 实际执行异步函数
     * 包装一层 try/finally 确保 loading 状态正确重置
     */
    async function runAsync(...args: TArgs): Promise<TResult | undefined> {
        loading.value = true;
        try {
            return await asyncFn(...args);
        } catch (err) {
            // 错误向上抛给调用方
            throw err;
        } finally {
            loading.value = false;
        }
    }

    /**
     * 提交入口：实现 500ms 防抖 + 重复点击只发 1 次
     *
     * 行为表（3 次连点场景）：
     *   - 第一次点击：进入防抖窗口，500ms 后执行
     *   - 第二次点击（500ms 内）：刷新参数，重置定时器
     *   - 第三次点击（500ms 内）：刷新参数，重置定时器
     *   - 500ms 后：用最后一次的参数执行
     *
     * loading=true 时（防抖窗口结束后正在执行）：
     *   - 直接 return undefined，不响应
     */
    function submit(...args: TArgs): Promise<TResult | undefined> {
        // 已经在执行中 → 不响应
        if (loading.value) {
            return Promise.resolve(undefined);
        }

        // 记录最新参数
        pendingArgs = args;

        // 清除上一个定时器
        if (timer !== null) {
            clearTimeout(timer);
        }

        // 设置新定时器
        return new Promise((resolve, reject) => {
            timer = setTimeout(() => {
                timer = null;
                if (pendingArgs) {
                    const currentArgs = pendingArgs;
                    pendingArgs = null;
                    runAsync(...currentArgs)
                        .then((res) => resolve(res))
                        .catch((err) => reject(err));
                } else {
                    resolve(undefined);
                }
            }, debounceMs);
        });
    }

    /** 重置 loading 状态（异常时手动调用） */
    function reset(): void {
        loading.value = false;
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        pendingArgs = null;
    }

    return {
        submit,
        loading,
        reset,
    };
}
