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

  it('返回裸健康状态数据', () => {
    const health = controller.check();

    expect(health.status).toBe('ok');
    expect(health.service).toBeTruthy();
    expect(health.version).toBeTruthy();
  });
});
