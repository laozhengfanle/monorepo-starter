<!--
  VipUpgradePage — VIP 升级提示页
  当非 VIP 用户尝试访问 VIP 专区时，路由守卫会重定向到此页面
  引导用户升级为 VIP 会员
  文案硬编码中文（CLAUDE.md 明确禁止 i18n）
-->
<template>
    <div class="max-w-3xl mx-auto px-4 py-12">
        <n-card bordered>
            <n-result status="warning" title="升级 VIP 会员" description="开通 VIP 即可解锁全部会员专属内容与特权">
                <template #footer>
                    <div class="flex gap-3 justify-center">
                        <n-button @click="$router.push('/')"> 返回首页 </n-button>
                        <n-button type="primary"> 立即升级 </n-button>
                    </div>
                </template>
            </n-result>
        </n-card>
    </div>
</template>

<script setup lang="ts">
/**
 * VipUpgradePage 组件逻辑
 *
 * VIP 升级提示页面：
 *   - 当非 VIP 用户访问 VIP 专区时，路由守卫重定向到此页
 *   - 引导用户升级为 VIP 会员
 *   - 后续接入真实支付流程
 */
</script>
