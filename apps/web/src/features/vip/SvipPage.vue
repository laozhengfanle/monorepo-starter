<!--
  SvipPage — SVIP 专属页
  仅 SVIP 角色可访问（路由守卫 requiresSvip 严格等值校验，vip 用户会被拦截）
  展示 SVIP 独享的高级特权（占位页面）
-->
<template>
    <div class="max-w-7xl mx-auto px-4 py-12">
        <h1 class="text-2xl font-bold text-gray-900 mb-6">SVIP 专属</h1>

        <!-- 顶部提示条：告诉用户"你已经是 SVIP"
         用 n-alert 让用户一眼看清自己享受的会员等级 -->
        <n-alert type="info" :show-icon="true" class="mb-6">
            <template #header> 您是 SVIP 会员 </template>
            享受顶级特权，专属内容仅对您开放。
        </n-alert>

        <!-- 用户身份信息条：展示昵称 + 角色徽章 -->
        <n-card v-if="authStore.user" bordered class="mb-6">
            <div class="flex items-center gap-3">
                <span class="text-gray-700">欢迎您，</span>
                <span class="text-lg font-semibold text-gray-900">
                    {{ authStore.user.nickname || 'SVIP 用户' }}
                </span>
                <!-- 角色徽章：SVIP 用 warning（金色）突出显示 -->
                <n-tag type="warning" size="small"> SVIP </n-tag>
            </div>
        </n-card>

        <!-- SVIP 独享功能列表（虚构占位） -->
        <n-card bordered>
            <n-result status="success" title="SVIP 独享特权" description="以下为 SVIP 用户专属内容：">
                <template #footer>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mx-auto text-left">
                        <!-- 特权 1：1对1 专属客服 -->
                        <div class="border border-gray-200 rounded-lg p-4">
                            <h3 class="font-semibold text-gray-900 mb-2">1对1 专属客服</h3>
                            <p class="text-sm text-gray-500">7×24 小时私人顾问，问题秒级响应。</p>
                        </div>
                        <!-- 特权 2：优先体验新功能 -->
                        <div class="border border-gray-200 rounded-lg p-4">
                            <h3 class="font-semibold text-gray-900 mb-2">优先体验新功能</h3>
                            <p class="text-sm text-gray-500">所有新功能提前 7 天灰度体验。</p>
                        </div>
                        <!-- 特权 3：定制化内容推荐 -->
                        <div class="border border-gray-200 rounded-lg p-4">
                            <h3 class="font-semibold text-gray-900 mb-2">定制化内容推荐</h3>
                            <p class="text-sm text-gray-500">AI 助理根据您的偏好生成专属推荐。</p>
                        </div>
                    </div>
                    <div class="mt-6">
                        <n-button type="primary" @click="$router.push('/')"> 返回首页 </n-button>
                    </div>
                </template>
            </n-result>
        </n-card>
    </div>
</template>

<script setup lang="ts">
/**
 * SvipPage 组件逻辑
 *
 * SVIP 专属占位页面：
 *   - 仅 SVIP 角色可访问
 *   - 路由守卫 requiresSvip 用 === 'svip' 严格校验，vip 用户会被拦截到 /vip-upgrade
 *   - 展示 SVIP 独享特权（虚构内容，后续接真实业务）
 *
 * 为什么 requiresSvip 用 === 而不是 includes？
 *   vip.includes('vip') 匹配 "vip" 和 "svip" 两个值。
 *   SVIP 页面要求"必须是 svip"，vip 用户不能进。
 *   所以单独一道 === 'svip' 严格等值校验。
 */
import { useAuthStore } from '@/features/auth/store';

// 从 store 拿当前用户信息，展示在页面上
const authStore = useAuthStore();
</script>
