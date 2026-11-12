import type { FailureCode } from '../../domain/wager/entity/wager-transaction.entity.js';

export class ResourceNotFoundError extends Error {
  constructor(resource: string, identifier: string) {
    super(`${resource} not found: ${identifier}`);
    this.name = 'ResourceNotFoundError';
  }
}

export class IdempotencyConflictError extends Error {
  public readonly code = 'IDEMPOTENCY_CONFLICT';
  constructor(idempotencyKey: string) {
    super(`Idempotency conflict for key "${idempotencyKey}": payload does not match original request`);
    this.name = 'IdempotencyConflictError';
  }
}

export class DuplicateWalletConflictError extends Error {
  public readonly code = 'DUPLICATE_WALLET';
  constructor(playerId: string, currency: string) {
    super(`Wallet already exists for player "${playerId}" and currency "${currency}"`);
    this.name = 'DuplicateWalletConflictError';
  }
}

export class BusinessRuleRejectionError extends Error {
  constructor(
    public readonly failureCode: FailureCode,
    message: string,
    public readonly transactionId?: string,
  ) {
    super(message);
    this.name = 'BusinessRuleRejectionError';
  }
}