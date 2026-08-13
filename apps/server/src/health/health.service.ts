import { Injectable } from '@nestjs/common';
import { API_VERSION } from '@starter/server-core';
import type { HealthVo } from '@starter/contracts';

const SERVICE_NAME = 'monorepo-starter-api';

@Injectable()
export class HealthService {
  check(): HealthVo {
    return {
      status: 'ok',
      service: SERVICE_NAME,
      version: API_VERSION,
    };
  }
}
