import { Inject, Injectable, Logger } from '@nestjs/common';
import { users, type DatabaseHandle } from '@appinity/database';
import { enqueueAffinityRefresh, type ProducerQueues } from '@appinity/ingestion';
import { eq } from 'drizzle-orm';
import { ConnectionsService } from '../connections/connections.service.js';
import { DATABASE, QUEUES } from '../infra/tokens.js';

export interface AccountDeletion {
  /** Fuentes cuyo permiso se pidió anular en el proveedor. */
  disconnected: string[];
  /** Fuentes que no se pudieron desconectar (se borran igualmente con la cuenta). */
  failed: string[];
}

/**
 * Eliminar una cuenta real. Lo usan «Eliminar mi cuenta» (DELETE /v1/me) y `pnpm account:delete` (peticiones por email
 * de la página /legal/eliminar-cuenta), para que las dos vías borren exactamente lo mismo.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(QUEUES) private readonly queues: ProducerQueues,
    private readonly connections: ConnectionsService,
  ) {}

  /**
   * Desconecta cada fuente pidiendo al proveedor que anule el permiso y borrando lo importado, y después borra al usuario
   * (en cascada: perfil, ajustes, evidencia, votos, afinidades, amistades, seguimientos, chats, sesiones, tokens push…).
   * Un proveedor que no responde no impide el borrado.
   */
  async deleteAccount(userId: string): Promise<AccountDeletion> {
    const result: AccountDeletion = { disconnected: [], failed: [] };
    for (const connection of await this.connections.list(userId)) {
      if (connection.status === 'revoked') continue;
      try {
        await this.connections.disconnect(userId, connection.id, true);
        result.disconnected.push(connection.sourceKey);
      } catch (error) {
        result.failed.push(connection.sourceKey);
        this.logger.warn(`Al eliminar la cuenta no se pudo desconectar ${connection.sourceKey}: ${(error as Error).message.slice(0, 120)}`);
      }
    }
    await this.database.db.delete(users).where(eq(users.id, userId));
    // Sin esta persona cambian la población y la rareza de sus obras, y con ellas los pesos del resto de parejas (B7).
    await enqueueAffinityRefresh(this.queues).catch((error: Error) => this.logger.warn(`No se pudo encolar el recálculo de afinidades: ${error.message}`));
    return result;
  }
}
