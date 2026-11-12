import { Injectable } from '@nestjs/common';
import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { randomUUID } from 'node:crypto';
import { Money } from '../../domain/common/money.vo.js';
import { Wallet, InsufficientFundsError } from '../../domain/wallet/entity/wallet.entity.js';
import { LedgerDirection, type WalletLedgerEntry } from '../../domain/wallet/entity/wallet-ledger-entry.entity.js';
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
  FailureCode,
} from '../../domain/wager/entity/wager-transaction.entity.js';
import { OutboxMessage } from '../../domain/messaging/outbox-message.entity.js';
import {
  WalletBalanceChanged,
  type EventContext,
} from '../../domain/messaging/events/wallet-balance-changed.event.js';
import {
  WagerTransactionProcessed,
  WagerTransactionRejected,
  WagerTransactionPendingReference,
} from '../../domain/messaging/events/wager-transaction-events.js';
import type { IntegrationEvent } from '../../domain/messaging/integration-event.js';
import { WalletOrmEntity } from '../../infrastructure/database/entities/wallet.orm-entity.js';
import { WalletLedgerEntryOrmEntity } from '../../infrastructure/database/entities/wallet-ledger-entry.orm-entity.js';
import { WagerTransactionOrmEntity } from '../../infrastructure/database/entities/wager-transaction.orm-entity.js';
import { OutboxMessageOrmEntity } from '../../infrastructure/database/entities/outbox-message.orm-entity.js';
import { WalletMapper } from '../../infrastructure/database/mappers/wallet.mapper.js';
import { WagerTransactionMapper } from '../../infrastructure/database/mappers/wager-transaction.mapper.js';
import { computeCanonicalPayloadHash } from '../common/payload-hash.util.js';
import {
  IdempotencyConflictError,
  ResourceNotFoundError,
} from '../common/application.errors.js';

export interface SubmitWagerTransactionInput {
  idempotencyKey: string;
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: { amount: string; currency: string };
  referenceExternalTransactionId?: string;
  correlationId?: string;
}

export interface SubmitWagerTransactionOutput {
  transactionId: string;
  status: WagerTransactionStatus;
  balance: { amount: string; currency: string };
  idempotentReplay: boolean;
  failureCode?: FailureCode;
}

@Injectable()
export class ProcessWagerTransactionUseCase {
  constructor(private readonly em: EntityManager) {}

  async execute(
    input: SubmitWagerTransactionInput,
    externalEm?: EntityManager,
  ): Promise<SubmitWagerTransactionOutput> {
    if (externalEm) {
      return this.executeInTransaction(externalEm, input);
    }
    return this.em.transactional((txEm) => this.executeInTransaction(txEm, input));
  }

