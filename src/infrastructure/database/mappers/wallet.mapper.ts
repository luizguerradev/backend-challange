import { Wallet } from '../../../domain/wallet/entity/wallet.entity';
import { WalletLedgerEntry, LedgerDirection } from '../../../domain/wallet/entity/wallet-ledger-entry.entity';
import { Money } from '../../../domain/common/money.vo';
import { WalletOrmEntity } from '../entities/wallet.orm-entity';
import { WalletLedgerEntryOrmEntity } from '../entities/wallet-ledger-entry.orm-entity';

export class WalletMapper {
  static toDomain(orm: WalletOrmEntity): Wallet {
    return Wallet.rehydrate({
      id: orm.id,
      playerId: orm.playerId,
      currency: orm.currency,
      balance: Money.from({ amount: orm.balance, currency: orm.currency }),
      version: orm.version,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    });
  }

  static toOrmEntity(domain: Wallet): WalletOrmEntity {
    const entity = new WalletOrmEntity();
    entity.id = domain.id;
    entity.playerId = domain.playerId;
    entity.currency = domain.currency;
    entity.balance = domain.balance.toString();
    entity.version = domain.version;
    entity.createdAt = domain.createdAt;
    entity.updatedAt = domain.updatedAt;
    return entity;
  }

static ledgerEntryToOrmEntity(domain: WalletLedgerEntry): WalletLedgerEntryOrmEntity {
    const entity = new WalletLedgerEntryOrmEntity();
    entity.id = domain.id;
    entity.walletId = domain.walletId;
    entity.transactionId = domain.transactionId;
    entity.direction = domain.direction;
    entity.amount = domain.money.toString();
    entity.currency = domain.money.currency;
    entity.balanceBefore = domain.balanceBefore.toString();
    entity.balanceAfter = domain.balanceAfter.toString();
    entity.createdAt = domain.createdAt;
    return entity;
  }
}