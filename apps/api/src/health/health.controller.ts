import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const databaseOk = await this.prisma.isReachable();

    return {
      status: databaseOk ? 'ok' : 'degraded',
      service: 'api',
      database: databaseOk ? 'ok' : 'unreachable',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