  private async executeInTransaction(
    txEm: EntityManager,
    input: SubmitWagerTransactionInput,
  ): Promise<SubmitWagerTransactionOutput> {
    const correlationId = input.correlationId ?? randomUUID();
    const payloadHash = computeCanonicalPayloadHash(input);
    const operationMoney = Money.from(input.money);

    // 1. Verifica Idempotência por idempotencyKey OU (providerId, externalTransactionId)
    const existingOrm = await txEm.findOne(WagerTransactionOrmEntity, {
      $or: [
        { idempotencyKey: input.idempotencyKey },
        { providerId: input.providerId, externalTransactionId: input.externalTransactionId },
      ],
    });

    if (existingOrm) {
      const existingTx = WagerTransactionMapper.toDomain(existingOrm);
      if (!existingTx.matchesPayload(payloadHash) || existingTx.idempotencyKey !== input.idempotencyKey) {
        throw new IdempotencyConflictError(input.idempotencyKey);
      }

      const observedBalance = await this.resolveObservedBalance(txEm, existingTx);
      return {
        transactionId: existingTx.id,
        status: existingTx.status,
        balance: observedBalance.toJSON(),
        idempotentReplay: true,
        ...(existingTx.failureCode ? { failureCode: existingTx.failureCode } : {}),
      };
    }

    // 2. Adquire Lock Pessimista na Wallet (SELECT ... FOR UPDATE)
    const walletOrm = await txEm.findOne(
      WalletOrmEntity,
      { id: input.walletId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );

    if (!walletOrm) {
      throw new ResourceNotFoundError('Wallet', input.walletId);
    }

    const wallet = WalletMapper.toDomain(walletOrm);

    const transaction = WagerTransaction.create({
      providerId: input.providerId,
      externalTransactionId: input.externalTransactionId,
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      walletId: input.walletId,
      playerId: input.playerId,
      roundId: input.roundId,
      gameId: input.gameId,
      kind: input.kind,
      money: operationMoney,
      referenceExternalTransactionId: input.referenceExternalTransactionId,
    });

    const context: EventContext = { correlationId, causationId: transaction.id };
    const eventsToPublish: IntegrationEvent<unknown>[] = [];
    let ledgerEntry: WalletLedgerEntry | undefined;

    // 3. Validação de Player e Moeda da Wallet
    if (wallet.playerId !== input.playerId) {
      transaction.reject(FailureCode.INVALID_PAYLOAD);
      eventsToPublish.push(this.buildRejectedEvent(transaction, context, 'Wallet does not belong to player'));
      await this.persistState(txEm, wallet, transaction, undefined, eventsToPublish);
      return this.buildOutput(transaction, wallet.balance, false);
    }

    if (wallet.currency !== operationMoney.currency) {
      transaction.reject(FailureCode.CURRENCY_MISMATCH);
      eventsToPublish.push(this.buildRejectedEvent(transaction, context, 'Wallet currency mismatch'));
      await this.persistState(txEm, wallet, transaction, undefined, eventsToPublish);
      return this.buildOutput(transaction, wallet.balance, false);
    }

    // 4. Resolução de Referência para REFUND, ROLLBACK (obrigatória) ou WIN (opcional)
    let referenceTx: WagerTransaction | undefined;
    if (input.referenceExternalTransactionId) {
      const refOrm = await txEm.findOne(WagerTransactionOrmEntity, {
        providerId: input.providerId,
        externalTransactionId: input.referenceExternalTransactionId,
      });

      if (!refOrm) {
        if (transaction.requiresReference()) {
          transaction.markPendingReference();
          eventsToPublish.push(this.buildPendingReferenceEvent(transaction, context));
          await this.persistState(txEm, wallet, transaction, undefined, eventsToPublish);
          return this.buildOutput(transaction, wallet.balance, false);
        }
      } else {
        referenceTx = WagerTransactionMapper.toDomain(refOrm);
      }
    }

    // 5. Regras específicas de REFUND e ROLLBACK
    if (transaction.requiresReference()) {
      if (!referenceTx) {
        transaction.markPendingReference();
        eventsToPublish.push(this.buildPendingReferenceEvent(transaction, context));
        await this.persistState(txEm, wallet, transaction, undefined, eventsToPublish);
        return this.buildOutput(transaction, wallet.balance, false);
      }

      if (referenceTx.status !== WagerTransactionStatus.PROCESSED) {
        transaction.reject(FailureCode.INVALID_REFERENCE_TYPE);
        eventsToPublish.push(this.buildRejectedEvent(transaction, context, 'Referenced transaction is not PROCESSED'));
        await this.persistState(txEm, wallet, transaction, undefined, eventsToPublish);
        return this.buildOutput(transaction, wallet.balance, false);
      }

      const sameContext =
        referenceTx.playerId === transaction.playerId &&
        referenceTx.walletId === transaction.walletId &&
        referenceTx.roundId === transaction.roundId &&
        referenceTx.money.equals(transaction.money);

      if (!sameContext) {
        transaction.reject(FailureCode.INVALID_PAYLOAD);
        eventsToPublish.push(this.buildRejectedEvent(transaction, context, 'Reference context or amount mismatch'));
        await this.persistState(txEm, wallet, transaction, undefined, eventsToPublish);
        return this.buildOutput(transaction, wallet.balance, false);
      }

      const validKindForRefund =
        transaction.kind === WagerTransactionKind.REFUND &&
        referenceTx.kind === WagerTransactionKind.BET;
      const validKindForRollback =
        transaction.kind === WagerTransactionKind.ROLLBACK &&
        (referenceTx.kind === WagerTransactionKind.BET ||
          referenceTx.kind === WagerTransactionKind.WIN ||
          referenceTx.kind === WagerTransactionKind.REFUND);

      if (!validKindForRefund && !validKindForRollback) {
        transaction.reject(FailureCode.INVALID_REFERENCE_TYPE);
        eventsToPublish.push(this.buildRejectedEvent(transaction, context, 'Invalid reference transaction kind'));
        await this.persistState(txEm, wallet, transaction, undefined, eventsToPublish);
        return this.buildOutput(transaction, wallet.balance, false);
      }

      const alreadyReverted = await txEm.findOne(WagerTransactionOrmEntity, {
        referenceTransactionId: referenceTx.id,
        status: WagerTransactionStatus.PROCESSED,
        kind: { $in: [WagerTransactionKind.REFUND, WagerTransactionKind.ROLLBACK] },
      });

      if (alreadyReverted) {
        transaction.reject(FailureCode.REFERENCE_ALREADY_REVERTED);
        eventsToPublish.push(this.buildRejectedEvent(transaction, context, 'Reference transaction already reverted'));
        await this.persistState(txEm, wallet, transaction, undefined, eventsToPublish);
        return this.buildOutput(transaction, wallet.balance, false);
      }
    }

    // 6. Aplicação financeira na Wallet e geração de Ledger
    try {
      if (transaction.affectsBalance()) {
        const direction = transaction.ledgerDirectionFor(referenceTx);
        if (direction === LedgerDirection.DEBIT) {
          ledgerEntry = wallet.debit(operationMoney, transaction.id);
        } else {
          ledgerEntry = wallet.credit(operationMoney, transaction.id);
        }
      }

      transaction.markProcessed(referenceTx?.id, new Date());

      if (ledgerEntry) {
        eventsToPublish.push(
          WalletBalanceChanged.create({
            context,
            data: {
              walletId: wallet.id,
              transactionId: transaction.id,
              direction: ledgerEntry.direction,
              money: ledgerEntry.money.toJSON(),
              balanceBefore: ledgerEntry.balanceBefore.toJSON(),
              balanceAfter: ledgerEntry.balanceAfter.toJSON(),
              walletVersion: wallet.version,
            },
          }),
        );
      }

      eventsToPublish.push(
        WagerTransactionProcessed.create({
          context,
          data: {
            transactionId: transaction.id,
            providerId: transaction.providerId,
            externalTransactionId: transaction.externalTransactionId,
            idempotencyKey: transaction.idempotencyKey,
            walletId: transaction.walletId,
            playerId: transaction.playerId,
            roundId: transaction.roundId,
            gameId: transaction.gameId,
            kind: transaction.kind,
            money: transaction.money.toJSON(),
            balance: wallet.balance.toJSON(),
            ...(transaction.referenceTransactionId
              ? { referenceTransactionId: transaction.referenceTransactionId }
              : {}),
            processedAt: (transaction.processedAt ?? new Date()).toISOString(),
          },
        }),
      );
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        const code =
          transaction.kind === WagerTransactionKind.ROLLBACK
            ? FailureCode.REVERSAL_WOULD_CAUSE_NEGATIVE_BALANCE
            : FailureCode.INSUFFICIENT_FUNDS;

        transaction.reject(code);
        eventsToPublish.push(this.buildRejectedEvent(transaction, context, err.message));
      } else {
        throw err;
      }
    }

    await this.persistState(txEm, wallet, transaction, ledgerEntry, eventsToPublish);
    return this.buildOutput(transaction, wallet.balance, false);
  }

