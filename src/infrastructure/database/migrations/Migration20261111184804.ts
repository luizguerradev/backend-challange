import { Migration } from '@mikro-orm/migrations';

export class Migration20261111184804 extends Migration {

  override name = 'Migration20261111184804';

  override up(): void | Promise<void> {
    this.addSql(`alter table "wager_transactions" drop constraint "wager_transactions_wallet_id_fkey";`);

    this.addSql(`alter table "wallet_ledger_entries" drop constraint "wallet_ledger_entries_wallet_id_fkey";`);

    this.addSql(`alter table "inbox_messages" drop constraint "inbox_messages_pkey";`);
    this.addSql(`alter table "inbox_messages" alter column "consumer_name" type varchar(255) using ("consumer_name"::varchar(255));`);
    this.addSql(`alter table "inbox_messages" alter column "message_id" type varchar(255) using ("message_id"::varchar(255));`);
    this.addSql(`alter table "inbox_messages" alter column "payload_hash" type varchar(255) using ("payload_hash"::varchar(255));`);
    this.addSql(`alter table "inbox_messages" alter column "received_at" set default now();`);
    this.addSql(`alter table "inbox_messages" add primary key ("message_id", "consumer_name");`);

    this.addSql(`drop index "idx_outbox_pending_due";`);

    this.addSql(`alter index "idx_wager_wallet_id" rename to "wager_transactions_wallet_id_index";`);
    this.addSql(`alter index "idx_wager_player_id" rename to "wager_transactions_player_id_index";`);
    this.addSql(`alter index "idx_wager_status" rename to "wager_transactions_status_index";`);
    this.addSql(`alter table "wager_transactions" drop constraint "uq_wager_provider_external_tx";`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_provider_id_external_transaction_id_unique" unique ("provider_id", "external_transaction_id");`);
    this.addSql(`alter table "wager_transactions" drop constraint "uq_wager_idempotency_key";`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_idempotency_key_unique" unique ("idempotency_key");`);

    this.addSql(`drop trigger if exists "trg_prevent_ledger_update_delete" on "wallet_ledger_entries";`);
    this.addSql(`drop function if exists "wallet_ledger_entries_trg_prevent_ledger_update_delete_fn"();`);
    this.addSql(`alter table "wallet_ledger_entries" add "currency" varchar(3) not null;`);
    this.addSql(`alter index "idx_ledger_wallet_id" rename to "wallet_ledger_entries_wallet_id_index";`);
    this.addSql(`alter index "idx_ledger_created_at" rename to "wallet_ledger_entries_created_at_index";`);

    this.addSql(`alter table "wallets" drop constraint "chk_wallet_balance_non_negative";`);
    this.addSql(`alter table "wallets" drop constraint "uq_wallet_player_currency";`);
    this.addSql(`alter table "wallets" add constraint "wallets_player_id_currency_unique" unique ("player_id", "currency");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "inbox_messages" drop constraint "inbox_messages_pkey";`);
    this.addSql(`alter table "inbox_messages" alter column "message_id" type text using ("message_id"::text);`);
    this.addSql(`alter table "inbox_messages" alter column "consumer_name" type text using ("consumer_name"::text);`);
    this.addSql(`alter table "inbox_messages" alter column "payload_hash" type char(64) using ("payload_hash"::char(64));`);
    this.addSql(`alter table "inbox_messages" alter column "received_at" drop default;`);
    this.addSql(`alter table "inbox_messages" add primary key ("consumer_name", "message_id");`);

    this.addSql(`create index "idx_outbox_pending_due" on "outbox_messages" ("published_at", "next_attempt_at");`);

    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_wallet_id_fkey" foreign key ("wallet_id") references "wallets" ("id") on delete restrict;`);
    this.addSql(`alter index "wager_transactions_player_id_index" rename to "idx_wager_player_id";`);
    this.addSql(`alter index "wager_transactions_status_index" rename to "idx_wager_status";`);
    this.addSql(`alter index "wager_transactions_wallet_id_index" rename to "idx_wager_wallet_id";`);
    this.addSql(`alter table "wager_transactions" drop constraint "wager_transactions_idempotency_key_unique";`);
    this.addSql(`alter table "wager_transactions" add constraint "uq_wager_idempotency_key" unique ("idempotency_key");`);
    this.addSql(`alter table "wager_transactions" drop constraint "wager_transactions_provider_id_external_transaction_id_unique";`);
    this.addSql(`alter table "wager_transactions" add constraint "uq_wager_provider_external_tx" unique ("provider_id", "external_transaction_id");`);

    this.addSql(`alter table "wallet_ledger_entries" drop column "currency";`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_wallet_id_fkey" foreign key ("wallet_id") references "wallets" ("id") on delete restrict;`);
    this.addSql(`alter index "wallet_ledger_entries_created_at_index" rename to "idx_ledger_created_at";`);
    this.addSql(`alter index "wallet_ledger_entries_wallet_id_index" rename to "idx_ledger_wallet_id";`);
    this.addSql(`create or replace function "wallet_ledger_entries_trg_prevent_ledger_update_delete_fn"() returns trigger as \$\$ begin ; end; \$\$ language plpgsql;`);
    this.addSql(`create trigger "trg_prevent_ledger_update_delete" BEFORE DELETE OR UPDATE on "wallet_ledger_entries" for each ROW execute function "wallet_ledger_entries_trg_prevent_ledger_update_delete_fn"();`);

    this.addSql(`alter table "wallets" drop constraint "wallets_player_id_currency_unique";`);
    this.addSql(`alter table "wallets" add constraint "uq_wallet_player_currency" unique ("player_id", "currency");`);
    this.addSql(`alter table "wallets" add constraint "chk_wallet_balance_non_negative" check (balance >= 0);`);
  }

}
