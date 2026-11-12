import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import 'dotenv/config';

import Migration20261111000001_InitialCoreTables from './src/infrastructure/database/migrations/Migration20261111000001_InitialCoreTables.js';
import { WalletSchema } from './src/infrastructure/database/entities/wallet.orm-entity.js';
import { WalletLedgerEntrySchema } from './src/infrastructure/database/entities/wallet-ledger-entry.orm-entity.js';
import { WagerTransactionSchema } from './src/infrastructure/database/entities/wager-transaction.orm-entity.js';
import { OutboxMessageSchema } from './src/infrastructure/database/entities/outbox-message.orm-entity.js';
import { InboxMessageSchema } from './src/infrastructure/database/entities/inbox-message.orm-entity.js';

export default defineConfig({
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  user: process.env.DATABASE_USER ?? 'wagering_user',
  password: process.env.DATABASE_PASSWORD ?? 'wagering_pass',
  dbName: process.env.DATABASE_NAME ?? 'wagering_db',
  entities: [
    WalletSchema,
    WalletLedgerEntrySchema,
    WagerTransactionSchema,
    OutboxMessageSchema,
    InboxMessageSchema,
  ],
  discovery: {
    warnWhenNoEntities: false,
  },
  extensions: [Migrator],
  migrations: {
    migrationsList: [
      {
        name: 'Migration20261111000001_InitialCoreTables',
        class: Migration20261111000001_InitialCoreTables,
      },
    ],
    path: './src/infrastructure/database/migrations',
    transactional: true,
    disableForeignKeys: false,
    allOrNothing: true,
    emit: 'ts',
  },
  debug: process.env.NODE_ENV === 'development',
});