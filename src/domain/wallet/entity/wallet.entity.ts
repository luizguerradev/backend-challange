import { randomUUID } from 'node:crypto';
import { Money } from '../../common/money.vo';
import { WalletLedgerEntry, LedgerDirection } from './wallet-ledger-entry.entity';

export class InsufficientFundsError extends Error {
  constructor(current: string, required: string) {
    super(`Insufficient funds. Current balance: ${current}, required: ${required}`);
    this.name = 'InsufficientFundsError';
  }
}

export class CurrencyMismatchError extends Error {
  constructor(expected: string, received: string) {
    super(`Currency mismatch. Expected ${expected}, received ${received}`);
    this.name = 'CurrencyMismatchError';
  }
}

export class Wallet {
  private readonly _id: string;
  private readonly _playerId: string;
  private readonly _currency: string;
  private _balance: Money;
  private _version: number;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(params: {
    id: string;
    playerId: string;
    currency: string;
    balance: Money;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this._id = params.id;
    this._playerId = params.playerId;
    this._currency = params.currency;
    this._balance = params.balance;
    this._version = params.version;
    this._createdAt = params.createdAt;
    this._updatedAt = params.updatedAt;
  }

  static create(playerId: string, currency: string, initialBalance = Money.zero(currency)): Wallet {
    const now = new Date();
    return new Wallet({
      id: randomUUID(),
      playerId,
      currency,
      balance: initialBalance,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(params: {
    id: string;
    playerId: string;
    currency: string;
    balance: Money;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }): Wallet {
    return new Wallet(params);
  }

  debit(amount: Money, transactionId: string): WalletLedgerEntry {
    this.assertCurrency(amount);

    if (this._balance.isLessThan(amount)) {
      throw new InsufficientFundsError(
        this._balance.format(),
        amount.format(),
      );
    }

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.subtract(amount);

    this._balance = balanceAfter;
    this._updatedAt = new Date();

    return WalletLedgerEntry.create({
      walletId: this._id,
      transactionId,
      direction: LedgerDirection.DEBIT,
      amount,
      balanceBefore,
      balanceAfter,
    });
  }

  credit(amount: Money, transactionId: string): WalletLedgerEntry {
    this.assertCurrency(amount);

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.add(amount);

    this._balance = balanceAfter;
    this._updatedAt = new Date();

    return WalletLedgerEntry.create({
      walletId: this._id,
      transactionId,
      direction: LedgerDirection.CREDIT,
      amount,
      balanceBefore,
      balanceAfter,
    });
  }

  private assertCurrency(money: Money): void {
    if (money.currency !== this._currency) {
      throw new CurrencyMismatchError(this._currency, money.currency);
    }
  }

  get id(): string { return this._id; }
  get playerId(): string { return this._playerId; }
  get currency(): string { return this._currency; }
  get balance(): Money { return this._balance; }
  get version(): number { return this._version; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }
}