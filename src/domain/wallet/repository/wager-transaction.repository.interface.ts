import type { WagerTransaction } from '../../wager/entity/wager-transaction.entity.js';

export const WAGER_TRANSACTION_REPOSITORY_TOKEN = Symbol('WAGER_TRANSACTION_REPOSITORY_TOKEN');

export interface WagerTransactionRepositoryInterface {
  findById(id: string): Promise<WagerTransaction | null>;
  findByIdempotencyKey(providerId: string, externalTransactionId: string): Promise<WagerTransaction | null>;
  save(transaction: WagerTransaction): Promise<void>;
}