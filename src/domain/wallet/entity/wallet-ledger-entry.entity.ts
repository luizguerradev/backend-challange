import { randomUUID } from 'node:crypto';
import { Money } from '../../common/money.vo';

export enum LedgerDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export interface CreateLedgerEntryProps {
  id?: string;
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: Money;
  balanceBefore: Money;
  balanceAfter: Money;
  createdAt?: Date;
}

export interface LedgerEntryState {
  id: string;
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: Money;
  balanceBefore: Money;
  balanceAfter: Money;
  createdAt: Date;
}

export class UnbalancedLedgerEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnbalancedLedgerEntryError';
  }
}

export class WalletLedgerEntry {
  private constructor(
    public readonly id: string,
    public readonly walletId: string,
    public readonly transactionId: string,
    public readonly direction: LedgerDirection,
    public readonly money: Money,
    public readonly balanceBefore: Money,
    public readonly balanceAfter: Money,
    public readonly createdAt: Date,
  ) {}

  static create(props: CreateLedgerEntryProps): WalletLedgerEntry {
    const entry = new WalletLedgerEntry(
      props.id ?? randomUUID(),
      props.walletId,
      props.transactionId,
      props.direction,
      props.money,
      props.balanceBefore,
      props.balanceAfter,
      props.createdAt ?? new Date(),
    );

    if (!entry.isBalanced()) {
      throw new UnbalancedLedgerEntryError(
        `Ledger entry calculation invalid: before (${props.balanceBefore.toString()}) ` +
        `${props.direction === LedgerDirection.CREDIT ? '+' : '-'} ` +
        `amount (${props.money.toString()}) !== after (${props.balanceAfter.toString()})`
      );
    }

    return entry;
  }

  static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
    return new WalletLedgerEntry(
      state.id,
      state.walletId,
      state.transactionId,
      state.direction,
      state.money,
      state.balanceBefore,
      state.balanceAfter,
      state.createdAt,
    );
  }

  isBalanced(): boolean {
    const calculated =
      this.direction === LedgerDirection.CREDIT
        ? this.balanceBefore.add(this.money)
        : this.balanceBefore.subtract(this.money);

    return calculated.equals(this.balanceAfter);
  }
}