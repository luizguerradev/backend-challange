import { Money } from '../../common/money.vo.js';
import { WalletLedgerEntry, LedgerDirection } from './wallet-ledger-entry.entity.js';

export class InsufficientFundsError extends Error {
  constructor(current: string, required: string) {
    super(`Insufficient funds. Current balance: ${current}, required: ${required}`);
    this.name = 'InsufficientFundsError';
  }
}

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: {
    id: string;
    playerId: string;
    initialBalance: Money;
  }): { wallet: Wallet; openingEntry?: WalletLedgerEntry } {
    const now = new Date();
    const wallet = new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      now,
      now,
    );

    let openingEntry: WalletLedgerEntry | undefined;
    if (props.initialBalance.isPositive()) {
      openingEntry = WalletLedgerEntry.create({
        walletId: wallet.id,
        transactionId: props.id, // ID da operação de abertura
        direction: LedgerDirection.CREDIT,
        money: props.initialBalance,
        balanceBefore: Money.zero(props.initialBalance.currency),
        balanceAfter: props.initialBalance,
        createdAt: now,
      });
    }

    return { wallet, openingEntry };
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      state.balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(amount: Money, transactionId: string): WalletLedgerEntry {
    this.assertSameCurrency(amount);

    if (this._balance.isLessThan(amount)) {
      throw new InsufficientFundsError(this._balance.toString(), amount.toString());
    }

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.subtract(amount);

    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = new Date();

    return WalletLedgerEntry.create({
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.DEBIT,
      money: amount,
      balanceBefore,
      balanceAfter,
      createdAt: this._updatedAt,
    });
  }

  credit(amount: Money, transactionId: string): WalletLedgerEntry {
    this.assertSameCurrency(amount);

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.add(amount);

    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = new Date();

    return WalletLedgerEntry.create({
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.CREDIT,
      money: amount,
      balanceBefore,
      balanceAfter,
      createdAt: this._updatedAt,
    });
  }

  private assertSameCurrency(money: Money): void {
    if (this.currency !== money.currency) {
      throw new Error(`Currency mismatch: wallet (${this.currency}) vs operation (${money.currency})`);
    }
  }
}