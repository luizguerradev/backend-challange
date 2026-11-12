import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import { randomUUID } from 'node:crypto';
import mikroOrmConfig from '../../mikro-orm.config.js';
import { WalletsApplicationService } from '../../src/application/wallet/wallets.service.js';
import { ProcessWagerTransactionUseCase } from '../../src/application/wager/process-wager-transaction.use-case.js';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
  FailureCode,
} from '../../src/domain/wager/entity/wager-transaction.entity.js';
import { IdempotencyConflictError } from '../../src/application/common/application.errors.js';

describe('Wagering Engine Concurrency, Idempotency & Out-of-Order E2E (PostgreSQL Real)', () => {
  let orm: MikroORM;
  let walletsService: WalletsApplicationService;
  let processWagerUseCase: ProcessWagerTransactionUseCase;

  beforeAll(async () => {
    orm = await MikroORM.init(mikroOrmConfig);
    walletsService = new WalletsApplicationService(orm.em.fork());
    processWagerUseCase = new ProcessWagerTransactionUseCase(orm.em.fork());
  });

  afterAll(async () => {
    await orm.close(true);
  });

  it('deve serializar 25 apostas concorrentes (SELECT FOR UPDATE) na mesma carteira sem permitir saldo negativo e manter reconciliação exata', async () => {
    const playerId = `player-race-${randomUUID()}`;
    // Carteira inicia com 100.00 BRL. Vamos disparar 25 apostas simultâneas de 10.00 BRL.
    // Exatamente 10 devem ser PROCESSED (consumindo os 100.00) e 15 devem ser REJECTED (INSUFFICIENT_FUNDS).
    const wallet = await walletsService.createWallet({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    const totalConcurrentBets = 25;
    const betPromises = Array.from({ length: totalConcurrentBets }, (_, idx) => {
      const txUseCase = new ProcessWagerTransactionUseCase(orm.em.fork());
      const extId = `bet-concurrent-${idx}-${randomUUID()}`;
      return txUseCase.execute({
        idempotencyKey: `idem-${extId}`,
        providerId: 'provider-stress',
        externalTransactionId: extId,
        playerId,
        walletId: wallet.id,
        roundId: 'round-stress-1',
        gameId: 'crash-aviator',
        kind: WagerTransactionKind.BET,
        money: { amount: '10.00', currency: 'BRL' },
      });
    });

    const results = await Promise.all(betPromises);

    const processed = results.filter((r) => r.status === WagerTransactionStatus.PROCESSED);
    const rejected = results.filter((r) => r.status === WagerTransactionStatus.REJECTED);

    expect(processed.length).toBe(10);
    expect(rejected.length).toBe(15);
    for (const rej of rejected) {
      expect(rej.failureCode).toBe(FailureCode.INSUFFICIENT_FUNDS);
    }

    // Verifica saldo final e reconciliação contábil (1 OPENING + 10 BETs = 11 entradas no ledger)
    const reconciliation = await new WalletsApplicationService(orm.em.fork()).reconcileWallet(
      wallet.id,
    );

    expect(reconciliation.consistent).toBe(true);
    expect(reconciliation.storedBalance.amount).toBe('0.00');
    expect(reconciliation.calculatedBalance.amount).toBe('0.00');
    expect(reconciliation.difference.amount).toBe('0.00');
    expect(reconciliation.checkedEntries).toBe(11);
  });

  it('deve garantir replay idempotente com saldo histórico observado e rejeitar conflito de payload (409)', async () => {
    const playerId = `player-idem-${randomUUID()}`;
    const wallet = await walletsService.createWallet({
      playerId,
      initialBalance: { amount: '500.00', currency: 'BRL' },
    });

    const extId = `ext-idem-${randomUUID()}`;
    const idemKey = `key-${extId}`;

    // 1ª execução: debita 50.00 -> saldo vai para 450.00
    const firstCall = await processWagerUseCase.execute({
      idempotencyKey: idemKey,
      providerId: 'provider-a',
      externalTransactionId: extId,
      playerId,
      walletId: wallet.id,
      roundId: 'round-idem',
      gameId: 'slots-1',
      kind: WagerTransactionKind.BET,
      money: { amount: '50.00', currency: 'BRL' },
    });

    expect(firstCall.status).toBe(WagerTransactionStatus.PROCESSED);
    expect(firstCall.balance.amount).toBe('450.00');
    expect(firstCall.idempotentReplay).toBe(false);

    // Faz outra aposta diferente para mudar o saldo atual da carteira para 400.00
    await processWagerUseCase.execute({
      idempotencyKey: `other-${randomUUID()}`,
      providerId: 'provider-a',
      externalTransactionId: `other-ext-${randomUUID()}`,
      playerId,
      walletId: wallet.id,
      roundId: 'round-idem',
      gameId: 'slots-1',
      kind: WagerTransactionKind.BET,
      money: { amount: '50.00', currency: 'BRL' },
    });

    // Replay idêntico da 1ª aposta: deve retornar idempotentReplay=true e o saldo observado na época (450.00)!
    const replayCall = await processWagerUseCase.execute({
      idempotencyKey: idemKey,
      providerId: 'provider-a',
      externalTransactionId: extId,
      playerId,
      walletId: wallet.id,
      roundId: 'round-idem',
      gameId: 'slots-1',
      kind: WagerTransactionKind.BET,
      money: { amount: '50.00', currency: 'BRL' },
    });

    expect(replayCall.transactionId).toBe(firstCall.transactionId);
    expect(replayCall.idempotentReplay).toBe(true);
    expect(replayCall.balance.amount).toBe('450.00');

    // Conflito de idempotência: mesma chave mas valor adulterado para 99.00
    await expect(
      processWagerUseCase.execute({
        idempotencyKey: idemKey,
        providerId: 'provider-a',
        externalTransactionId: extId,
        playerId,
        walletId: wallet.id,
        roundId: 'round-idem',
        gameId: 'slots-1',
        kind: WagerTransactionKind.BET,
        money: { amount: '99.00', currency: 'BRL' },
      }),
    ).rejects.toThrow(IdempotencyConflictError);
  });

  it('deve tratar REFUND fora de ordem (PENDING_REFERENCE) e processar assim que o BET original chegar', async () => {
    const playerId = `player-ooo-${randomUUID()}`;
    const wallet = await walletsService.createWallet({
      playerId,
      initialBalance: { amount: '200.00', currency: 'BRL' },
    });

    const missingBetExtId = `bet-delayed-${randomUUID()}`;
    const refundExtId = `refund-early-${randomUUID()}`;

    // 1. O REFUND chega ANTES do BET original
    const earlyRefund = await processWagerUseCase.execute({
      idempotencyKey: `idem-${refundExtId}`,
      providerId: 'provider-b',
      externalTransactionId: refundExtId,
      playerId,
      walletId: wallet.id,
      roundId: 'round-ooo-1',
      gameId: 'roulette',
      kind: WagerTransactionKind.REFUND,
      money: { amount: '40.00', currency: 'BRL' },
      referenceExternalTransactionId: missingBetExtId,
    });

    expect(earlyRefund.status).toBe(WagerTransactionStatus.PENDING_REFERENCE);
    expect(earlyRefund.balance.amount).toBe('200.00'); // Saldo não foi alterado

    // 2. Agora o BET atrasado chega e debita 40.00 -> saldo cai para 160.00
    const delayedBet = await processWagerUseCase.execute({
      idempotencyKey: `idem-${missingBetExtId}`,
      providerId: 'provider-b',
      externalTransactionId: missingBetExtId,
      playerId,
      walletId: wallet.id,
      roundId: 'round-ooo-1',
      gameId: 'roulette',
      kind: WagerTransactionKind.BET,
      money: { amount: '40.00', currency: 'BRL' },
    });

    expect(delayedBet.status).toBe(WagerTransactionStatus.PROCESSED);
    expect(delayedBet.balance.amount).toBe('160.00');

    // 3. O Worker de retry reprocessa o PENDING_REFERENCE -> estorna os 40.00 voltando para 200.00
    const resolved = await new ProcessWagerTransactionUseCase(
      orm.em.fork(),
    ).retryPendingReferences(wallet.id);
    expect(resolved).toBe(1);

    const updatedRefund = await new ProcessWagerTransactionUseCase(
      orm.em.fork(),
    ).getTransactionById(earlyRefund.transactionId);
    expect(updatedRefund.status).toBe(WagerTransactionStatus.PROCESSED);

    const reconciliation = await new WalletsApplicationService(orm.em.fork()).reconcileWallet(
      wallet.id,
    );
    expect(reconciliation.consistent).toBe(true);
    expect(reconciliation.storedBalance.amount).toBe('200.00');
    expect(reconciliation.checkedEntries).toBe(3); // OPENING (+200), BET (-40), REFUND (+40)
  });

  it('deve bloquear dupla reversão (REFERENCE_ALREADY_REVERTED) e ROLLBACK de WIN que causaria saldo negativo (REVERSAL_WOULD_CAUSE_NEGATIVE_BALANCE)', async () => {
    const playerId = `player-rev-${randomUUID()}`;
    const wallet = await walletsService.createWallet({
      playerId,
      initialBalance: { amount: '50.00', currency: 'BRL' },
    });

    const betExtId = `bet-rev-${randomUUID()}`;
    const winExtId = `win-rev-${randomUUID()}`;

    // Faz um BET de 50.00 -> saldo vai a 0.00
    await processWagerUseCase.execute({
      idempotencyKey: `idem-${betExtId}`,
      providerId: 'provider-c',
      externalTransactionId: betExtId,
      playerId,
      walletId: wallet.id,
      roundId: 'round-rev',
      gameId: 'blackjack',
      kind: WagerTransactionKind.BET,
      money: { amount: '50.00', currency: 'BRL' },
    });

    // Ganha um WIN de 100.00 -> saldo vai a 100.00
    await processWagerUseCase.execute({
      idempotencyKey: `idem-${winExtId}`,
      providerId: 'provider-c',
      externalTransactionId: winExtId,
      playerId,
      walletId: wallet.id,
      roundId: 'round-rev',
      gameId: 'blackjack',
      kind: WagerTransactionKind.WIN,
      money: { amount: '100.00', currency: 'BRL' },
    });

    // Gasta 80.00 em outra aposta -> saldo cai para 20.00
    await processWagerUseCase.execute({
      idempotencyKey: `idem-spend-${randomUUID()}`,
      providerId: 'provider-c',
      externalTransactionId: `spend-${randomUUID()}`,
      playerId,
      walletId: wallet.id,
      roundId: 'round-rev-2',
      gameId: 'blackjack',
      kind: WagerTransactionKind.BET,
      money: { amount: '80.00', currency: 'BRL' },
    });

    // Tenta dar ROLLBACK no WIN de 100.00 quando a carteira só tem 20.00:
    // Deve rejeitar com REVERSAL_WOULD_CAUSE_NEGATIVE_BALANCE (distinto de INSUFFICIENT_FUNDS!)
    const rollbackWin = await processWagerUseCase.execute({
      idempotencyKey: `idem-rb-win-${randomUUID()}`,
      providerId: 'provider-c',
      externalTransactionId: `rb-win-${randomUUID()}`,
      playerId,
      walletId: wallet.id,
      roundId: 'round-rev',
      gameId: 'blackjack',
      kind: WagerTransactionKind.ROLLBACK,
      money: { amount: '100.00', currency: 'BRL' },
      referenceExternalTransactionId: winExtId,
    });

    expect(rollbackWin.status).toBe(WagerTransactionStatus.REJECTED);
    expect(rollbackWin.failureCode).toBe(FailureCode.REVERSAL_WOULD_CAUSE_NEGATIVE_BALANCE);

    // Faz REFUND válido do primeiro BET de 50.00 -> saldo sobe para 70.00
    const firstRefund = await processWagerUseCase.execute({
      idempotencyKey: `idem-ref-1-${randomUUID()}`,
      providerId: 'provider-c',
      externalTransactionId: `ref-1-${randomUUID()}`,
      playerId,
      walletId: wallet.id,
      roundId: 'round-rev',
      gameId: 'blackjack',
      kind: WagerTransactionKind.REFUND,
      money: { amount: '50.00', currency: 'BRL' },
      referenceExternalTransactionId: betExtId,
    });
    expect(firstRefund.status).toBe(WagerTransactionStatus.PROCESSED);
    expect(firstRefund.balance.amount).toBe('70.00');

    // Tenta reverter o mesmo BET uma segunda vez com outro externalTransactionId -> REFERENCE_ALREADY_REVERTED
    const secondRefund = await processWagerUseCase.execute({
      idempotencyKey: `idem-ref-2-${randomUUID()}`,
      providerId: 'provider-c',
      externalTransactionId: `ref-2-${randomUUID()}`,
      playerId,
      walletId: wallet.id,
      roundId: 'round-rev',
      gameId: 'blackjack',
      kind: WagerTransactionKind.REFUND,
      money: { amount: '50.00', currency: 'BRL' },
      referenceExternalTransactionId: betExtId,
    });
    expect(secondRefund.status).toBe(WagerTransactionStatus.REJECTED);
    expect(secondRefund.failureCode).toBe(FailureCode.REFERENCE_ALREADY_REVERTED);
  });
});