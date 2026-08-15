import { Module } from '@nestjs/common';
import { AuthModule } from '../modules/auth/auth.module.js';
import { PrismaUserRepository } from './prisma-user.repository.js';
import { UserRepository } from './user.repository.js';
import { UsersController } from './users.controller.js';
import { UsersResolver } from './users.resolver.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersResolver,
    { provide: UserRepository, useClass: PrismaUserRepository },
  ],
})
export class UsersModule {}