import { Module } from '@nestjs/common';
import { InMemoryUserRepository } from './in-memory-user.repository.js';
import { UserRepository } from './user.repository.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController],
  providers: [UsersService, { provide: UserRepository, useClass: InMemoryUserRepository }],
})
export class UsersModule {}
