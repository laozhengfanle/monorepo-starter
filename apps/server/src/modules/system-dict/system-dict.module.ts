import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SysDictController } from './system-dict.controller.js';
import { SysDictResolver } from './system-dict.resolver.js';
import { SysDictService } from './system-dict.service.js';

/** 数据字典模块（sys_dict_type / sys_dict_item，GraphQL + REST 双协议，权限 config:dict:*） */
@Module({
  imports: [AuthModule],
  controllers: [SysDictController],
  providers: [SysDictService, SysDictResolver],
  exports: [SysDictService],
})
export class SysDictModule {}
