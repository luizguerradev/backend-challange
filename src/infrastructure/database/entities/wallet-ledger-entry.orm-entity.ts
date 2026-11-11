import { EntitySchema } from '@mikro-orm/core';

export class WalletLedgerEntryOrmEntity {
  id!: string;
  walletId!: string;
  transactionId!: string;
  direction!: string;
  amount!: string;
  currency!: string;
  balanceBefore!: string;
  balanceAfter!: string;
  createdAt: Date = new Date();
}

export const WalletLedgerEntrySchema = new EntitySchema<WalletLedgerEntryOrmEntity>({
  class: WalletLedgerEntryOrmEntity,
  tableName: 'wallet_ledger_entries',
  properties: {
    id: { type: 'uuid', primary: true },
    walletId: { fieldName: 'wallet_id', type: 'uuid', index: true },
    transactionId: { fieldName: 'transaction_id', type: 'uuid' },
    direction: { type: 'varchar', length: 10 },
    amount: { type: 'numeric', precision: 18, scale: 2 },
    currency: { type: 'varchar', length: 3 },
    balanceBefore: { fieldName: 'balance_before', type: 'numeric', precision: 18, scale: 2 },
    balanceAfter: { fieldName: 'balance_after', type: 'numeric', precision: 18, scale: 2 },
    createdAt: { fieldName: 'created_at', type: 'timestamptz', defaultRaw: 'now()', index: true },
  },
});