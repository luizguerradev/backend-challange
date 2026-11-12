import { randomUUID } from 'node:crypto';
import { IntegrationEvent } from '../integration-event.js';
import type { MoneyProps } from '../../common/money.vo.js';
import type { EventContext } from './wallet-balance-changed.event.js';
import type { WagerTransactionKind, FailureCode } from '../../wager/entity/wager-transaction.entity.js';

export interface WagerProcessedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  balance: MoneyProps;
  referenceTransactionId?: string;
  processedAt: string;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerProcessedData> {
  readonly eventType = 'WagerTransactionProcessed';
  readonly version = 1;

  static create(props: {
    eventId?: string;
    occurredAt?: Date;
    context: EventContext;
    data: WagerProcessedData;
  }): WagerTransactionProcessed {
    return new WagerTransactionProcessed({
      eventId: props.eventId ?? randomUUID(),
      aggregateId: props.data.transactionId,
      correlationId: props.context.correlationId,
      causationId: props.context.causationId,
      occurredAt: props.occurredAt ?? new Date(),
      data: props.data,
    });
  }
}

export interface WagerRejectedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  failureCode: FailureCode;
  reason?: string;
}

export class WagerTransactionRejected extends IntegrationEvent<WagerRejectedData> {
  readonly eventType = 'WagerTransactionRejected';
  readonly version = 1;

  static create(props: {
    eventId?: string;
    occurredAt?: Date;
    context: EventContext;
    data: WagerRejectedData;
  }): WagerTransactionRejected {
    return new WagerTransactionRejected({
      eventId: props.eventId ?? randomUUID(),
      aggregateId: props.data.transactionId,
      correlationId: props.context.correlationId,
      causationId: props.context.causationId,
      occurredAt: props.occurredAt ?? new Date(),
      data: props.data,
    });
  }
}

export interface WagerPendingReferenceData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  referenceExternalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerPendingReferenceData> {
  readonly eventType = 'WagerTransactionPendingReference';
  readonly version = 1;

  static create(props: {
    eventId?: string;
    occurredAt?: Date;
    context: EventContext;
    data: WagerPendingReferenceData;
  }): WagerTransactionPendingReference {
    return new WagerTransactionPendingReference({
      eventId: props.eventId ?? randomUUID(),
      aggregateId: props.data.transactionId,
      correlationId: props.context.correlationId,
      causationId: props.context.causationId,
      occurredAt: props.occurredAt ?? new Date(),
      data: props.data,
    });
  }
}