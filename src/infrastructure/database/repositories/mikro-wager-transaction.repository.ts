import { EntityManager } from '@mikro-orm/postgresql';
import type { WagerTransactionRepositoryInterface } from '../../../domain/wager/repository/wager-transaction.repository.interface';
import type { WagerTransaction } from '../../../domain/wager/entity/wager-transaction.entity';
import { WagerTransactionOrmEntity } from '../entities/wager-transaction.orm-entity';
import { WagerTransactionMapper } from '../mappers/wager-transaction.mapper';

export class MikroWagerTransactionRepository implements WagerTransactionRepositoryInterface {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<WagerTransaction | null> {
    const orm = await this.em.findOne(WagerTransactionOrmEntity, { id });
    return orm ? WagerTransactionMapper.toDomain(orm) : null;
  }

  async findByIdempotencyKey(providerId: string, externalTransactionId: string): Promise<WagerTransaction | null> {
    const orm = await this.em.findOne(WagerTransactionOrmEntity, {
      providerId,
      externalTransactionId,
    });
    return orm ? WagerTransactionMapper.toDomain(orm) : null;
  }

  async save(transaction: WagerTransaction): Promise<void> {
    const orm = WagerTransactionMapper.toOrmEntity(transaction);
    this.em.persist(orm);
    await this.em.flush();
  }
}