import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { 
  WagerTransaction, 
  WagerTransactionKind, 
  WagerTransactionStatus, 
  InvalidTransactionStateError 
} from '../../src/domain/wager/entity/wager-transaction.entity.js';
import { Money } from '../../src/domain/common/money.vo.js';
import { LedgerDirection } from '../../src/domain/wallet/entity/wallet-ledger-entry.entity.js';

describe('WagerTransaction Entity', () => {
  const createSampleWager = () => {
    return WagerTransaction.create({
      providerId: 'provider-a',
      externalTransactionId: 'ext-tx-100',
      payloadHash: 'hash-abc-123',
      walletId: randomUUID(),
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'fortune-tiger',
      kind: WagerTransactionKind.BET,
      money: Money.from({ amount: '25.00', currency: 'BRL' }),
    });
  };

  it('deve inicializar com status PENDING e montar a idempotencyKey', () => {
    const wager = createSampleWager();

    expect(wager.status).toBe(WagerTransactionStatus.PENDING);
    expect(wager.idempotencyKey).toBe('provider-a:ext-tx-100');
    expect(wager.isTerminal()).toBe(false);
    expect(wager.affectsBalance()).toBe(true);
    expect(wager.processedAt).toBeUndefined();
  });

  it('deve transicionar com sucesso de PENDING para PROCESSED', () => {
    const wager = createSampleWager();
    wager.markProcessed(undefined);

    expect(wager.status).toBe(WagerTransactionStatus.PROCESSED);
    expect(wager.isTerminal()).toBe(true);
    expect(wager.processedAt).toBeInstanceOf(Date);
  });

  it('deve transicionar com sucesso de PENDING para REJECTED com failureCode auditável', () => {
    const wager = createSampleWager();
    wager.reject('INSUFFICIENT_FUNDS');

    expect(wager.status).toBe(WagerTransactionStatus.REJECTED);
    expect(wager.failureCode).toBe('INSUFFICIENT_FUNDS');
    expect(wager.isTerminal()).toBe(true);
  });

  it('deve marcar como PENDING_REFERENCE e permitir reprocessamento', () => {
    const refund = WagerTransaction.create({
      providerId: 'provider-a',
      externalTransactionId: 'refund-1',
      payloadHash: 'hash-ref-1',
      walletId: randomUUID(),
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'fortune-tiger',
      kind: WagerTransactionKind.REFUND,
      money: Money.from({ amount: '25.00', currency: 'BRL' }),
      referenceExternalTransactionId: 'ext-tx-100',
    });

    refund.markPendingReference();
    expect(refund.status).toBe(WagerTransactionStatus.PENDING_REFERENCE);
    expect(refund.isTerminal()).toBe(false);

    // Permite transicionar para PROCESSED quando a referência for encontrada
    refund.markProcessed('internal-bet-uuid');
    expect(refund.status).toBe(WagerTransactionStatus.PROCESSED);
    expect(refund.referenceTransactionId).toBe('internal-bet-uuid');
  });

  it('deve bloquear transições a partir de estados terminais', () => {
    const wager = createSampleWager();
    wager.markProcessed(undefined);

    // Não pode transicionar aposta que já é terminal (PROCESSED)
    expect(() => wager.markProcessed(undefined)).toThrow(InvalidTransactionStateError);
    expect(() => wager.reject('INSUFFICIENT_FUNDS')).toThrow(InvalidTransactionStateError);
    expect(() => wager.fail('INTERNAL_PROCESSING_ERROR')).toThrow(InvalidTransactionStateError);
  });

  it('deve determinar a direção correta do ledger por kind', () => {
    const bet = createSampleWager();
    expect(bet.ledgerDirectionFor()).toBe(LedgerDirection.DEBIT);

    const win = WagerTransaction.create({
      providerId: 'provider-a',
      externalTransactionId: 'win-1',
      payloadHash: 'hash-win-1',
      walletId: randomUUID(),
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'fortune-tiger',
      kind: WagerTransactionKind.WIN,
      money: Money.from({ amount: '50.00', currency: 'BRL' }),
    });
    expect(win.ledgerDirectionFor()).toBe(LedgerDirection.CREDIT);
  });
});