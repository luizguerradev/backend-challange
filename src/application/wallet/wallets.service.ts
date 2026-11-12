import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { randomUUID } from 'node:crypto';
import { Money } from '../../domain/common/money.vo.js';
import { Wallet } from '../../domain/wallet/entity/wallet.entity.js';
import { LedgerDirection } from '../../domain/wallet/entity/wallet-ledger-entry.entity.js';
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/wager/entity/wager-transaction.entity.js';
import { OutboxMessage } from '../../domain/messaging/outbox-message.entity.js';
import { WalletBalanceChanged } from '../../domain/messaging/events/wallet-balance-changed.event.js';
import { WagerTransactionProcessed } from '../../domain/messaging/events/wager-transaction-events.js';
import { WalletOrmEntity } from '../../infrastructure/database/entities/wallet.orm-entity.js';
import { WalletLedgerEntryOrmEntity } from '../../infrastructure/database/entities/wallet-ledger-entry.orm-entity.js';
import { WagerTransactionOrmEntity } from '../../infrastructure/database/entities/wager-transaction.orm-entity.js';
import { OutboxMessageOrmEntity } from '../../infrastructure/database/entities/outbox-message.orm-entity.js';
import { WalletMapper } from '../../infrastructure/database/mappers/wallet.mapper.js';
import { WagerTransactionMapper } from '../../infrastructure/database/mappers/wager-transaction.mapper.js';
import { DuplicateWalletConflictError, ResourceNotFoundError } from '../common/application.errors.js';
import { computeCanonicalPayloadHash } from '../common/payload-hash.util.js';
import type { IntegrationEvent } from '../../domain/messaging/integration-event.js';

@Injectable()
export class WalletsApplicationService {
  constructor(private readonly em: EntityManager) {}

  async createWallet(input: {
    playerId: string;
    initialBalance: { amount: string; currency: string };
    correlationId?: string;
  }) {
    const initialMoney = Money.from(input.initialBalance);
    const correlationId = input.correlationId ?? randomUUID();

    return this.em.transactional(async (txEm) => {
      const existing = await txEm.findOne(WalletOrmEntity, {
        playerId: input.playerId,
        currency: initialMoney.currency,
      });

      if (existing) {
        throw new DuplicateWalletConflictError(input.playerId, initialMoney.currency);
      }

      const walletId = randomUUID();
      const openingTxId = randomUUID();
      const now = new Date();

      const { wallet, openingEntry } = Wallet.open({
        id: walletId,
        playerId: input.playerId,
        initialBalance: initialMoney,
      });

      const walletOrm = WalletMapper.toOrmEntity(wallet);
      txEm.persist(txEm.create(WalletOrmEntity, walletOrm));
      // Garante que a linha pai em 'wallets' seja enviada ao PostgreSQL antes das tabelas filhas (FK)
      await txEm.flush(); 
      if (openingEntry) {
        const openingExternalId = `opening:${wallet.id}`;
        const openingPayloadHash = computeCanonicalPayloadHash({
          providerId: 'internal',
          externalTransactionId: openingExternalId,
          playerId: wallet.playerId,
          walletId: wallet.id,
          roundId: 'opening',
          gameId: 'opening',
          kind: WagerTransactionKind.OPENING,
          money: initialMoney.toJSON(),
        });

        const openingTx = WagerTransaction.rehydrate({
          id: openingTxId,
          providerId: 'internal',
          externalTransactionId: openingExternalId,
          idempotencyKey: `internal:${openingExternalId}`,
          payloadHash: openingPayloadHash,
          walletId: wallet.id,
          playerId: wallet.playerId,
          roundId: 'opening',
          gameId: 'opening',
          kind: WagerTransactionKind.OPENING,
          money: initialMoney,
          createdAt: now,
          status: WagerTransactionStatus.PROCESSED,
          processedAt: now,
        });

        const correctedLedgerEntry = WalletMapper.ledgerEntryToOrmEntity(openingEntry);
        correctedLedgerEntry.transactionId = openingTx.id;

        txEm.persist(txEm.create(WagerTransactionOrmEntity, WagerTransactionMapper.toOrmEntity(openingTx)));
        txEm.persist(txEm.create(WalletLedgerEntryOrmEntity, correctedLedgerEntry));

        const context = { correlationId, causationId: openingTx.id };

        const balanceEvent = WalletBalanceChanged.create({
          context,
          data: {
            walletId: wallet.id,
            transactionId: openingTx.id,
            direction: openingEntry.direction,
            money: openingEntry.money.toJSON(),
            balanceBefore: openingEntry.balanceBefore.toJSON(),
            balanceAfter: openingEntry.balanceAfter.toJSON(),
            walletVersion: wallet.version,
          },
        });

        const processedEvent = WagerTransactionProcessed.create({
          context,
          data: {
            transactionId: openingTx.id,
            providerId: openingTx.providerId,
            externalTransactionId: openingTx.externalTransactionId,
            idempotencyKey: openingTx.idempotencyKey,
            walletId: openingTx.walletId,
            playerId: openingTx.playerId,
            roundId: openingTx.roundId,
            gameId: openingTx.gameId,
            kind: openingTx.kind,
            money: openingTx.money.toJSON(),
            balance: wallet.balance.toJSON(),
            processedAt: (openingTx.processedAt ?? now).toISOString(),
          },
        });
const eventsToPublish: IntegrationEvent<unknown>[] = [balanceEvent, processedEvent];

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
     
      }

      await txEm.flush();

      return {
        id: wallet.id,
        playerId: wallet.playerId,
        balance: wallet.balance.toJSON(),
        version: wallet.version,
      };
    });
  }

