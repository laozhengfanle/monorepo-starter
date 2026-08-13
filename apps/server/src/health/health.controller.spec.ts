import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('返回 success envelope 与健康状态', () => {
    const envelope = controller.check();

    expect(envelope.success).toBe(true);
    expect(envelope.error).toBeNull();
    if (!envelope.success) {
      throw new Error('期望 success envelope');
    }
    expect(envelope.data.status).toBe('ok');
    expect(envelope.data.service).toBeTruthy();
    expect(envelope.data.version).toBeTruthy();
  });
});
