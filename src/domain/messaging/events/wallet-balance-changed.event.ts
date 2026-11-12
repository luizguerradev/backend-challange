import { randomUUID } from 'node:crypto';
import { IntegrationEvent } from '../integration-event.js';
import type { MoneyProps } from '../../common/money.vo.js';
import type { LedgerDirection } from '../../wallet/entity/wallet-ledger-entry.entity.js';

export interface WalletBalanceChangedData {
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: MoneyProps;
  balanceBefore: MoneyProps;
  balanceAfter: MoneyProps;
  walletVersion: number;
}

export interface EventContext {
  correlationId: string;
  causationId?: string;
}

export class WalletBalanceChanged extends IntegrationEvent<WalletBalanceChangedData> {
  readonly eventType = 'WalletBalanceChanged';
  readonly version = 1;

  static create(props: {
    eventId?: string;
    occurredAt?: Date;
    context: EventContext;
    data: WalletBalanceChangedData;
  }): WalletBalanceChanged {
    return new WalletBalanceChanged({
      eventId: props.eventId ?? randomUUID(),
      aggregateId: props.data.walletId,
      correlationId: props.context.correlationId,
      causationId: props.context.causationId,
      occurredAt: props.occurredAt ?? new Date(),
      data: props.data,
    });
  }
}