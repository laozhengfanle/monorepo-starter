/**
 * useMessage 包装器
 *
 * 解决 Naive UI 内存泄漏：组件 onUnmounted 后，该组件创建的 message / dialog
 * 仍残留在 NMessageProvider / NDialogProvider 的内部列表中，造成 DOM 节点堆积。
 *
 * 设计：
 *   - 包装 Naive UI 的 useMessage / useDialog
 *   - 跟踪当前组件通过本包装器创建的所有 message 实例（messageReactive）
 *   - 组件 onUnmounted 时遍历调用 destroy()，释放 DOM
 *   - 不影响 Naive UI 自身的 destroyAll() 行为（那个是全局销毁）
 *
 * 用法：
 *   ```ts
 *   import { useMessage } from '@/shared/composables/useMessage';
 *   const { message, dialog } = useMessage();
 *   message.success('保存成功');  // 返回值是 messageReactive
 *   // 组件 onUnmounted 时自动销毁
 *   ```
 *
 * 与直接 useMessage() 的差异：
 *   - 直接 useMessage() 调 message.success() 返回的 messageReactive 需要手动 destroy()，
 *     否则组件卸载后 message 仍会挂载到 NMessageProvider 上
 *   - 本 composable 自动跟踪 + 销毁
 */
import { onUnmounted } from 'vue';
import { useMessage as useNaiveMessage, useDialog as useNaiveDialog } from 'naive-ui';

/** Naive UI message instance 共同形状（最小可用子集） */
interface NaiveMessageReactive {
    destroy: () => void;
    [key: string]: unknown;
}

/** 包装后的 message API（与 Naive UI 原生一致，仅补一层 destroy 跟踪） */
export interface UseMessageApi {
    /** 原生 message API（success/error/warning/info/loading/create/destroyAll） */
    success: (content: string, options?: Record<string, unknown>) => NaiveMessageReactive;
    error: (content: string, options?: Record<string, unknown>) => NaiveMessageReactive;
    warning: (content: string, options?: Record<string, unknown>) => NaiveMessageReactive;
    info: (content: string, options?: Record<string, unknown>) => NaiveMessageReactive;
    loading: (content: string, options?: Record<string, unknown>) => NaiveMessageReactive;
    create: (content: string, options?: Record<string, unknown>) => NaiveMessageReactive;
    destroyAll: () => void;
}

/** dialog 通用配置选项 */
interface DialogCommonOptions {
    title: string;
    content: string;
    positiveText?: string;
    negativeText?: string;
    onPositiveClick?: () => void;
    onNegativeClick?: () => void;
}

/** 包装后的 dialog API（透传 Naive UI 原生 dialog 方法） */
export interface UseDialogApi {
    warning: (options: DialogCommonOptions) => void;
    error: (options: DialogCommonOptions) => void;
    info: (options: DialogCommonOptions) => void;
    success: (options: DialogCommonOptions) => void;
    create: (options: Record<string, unknown>) => { destroy: () => void };
    destroyAll: () => void;
}

/** useMessage composable 返回 */
export interface UseMessageReturn {
    message: UseMessageApi;
    dialog: UseDialogApi;
}

/**
 * 创建一个 useMessage 实例：返回包装后的 message / dialog，
 * 并在 onUnmounted 时自动销毁本组件创建的所有 message 实例。
 */
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

    /** 当前组件创建的所有 message instance（用于 onUnmounted 销毁） */
    const ownedMessages = new Set<NaiveMessageReactive>();

    /** 包装：调用原生 API + 跟踪返回值 */
    function wrapCreate(fn: (content: string, options?: Record<string, unknown>) => NaiveMessageReactive) {
        return (content: string, options?: Record<string, unknown>): NaiveMessageReactive => {
            const reactive = fn(content, options);
            // 仅当返回值是带 destroy 方法的对象时加入跟踪
            // 防御性写法：测试环境 mock 的 vi.fn() 可能返回 undefined / 不含 destroy
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
            // 优先销毁 owned 集合
            for (const inst of ownedMessages) {
                try {
                    inst.destroy();
                } catch {
                    // 忽略：可能已被用户手动 destroy
                }
            }
            ownedMessages.clear();
            // 也调用 Naive UI 自身的 destroyAll，清理其他来源（防御性）
            naiveMessage.destroyAll();
        },
    };

    // 组件卸载时：自动销毁该组件创建的所有 message
    onUnmounted(() => {
        for (const inst of ownedMessages) {
            try {
                inst.destroy();
            } catch {
                // 忽略（实例可能已自然消失）
            }
        }
        ownedMessages.clear();
    });

    return {
        message,
        dialog: naiveDialog as unknown as UseDialogApi,
    };
}
