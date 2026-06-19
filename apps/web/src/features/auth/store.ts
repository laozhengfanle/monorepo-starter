/**
 * 认证状态管理 — 会员端
 *
 * Pinia Store，管理会员的登录状态和用户信息。
 *
 * Token 策略：
 *   - httpOnly Cookie 由后端管理，前端不存储 token 值
 *   - localStorage 仅存储登录状态标志（member_auth_status），不含 token
 *   - 页面刷新后通过标志判断是否需要重新获取用户信息
 *
 * 登录流程：
 *   smsLogin() → 后端 Set-Cookie → 标记 isLoggedIn → fetchUser() 获取用户信息
 *
 * 登出流程：
 *   logout() → 后端 Clear-Cookie → 清除登录状态 → 清除用户信息
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { fetchMe as fetchMeApi } from './api';
import { smsLogin as smsLoginApi, sendSmsCode as sendSmsCodeApi, logout as logoutApi } from '@/api/bff/auth';
import type { MemberMe } from './types';

/** localStorage 中存储登录状态的 key */
const AUTH_STATUS_KEY = 'member_auth_status';

/** 标记登录状态到 localStorage */
function setAuthStatus() {
    localStorage.setItem(AUTH_STATUS_KEY, '1');
}

/** 清除 localStorage 中的登录状态 */
function removeAuthStatus() {
    localStorage.removeItem(AUTH_STATUS_KEY);
}

/** 检查 localStorage 中是否有登录状态标志 */
function hasAuthStatus(): boolean {
    return localStorage.getItem(AUTH_STATUS_KEY) === '1';
}

export const useAuthStore = defineStore('auth', () => {
    // ---- 状态 ----

    /** 当前登录的用户信息（null 表示未获取或未登录） */
    const user = ref<MemberMe | null>(null);

    /** 是否已登录（基于 httpOnly Cookie + localStorage 标志） */
    const isLoggedIn = ref<boolean>(hasAuthStatus());

    // ---- Actions ----

    /**
     * 发送短信验证码
     *
     * @param phone 手机号码
     * @param purpose 用途（默认 'login'）
     * @param turnstileToken Cloudflare Turnstile 验证 token（可选）
     */
    async function sendSmsCode(phone: string, purpose: string = 'login', turnstileToken?: string): Promise<void> {
        await sendSmsCodeApi(phone, purpose, turnstileToken);
    }

    /**
     * 短信验证码登录
     *
     * 登录成功后：
     *   1. 后端通过 Set-Cookie 写入 httpOnly Cookie
     *   2. 前端标记 isLoggedIn
     *   3. 调用 fetchUser() 获取用户信息
     *
     * @param phone 手机号码
     * @param code 短信验证码
     * @param turnstileToken Cloudflare Turnstile 验证 token（可选）
     */
    async function login(phone: string, code: string, turnstileToken?: string): Promise<void> {
        // 调用登录接口（后端 Set-Cookie）
        await smsLoginApi(phone, code, turnstileToken);
        // 标记登录状态
        isLoggedIn.value = true;
        setAuthStatus();
        // 获取用户信息
        await fetchUser();
    }

    /**
     * 获取当前登录用户信息
     *
     * 通过 GraphQL me 查询获取，未登录时返回 null。
     * 用于页面刷新后恢复用户信息。
     */
    async function fetchUser(): Promise<void> {
        try {
            const me = await fetchMeApi();
            if (me) {
                user.value = me;
            } else {
                // me 返回 null 说明 Cookie 已失效
                user.value = null;
                isLoggedIn.value = false;
                removeAuthStatus();
            }
        } catch {
            // 请求失败（网络错误等），清除登录状态
            user.value = null;
            isLoggedIn.value = false;
            removeAuthStatus();
            throw new Error('获取用户信息失败');
        }
    }

    /**
     * 退出登录
     *
     * 清除前端登录状态和用户信息。
     * 后端 Cookie 由后端接口清除。
     */
    async function logout(): Promise<void> {
        try {
            await logoutApi();
        } catch {
            // 登出接口失败不影响前端清除状态
        } finally {
            // 无论后端是否成功，都清除前端状态
            user.value = null;
            isLoggedIn.value = false;
            removeAuthStatus();
        }
    }

    return {
        user,
        isLoggedIn,
        sendSmsCode,
        login,
        fetchUser,
        logout,
    };
});
