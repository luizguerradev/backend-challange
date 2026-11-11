import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import type { WalletRepositoryInterface } from '../../../domain/wallet/repository/wallet.repository.interface';
import type { Wallet } from '../../../domain/wallet/entity/wallet.entity';
import type { WalletLedgerEntry } from '../../../domain/wallet/entity/wallet-ledger-entry.entity';
import { WalletOrmEntity } from '../entities/wallet.orm-entity';
import { WalletMapper } from '../mappers/wallet.mapper';

export class MikroWalletRepository implements WalletRepositoryInterface {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<Wallet | null> {
    const orm = await this.em.findOne(WalletOrmEntity, { id });
    return orm ? WalletMapper.toDomain(orm) : null;
  }

  async findByPlayerId(playerId: string, currency: string): Promise<Wallet | null> {
    const orm = await this.em.findOne(WalletOrmEntity, { playerId, currency });
    return orm ? WalletMapper.toDomain(orm) : null;
  }

  /**
   * Bloqueia a linha no PostgreSQL com SELECT ... FOR UPDATE
   * Garante a walletId como unidade de concorrência (Seção 5.6 e 8)
   */
  async findByIdForUpdate(id: string): Promise<Wallet | null> {
    const orm = await this.em.findOne(WalletOrmEntity, { id }, {
      lockMode: LockMode.PESSIMISTIC_WRITE,
    });
    return orm ? WalletMapper.toDomain(orm) : null;
  }

  async save(wallet: Wallet, ledgerEntry?: WalletLedgerEntry): Promise<void> {
    const walletOrm = WalletMapper.toOrmEntity(wallet);

    // Enfileira a carteira no Unit of Work via upsert
    await this.em.upsert(WalletOrmEntity, walletOrm);

    // Se houver lançamento de ledger, enfileira a entidade no Unit of Work
    if (ledgerEntry) {
      const ledgerOrm = WalletMapper.ledgerEntryToOrmEntity(ledgerEntry);
      this.em.persist(ledgerOrm);
    }

    // Comita tudo atomicamente na mesma transação
    await this.em.flush();
  }
}