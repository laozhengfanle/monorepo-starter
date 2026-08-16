import { Field, Int, ObjectType } from '@nestjs/graphql';

/** 仪表盘统计卡片 */
@ObjectType('DashboardStat', { description: '仪表盘统计卡片' })
export class DashboardStatType {
  @Field({ description: '标签名，如 管理员 / 角色 / 菜单项 / 近7日操作' })
  label!: string;

  @Field(() => Int, { description: '当前值' })
  value!: number;

  @Field(() => Int, { description: '较上周趋势百分比（正=上升，负=下降）' })
  trend!: number;
}

/** 敏感操作趋势数据点（按风险等级拆分） */
@ObjectType('DashboardTrendItem', { description: '敏感操作趋势数据点' })
export class DashboardTrendItemType {
  @Field({ description: '时间段标签（周一 / MM-DD / M月）' })
  label!: string;

  @Field(() => Int, { description: '高危操作次数' })
  highRisk!: number;

  @Field(() => Int, { description: '中危操作次数' })
  midRisk!: number;

  @Field(() => Int, { description: '低危操作次数' })
  lowRisk!: number;
}

/** 操作类型分布项 */
@ObjectType('DashboardDistItem', { description: '操作类型分布项' })
export class DashboardDistItemType {
  @Field({ description: '操作中文标签（字典 audit_action）' })
  label!: string;

  @Field(() => Int, { description: '占比（0-100）' })
  percent!: number;

  @Field({ description: '饼图颜色' })
  color!: string;
}

/** 最近操作记录行 */
@ObjectType('DashboardOpLog', { description: '最近操作记录' })
export class DashboardOpLogType {
  @Field(() => Int, { description: '序号' })
  seq!: number;

  @Field({ description: '操作者用户名（无则系统）' })
  user!: string;

  @Field({ description: '操作内容中文标签（字典 audit_action）' })
  content!: string;

  @Field({ description: '资源类型中文标签（字典 audit_resource）' })
  module!: string;

  @Field({ description: '操作类型分类：login/logout/create/update/delete/reset/grant/export' })
  type!: string;

  @Field({ description: 'IP' })
  ip!: string;

  @Field({ description: '操作时间（YYYY-MM-DD HH:mm:ss）' })
  time!: string;
}

/** 操作记录分页 */
@ObjectType('DashboardOpLogPage', { description: '分页操作记录' })
export class DashboardOpLogPageType {
  @Field(() => [DashboardOpLogType])
  list!: DashboardOpLogType[];

  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  page!: number;

  @Field(() => Int)
  pageSize!: number;
}
