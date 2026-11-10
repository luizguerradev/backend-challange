import { randomUUID } from 'node:crypto';
import { Money } from '../../common/money.vo';

export enum LedgerDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export class WalletLedgerEntry {
  private readonly _id: string;
  private readonly _walletId: string;
  private readonly _transactionId: string;
  private readonly _direction: LedgerDirection;
  private readonly _amount: Money;
  private readonly _balanceBefore: Money;
  private readonly _balanceAfter: Money;
  private readonly _createdAt: Date;

  private constructor(params: {
    id: string;
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    amount: Money;
    balanceBefore: Money;
    balanceAfter: Money;
    createdAt: Date;
  }) {
    this._id = params.id;
    this._walletId = params.walletId;
    this._transactionId = params.transactionId;
    this._direction = params.direction;
    this._amount = params.amount;
    this._balanceBefore = params.balanceBefore;
    this._balanceAfter = params.balanceAfter;
    this._createdAt = params.createdAt;
  }

  static create(params: {
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    amount: Money;
    balanceBefore: Money;
    balanceAfter: Money;
  }): WalletLedgerEntry {
    return new WalletLedgerEntry({
      id: randomUUID(),
      walletId: params.walletId,
      transactionId: params.transactionId,
      direction: params.direction,
      amount: params.amount,
      balanceBefore: params.balanceBefore,
      balanceAfter: params.balanceAfter,
      createdAt: new Date(),
    });
  }

  static reconstitute(params: {
    id: string;
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    amount: Money;
    balanceBefore: Money;
    balanceAfter: Money;
    createdAt: Date;
  }): WalletLedgerEntry {
    return new WalletLedgerEntry(params);
  }

  get id(): string { return this._id; }
  get walletId(): string { return this._walletId; }
  get transactionId(): string { return this._transactionId; }
  get direction(): LedgerDirection { return this._direction; }
  get amount(): Money { return this._amount; }
  get balanceBefore(): Money { return this._balanceBefore; }
  get balanceAfter(): Money { return this._balanceAfter; }
  get createdAt(): Date { return this._createdAt; }
}