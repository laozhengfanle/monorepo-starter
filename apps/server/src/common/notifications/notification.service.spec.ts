import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { NotificationService } from './notification.service.js';
import { EMAIL_PROVIDER_TOKEN, SMS_PROVIDER_TOKEN } from './tokens.js';
import { MockSmsProvider } from './providers/mock-sms.provider.js';
import { MockEmailProvider } from './providers/mock-email.provider.js';

describe('NotificationService', () => {
  let service: NotificationService;
  const smsSend = vi.fn<any>().mockResolvedValue(undefined);
  const emailSend = vi.fn<any>().mockResolvedValue(undefined);

  const fakeSms = { name: 'aliyun', send: smsSend };
  const fakeEmail = { name: 'smtp', send: emailSend };

  async function createService(
    config: Record<string, string | undefined> = {},
  ) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: SMS_PROVIDER_TOKEN,
          useValue: [new MockSmsProvider(), fakeSms],
        },
        {
          provide: EMAIL_PROVIDER_TOKEN,
          useValue: [new MockEmailProvider(), fakeEmail],
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def: unknown) => config[key] ?? def,
          },
        },
      ],
    }).compile();
    return moduleRef.get(NotificationService);
  }

  beforeEach(() => {
    smsSend.mockClear();
    emailSend.mockClear();
  });

  it('默认使用 mock Provider（开发环境不真实发送）', async () => {
    service = await createService();
    await service.sendSms('13800000000', 'SMS_1', { code: '123456' });
    // 默认第一个（mock）——不调用真实 provider
    expect(smsSend).not.toHaveBeenCalled();
  });

  it('按 NOTIFY_SMS_PROVIDER 配置选择真实 Provider', async () => {
    service = await createService({ NOTIFY_SMS_PROVIDER: 'aliyun' });
    await service.sendSms('13800000000', 'SMS_1', { code: '123456' });

    expect(smsSend).toHaveBeenCalledWith('13800000000', 'SMS_1', {
      code: '123456',
    });
  });

  it('按 NOTIFY_EMAIL_PROVIDER 配置选择真实 Provider', async () => {
    service = await createService({ NOTIFY_EMAIL_PROVIDER: 'smtp' });
    await service.sendEmail('a@b.com', '标题', '<p>内容</p>', '内容');

    expect(emailSend).toHaveBeenCalledWith(
      'a@b.com',
      '标题',
      '<p>内容</p>',
      '内容',
    );
  });

  it('未配置 Provider 集合时静默跳过', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: SMS_PROVIDER_TOKEN, useValue: [] },
        { provide: EMAIL_PROVIDER_TOKEN, useValue: [] },
        {
          provide: ConfigService,
          useValue: { get: () => 'nonexistent' },
        },
      ],
    }).compile();
    service = moduleRef.get(NotificationService);

    await expect(
      service.sendSms('13800000000', 'SMS_1', { code: '1' }),
    ).resolves.toBeUndefined();
  });
});
