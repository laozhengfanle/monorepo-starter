import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { HealthVo } from '@starter/contracts';
import type { ApiEnvelope } from '@starter/contracts';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({ type: HealthVo })
  check(): ApiEnvelope<HealthVo> {
    return { success: true, data: this.healthService.check(), error: null };
  }
}
