/**
 * 修改密码 GraphQL InputType
 */
import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class ChangePasswordInput {
    @Field({ description: '旧密码' })
    oldPassword!: string;

    @Field({ description: '新密码（8-32 字符，含大小写 + 数字）' })
    newPassword!: string;
}
