import { EntitySchema } from '@mikro-orm/core';

export class WalletOrmEntity {
  id!: string;
  playerId!: string;
  currency!: string;
  balance!: string;
  version: number = 1;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const WalletSchema = new EntitySchema<WalletOrmEntity>({
  class: WalletOrmEntity,
  tableName: 'wallets',
  uniques: [{ properties: ['playerId', 'currency'] }],
  properties: {
    id: { type: 'uuid', primary: true },
    playerId: { fieldName: 'player_id', type: 'text' },
    currency: { type: 'varchar', length: 3 },
    balance: { type: 'numeric', precision: 18, scale: 2 },
    version: { type: 'integer', default: 1 },
    createdAt: { fieldName: 'created_at', type: 'timestamptz', defaultRaw: 'now()' },
    updatedAt: { fieldName: 'updated_at', type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() },
  },
});