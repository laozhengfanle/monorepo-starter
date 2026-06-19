/**
 * useFormSubmit
 *
 * 表单提交防抖 composable
 * 行为：500ms 防抖 + 重复点击只发 1 次 + loading 状态
 */
import { ref, onUnmounted, type Ref } from 'vue';

/** useFormSubmit 配置项 */
export interface UseFormSubmitOptions {
    /** 防抖毫秒数（默认 500ms） */
    debounceMs?: number;
}

/** useFormSubmit 返回值 */
export interface UseFormSubmitReturn<TArgs extends unknown[], TResult> {
    submit: (...args: TArgs) => Promise<TResult | undefined>;
    loading: Ref<boolean>;
    reset: () => void;
}

/**
 * 创建一个防抖的表单提交函数
 */
export function useFormSubmit<TArgs extends unknown[], TResult>(
    asyncFn: (...args: TArgs) => Promise<TResult>,
    options: UseFormSubmitOptions = {},
): UseFormSubmitReturn<TArgs, TResult> {
    const { debounceMs = 500 } = options;

    const loading = ref(false);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pendingArgs: TArgs | null = null;

    async function runAsync(...args: TArgs): Promise<TResult | undefined> {
        loading.value = true;
        try {
            return await asyncFn(...args);
        } finally {
            loading.value = false;
        }
    }

    function submit(...args: TArgs): Promise<TResult | undefined> {
        if (loading.value) {
            return Promise.resolve(undefined);
        }

        pendingArgs = args;

        if (timer !== null) {
            clearTimeout(timer);
        }

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

    function reset(): void {
        loading.value = false;
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        pendingArgs = null;
    }

    /** 组件卸载时清理定时器，防止在已卸载组件上触发状态更新 */
    onUnmounted(() => {
        reset();
    });

    return {
        submit,
        loading,
        reset,
    };
}