  private buildRejectedEvent(
    tx: WagerTransaction,
    context: EventContext,
    reason?: string,
  ): WagerTransactionRejected {
    return WagerTransactionRejected.create({
      context,
      data: {
        transactionId: tx.id,
        providerId: tx.providerId,
        externalTransactionId: tx.externalTransactionId,
        idempotencyKey: tx.idempotencyKey,
        walletId: tx.walletId,
        playerId: tx.playerId,
        roundId: tx.roundId,
        gameId: tx.gameId,
        kind: tx.kind,
        money: tx.money.toJSON(),
        failureCode: tx.failureCode ?? FailureCode.INTERNAL_PROCESSING_ERROR,
        ...(reason ? { reason } : {}),
      },
    });
  }

  private buildPendingReferenceEvent(
    tx: WagerTransaction,
    context: EventContext,
  ): WagerTransactionPendingReference {
    return WagerTransactionPendingReference.create({
      context,
      data: {
        transactionId: tx.id,
        providerId: tx.providerId,
        externalTransactionId: tx.externalTransactionId,
        referenceExternalTransactionId: tx.referenceExternalTransactionId ?? '',
        walletId: tx.walletId,
        playerId: tx.playerId,
        roundId: tx.roundId,
      },
    });
  }

  private async persistState(
    txEm: EntityManager,
    wallet: Wallet,
    transaction: WagerTransaction,
    ledgerEntry: WalletLedgerEntry | undefined,
    events: IntegrationEvent<unknown>[],
  ): Promise<void> {
    await txEm.upsert(WalletOrmEntity, WalletMapper.toOrmEntity(wallet));
    txEm.persist(txEm.create(WagerTransactionOrmEntity, WagerTransactionMapper.toOrmEntity(transaction)));

    if (ledgerEntry) {
      txEm.persist(
        txEm.create(WalletLedgerEntryOrmEntity, WalletMapper.ledgerEntryToOrmEntity(ledgerEntry)),
      );
    }

    const now = new Date();
    for (const evt of events) {
      const outboxMsg = OutboxMessage.enqueue(evt);
      txEm.persist(
        txEm.create(OutboxMessageOrmEntity, {
          id: outboxMsg.id,
          aggregateId: outboxMsg.aggregateId,
          eventType: outboxMsg.eventType,
          payload: outboxMsg.payload as Record<string, unknown>,
          occurredAt: outboxMsg.occurredAt,
          attempts: outboxMsg.attempts,
          nextAttemptAt: outboxMsg.nextAttemptAt ?? null,
          publishedAt: outboxMsg.publishedAt ?? null,
          createdAt: now,
        }),
      );
    }

    await txEm.flush();
  }

