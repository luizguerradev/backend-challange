import { EntityManager } from '@mikro-orm/postgresql';
import { InboxMessage } from '../../../domain/messaging/inbox-message.entity.js';
import { InboxMessageOrmEntity } from '../entities/inbox-message.orm-entity.js';

export class MikroInboxRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(messageId: string, consumerName: string): Promise<InboxMessage | null> {
    const orm = await this.em.findOne(
      InboxMessageOrmEntity, 
      { messageId, consumerName },
      { refresh: true, disableIdentityMap: true } // Evita leitura fantasma
    );
    if (!orm) return null;

    return InboxMessage.rehydrate({
      messageId: orm.messageId,
      consumerName: orm.consumerName,
      payloadHash: orm.payloadHash,
      receivedAt: orm.receivedAt,
      processedAt: orm.processedAt ?? undefined,
    });
  }

  async save(message: InboxMessage): Promise<void> {
    const entity = new InboxMessageOrmEntity();
    entity.messageId = message.messageId;
    entity.consumerName = message.consumerName;
    entity.payloadHash = message.payloadHash;
    entity.receivedAt = message.receivedAt;
    entity.processedAt = message.processedAt;

    await this.em.upsert(InboxMessageOrmEntity, entity);
    await this.em.flush();
  }
}