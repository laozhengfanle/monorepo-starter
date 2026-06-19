<template>
    <n-card title="管理员详情" size="small">
        <n-descriptions v-if="user" bordered :column="2" :label-style="{ width: '100px' }">
            <n-descriptions-item label="管理员 ID">{{ userId }}</n-descriptions-item>
            <n-descriptions-item label="头像">
                <n-avatar :src="user.avatar" :size="48" round fallback-src="/hero.png" />
            </n-descriptions-item>
            <n-descriptions-item label="用户名">{{ user.username }}</n-descriptions-item>
            <n-descriptions-item label="邮箱">{{ user.email }}</n-descriptions-item>
            <n-descriptions-item label="角色">
                <n-tag type="info" size="small">{{ user.role }}</n-tag>
            </n-descriptions-item>
        </n-descriptions>

        <n-divider />

        <n-button quaternary @click="onBack">
            <template #icon>
                <n-icon><ArrowLeft /></n-icon>
            </template>
            返回管理员列表
        </n-button>
    </n-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

defineOptions({ name: 'IamAdminDetailPage' });
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from '@/shared/composables/useMessage';
import { ArrowLeft } from '@vicons/tabler';
import { getAccountById, type AccountRow } from '@/api';

const route = useRoute();
const router = useRouter();
const { message } = useMessage();

const userId = route.params.id as string;
const user = ref<AccountRow | null>(null);

onMounted(async () => {
    try {
        user.value = (await getAccountById(userId)) ?? null;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        message.error(msg || '加载管理员详情失败');
    }
});

function onBack() {
    router.push({ name: 'IamAdminsPage' });
}
</script>
