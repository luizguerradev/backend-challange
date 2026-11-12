import { 
  WagerTransaction, 
  WagerTransactionKind, 
  WagerTransactionStatus, 
  FailureCode 
} from '../../../domain/wager/entity/wager-transaction.entity.js';
import { Money } from '../../../domain/common/money.vo.js';
import { WagerTransactionOrmEntity } from '../entities/wager-transaction.orm-entity.js';

export class WagerTransactionMapper {
  static toDomain(orm: WagerTransactionOrmEntity): WagerTransaction {
    return WagerTransaction.rehydrate({
      id: orm.id,
      providerId: orm.providerId,
      externalTransactionId: orm.externalTransactionId,
      idempotencyKey: orm.idempotencyKey,
      payloadHash: orm.payloadHash,
      walletId: orm.walletId,
      playerId: orm.playerId,
      roundId: orm.roundId,
      gameId: orm.gameId,
      kind: orm.kind as WagerTransactionKind,
      money: Money.from({ amount: orm.amount, currency: orm.currency }),
      referenceExternalTransactionId: orm.referenceExternalTransactionId,
      referenceTransactionId: orm.referenceTransactionId,
      status: orm.status as WagerTransactionStatus,
      failureCode: orm.failureCode as FailureCode | undefined,
      processedAt: orm.processedAt,
      createdAt: orm.createdAt,
    });
  }

  static toOrmEntity(domain: WagerTransaction): WagerTransactionOrmEntity {
    const entity = new WagerTransactionOrmEntity();
    entity.id = domain.id;
    entity.providerId = domain.providerId;
    entity.externalTransactionId = domain.externalTransactionId;
    entity.idempotencyKey = domain.idempotencyKey;
    entity.payloadHash = domain.payloadHash;
    entity.walletId = domain.walletId;
    entity.playerId = domain.playerId;
    entity.roundId = domain.roundId;
    entity.gameId = domain.gameId;
    entity.kind = domain.kind;
    entity.amount = domain.money.toString();
    entity.currency = domain.money.currency;
    entity.referenceExternalTransactionId = domain.referenceExternalTransactionId;
    entity.referenceTransactionId = domain.referenceTransactionId;
    entity.status = domain.status;
    entity.failureCode = domain.failureCode;
    entity.processedAt = domain.processedAt;
    entity.createdAt = domain.createdAt;
    return entity;
  }
}