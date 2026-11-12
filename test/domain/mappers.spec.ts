import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Wallet } from '../../src/domain/wallet/entity/wallet.entity.js';
import { Money } from '../../src/domain/common/money.vo.js';
import { 
  WagerTransaction, 
  WagerTransactionKind, 
  WagerTransactionStatus 
} from '../../src/domain/wager/entity/wager-transaction.entity.js';
import { WalletMapper } from '../../src/infrastructure/database/mappers/wallet.mapper.js';
import { WagerTransactionMapper } from '../../src/infrastructure/database/mappers/wager-transaction.mapper.js';

describe('Database Mappers', () => {
  it('deve converter Wallet de domínio para ORM e reidratar mantendo valores exatos', () => {
    const { wallet } = Wallet.open({
      id: randomUUID(),
      playerId: 'player-test-1',
      initialBalance: Money.from({ amount: '350.50', currency: 'BRL' }),
    });

    const orm = WalletMapper.toOrmEntity(wallet);
    expect(orm.id).toBe(wallet.id);
    expect(orm.balance).toBe('350.50');
    expect(orm.version).toBe(1);

    const rehydrated = WalletMapper.toDomain(orm);
    expect(rehydrated.id).toBe(wallet.id);
    expect(rehydrated.balance.toString()).toBe('350.50');
    expect(rehydrated.version).toBe(1);
  });

  it('deve converter WagerTransaction de domínio para ORM e reidratar mantendo status e idempotencyKey', () => {
    const wager = WagerTransaction.create({
      providerId: 'provider-1',
      externalTransactionId: 'tx-999',
      payloadHash: 'a'.repeat(64),
      walletId: randomUUID(),
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerTransactionKind.BET,
      money: Money.from({ amount: '50.00', currency: 'BRL' }),
    });

    wager.markProcessed(undefined);

    const orm = WagerTransactionMapper.toOrmEntity(wager);
    expect(orm.idempotencyKey).toBe('provider-1:tx-999');
    expect(orm.status).toBe(WagerTransactionStatus.PROCESSED);
    expect(orm.amount).toBe('50.00');

    const rehydrated = WagerTransactionMapper.toDomain(orm);
    expect(rehydrated.idempotencyKey).toBe('provider-1:tx-999');
    expect(rehydrated.status).toBe(WagerTransactionStatus.PROCESSED);
    expect(rehydrated.money.toString()).toBe('50.00');
  });
});