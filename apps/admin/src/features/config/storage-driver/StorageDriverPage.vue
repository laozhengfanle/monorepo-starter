<!--
存储驱动页面 — 配置文件存储驱动参数
对应 config 表 key: storage.driver
-->
<template>
    <n-card title="存储驱动">
        <!-- 加载中骨架 -->
        <div v-if="isLoading" class="flex items-center justify-center py-10">
            <n-spin description="加载配置中..." />
        </div>
        <n-form
            v-else
            ref="formRef"
            :model="form"
            :rules="rules"
            label-placement="left"
            label-width="10rem"
            class="max-w-2xl"
        >
            <n-form-item label="驱动" path="driver" feedback="文件存储方案，本地存储无需额外配置">
                <n-select v-model:value="form.driver" :options="driverOptions" placeholder="请选择存储驱动" />
            </n-form-item>

            <!-- 本地存储 -->
            <template v-if="form.driver === 'local'">
                <n-form-item label="本地路径" path="localPath" feedback="服务器本地磁盘目录，需确保有写入权限">
                    <n-input v-model:value="form.localPath" placeholder="/uploads" clearable />
                </n-form-item>
            </template>

            <!-- S3 / OSS / COS -->
            <template v-if="form.driver === 's3' || form.driver === 'oss' || form.driver === 'cos'">
                <n-form-item label="Bucket" path="bucket" feedback="云存储空间名称，需预先在服务商后台创建">
                    <n-input v-model:value="form.bucket" placeholder="存储桶名称" clearable />
                </n-form-item>
                <n-form-item label="Region" path="region" feedback="存储桶所在地域，如 oss-cn-hangzhou、ap-singapore">
                    <n-input v-model:value="form.region" placeholder="地域节点" clearable />
                </n-form-item>
                <n-form-item label="AccessKey" path="accessKey" feedback="云服务商 RAM 账号的 AccessKey ID">
                    <n-input v-model:value="form.accessKey" placeholder="AccessKey" clearable />
                </n-form-item>
                <n-form-item label="SecretKey" path="secretKey" feedback="AccessKey 对应的密钥，加密存储">
                    <n-input
                        v-model:value="form.secretKey"
                        type="password"
                        show-password-on="click"
                        placeholder="SecretKey"
                        clearable
                    />
                </n-form-item>
            </template>

            <n-form-item label=" ">
                <n-button type="primary" :loading="isSaving" @click="onSave"> 保存设置 </n-button>
            </n-form-item>
        </n-form>
    </n-card>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';

defineOptions({ name: 'ConfigStorageDriver' });
import { useMessage } from 'naive-ui';
import type { FormInst } from 'naive-ui';
import { getConfigs, batchUpdateConfigs } from '@/api/configs';

const message = useMessage();
const formRef = ref<FormInst | null>(null);
const isSaving = ref(false);

const isLoading = ref(true);

const form = reactive({
    driver: 'local' as string,
    localPath: '/uploads',
    bucket: '',
    region: '',
    accessKey: '',
    secretKey: '',
});

const driverOptions = [
    { label: '本地存储', value: 'local' },
    { label: '阿里云 OSS', value: 'oss' },
    { label: '腾讯云 COS', value: 'cos' },
    { label: 'AWS S3', value: 's3' },
];

/** 校验规则：根据驱动动态切换必填项 */
const isCloud = computed(() => form.driver === 's3' || form.driver === 'oss' || form.driver === 'cos');

const rules = computed(() => ({
    driver: { required: true, message: '请选择存储驱动', trigger: 'blur' },
    localPath: isCloud.value ? undefined : { required: true, message: '请输入本地存储路径', trigger: 'blur' },
    bucket: isCloud.value ? { required: true, message: '请输入 Bucket 名称', trigger: 'blur' } : undefined,
    region: isCloud.value ? { required: true, message: '请输入 Region 地域', trigger: 'blur' } : undefined,
    accessKey: isCloud.value ? { required: true, message: '请输入 AccessKey', trigger: 'blur' } : undefined,
    secretKey: isCloud.value ? { required: true, message: '请输入 SecretKey', trigger: 'blur' } : undefined,
}));

async function onSave() {
    try {
        await formRef.value?.validate();
    } catch {
        return;
    }
    isSaving.value = true;
    try {
        // 只提交当前驱动相关的字段，避免将无关字段（如 local 模式下的 S3 空值）一并写入
        const value = isCloud.value
            ? {
                  driver: form.driver,
                  bucket: form.bucket,
                  region: form.region,
                  accessKey: form.accessKey,
                  secretKey: form.secretKey,
              }
            : { driver: form.driver, localPath: form.localPath };
        await batchUpdateConfigs([{ key: 'storage.driver', value }]);
        message.success('存储驱动配置已保存');
    } catch {
        message.error('保存失败，请重试');
    } finally {
        isSaving.value = false;
    }
}

onMounted(async () => {
    // 后端密钥字段已自动脱敏（仅显示末 4 位），完整值需通过服务端读取
    // 每个配置页独立调用 getConfigs() 是 Demo 设计：页面之间无状态共享依赖，
    // 确保每个页面进入时都能获取最新配置。
    try {
        const configs = await getConfigs();
        const item = configs.find((c) => c.key === 'storage.driver');
        if (item) {
            const v = item.value;
            form.driver = (v.driver as string) || 'local';
            form.localPath = (v.localPath as string) || '/uploads';
            form.bucket = (v.bucket as string) || '';
            form.region = (v.region as string) || '';
            form.accessKey = (v.accessKey as string) || '';
            form.secretKey = (v.secretKey as string) || '';
        }
    } catch {
        message.error('加载配置失败，请刷新页面');
    } finally {
        isLoading.value = false;
    }
});
</script>
