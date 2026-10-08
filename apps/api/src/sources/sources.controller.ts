import { Controller, Get, Inject } from '@nestjs/common';
import type { AdapterRegistry } from '@appinity/integrations';
import type { SourceDto } from '@appinity/shared';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ADAPTER_REGISTRY } from '../infra/tokens.js';

@Controller('v1/sources')
export class SourcesController {
  constructor(@Inject(ADAPTER_REGISTRY) private readonly registry: AdapterRegistry) {}

  /** Fuentes visibles para el usuario: las simuladas solo son conectables por usuarios de demo. */
  @Get()
  list(@CurrentUser() auth: AuthContext): Array<SourceDto & { plannedPhase?: string }> {
    return this.registry.manifests().map((m) => ({
      ...m,
      connectable: m.connectable && m.simulated === (auth.dataset === 'demo'),
    }));
  }
}
