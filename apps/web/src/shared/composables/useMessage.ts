/**
 * useMessage 包装器（C 端版）
 *
 * 与 admin 端 useMessage.ts 行为一致：
 *   - 包装 Naive UI useMessage / useDialog / useNotification
 *   - 组件 onUnmounted 时自动销毁该组件创建的所有 message
 *   - 防御性处理：mock 实例（无 destroy 方法）不加入跟踪
 *
 * 用法：
 *   ```ts
 *   import { useMessage } from '@/shared/composables/useMessage';
 *   const { message } = useMessage();
 *   message.success('保存成功');
 *   ```
 */
import { onUnmounted } from 'vue';
import {
    useMessage as useNaiveMessage,
    useDialog as useNaiveDialog,
    useNotification as useNaiveNotification,
} from 'naive-ui';

/** Naive UI message instance 最小可用形状 */
interface NaiveMessageReactive {
    destroy: () => void;
    [key: string]: unknown;
}

/** 包装后的 message API */
export interface UseMessageApi {
    success: (content: string, options?: Record<string, unknown>) => NaiveMessageReactive;
    error: (content: string, options?: Record<string, unknown>) => NaiveMessageReactive;
    warning: (content: string, options?: Record<string, unknown>) => NaiveMessageReactive;
    info: (content: string, options?: Record<string, unknown>) => NaiveMessageReactive;
    loading: (content: string, options?: Record<string, unknown>) => NaiveMessageReactive;
    create: (content: string, options?: Record<string, unknown>) => NaiveMessageReactive;
    destroyAll: () => void;
}

/** useMessage composable 返回 */
export interface UseMessageReturn {
    message: UseMessageApi;
    dialog: ReturnType<typeof useNaiveDialog>;
    notification: ReturnType<typeof useNaiveNotification>;
}

export function useMessage(): UseMessageReturn {
    const naiveMessage = useNaiveMessage() as unknown as {
        success: (c: string, o?: Record<string, unknown>) => NaiveMessageReactive;
        error: (c: string, o?: Record<string, unknown>) => NaiveMessageReactive;
        warning: (c: string, o?: Record<string, unknown>) => NaiveMessageReactive;
        info: (c: string, o?: Record<string, unknown>) => NaiveMessageReactive;
        loading: (c: string, o?: Record<string, unknown>) => NaiveMessageReactive;
        create: (c: string, o?: Record<string, unknown>) => NaiveMessageReactive;
        destroyAll: () => void;
    };
    const naiveDialog = useNaiveDialog();
    const naiveNotification = useNaiveNotification();

    const ownedMessages = new Set<NaiveMessageReactive>();

    function wrapCreate(fn: (content: string, options?: Record<string, unknown>) => NaiveMessageReactive) {
        return (content: string, options?: Record<string, unknown>): NaiveMessageReactive => {
            const reactive = fn(content, options);
            if (
                reactive &&
                typeof reactive === 'object' &&
                typeof (reactive as { destroy?: unknown }).destroy === 'function'
            ) {
                ownedMessages.add(reactive);
            }
            return reactive;
        };
    }

    const message: UseMessageApi = {
        success: wrapCreate(naiveMessage.success),
        error: wrapCreate(naiveMessage.error),
        warning: wrapCreate(naiveMessage.warning),
        info: wrapCreate(naiveMessage.info),
        loading: wrapCreate(naiveMessage.loading),
        create: wrapCreate(naiveMessage.create),
        destroyAll: () => {
            for (const inst of ownedMessages) {
                try {
                    inst.destroy();
                } catch {
                    // 忽略
                }
            }
            ownedMessages.clear();
            naiveMessage.destroyAll();
        },
    };

    onUnmounted(() => {
        for (const inst of ownedMessages) {
            try {
                inst.destroy();
            } catch {
                // 忽略
            }
        }
        ownedMessages.clear();
    });

    return {
        message,
        dialog: naiveDialog,
        notification: naiveNotification,
    };
}
