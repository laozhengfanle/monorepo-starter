import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateUserDto,
  PaginatedUsersResponseDto,
  QueryUsersDto,
  UpdateUserDto,
  UserVo,
} from '@starter/contracts';
import type { ApiEnvelope, PaginatedData } from '@starter/contracts';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOkResponse({ type: PaginatedUsersResponseDto })
  list(@Query() query: QueryUsersDto): Promise<ApiEnvelope<PaginatedData<UserVo>>> {
    return this.usersService.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: UserVo })
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<UserVo> {
    return this.usersService.findById(id);
  }

  @Post()
  @ApiCreatedResponse({ type: UserVo })
  @ApiBody({ type: CreateUserDto })
  create(@Body() body: CreateUserDto): Promise<UserVo> {
    return this.usersService.create(body);
  }

  @Put(':id')
  @ApiOkResponse({ type: UserVo })
  @ApiBody({ type: UpdateUserDto })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: UpdateUserDto): Promise<UserVo> {
    return this.usersService.update(id, body);
  }

  @Delete(':id')
  @ApiOkResponse({ type: UserVo })
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<UserVo> {
    return this.usersService.remove(id);
  }
}