  private async resolveObservedBalance(
    txEm: EntityManager,
    tx: WagerTransaction,
  ): Promise<Money> {
    const ledgerOrm = await txEm.findOne(WalletLedgerEntryOrmEntity, {
      transactionId: tx.id,
    });

    if (ledgerOrm) {
      return Money.from({ amount: ledgerOrm.balanceAfter, currency: ledgerOrm.currency });
    }

    const walletOrm = await txEm.findOne(WalletOrmEntity, { id: tx.walletId });
    if (walletOrm) {
      return Money.from({ amount: walletOrm.balance, currency: walletOrm.currency });
    }

    return Money.zero(tx.money.currency);
  }

  private buildOutput(
    tx: WagerTransaction,
    balance: Money,
    idempotentReplay: boolean,
  ): SubmitWagerTransactionOutput {
    return {
      transactionId: tx.id,
      status: tx.status,
      balance: balance.toJSON(),
      idempotentReplay,
      ...(tx.failureCode ? { failureCode: tx.failureCode } : {}),
    };
  }

  async getTransactionById(transactionId: string) {
    const orm = await this.em.findOne(WagerTransactionOrmEntity, { id: transactionId });
    if (!orm) {
      throw new ResourceNotFoundError('WagerTransaction', transactionId);
    }
    return this.serializeTransaction(WagerTransactionMapper.toDomain(orm));
  }

