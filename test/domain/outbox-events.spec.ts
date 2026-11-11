import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { WalletBalanceChanged } from '../../src/domain/messaging/events/wallet-balance-changed.event';
import { 
  WagerTransactionProcessed, 
  WagerTransactionRejected 
} from '../../src/domain/messaging/events/wager-transaction-events';
import { OutboxMessage } from '../../src/domain/messaging/outbox-message.entity';
import { LedgerDirection } from '../../src/domain/wallet/entity/wallet-ledger-entry.entity';
import { WagerTransactionKind, FailureCode } from '../../src/domain/wager/entity/wager-transaction.entity';

describe('Transactional Outbox & Integration Event Envelopes', () => {
  it('deve instanciar WalletBalanceChanged com payload canônico e tipos de evento no envelope', () => {
    const event = WalletBalanceChanged.create({
      context: { correlationId: 'corr-123', causationId: 'caus-456' },
      data: {
        walletId: 'wallet-1',
        transactionId: 'tx-1',
        direction: LedgerDirection.CREDIT,
        money: { amount: '100.00', currency: 'BRL' },
        balanceBefore: { amount: '0.00', currency: 'BRL' },
        balanceAfter: { amount: '100.00', currency: 'BRL' },
        walletVersion: 1,
      },
    });

    expect(event.eventType).toBe('WalletBalanceChanged');
    expect(event.version).toBe(1);
    expect(event.correlationId).toBe('corr-123');

    const json = event.toJSON();
    expect(json.eventType).toBe('WalletBalanceChanged');
    expect(json.data.money.amount).toBe('100.00');
    expect(typeof json.occurredAt).toBe('string');
  });

  it('deve enfileirar evento no OutboxMessage e controlar ciclo de retry com backoff', () => {
    const event = WagerTransactionRejected.create({
      context: { correlationId: 'corr-999' },
      data: {
        transactionId: randomUUID(),
        providerId: 'prv-1',
        externalTransactionId: 'ext-tx-1',
        idempotencyKey: 'prv-1:ext-tx-1',
        walletId: randomUUID(),
        playerId: 'ply-1',
        roundId: 'rnd-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.BET,
        money: { amount: '50.00', currency: 'BRL' },
        failureCode: FailureCode.INSUFFICIENT_FUNDS,
      },
    });

    const outbox = OutboxMessage.enqueue(event);
    expect(outbox.isPending()).toBe(true);
    expect(outbox.attempts).toBe(0);
    expect(outbox.isDue()).toBe(true);

    const t0 = new Date('2026-11-11T10:00:00Z');
    outbox.scheduleRetry(t0, 1000);

    expect(outbox.attempts).toBe(1);
    expect(outbox.nextAttemptAt!.getTime()).toBe(new Date('2026-11-11T10:00:02Z').getTime()); // 2^1 * 1000 = 2000ms

    outbox.markPublished(new Date('2026-11-11T10:00:05Z'));
    expect(outbox.isPending()).toBe(false);
    expect(outbox.publishedAt).toBeDefined();
    expect(() => outbox.markPublished()).toThrow(/already published/);
  });
});