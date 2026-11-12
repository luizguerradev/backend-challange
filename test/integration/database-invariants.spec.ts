import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { randomUUID } from 'node:crypto';
import config from '../../mikro-orm.config.js';
import { MikroWalletRepository } from '../../src/infrastructure/database/repositories/mikro-wallet.repository.js';
import { Wallet } from '../../src/domain/wallet/entity/wallet.entity.js';
import { Money } from '../../src/domain/common/money.vo.js';

describe('Database Schema & Repository Invariants (PostgreSQL Real)', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init(config);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  it('deve rejeitar violação de saldo negativo via constraint no PostgreSQL', async () => {
    const em = orm.em.fork();
    const walletId = randomUUID();
    const playerId = `player-chk-${randomUUID()}`;

    const query = `
      INSERT INTO "wallets" ("id", "player_id", "currency", "balance", "version", "created_at", "updated_at")
      VALUES ('${walletId}', '${playerId}', 'BRL', -10.00, 1, NOW(), NOW());
    `;

    await expect(em.execute(query)).rejects.toThrow(/c(h)?k_wallet_balance_non_negative/i);
  });

  it('deve bloquear UPDATE ou DELETE no ledger via Trigger PL/pgSQL', async () => {
    const em = orm.em.fork();
    const repo = new MikroWalletRepository(em);
    const walletId = randomUUID();
    const playerId = `player-trigger-${randomUUID()}`;

    const { wallet, openingEntry } = Wallet.open({
      id: walletId,
      playerId,
      initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
    });

    await repo.save(wallet, openingEntry);

    // Tentativa de UPDATE bloqueada pela trigger de imutabilidade
    await expect(
      em.execute(`UPDATE "wallet_ledger_entries" SET "amount" = 200.00 WHERE "id" = '${openingEntry!.id}';`)
    ).rejects.toThrow(/immutable/i);

    // Tentativa de DELETE bloqueada pela trigger de imutabilidade
    await expect(
      em.execute(`DELETE FROM "wallet_ledger_entries" WHERE "id" = '${openingEntry!.id}';`)
    ).rejects.toThrow(/immutable/i);
  });

  it('deve obter a carteira com Pessimistic Lock (SELECT FOR UPDATE)', async () => {
    const em = orm.em.fork();
    const repo = new MikroWalletRepository(em);
    const walletId = randomUUID();
    const playerId = `player-lock-${randomUUID()}`;

    const { wallet } = Wallet.open({
      id: walletId,
      playerId,
      initialBalance: Money.from({ amount: '50.00', currency: 'BRL' }),
    });
    await repo.save(wallet);

    // SELECT FOR UPDATE executado dentro de bloco transacional
    await em.transactional(async (txEm) => {
      const txRepo = new MikroWalletRepository(txEm);
      const lockedWallet = await txRepo.findByIdForUpdate(walletId);

      expect(lockedWallet).not.toBeNull();
      expect(lockedWallet!.id).toBe(walletId);
      expect(lockedWallet!.balance.toString()).toBe('50.00');
    });
  });
});