  async getTransactionByExternalId(providerId: string, externalTransactionId: string) {
    const orm = await this.em.findOne(WagerTransactionOrmEntity, {
      providerId,
      externalTransactionId,
    });
    if (!orm) {
      throw new ResourceNotFoundError(
        'WagerTransaction',
        `${providerId}:${externalTransactionId}`,
      );
    }
    return this.serializeTransaction(WagerTransactionMapper.toDomain(orm));
  }

  private serializeTransaction(tx: WagerTransaction) {
    return {
      id: tx.id,
      providerId: tx.providerId,
      externalTransactionId: tx.externalTransactionId,
      idempotencyKey: tx.idempotencyKey,
      walletId: tx.walletId,
      playerId: tx.playerId,
      roundId: tx.roundId,
      gameId: tx.gameId,
      kind: tx.kind,
      status: tx.status,
      money: tx.money.toJSON(),
      referenceExternalTransactionId: tx.referenceExternalTransactionId ?? null,
      referenceTransactionId: tx.referenceTransactionId ?? null,
      failureCode: tx.failureCode ?? null,
      createdAt: tx.createdAt.toISOString(),
      processedAt: tx.processedAt?.toISOString() ?? null,
    };
  }
  /**
   * Reprocessa transações em estado PENDING_REFERENCE cuja transação de referência
   * já tenha chegado e sido processada (Seção 7.1).
   */
  async retryPendingReferences(walletId?: string): Promise<number> {
    const filter: Record<string, unknown> = {
      status: WagerTransactionStatus.PENDING_REFERENCE,
    };
    if (walletId) {
      filter.walletId = walletId;
    }

    const pendingList = await this.em.find(
      WagerTransactionOrmEntity,
      filter,
      { orderBy: { createdAt: 'ASC' }, limit: 100 },
    );

    let resolvedCount = 0;

    for (const pendingOrm of pendingList) {
      if (!pendingOrm.referenceExternalTransactionId) continue;

      const refOrm = await this.em.findOne(WagerTransactionOrmEntity, {
        providerId: pendingOrm.providerId,
        externalTransactionId: pendingOrm.referenceExternalTransactionId,
      });

      if (!refOrm) continue;

      await this.em.transactional(async (txEm) => {
        const lockedWalletOrm = await txEm.findOne(
          WalletOrmEntity,
          { id: pendingOrm.walletId },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!lockedWalletOrm) return;

        const currentPendingOrm = await txEm.findOne(
          WagerTransactionOrmEntity,
          { id: pendingOrm.id },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (
          !currentPendingOrm ||
          currentPendingOrm.status !== WagerTransactionStatus.PENDING_REFERENCE
        ) {
          return;
        }

        const wallet = WalletMapper.toDomain(lockedWalletOrm);
        const pendingTx = WagerTransactionMapper.toDomain(currentPendingOrm);
        const referenceTx = WagerTransactionMapper.toDomain(refOrm);
        const context: EventContext = {
          correlationId: randomUUID(),
          causationId: pendingTx.id,
        };
        const eventsToPublish: IntegrationEvent<unknown>[] = [];
        let ledgerEntry: WalletLedgerEntry | undefined;

        if (referenceTx.status !== WagerTransactionStatus.PROCESSED) {
          pendingTx.reject(FailureCode.INVALID_REFERENCE_TYPE);
          eventsToPublish.push(
            this.buildRejectedEvent(pendingTx, context, 'Referenced transaction is not PROCESSED'),
          );
        } else {
          const alreadyReverted = await txEm.findOne(WagerTransactionOrmEntity, {
            referenceTransactionId: referenceTx.id,
            status: WagerTransactionStatus.PROCESSED,
            kind: { $in: [WagerTransactionKind.REFUND, WagerTransactionKind.ROLLBACK] },
          });

          if (alreadyReverted) {
            pendingTx.reject(FailureCode.REFERENCE_ALREADY_REVERTED);
            eventsToPublish.push(
              this.buildRejectedEvent(pendingTx, context, 'Reference transaction already reverted'),
            );
          } else {
            try {
              const direction = pendingTx.ledgerDirectionFor(referenceTx);
              if (direction === LedgerDirection.DEBIT) {
                ledgerEntry = wallet.debit(pendingTx.money, pendingTx.id);
              } else {
                ledgerEntry = wallet.credit(pendingTx.money, pendingTx.id);
              }

              pendingTx.markProcessed(referenceTx.id, new Date());

              eventsToPublish.push(
                WalletBalanceChanged.create({
                  context,
                  data: {
                    walletId: wallet.id,
                    transactionId: pendingTx.id,
                    direction: ledgerEntry.direction,
                    money: ledgerEntry.money.toJSON(),
                    balanceBefore: ledgerEntry.balanceBefore.toJSON(),
                    balanceAfter: ledgerEntry.balanceAfter.toJSON(),
                    walletVersion: wallet.version,
                  },
                }),
                WagerTransactionProcessed.create({
                  context,
                  data: {
                    transactionId: pendingTx.id,
                    providerId: pendingTx.providerId,
                    externalTransactionId: pendingTx.externalTransactionId,
                    idempotencyKey: pendingTx.idempotencyKey,
                    walletId: pendingTx.walletId,
                    playerId: pendingTx.playerId,
                    roundId: pendingTx.roundId,
                    gameId: pendingTx.gameId,
                    kind: pendingTx.kind,
                    money: pendingTx.money.toJSON(),
                    balance: wallet.balance.toJSON(),
                    referenceTransactionId: referenceTx.id,
                    processedAt: (pendingTx.processedAt ?? new Date()).toISOString(),
                  },
                }),
              );
            } catch (err) {
              if (err instanceof InsufficientFundsError) {
                const code =
                  pendingTx.kind === WagerTransactionKind.ROLLBACK
                    ? FailureCode.REVERSAL_WOULD_CAUSE_NEGATIVE_BALANCE
                    : FailureCode.INSUFFICIENT_FUNDS;
                pendingTx.reject(code);
                eventsToPublish.push(this.buildRejectedEvent(pendingTx, context, err.message));
              } else {
                throw err;
              }
            }
          }
        }

        await txEm.upsert(WalletOrmEntity, WalletMapper.toOrmEntity(wallet));
        await txEm.upsert(
          WagerTransactionOrmEntity,
          WagerTransactionMapper.toOrmEntity(pendingTx),
        );

        if (ledgerEntry) {
          txEm.persist(
            txEm.create(
              WalletLedgerEntryOrmEntity,
              WalletMapper.ledgerEntryToOrmEntity(ledgerEntry),
            ),
          );
        }

        const now = new Date();
        for (const evt of eventsToPublish) {
          const outboxMsg = OutboxMessage.enqueue(evt);
          txEm.persist(
            txEm.create(OutboxMessageOrmEntity, {
              id: outboxMsg.id,
              aggregateId: outboxMsg.aggregateId,
              eventType: outboxMsg.eventType,
              payload: outboxMsg.payload as Record<string, unknown>,
              occurredAt: outboxMsg.occurredAt,
              attempts: outboxMsg.attempts,
              nextAttemptAt: outboxMsg.nextAttemptAt ?? null,
              publishedAt: outboxMsg.publishedAt ?? null,
              createdAt: now,
            }),
          );
        }

        await txEm.flush();
        resolvedCount += 1;
      });
    }

    return resolvedCount;
  }
}