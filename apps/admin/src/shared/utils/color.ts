/**
 * 颜色工具 — hex 色值解析、转换、亮度调整
 *
 * 被 settings.ts、Tabbar.vue、index.html 内联脚本共用。
 * index.html 内联脚本无法 import 模块，因此其逻辑与 adjustColor 保持
 * 独立但算法一致（仅偏移量不同：loading 骨架在暗色模式下需更高亮度）。
 */

/** 将 hex 色值转为 RGB 对象，非法值返回 null */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const h = hex.replace('#', '');
    // 3 位简写 → 展开为 6 位
    if (/^[0-9a-fA-F]{3}$/.test(h)) {
        return {
            r: parseInt(h[0] + h[0], 16),
            g: parseInt(h[1] + h[1], 16),
            b: parseInt(h[2] + h[2], 16),
        };
    }
    // 6 或 8 位
    const m = /^([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/i.exec(h);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

/** 将 RGB 三个通道转回 hex */
export function rgbToHex(r: number, g: number, b: number): string {
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

/** 对 hex 色值进行变亮/变暗，amount 为正变亮、为负变暗 */
export function adjustColor(hex: string, amount: number): string {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return rgbToHex(rgb.r + amount, rgb.g + amount, rgb.b + amount);
}

/** 校验是否为合法 hex 色值 */
export function isValidHexColor(v: string): boolean {
    return /^#[0-9a-fA-F]{3,8}$/.test(v);
}
