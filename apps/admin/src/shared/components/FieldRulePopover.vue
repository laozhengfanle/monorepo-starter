<!--
  FieldRulePopover — 表单字段规则提示弹窗

  使用场景：字段 focus 时弹出规则清单，
  已满足的规则显示绿色勾，未满足的显示红色叉，用户边输边看到进度。

  用法：
  <FieldRulePopover :rules="usernameRules" :value="formData.username">
    <n-input v-model:value="formData.username" placeholder="请输入用户名" />
  </FieldRulePopover>

  Props:
  - rules: RuleItem[]  规则列表，每项含 label + check 函数
  - value: unknown     当前输入值，传给 check(value) 判断是否满足

  设计要点：
  - 不用 n-popover 包裹输入框（会破坏 n-form-item 的 flex 布局导致输入框消失）
  - 输入框通过默认 slot 正常渲染，弹窗用 Teleport + 绝对定位独立显示
  - 弹窗定位在输入框右侧，不遮挡输入内容
-->
<template>
    <!-- 输入框区域：不包裹任何额外 div，直接渲染 slot 内容 -->
    <div ref="triggerRef" class="field-rule-trigger" @focusin="onFocusIn" @focusout="onFocusOut">
        <slot />
    </div>
    <!-- 弹窗：Teleport 到 body，绝对定位在输入框右侧 -->
    <Teleport to="body">
        <Transition name="rule-popover">
            <div
                v-if="isFocused && hasVisibleRules"
                class="field-rule-popover"
                :class="{ 'field-rule-popover--bottom': placement === 'bottom' }"
                :style="popoverStyle"
            >
                <div class="field-rule-popover__arrow" />
                <div class="field-rule-popover__content">
                    <div v-for="(rule, index) in rules" :key="index" class="flex items-center gap-2 py-0.5 text-xs">
                        <!-- 已满足：绿色勾 / 未满足：红色叉 -->
                        <n-icon :size="14" :color="rule.check(value) ? '#18a058' : '#d03050'">
                            <component :is="rule.check(value) ? CheckmarkCircle : CloseCircle" />
                        </n-icon>
                        <span :class="rule.check(value) ? 'text-gray-500' : 'text-red-500'">
                            {{ rule.label }}
                        </span>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
/**
 * FieldRulePopover 组件
 *
 * 功能：focus 时在输入框右侧弹出规则清单弹窗，
 *       已满足的规则显示绿色勾 + 灰色文字，
 *       未满足的规则显示红色叉 + 红色文字。
 *
 * 设计原则：
 * - 不使用 n-form-item 的 feedback，统一用 popover 展示规则
 * - 不用 n-popover 包裹输入框（会破坏 n-form-item 的 flex 布局）
 * - 弹窗用 Teleport + 绝对定位，不影响表单布局
 * - focusout 时延迟关闭（给弹窗内的交互留时间）
 */
import { ref, computed, onBeforeUnmount } from 'vue';
import { NIcon } from 'naive-ui';
import { CheckmarkCircle, CloseCircle } from '@vicons/ionicons5';

/** 单条规则定义 */
export interface RuleItem {
    /** 规则描述文本，如"2-20 个字符" */
    label: string;
    /** 校验函数：传入当前值，返回是否满足 */
    check: (value: unknown) => boolean;
}

defineOptions({ name: 'FieldRulePopover' });

const props = defineProps<{
    /** 规则列表 */
    rules: RuleItem[];
    /** 当前输入值（支持 string / string[] / 任意类型） */
    value: unknown;
}>();

// ---- 弹窗显隐控制 ----
const isFocused = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const popoverLeft = ref(0);
const popoverTop = ref(0);
/** 弹窗位置：right=输入框右侧，bottom=输入框下方（右侧空间不足时） */
const placement = ref<'right' | 'bottom'>('right');

/** 是否有可见规则（空规则列表不弹窗） */
const hasVisibleRules = computed(() => props.rules.length > 0);

/** 弹窗内联样式（动态定位） */
const popoverStyle = computed(() => ({
    left: `${popoverLeft.value}px`,
    top: `${popoverTop.value}px`,
}));

/** focus 时计算弹窗位置
 *  使用 requestAnimationFrame 双帧等待，确保浏览器完成布局计算后再定位。
 *  解决：弹窗（n-modal）打开时自动聚焦输入框，但 modal 动画尚未完成，
 *  导致 getBoundingClientRect() 取到的是动画中间位置，弹窗定位错误。
 */
function onFocusIn() {
    isFocused.value = true;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            updatePosition();
        });
    });
}

/** 计算弹窗位置（从 triggerRef 获取输入框坐标） */
function updatePosition() {
    if (!triggerRef.value) return;
    const rect = triggerRef.value.getBoundingClientRect();
    const popoverWidth = 240;
    // 优先在输入框右侧显示；如果右侧空间不足（< popoverWidth + 间距），则显示在输入框下方
    const rightSpace = window.innerWidth - rect.right - 8;
    if (rightSpace >= popoverWidth) {
        // 右侧空间充足：弹窗在右侧
        popoverLeft.value = rect.right + 8;
        popoverTop.value = rect.top;
        placement.value = 'right';
    } else {
        // 右侧空间不足：弹窗在下方
        popoverLeft.value = rect.left;
        popoverTop.value = rect.bottom + 4;
        placement.value = 'bottom';
    }
}

/** focusout 时关闭弹窗 */
let closeTimer: ReturnType<typeof setTimeout> | null = null;
function onFocusOut() {
    // 延迟关闭，防止点击弹窗内容时闪烁
    closeTimer = setTimeout(() => {
        isFocused.value = false;
    }, 150);
}

onBeforeUnmount(() => {
    if (closeTimer) clearTimeout(closeTimer);
});
</script>

<style scoped>
/* 触发区域：inline-flex 保证不破坏 n-form-item 的 flex 布局 */
.field-rule-trigger {
    display: inline-flex;
    width: 100%;
}

/* 弹窗容器：固定定位，不影响文档流 */
.field-rule-popover {
    position: fixed;
    z-index: 3000;
    min-width: 200px;
    max-width: 300px;
    background: var(--n-color, #fff);
    border: 1px solid var(--n-border-color, #e0e0e6);
    border-radius: var(--n-border-radius, 3px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    padding: 4px 0;
}

/* 弹窗箭头 — 默认（右侧模式）：左侧指向输入框 */
.field-rule-popover__arrow {
    position: absolute;
    left: -6px;
    top: 12px;
    width: 0;
    height: 0;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-right: 6px solid var(--n-border-color, #e0e0e6);
}

.field-rule-popover__arrow::after {
    content: '';
    position: absolute;
    left: 1px;
    top: -5px;
    width: 0;
    height: 0;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
    border-right: 5px solid var(--n-color, #fff);
}

/* 弹窗箭头 — 下方模式：顶部指向输入框 */
.field-rule-popover--bottom .field-rule-popover__arrow {
    left: 16px;
    top: -6px;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: none;
    border-bottom: 6px solid var(--n-border-color, #e0e0e6);
}

.field-rule-popover--bottom .field-rule-popover__arrow::after {
    left: -5px;
    top: 1px;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: none;
    border-bottom: 5px solid var(--n-color, #fff);
}

.field-rule-popover__content {
    padding: 4px 12px;
}

/* 过渡动画 */
.rule-popover-enter-active,
.rule-popover-leave-active {
    transition: opacity 0.15s ease;
}

.rule-popover-enter-from,
.rule-popover-leave-to {
    opacity: 0;
}
</style>
