import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import { MetricsIpGuard } from '../common/guards/metrics-ip.guard.js';

/**
 * Prometheus 指标端点 Controller
 *
 * 设计要点：
 * - 继承 @willsoto/nestjs-prometheus 的 PrometheusController，复用其 base 内容（content-type 设置 + register.metrics() 调用）
 * - 加 @UseGuards(MetricsIpGuard) 实现内网白名单（外网 403）
 * - @Controller() 不带路径前缀，路径来自 PrometheusModule.register({ path: '/metrics' })
 *
 * 为什么用继承而不是自己写：
 * - PrometheusController 内部用 client.register.contentType 设置 response header
 *   （prom-client v15 的 contentType 是 'text/plain; version=0.0.4; charset=utf-8'）
 * - 自己重写需要 import prom-client 拿 register，重复且易漂移
 *
 * 关于 main.ts 的 setGlobalPrefix：
 * - 默认所有路由会加 /api 前缀，但 PrometheusModule 自动注册时把 path 写入 metadata 时是直接覆盖，
 *   所以即使有 /api prefix，path 设置为 /metrics 时仍然是 /metrics
 * - 但 NestJS 的 setGlobalPrefix 默认会同时应用，需要在 main.ts exclude 里加 'metrics' 才能稳定
 * - 这是和 Pino subagent 共享的 main.ts 修改，通过 Edit 工具精确字符串匹配避免冲突
 */
@Controller()
@UseGuards(MetricsIpGuard)
export class MetricsController extends PrometheusController {
    /**
     * 暴露 Prometheus 指标
     * - @Res({ passthrough: true }) 让 Nest 仍处理返回值（super.index 返回 string），
     *   同时基类通过 response.header() 设置 Content-Type
     * - override 关键字：明确告诉 TypeScript 我们是有意覆盖基类的 index
     */
    @Get()
    override async index(@Res({ passthrough: true }) response: Response): Promise<string> {
        return super.index(response);
    }
}
