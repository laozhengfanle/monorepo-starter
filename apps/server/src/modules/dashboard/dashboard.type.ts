/**
 * Dashboard GraphQL ObjectTypes
 */
import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('StatCard', { description: '统计卡片' })
export class StatCard {
    @Field({ description: '标签名' })
    label!: string;

    @Field(() => Int, { description: '数值' })
    value!: number;

    @Field(() => Int, { description: '趋势（正数上升，负数下降）' })
    trend!: number;
}

@ObjectType('TrendItem', { description: '趋势数据点' })
export class TrendItem {
    @Field({ description: '时间段标签' })
    label!: string;

    @Field(() => Int, { description: '高危操作次数' })
    highRisk!: number;

    @Field(() => Int, { description: '中危操作次数' })
    midRisk!: number;

    @Field(() => Int, { description: '低危操作次数' })
    lowRisk!: number;
}

@ObjectType('DistItem', { description: '分布数据项' })
export class DistItem {
    @Field({ description: '类别标签' })
    label!: string;

    @Field(() => Int, { description: '百分比（0-100）' })
    percent!: number;

    @Field({ description: '颜色值' })
    color!: string;
}

@ObjectType('OperationLog', { description: '操作记录' })
export class OperationLog {
    @Field({ description: 'ID' })
    id!: string;

    @Field({ description: '操作用户名' })
    user!: string;

    @Field({ description: '用户头衔' })
    title!: string;

    @Field({ description: '头像（DiceBear SVG data URI）' })
    avatar!: string;

    @Field({ description: '头衔标签颜色' })
    titleColor!: string;

    @Field({ description: '操作内容' })
    content!: string;

    @Field({ description: '操作类型' })
    type!: string;

    @Field({ description: '业务模块' })
    module!: string;

    @Field({ description: 'IP 地址' })
    ip!: string;

    @Field({ description: '操作时间（YYYY-MM-DD HH:mm:ss）' })
    time!: string;
}

@ObjectType('PaginatedOperationLog', { description: '分页操作日志' })
export class PaginatedOperationLog {
    @Field(() => [OperationLog])
    list!: OperationLog[];

    @Field(() => Int)
    total!: number;

    @Field(() => Int)
    page!: number;

    @Field(() => Int)
    pageSize!: number;
}

@ObjectType('QuickEntry', { description: '快捷入口' })
export class QuickEntry {
    @Field({ description: '标题' })
    title!: string;

    @Field({ description: '描述' })
    desc!: string;

    @Field({ description: '图标颜色' })
    iconColor!: string;

    @Field({ description: '背景类名' })
    bgClass!: string;

    @Field({ description: '路由路径' })
    route!: string;
}

@ObjectType('Notice', { description: '系统公告' })
export class Notice {
    @Field({ description: 'ID' })
    id!: string;

    @Field({ description: '标签' })
    tag!: string;

    @Field({ description: '类型' })
    type!: string;

    @Field({ description: '标题' })
    title!: string;

    @Field({ description: '时间（YYYY-MM-DD HH:mm:ss）' })
    time!: string;
}
