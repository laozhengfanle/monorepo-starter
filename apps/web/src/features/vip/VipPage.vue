<!--
  VipPage — VIP 专区页
  展示 VIP 专属内容（占位页面）
  需要 VIP/SVIP 角色才能访问（路由守卫控制）
  文案硬编码中文（CLAUDE.md 明确禁止 i18n）
-->
<template>
    <div class="max-w-7xl mx-auto px-4 py-12">
        <h1 class="text-2xl font-bold text-gray-900 mb-6">VIP 专区</h1>

        <!-- VIP 专属内容 -->
        <n-card bordered>
            <n-result status="info" title="开通 VIP 尊享更多特权" description="登录后即可访问会员专属内容">
                <template #footer>
                    <n-button type="primary" @click="$router.push('/')"> 返回首页 </n-button>
                </template>
            </n-result>
        </n-card>
    </div>
</template>

<script setup lang="ts">
/**
 * VipPage 组件逻辑
 *
 * VIP 专区占位页面，后续接入真实 VIP 内容。
 * 仅 VIP/SVIP 角色可访问，由路由守卫控制。
 */
</script>
