import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import type { OutboxRepositoryInterface } from '../../../domain/messaging/repository/outbox.repository.interface.js';
import { OutboxMessage } from '../../../domain/messaging/outbox-message.entity.js';
import { OutboxMessageOrmEntity } from '../entities/outbox-message.orm-entity.js';

export class MikroOutboxRepository implements OutboxRepositoryInterface {
  constructor(private readonly em: EntityManager) {}

  async save(message: OutboxMessage): Promise<void> {
    const entity = this.toOrmEntity(message);
    await this.em.upsert(OutboxMessageOrmEntity, entity);
    await this.em.flush();
  }

  async saveBatch(messages: OutboxMessage[]): Promise<void> {
    for (const msg of messages) {
      const entity = this.toOrmEntity(msg);
      this.em.persist(entity);
    }
    await this.em.flush();
  }

  /**
   * Busca mensagens pendentes prontas para envio com concorrência segura.
   * Utiliza QueryBuilder nativo do MikroORM v6 para acionar o Lock Pessimista.
   */
  async fetchPendingDueForUpdate(limit: number, now: Date = new Date()): Promise<OutboxMessage[]> {
    const qb = this.em.createQueryBuilder(OutboxMessageOrmEntity, 'o');
    
    // O SKIP LOCKED garante a segurança de que vários workers não tocam na mesma mensagem.
    const entities = await qb
      .select('*')
      .where({ publishedAt: null })
      .andWhere({
        $or: [
          { nextAttemptAt: null },
          { nextAttemptAt: { $lte: now } },
        ],
      })
      .orderBy({ createdAt: 'ASC' })
      .limit(limit)
      .setLockMode(LockMode.PESSIMISTIC_WRITE, ['o']) // FOR UPDATE SKIP LOCKED
      .execute('all');

    return entities.map((row: any) =>
      OutboxMessage.rehydrate({
        id: row.id,
        aggregateId: row.aggregate_id ?? row.aggregateId,
        eventType: row.event_type ?? row.eventType,
        payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
        occurredAt: new Date(row.occurred_at ?? row.occurredAt),
        attempts: Number(row.attempts),
        nextAttemptAt: (row.next_attempt_at ?? row.nextAttemptAt) 
          ? new Date(row.next_attempt_at ?? row.nextAttemptAt) : undefined,
        publishedAt: (row.published_at ?? row.publishedAt) 
          ? new Date(row.published_at ?? row.publishedAt) : undefined,
        createdAt: new Date(row.created_at ?? row.createdAt),
      })
    );
  }

  async findById(id: string): Promise<OutboxMessage | null> {
    // Força o ORM a buscar do BD em vez do cache e esvazia o Identity Map local
    const orm = await this.em.findOne(OutboxMessageOrmEntity, { id }, { refresh: true, disableIdentityMap: true });
    if (!orm) return null;

    return OutboxMessage.rehydrate({
      id: orm.id,
      aggregateId: orm.aggregateId,
      eventType: orm.eventType,
      payload: orm.payload,
      occurredAt: orm.occurredAt,
      attempts: orm.attempts,
      // Converte o "null" vindo do PostgreSQL para o "undefined" esperado pela classe de Domínio
      nextAttemptAt: orm.nextAttemptAt ?? undefined,
      publishedAt: orm.publishedAt ?? undefined,
      createdAt: orm.createdAt,
    });
  }

  private toOrmEntity(domain: OutboxMessage): OutboxMessageOrmEntity {
    const entity = new OutboxMessageOrmEntity();
    entity.id = domain.id;
    entity.aggregateId = domain.aggregateId;
    entity.eventType = domain.eventType;
    entity.payload = domain.payload as Record<string, unknown>;
    entity.occurredAt = domain.occurredAt;
    entity.attempts = domain.attempts;
    // Opcional: undefined será ignorado pelo driver ou mapeado corretamente para NULL
    entity.nextAttemptAt = domain.nextAttemptAt;
    entity.publishedAt = domain.publishedAt;
    entity.createdAt = domain.createdAt;
    return entity;
  }
}