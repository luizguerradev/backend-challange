import type { Wallet } from '../entity/wallet.entity';
import type { WalletLedgerEntry } from '../entity/wallet-ledger-entry.entity';

export const WALLET_REPOSITORY_TOKEN = Symbol('WALLET_REPOSITORY_TOKEN');

export interface WalletRepositoryInterface {
  findById(id: string): Promise<Wallet | null>;
  findByPlayerId(playerId: string, currency: string): Promise<Wallet | null>;
  findByIdForUpdate(id: string): Promise<Wallet | null>;
  save(wallet: Wallet, ledgerEntry?: WalletLedgerEntry): Promise<void>;
}