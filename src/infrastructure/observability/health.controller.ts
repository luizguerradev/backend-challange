import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EntityManager } from '@mikro-orm/postgresql';

@ApiTags('Observability')
@Controller('health')
export class HealthController {
  constructor(private readonly em: EntityManager) {}

  @Get()
  @ApiOperation({ summary: 'Verificar saúde da API e conectividade com o banco de dados' })
  @ApiResponse({ status: 200, description: 'Serviço operacional.' })
  @ApiResponse({ status: 503, description: 'Serviço degradado / banco indisponível.' })
  async check() {
    let dbStatus = 'up';
    try {
      await this.em.getConnection().execute('SELECT 1');
    } catch {
      dbStatus = 'down';
    }

    const isHealthy = dbStatus === 'up';

    return {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        api: 'up',
      },
    };
  }
}