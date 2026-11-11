import { Migration } from '@mikro-orm/migrations';

export default class Migration20261111000001_InitialCoreTables extends Migration {
  async up(): Promise<void> {
    // 1. Wallets com check constraint de saldo não-negativo (Seção 5.9 e 6.2)
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "wallets" (
        "id" UUID PRIMARY KEY,
        "player_id" TEXT NOT NULL,
        "currency" VARCHAR(3) NOT NULL,
        "balance" NUMERIC(18, 2) NOT NULL,
        "version" INTEGER NOT NULL DEFAULT 1,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_wallet_player_currency" UNIQUE ("player_id", "currency"),
        CONSTRAINT "chk_wallet_balance_non_negative" CHECK ("balance" >= 0)
      );
    `);

    // 2. Ledger Imutável (Seção 5.5 e 6.4)
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "wallet_ledger_entries" (
        "id" UUID PRIMARY KEY,
        "wallet_id" UUID NOT NULL REFERENCES "wallets"("id") ON DELETE RESTRICT,
        "transaction_id" UUID NOT NULL,
        "direction" VARCHAR(10) NOT NULL,
        "amount" NUMERIC(18, 2) NOT NULL,
        "balance_before" NUMERIC(18, 2) NOT NULL,
        "balance_after" NUMERIC(18, 2) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_ledger_wallet_id" ON "wallet_ledger_entries"("wallet_id");
      CREATE INDEX IF NOT EXISTS "idx_ledger_created_at" ON "wallet_ledger_entries"("created_at");
    `);

    // 3. Trigger de Imutabilidade no Ledger
    this.addSql(`
      CREATE OR REPLACE FUNCTION prevent_ledger_modification()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'Wallet ledger entries are strictly immutable. UPDATE and DELETE operations are prohibited.';
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_prevent_ledger_update_delete ON "wallet_ledger_entries";
      CREATE TRIGGER trg_prevent_ledger_update_delete
      BEFORE UPDATE OR DELETE ON "wallet_ledger_entries"
      FOR EACH ROW EXECUTE FUNCTION prevent_ledger_modification();
    `);

    // 4. Wager Transactions com Idempotência e Hash (Seção 6.3 e 9)
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "wager_transactions" (
        "id" UUID PRIMARY KEY,
        "provider_id" TEXT NOT NULL,
        "external_transaction_id" TEXT NOT NULL,
        "idempotency_key" TEXT NOT NULL,
        "payload_hash" CHAR(64) NOT NULL,
        "wallet_id" UUID NOT NULL REFERENCES "wallets"("id") ON DELETE RESTRICT,
        "player_id" TEXT NOT NULL,
        "round_id" TEXT NOT NULL,
        "game_id" TEXT NOT NULL,
        "kind" VARCHAR(20) NOT NULL,
        "amount" NUMERIC(18, 2) NOT NULL,
        "currency" VARCHAR(3) NOT NULL,
        "reference_external_transaction_id" TEXT,
        "reference_transaction_id" UUID,
        "status" VARCHAR(20) NOT NULL,
        "failure_code" TEXT,
        "processed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_wager_provider_external_tx" UNIQUE ("provider_id", "external_transaction_id"),
        CONSTRAINT "uq_wager_idempotency_key" UNIQUE ("idempotency_key")
      );
      CREATE INDEX IF NOT EXISTS "idx_wager_wallet_id" ON "wager_transactions"("wallet_id");
      CREATE INDEX IF NOT EXISTS "idx_wager_player_id" ON "wager_transactions"("player_id");
      CREATE INDEX IF NOT EXISTS "idx_wager_status" ON "wager_transactions"("status");
    `);

    // 5. Transactional Outbox (Seção 6.5 e 11)
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "outbox_messages" (
        "id" UUID PRIMARY KEY,
        "aggregate_id" TEXT NOT NULL,
        "event_type" VARCHAR(100) NOT NULL,
        "payload" JSONB NOT NULL,
        "occurred_at" TIMESTAMPTZ NOT NULL,
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "next_attempt_at" TIMESTAMPTZ,
        "published_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_outbox_pending_due" ON "outbox_messages"("published_at", "next_attempt_at");
    `);

    // 6. Persistent Inbox (Seção 6.5 e 10)
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "inbox_messages" (
        "message_id" TEXT NOT NULL,
        "consumer_name" TEXT NOT NULL,
        "payload_hash" CHAR(64) NOT NULL,
        "received_at" TIMESTAMPTZ NOT NULL,
        "processed_at" TIMESTAMPTZ,
        PRIMARY KEY ("consumer_name", "message_id")
      );
    `);
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "inbox_messages" CASCADE;`);
    this.addSql(`DROP TABLE IF EXISTS "outbox_messages" CASCADE;`);
    this.addSql(`DROP TABLE IF EXISTS "wager_transactions" CASCADE;`);
    this.addSql(`DROP TRIGGER IF EXISTS trg_prevent_ledger_update_delete ON "wallet_ledger_entries";`);
    this.addSql(`DROP FUNCTION IF EXISTS prevent_ledger_modification;`);
    this.addSql(`DROP TABLE IF EXISTS "wallet_ledger_entries" CASCADE;`);
    this.addSql(`DROP TABLE IF EXISTS "wallets" CASCADE;`);
  }
}