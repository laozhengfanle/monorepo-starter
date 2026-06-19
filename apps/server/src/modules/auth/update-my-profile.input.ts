/**
 * 更新当前管理员个人资料的输入类型
 *
 * 所有字段可选，只更新传入的字段。
 * 不允许修改 username、roles、enabled 等管理字段。
 */
import { Field, InputType } from '@nestjs/graphql';

@InputType('UpdateMyProfileInput')
export class UpdateMyProfileInput {
    /** 昵称 */
    @Field({ nullable: true })
    nickname?: string;

    /** 头像 URL（由上传接口返回） */
    @Field({ nullable: true })
    avatar?: string;

    /** 邮箱 */
    @Field({ nullable: true })
    email?: string;

    /** 手机号 */
    @Field({ nullable: true })
    phone?: string;
}
