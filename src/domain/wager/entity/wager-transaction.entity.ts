import { randomUUID } from 'node:crypto';
import { Money } from '../../common/money.vo';
import { LedgerDirection } from '../../wallet/entity/wallet-ledger-entry.entity';

export enum WagerTransactionKind {
  OPENING = 'OPENING',
  BET = 'BET',
  WIN = 'WIN',
  LOSS = 'LOSS',
  REFUND = 'REFUND',
  ROLLBACK = 'ROLLBACK',
}

export enum WagerTransactionStatus {
  PENDING = 'PENDING',
  PENDING_REFERENCE = 'PENDING_REFERENCE',
  PROCESSED = 'PROCESSED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}

export const FailureCode = {
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  CURRENCY_MISMATCH: 'CURRENCY_MISMATCH',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  REFERENCE_NOT_FOUND: 'REFERENCE_NOT_FOUND',
  REFERENCE_ALREADY_REVERTED: 'REFERENCE_ALREADY_REVERTED',
  INVALID_REFERENCE_TYPE: 'INVALID_REFERENCE_TYPE',
  REVERSAL_WOULD_CAUSE_NEGATIVE_BALANCE: 'REVERSAL_WOULD_CAUSE_NEGATIVE_BALANCE',
  INTERNAL_PROCESSING_ERROR: 'INTERNAL_PROCESSING_ERROR',
} as const;

export type FailureCode = (typeof FailureCode)[keyof typeof FailureCode];

export class InvalidTransactionStateError extends Error {
  constructor(currentStatus: WagerTransactionStatus, action: string) {
    super(`Cannot execute ${action} on transaction with terminal status ${currentStatus}`);
    this.name = 'InvalidTransactionStateError';
  }
}

export interface CreateWagerTransactionProps {
  id?: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey?: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
}

export interface WagerTransactionState {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  createdAt: Date;
  status: WagerTransactionStatus;
  referenceTransactionId?: string;
  failureCode?: FailureCode;
  processedAt?: Date;
}

export class WagerTransaction {
  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly idempotencyKey: string,
    public readonly payloadHash: string,
    public readonly walletId: string,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: WagerTransactionKind,
    public readonly money: Money,
    public readonly referenceExternalTransactionId: string | undefined,
    public readonly createdAt: Date,
    private _status: WagerTransactionStatus,
    private _referenceTransactionId?: string,
    private _failureCode?: FailureCode,
    private _processedAt?: Date,
  ) {}

  static create(props: CreateWagerTransactionProps): WagerTransaction {
    if (props.kind === WagerTransactionKind.OPENING) {
      throw new Error('OPENING transactions are internal and cannot be submitted via API or Queue');
    }

    if ((props.kind === WagerTransactionKind.REFUND || props.kind === WagerTransactionKind.ROLLBACK) && !props.referenceExternalTransactionId) {
      throw new Error(`${props.kind} requires referenceExternalTransactionId`);
    }

    const idempotencyKey = props.idempotencyKey ?? `${props.providerId}:${props.externalTransactionId}`;

    return new WagerTransaction(
      props.id ?? randomUUID(),
      props.providerId,
      props.externalTransactionId,
      idempotencyKey,
      props.payloadHash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      props.kind,
      props.money,
      props.referenceExternalTransactionId,
      new Date(),
      WagerTransactionStatus.PENDING,
    );
  }

  static rehydrate(state: WagerTransactionState): WagerTransaction {
    return new WagerTransaction(
      state.id,
      state.providerId,
      state.externalTransactionId,
      state.idempotencyKey,
      state.payloadHash,
      state.walletId,
      state.playerId,
      state.roundId,
      state.gameId,
      state.kind,
      state.money,
      state.referenceExternalTransactionId,
      state.createdAt,
      state.status,
      state.referenceTransactionId,
      state.failureCode,
      state.processedAt,
    );
  }

  get status(): WagerTransactionStatus { return this._status; }
  get referenceTransactionId(): string | undefined { return this._referenceTransactionId; }
  get failureCode(): FailureCode | undefined { return this._failureCode; }
  get processedAt(): Date | undefined { return this._processedAt; }

  markProcessed(referenceTransactionId: string | undefined, at: Date = new Date()): void {
    this.assertNonTerminal('markProcessed');
    this._status = WagerTransactionStatus.PROCESSED;
    this._referenceTransactionId = referenceTransactionId;
    this._processedAt = at;
  }

  markPendingReference(): void {
    this.assertNonTerminal('markPendingReference');
    this._status = WagerTransactionStatus.PENDING_REFERENCE;
  }

  reject(code: FailureCode): void {
    this.assertNonTerminal('reject');
    this._status = WagerTransactionStatus.REJECTED;
    this._failureCode = code;
    this._processedAt = new Date();
  }

  fail(code: FailureCode): void {
    this.assertNonTerminal('fail');
    this._status = WagerTransactionStatus.FAILED;
    this._failureCode = code;
    this._processedAt = new Date();
  }

  isTerminal(): boolean {
    return (
      this._status === WagerTransactionStatus.PROCESSED ||
      this._status === WagerTransactionStatus.REJECTED ||
      this._status === WagerTransactionStatus.FAILED
    );
  }

  affectsBalance(): boolean {
    return this.kind !== WagerTransactionKind.LOSS;
  }

  requiresReference(): boolean {
    return this.kind === WagerTransactionKind.REFUND || this.kind === WagerTransactionKind.ROLLBACK;
  }

  matchesPayload(payloadHash: string): boolean {
    return this.payloadHash === payloadHash;
  }

  ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
    switch (this.kind) {
      case WagerTransactionKind.OPENING:
      case WagerTransactionKind.WIN:
      case WagerTransactionKind.REFUND:
        return LedgerDirection.CREDIT;
      case WagerTransactionKind.BET:
        return LedgerDirection.DEBIT;
      case WagerTransactionKind.ROLLBACK: {
        if (!reference) {
          throw new Error('ROLLBACK requires reference transaction to determine direction');
        }
        // Inverte a direção da transação original
        return reference.kind === WagerTransactionKind.BET ? LedgerDirection.CREDIT : LedgerDirection.DEBIT;
      }
      case WagerTransactionKind.LOSS:
        throw new Error('LOSS transactions do not generate ledger entries');
    }
  }

  private assertNonTerminal(action: string): void {
    if (this.isTerminal()) {
      throw new InvalidTransactionStateError(this._status, action);
    }
  }
}