/**
 * useSystemInfo — 获取浏览器和操作系统信息
 *
 * VueUse 没有提供 OS/浏览器检测的 composable，
 * 因此将项目中多处重复的 UA 解析逻辑提取到这里统一维护。
 */
import { computed } from 'vue';

/** 检测操作系统名称 */
function detectOS(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Win')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
    return 'Unknown';
}

/** 检测浏览器名称 */
function detectBrowser(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Edg')) return 'Edge';
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    return 'Unknown';
}

/** 检测屏幕分辨率 */
function detectScreenResolution(): string {
    return `${screen.width} × ${screen.height}`;
}

export function useSystemInfo() {
    // 使用 computed 缓存结果，UA 在页面生命周期内不会变
    const os = computed(detectOS);
    const browser = computed(detectBrowser);
    const resolution = computed(detectScreenResolution);

    return { os, browser, resolution };
}
