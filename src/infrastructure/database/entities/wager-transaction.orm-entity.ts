import { EntitySchema } from '@mikro-orm/core';

export class WagerTransactionOrmEntity {
  id!: string;
  providerId!: string;
  externalTransactionId!: string;
  idempotencyKey!: string;
  payloadHash!: string;
  walletId!: string;
  playerId!: string;
  roundId!: string;
  gameId!: string;
  kind!: string;
  amount!: string;
  currency!: string;
  referenceExternalTransactionId?: string;
  referenceTransactionId?: string;
  status!: string;
  failureCode?: string;
  processedAt?: Date;
  createdAt: Date = new Date();
}

export const WagerTransactionSchema = new EntitySchema<WagerTransactionOrmEntity>({
  class: WagerTransactionOrmEntity,
  tableName: 'wager_transactions',
  uniques: [
    { properties: ['providerId', 'externalTransactionId'] },
    { properties: ['idempotencyKey'] },
  ],
  properties: {
    id: { type: 'uuid', primary: true },
    providerId: { fieldName: 'provider_id', type: 'text' },
    externalTransactionId: { fieldName: 'external_transaction_id', type: 'text' },
    idempotencyKey: { fieldName: 'idempotency_key', type: 'text' },
    payloadHash: { fieldName: 'payload_hash', type: 'char', length: 64 },
    walletId: { fieldName: 'wallet_id', type: 'uuid', index: true },
    playerId: { fieldName: 'player_id', type: 'text', index: true },
    roundId: { fieldName: 'round_id', type: 'text' },
    gameId: { fieldName: 'game_id', type: 'text' },
    kind: { type: 'varchar', length: 20 },
    amount: { type: 'numeric', precision: 18, scale: 2 },
    currency: { type: 'varchar', length: 3 },
    referenceExternalTransactionId: { fieldName: 'reference_external_transaction_id', type: 'text', nullable: true },
    referenceTransactionId: { fieldName: 'reference_transaction_id', type: 'uuid', nullable: true },
    status: { type: 'varchar', length: 20, index: true },
    failureCode: { fieldName: 'failure_code', type: 'text', nullable: true },
    processedAt: { fieldName: 'processed_at', type: 'timestamptz', nullable: true },
    createdAt: { fieldName: 'created_at', type: 'timestamptz', defaultRaw: 'now()' },
  },
});