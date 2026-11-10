import { describe, it, expect } from 'vitest';
import { 
  WagerTransaction, 
  WagerKind, 
  WagerStatus, 
  InvalidWagerStateTransitionError 
} from '../../src/domain/wager/entity/wager-transaction.entity.js';
import { Money } from '../../src/domain/common/money.vo';

describe('WagerTransaction Entity', () => {
  const createSampleWager = () => {
    return WagerTransaction.create({
      providerId: 'provider-a',
      externalTransactionId: 'ext-tx-100',
      payloadHash: 'hash-abc-123',
      walletId: 'wallet-uuid',
      playerId: 'player-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: WagerKind.BET,
      amount: Money.fromNumber(25, 'BRL'),
      currency: 'BRL',
    });
  };

  it('deve inicializar com status PENDING e montar a idempotencyKey', () => {
    const wager = createSampleWager();

    expect(wager.status).toBe(WagerStatus.PENDING);
    expect(wager.idempotencyKey).toBe('provider-a:ext-tx-100');
    expect(wager.processedAt).toBeUndefined();
  });

  it('deve transicionar com sucesso de PENDING para PROCESSED', () => {
    const wager = createSampleWager();
    wager.markAsProcessed();

    expect(wager.status).toBe(WagerStatus.PROCESSED);
    expect(wager.processedAt).toBeInstanceOf(Date);
  });

  it('deve transicionar com sucesso de PENDING para REJECTED', () => {
    const wager = createSampleWager();
    wager.markAsRejected('INSUFFICIENT_FUNDS');

    expect(wager.status).toBe(WagerStatus.REJECTED);
    expect(wager.failureCode).toBe('INSUFFICIENT_FUNDS');
  });

  it('deve transicionar de PROCESSED para ROLLED_BACK', () => {
    const wager = createSampleWager();
    wager.markAsProcessed();
    wager.markAsRolledBack();

    expect(wager.status).toBe(WagerStatus.ROLLED_BACK);
  });

  it('deve bloquear transições inválidas de estado', () => {
    const wager = createSampleWager();
    
    // Não pode dar rollback direto de PENDING
    expect(() => wager.markAsRolledBack()).toThrow(InvalidWagerStateTransitionError);

    wager.markAsProcessed();
    // Não pode reprocessar quem já está PROCESSED
    expect(() => wager.markAsProcessed()).toThrow(InvalidWagerStateTransitionError);
  });
});