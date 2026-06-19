/**
 * 路由事件总线（发布订阅模式）
 *
 * 使用 mitt 解耦路由变化监听，避免在 router.afterEach 中堆积回调。
 * 菜单高亮、TabBar 新增标签、面包屑等均可通过 listenerRouteChange 订阅。
 */
import mitt, { type Handler } from 'mitt';
import type { RouteLocationNormalized } from 'vue-router';

const KEY = Symbol('ROUTE_CHANGE');

type RouteChangeEvents = Record<typeof KEY, RouteLocationNormalized>;
const emitter = mitt<RouteChangeEvents>();

/** 最近一次路由快照，用于订阅后立刻补发 */
let latestRoute: RouteLocationNormalized;

/**
 * 在路由守卫中调用，广播路由变化
 */
export function setRouteEmitter(to: RouteLocationNormalized) {
    emitter.emit(KEY, to);
    latestRoute = to;
}

/**
 * 订阅路由变化
 * @param handler  回调函数
 * @param immediate  是否立即用最新路由执行一次（默认 true）
 * @returns 取消订阅函数
 */
export function listenerRouteChange(handler: (route: RouteLocationNormalized) => void, immediate = true): () => void {
    emitter.on(KEY, handler as Handler);
    if (immediate && latestRoute) {
        handler(latestRoute);
    }
    return () => emitter.off(KEY, handler as Handler);
}

/**
 * 取消订阅（不传 handler 则移除该 key 下所有监听者）
 *
 * ⚠️ 无参调用会清除所有路由监听者，仅应在测试或重置场景使用。
 * 组件级取消订阅请使用 listenerRouteChange 返回的 unsubscribe 函数。
 *
 * @internal 外部不应直接调用
 */
export function removeRouteListener(handler?: Handler) {
    if (handler) {
        emitter.off(KEY, handler);
    } else {
        emitter.off(KEY);
    }
}
