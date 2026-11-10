import { randomUUID } from 'node:crypto';
import { Money } from '../../common/money.vo.js';

export enum WagerKind {
  BET = 'BET',
  WIN = 'WIN',
  ROLLBACK = 'ROLLBACK',
}

export enum WagerStatus {
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
  REJECTED = 'REJECTED',
  ROLLED_BACK = 'ROLLED_BACK',
}

export class InvalidWagerStateTransitionError extends Error {
  constructor(from: WagerStatus, to: WagerStatus) {
    super(`Cannot transition wager from ${from} to ${to}`);
    this.name = 'InvalidWagerStateTransitionError';
  }
}

export class WagerTransaction {
  private readonly _id: string;
  private readonly _providerId: string;
  private readonly _externalTransactionId: string;
  private readonly _idempotencyKey: string;
  private readonly _payloadHash: string;
  private readonly _walletId: string;
  private readonly _playerId: string;
  private readonly _roundId: string;
  private readonly _gameId: string;
  private readonly _kind: WagerKind;
  private readonly _amount: Money;
  private readonly _currency: string;
  private readonly _referenceExternalTransactionId?: string;
  private _referenceTransactionId?: string;
  private _status: WagerStatus;
  private _failureCode?: string;
  private _processedAt?: Date;
  private readonly _createdAt: Date;

  private constructor(params: {
    id: string;
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    payloadHash: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: WagerKind;
    amount: Money;
    currency: string;
    referenceExternalTransactionId?: string;
    referenceTransactionId?: string;
    status: WagerStatus;
    failureCode?: string;
    processedAt?: Date;
    createdAt: Date;
  }) {
    this._id = params.id;
    this._providerId = params.providerId;
    this._externalTransactionId = params.externalTransactionId;
    this._idempotencyKey = params.idempotencyKey;
    this._payloadHash = params.payloadHash;
    this._walletId = params.walletId;
    this._playerId = params.playerId;
    this._roundId = params.roundId;
    this._gameId = params.gameId;
    this._kind = params.kind;
    this._amount = params.amount;
    this._currency = params.currency;
    this._referenceExternalTransactionId = params.referenceExternalTransactionId;
    this._referenceTransactionId = params.referenceTransactionId;
    this._status = params.status;
    this._failureCode = params.failureCode;
    this._processedAt = params.processedAt;
    this._createdAt = params.createdAt;
  }

  static create(params: {
    providerId: string;
    externalTransactionId: string;
    payloadHash: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: WagerKind;
    amount: Money;
    currency: string;
    referenceExternalTransactionId?: string;
  }): WagerTransaction {
    const idempotencyKey = `${params.providerId}:${params.externalTransactionId}`;
    return new WagerTransaction({
      id: randomUUID(),
      providerId: params.providerId,
      externalTransactionId: params.externalTransactionId,
      idempotencyKey,
      payloadHash: params.payloadHash,
      walletId: params.walletId,
      playerId: params.playerId,
      roundId: params.roundId,
      gameId: params.gameId,
      kind: params.kind,
      amount: params.amount,
      currency: params.currency,
      referenceExternalTransactionId: params.referenceExternalTransactionId,
      status: WagerStatus.PENDING,
      createdAt: new Date(),
    });
  }

  static reconstitute(params: {
    id: string;
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    payloadHash: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: WagerKind;
    amount: Money;
    currency: string;
    referenceExternalTransactionId?: string;
    referenceTransactionId?: string;
    status: WagerStatus;
    failureCode?: string;
    processedAt?: Date;
    createdAt: Date;
  }): WagerTransaction {
    return new WagerTransaction(params);
  }

  markAsProcessed(): void {
    if (this._status !== WagerStatus.PENDING) {
      throw new InvalidWagerStateTransitionError(this._status, WagerStatus.PROCESSED);
    }
    this._status = WagerStatus.PROCESSED;
    this._processedAt = new Date();
  }

  markAsRejected(failureCode: string): void {
    if (this._status !== WagerStatus.PENDING) {
      throw new InvalidWagerStateTransitionError(this._status, WagerStatus.REJECTED);
    }
    this._status = WagerStatus.REJECTED;
    this._failureCode = failureCode;
    this._processedAt = new Date();
  }

  markAsRolledBack(): void {
    if (this._status !== WagerStatus.PROCESSED) {
      throw new InvalidWagerStateTransitionError(this._status, WagerStatus.ROLLED_BACK);
    }
    this._status = WagerStatus.ROLLED_BACK;
    this._processedAt = new Date();
  }

  setReferenceTransactionId(referenceTransactionId: string): void {
    this._referenceTransactionId = referenceTransactionId;
  }

  get id(): string { return this._id; }
  get providerId(): string { return this._providerId; }
  get externalTransactionId(): string { return this._externalTransactionId; }
  get idempotencyKey(): string { return this._idempotencyKey; }
  get payloadHash(): string { return this._payloadHash; }
  get walletId(): string { return this._walletId; }
  get playerId(): string { return this._playerId; }
  get roundId(): string { return this._roundId; }
  get gameId(): string { return this._gameId; }
  get kind(): WagerKind { return this._kind; }
  get amount(): Money { return this._amount; }
  get currency(): string { return this._currency; }
  get referenceExternalTransactionId(): string | undefined { return this._referenceExternalTransactionId; }
  get referenceTransactionId(): string | undefined { return this._referenceTransactionId; }
  get status(): WagerStatus { return this._status; }
  get failureCode(): string | undefined { return this._failureCode; }
  get processedAt(): Date | undefined { return this._processedAt; }
  get createdAt(): Date { return this._createdAt; }
}