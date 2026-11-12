import type { EntityManager } from '@mikro-orm/postgresql';
import { MikroOutboxRepository } from '../../infrastructure/database/repositories/mikro-outbox.repository.js';
import type { EventPublisherPort } from '../../domain/messaging/ports/event-publisher.port.js';

export interface OutboxPublisherWorkerOptions {
  batchSize?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export class OutboxPublisherWorker {
  constructor(
    private readonly em: EntityManager,
    private readonly publisher: EventPublisherPort,
    private readonly options: OutboxPublisherWorkerOptions = {},
  ) {}

  /**
   * Processa uma rodada de eventos pendentes dentro de uma transação controlada.
   * Retorna o número de eventos publicados com sucesso.
   */
  async processDueBatch(now: Date = new Date()): Promise<number> {
    const batchSize = this.options.batchSize ?? 20;
    const baseDelay = this.options.baseDelayMs ?? 1000;
    const maxDelay = this.options.maxDelayMs ?? 60000;

    let publishedCount = 0;

    await this.em.transactional(async (txEm) => {
      const txRepo = new MikroOutboxRepository(txEm);

      // Trava e seleciona com SKIP LOCKED + CTE
      const pendingMessages = await txRepo.fetchPendingDueForUpdate(batchSize, now);

      if (pendingMessages.length === 0) {
        return;
      }

      for (const message of pendingMessages) {
        try {
          await this.publisher.publish({
            messageId: message.id,
            eventType: message.eventType,
            payload: message.payload as Record<string, unknown>,
          });

          message.markPublished(now);
          await txRepo.save(message); // <- Salva como publicado
          publishedCount += 1;
        } catch (error) {
          // Broker inacessível: agenda backoff exponencial
          message.scheduleRetry(now, baseDelay, maxDelay);
          await txRepo.save(message); // <- ESTAVA FALTANDO SALVAR O RETRY!
        }
      }
    });

    return publishedCount;
  }
}