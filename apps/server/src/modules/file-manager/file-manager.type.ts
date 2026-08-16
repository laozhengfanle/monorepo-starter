import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import type { UploadFile } from '@starter/contracts';

/** 上传文件元数据项 */
@ObjectType('UploadFile')
export class UploadFileType implements UploadFile {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  originalName!: string;

  @Field(() => String)
  storedName!: string;

  @Field(() => String)
  mimeType!: string;

  @Field(() => Int)
  size!: number;

  @Field(() => String)
  url!: string;

  @Field(() => String, { nullable: true })
  accountId!: string | null;

  @Field(() => String)
  createdAt!: string;

  @Field(() => String, { nullable: true })
  deletedAt!: string | null;
}

/** 文件分页结果 */
@ObjectType('PaginatedUploadFiles')
export class PaginatedUploadFilesType {
  @Field(() => [UploadFileType])
  items!: UploadFileType[];

  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  page!: number;

  @Field(() => Int)
  pageSize!: number;
}