  async getWallet(walletId: string) {
    const orm = await this.em.findOne(WalletOrmEntity, { id: walletId });
    if (!orm) {
      throw new ResourceNotFoundError('Wallet', walletId);
    }
    const wallet = WalletMapper.toDomain(orm);
    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.balance.toJSON(),
      version: wallet.version,
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString(),
    };
  }

  async getLedger(walletId: string, cursor?: string, limit = 50) {
    const walletOrm = await this.em.findOne(WalletOrmEntity, { id: walletId });
    if (!walletOrm) {
      throw new ResourceNotFoundError('Wallet', walletId);
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const qb = this.em
      .createQueryBuilder(WalletLedgerEntryOrmEntity, 'l')
      .select('*')
      .where({ walletId })
      .orderBy({ createdAt: 'ASC', id: 'ASC' })
      .limit(safeLimit + 1);

    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
          createdAt: string;
          id: string;
        };
        const cursorDate = new Date(decoded.createdAt);
        qb.andWhere(
          '(l.created_at > ? OR (l.created_at = ? AND l.id > ?))',
          [cursorDate, cursorDate, decoded.id],
        );
      } catch {
        // Ignora cursor malformado
      }
    }

    const rows = await qb.getResultList();
    const hasMore = rows.length > safeLimit;
    const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;

    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && lastRow
        ? Buffer.from(
            JSON.stringify({
              createdAt: lastRow.createdAt.toISOString(),
              id: lastRow.id,
            }),
          ).toString('base64url')
        : null;

    return {
      walletId,
      entries: pageRows.map((r) => ({
        id: r.id,
        walletId: r.walletId,
        transactionId: r.transactionId,
        direction: r.direction,
        money: { amount: r.amount, currency: r.currency },
        balanceBefore: { amount: r.balanceBefore, currency: r.currency },
        balanceAfter: { amount: r.balanceAfter, currency: r.currency },
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor,
    };
  }

  async reconcileWallet(walletId: string) {
    const walletOrm = await this.em.findOne(WalletOrmEntity, { id: walletId });
    if (!walletOrm) {
      throw new ResourceNotFoundError('Wallet', walletId);
    }

    const wallet = WalletMapper.toDomain(walletOrm);
    const entries = await this.em.find(
      WalletLedgerEntryOrmEntity,
      { walletId },
      { orderBy: { createdAt: 'ASC', id: 'ASC' } },
    );

    let calculated = Money.zero(wallet.currency);
    for (const entry of entries) {
      const entryMoney = Money.from({ amount: entry.amount, currency: entry.currency });
      if (entry.direction === LedgerDirection.CREDIT) {
        calculated = calculated.add(entryMoney);
      } else {
        calculated = calculated.subtract(entryMoney);
      }
    }

    const consistent = wallet.balance.equals(calculated);
    const difference = wallet.balance.isLessThan(calculated)
      ? calculated.subtract(wallet.balance)
      : wallet.balance.subtract(calculated);

    if (!consistent) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'WALLET_RECONCILIATION_MISMATCH',
          walletId,
          storedBalance: wallet.balance.toJSON(),
          calculatedBalance: calculated.toJSON(),
          difference: difference.toJSON(),
        }),
      );
    }

    return {
      walletId,
      storedBalance: wallet.balance.toJSON(),
      calculatedBalance: calculated.toJSON(),
      difference: difference.toJSON(),
      consistent,
      checkedEntries: entries.length,
    };
  }
}