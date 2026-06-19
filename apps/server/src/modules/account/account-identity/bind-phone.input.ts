/**
 * 绑定/解绑手机号 GraphQL InputType
 */
import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class BindPhoneInput {
    @Field({ description: '要绑定的手机号（中国大陆 11 位）' })
    phone!: string;

    @Field({ description: '手机验证码（6 位数字）' })
    code!: string;
}

@InputType()
export class UnbindPhoneInput {
    @Field({ description: '要解绑的手机号' })
    phone!: string;

    @Field({ description: '手机验证码（验证本人操作，6 位数字）' })
    code!: string;
}
