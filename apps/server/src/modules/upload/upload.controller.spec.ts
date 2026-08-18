import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { UploadController } from './upload.controller.js';
import { UploadService } from './upload.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { TokenBlacklistService } from '../auth/token-blacklist.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

describe('UploadController', () => {
  let controller: UploadController;
  let uploadService: { save: ReturnType<typeof vi.fn<any>> };

  const user = { accountId: 'acc-1', userType: 'admin' };
  const req = { ip: '1.2.3.4', headers: { 'user-agent': 't' } } as never;

  function makeFile(originalname: string, mimetype: string, buffer?: Buffer) {
    return {
      originalname,
      mimetype,
      buffer: buffer ?? Buffer.from('data'),
    } as {
      originalname: string;
      mimetype: string;
      buffer: Buffer;
    };
  }

  beforeEach(async () => {
    uploadService = {
      save: vi
        .fn<any>()
        .mockResolvedValue({ id: 'f1', url: '/uploads/files/x.png' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        { provide: UploadService, useValue: uploadService },
        // JwtAuthGuard 依赖（@UseGuards 会实例化）
        JwtAuthGuard,
        { provide: JwtService, useValue: { verifyAsync: vi.fn<any>() } },
        { provide: ConfigService, useValue: { get: () => 'secret' } },
        {
          provide: PrismaService,
          useValue: { client: { account: { findUnique: vi.fn<any>() } } },
        },
        {
          provide: TokenBlacklistService,
          useValue: { isRevoked: vi.fn<any>() },
        },
      ],
    }).compile();
    controller = moduleRef.get(UploadController);
  });

  it('合法文件（png + image/png）→ 委托 save', async () => {
    const result = await controller.upload(
      makeFile('photo.png', 'image/png'),
      { folder: 'avatars' },
      user,
      req,
    );

    expect(uploadService.save).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'photo.png' }),
      'acc-1',
      'avatars',
      expect.any(Object),
    );
    expect(result.url).toBe('/uploads/files/x.png');
  });

  it('folder 缺省为 files', async () => {
    await controller.upload(
      makeFile('a.pdf', 'application/pdf'),
      {},
      user,
      req,
    );

    expect(uploadService.save).toHaveBeenCalledWith(
      expect.anything(),
      'acc-1',
      'files',
      expect.any(Object),
    );
  });

  it('防伪装：mimetype 与扩展名不匹配 → 400', () => {
    // upload 在校验分支是同步 throw（非 async）
    expect(() =>
      controller.upload(makeFile('photo.png', 'text/html'), {}, user, req),
    ).toThrow(BadRequestException);
    expect(uploadService.save).not.toHaveBeenCalled();
  });

  it('危险扩展名（svg/html/js）→ 400（防存储型 XSS）', () => {
    expect(() =>
      controller.upload(makeFile('evil.svg', 'image/svg+xml'), {}, user, req),
    ).toThrow(BadRequestException);
  });

  it('无扩展名 → 400', () => {
    expect(() =>
      controller.upload(
        makeFile('noext', 'application/octet-stream'),
        {},
        user,
        req,
      ),
    ).toThrow(BadRequestException);
  });
});
