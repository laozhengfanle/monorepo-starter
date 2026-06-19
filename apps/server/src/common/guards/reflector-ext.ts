/**
 * Reflector 扩展工具类
 *
 * 解决问题：
 * - NestJS 内置的 Reflector.getAllAndOverride 需要每次手动传入 [handler, class] 两层 targets
 * - 多处 Guard 中重复同样的样板代码（4 处 getAllAndOverride 写法都一样），难以维护
 * - 通过本工具类统一封装：传 reflector + ctx，一行调用即可拿到对应元数据
 *
 * 反射读取的"两层"含义：
 * - getHandler()：方法装饰器（如 @Public() 标记在某个具体方法上）
 * - getClass()：类装饰器（如 @RequireAuth() 标记在 Controller 类上）
 * - getAllAndOverride 顺序：先方法、后类，方法上的元数据优先级更高（可覆盖类上的同名装饰器）
 *
 * 使用方式：
 *   import { ReflectorExt } from './reflector-ext.js';
 *
 *   const isPub = ReflectorExt.isPublic(this.reflector, context);
 *   const perms = ReflectorExt.getPermissions(this.reflector, context);
 *
 * 设计取舍：
 * - 用 namespace 聚合静态方法（ReflectorExt.isPublic），比 export 顶层函数更内聚
 * - 4 个函数对应 Guard 实际使用的 4 个元数据 key（IS_PUBLIC / REQUIRE_AUTH / LOGIN_ONLY / PERMISSION）
 * - 装饰器常量直接从 '../decorators/*.decorator.js' 引入，避免重复定义字符串 key
 */
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
// 引入 4 个元数据常量 key，与各装饰器文件保持单一来源
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { REQUIRE_AUTH_KEY } from '../decorators/require-auth.decorator.js';
import { LOGIN_ONLY_KEY } from '../decorators/login-only.decorator.js';
import { PERMISSION_KEY } from '../decorators/permission.decorator.js';

/**
 * Reflector 扩展工具命名空间
 * - 静态方法集合，调用方式：ReflectorExt.isPublic(reflector, ctx)
 * - 命名空间比导出一堆顶层函数更内聚，避免模块名污染
 */
export const ReflectorExt = {
    /**
     * 判断当前路由是否标记了 @Public()
     *
     * 反射读取的两层：
     * - getHandler()：方法级 @Public() 装饰器
     * - getClass()：类级 @Public() 装饰器
     * - getAllAndOverride 顺序：先查方法、再查类，方法上的优先级更高
     *
     * 适用场景：
     * - JwtAuthGuard：标记后跳过 JWT 验证
     * - AdminPermissionGuard / MemberPermissionGuard：标记后跳过权限校验
     *
     * @param reflector NestJS 反射器实例
     * @param ctx 执行上下文（HTTP / GraphQL / RPC 等任意类型）
     * @returns true = 已标记 @Public()，false = 未标记
     */
    isPublic(reflector: Reflector, ctx: ExecutionContext): boolean {
        // 调用 NestJS 内置 getAllAndOverride，两层 targets 一次传齐
        const value = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
        // 强制转 boolean：undefined / null 统一视为 false
        return Boolean(value);
    },

    /**
     * 判断当前路由是否标记了 @RequireAuth()
     *
     * 反射读取的两层：
     * - getHandler()：方法级 @RequireAuth()
     * - getClass()：类级 @RequireAuth()（常见用法：直接挂在 Controller 上）
     * - 同名 key 下方法层覆盖类层
     *
     * 适用场景：
     * - AdminPermissionGuard / MemberPermissionGuard 用来判断"是否进入权限校验模式"
     * - 未标记的控制器（member/health/auth 等）直接放行，不进入权限链路
     *
     * @param reflector NestJS 反射器实例
     * @param ctx 执行上下文
     * @returns true = 已标记 @RequireAuth()，false = 未标记
     */
    getRequireAuth(reflector: Reflector, ctx: ExecutionContext): boolean {
        // 读取 REQUIRE_AUTH_KEY（值为 'requireAuth'）的元数据
        const value = reflector.getAllAndOverride<boolean>(REQUIRE_AUTH_KEY, [ctx.getHandler(), ctx.getClass()]);
        return Boolean(value);
    },

    /**
     * 判断当前路由是否标记了 @LoginOnly()
     *
     * 反射读取的两层：
     * - getHandler()：方法级 @LoginOnly()
     * - getClass()：类级 @LoginOnly()
     *
     * 适用场景：
     * - 标记后只校验"已登录"这一个状态，不再校验具体权限码
     * - 例：当前账户的菜单、个人资料等"登录后就能查自己"的端点
     *
     * @param reflector NestJS 反射器实例
     * @param ctx 执行上下文
     * @returns true = 已标记 @LoginOnly()，false = 未标记
     */
    getLoginOnly(reflector: Reflector, ctx: ExecutionContext): boolean {
        // 读取 LOGIN_ONLY_KEY（值为 'loginOnly'）的元数据
        const value = reflector.getAllAndOverride<boolean>(LOGIN_ONLY_KEY, [ctx.getHandler(), ctx.getClass()]);
        return Boolean(value);
    },

    /**
     * 获取当前路由所需的权限码列表（已归一化为 string[]）
     *
     * 反射读取的两层：
     * - getHandler()：方法级 @Permission('a', 'b')
     * - getClass()：类级 @Permission(...)
     * - getAllAndOverride 会按"方法→类"顺序查找，找到第一个非 undefined 的值就返回
     *
     * 归一化规则（输入→输出）：
     * - undefined / null           → []（未标记 @Permission()）
     * - 单个 string 'a'            → ['a']（兼容老装饰器风格）
     * - string[] ['a', 'b']        → ['a', 'b']（新装饰器多参数 OR 语义）
     * - 空数组 []                  → []（明确无权限要求，但通常意味着漏写装饰器）
     *
     * 为什么要归一化：
     * - @Permission('a', 'b') 内部用 SetMetadata 存为 string[]
     * - 老版本 @Permission('a') 存为单个 string
     * - 调用方统一用 requiredPermissions.some((p) => userPerms.includes(p)) 处理 OR 语义
     *
     * @param reflector NestJS 反射器实例
     * @param ctx 执行上下文
     * @returns 归一化后的权限码数组（永不为 null/undefined，空数组表示"未标记"）
     */
    getPermissions(reflector: Reflector, ctx: ExecutionContext): string[] {
        // 读取 PERMISSION_KEY（值为 'permission'）的元数据
        // 类型可能是 string | string[]，取决于装饰器调用方式
        const raw = reflector.getAllAndOverride<string | string[]>(PERMISSION_KEY, [ctx.getHandler(), ctx.getClass()]);
        // 三分支归一化：数组 → 原样；非空 string → 包成单元素数组；其他 → 空数组
        if (Array.isArray(raw)) {
            return raw;
        }
        if (typeof raw === 'string' && raw.length > 0) {
            return [raw];
        }
        return [];
    },
};
