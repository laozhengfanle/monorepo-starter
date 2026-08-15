import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateDictItemDto,
  CreateDictTypeDto,
  UpdateDictItemDto,
  UpdateDictTypeDto,
} from '@starter/server-core';
import type { SysDictItem, SysDictType } from '@starter/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { SysDictService } from './system-dict.service.js';

/** 数据字典 REST 端点（权限 config:dict:*） */
@ApiTags('admin-dicts')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/dicts')
export class SysDictController {
  constructor(private readonly sysDictService: SysDictService) {}

  @Get()
  @RequirePermission('config:dict:view')
  @ApiOkResponse({ description: '全部字典类型（含 items）' })
  list(): Promise<SysDictType[]> {
    return this.sysDictService.listTypes();
  }

  @Get('code/:code')
  @RequirePermission('config:dict:view')
  @ApiOkResponse({ description: '按 code 查字典类型（含 items）' })
  getByCode(@Param('code') code: string): Promise<SysDictType | null> {
    return this.sysDictService.getTypeByCode(code);
  }

  @Post()
  @RequirePermission('config:dict:update')
  @ApiCreatedResponse({ description: '创建字典类型' })
  @ApiBody({ type: CreateDictTypeDto })
  createType(@Body() body: CreateDictTypeDto): Promise<SysDictType> {
    return this.sysDictService.createType(body);
  }

  @Put('type/:id')
  @RequirePermission('config:dict:update')
  @ApiOkResponse({ description: '更新字典类型' })
  @ApiBody({ type: UpdateDictTypeDto })
  updateType(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateDictTypeDto,
  ): Promise<SysDictType> {
    return this.sysDictService.updateType(id, body);
  }

  @Delete('type/:id')
  @RequirePermission('config:dict:update')
  @ApiOkResponse({ description: '删除字典类型（级联删除 items）' })
  removeType(@Param('id', new ParseUUIDPipe()) id: string): Promise<{ success: true }> {
    return this.sysDictService.removeType(id);
  }

  @Post('item')
  @RequirePermission('config:dict:update')
  @ApiCreatedResponse({ description: '创建字典项' })
  @ApiBody({ type: CreateDictItemDto })
  createItem(@Body() body: CreateDictItemDto): Promise<SysDictItem> {
    return this.sysDictService.createItem(body);
  }

  @Put('item/:id')
  @RequirePermission('config:dict:update')
  @ApiOkResponse({ description: '更新字典项' })
  @ApiBody({ type: UpdateDictItemDto })
  updateItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateDictItemDto,
  ): Promise<SysDictItem> {
    return this.sysDictService.updateItem(id, body);
  }

  @Delete('item/:id')
  @RequirePermission('config:dict:update')
  @ApiOkResponse({ description: '删除字典项' })
  removeItem(@Param('id', new ParseUUIDPipe()) id: string): Promise<{ success: true }> {
    return this.sysDictService.removeItem(id);
  }
}
