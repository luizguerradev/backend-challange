import { describe, it, expect } from 'vitest';
import { Wallet, InsufficientFundsError, CurrencyMismatchError } from '../../src/domain/wallet/entity/wallet.entity.js';
import { Money } from '../../src/domain/common/money.vo';
import { LedgerDirection } from '../../src/domain/wallet/entity/wallet-ledger-entry.entity.js';

describe('Wallet Aggregate', () => {
  it('deve criar uma carteira com saldo zerado por padrão', () => {
    const wallet = Wallet.create('player-1', 'BRL');
    expect(wallet.balance.amount.toNumber()).toBe(0);
    expect(wallet.currency).toBe('BRL');
  });

  it('deve creditar fundos e gerar um registro de ledger imutável correto', () => {
    const wallet = Wallet.create('player-1', 'BRL');
    const creditAmount = Money.fromNumber(100.5, 'BRL');

    const entry = wallet.credit(creditAmount, 'tx-1');

    expect(wallet.balance.format()).toBe('100.50');
    expect(entry.direction).toBe(LedgerDirection.CREDIT);
    expect(entry.amount.format()).toBe('100.50');
    expect(entry.balanceBefore.format()).toBe('0.00');
    expect(entry.balanceAfter.format()).toBe('100.50');
  });

  it('deve debitar fundos quando houver saldo suficiente', () => {
    const wallet = Wallet.create('player-1', 'BRL', Money.fromNumber(200, 'BRL'));
    const debitAmount = Money.fromNumber(50, 'BRL');

    const entry = wallet.debit(debitAmount, 'tx-2');

    expect(wallet.balance.format()).toBe('150.00');
    expect(entry.direction).toBe(LedgerDirection.DEBIT);
    expect(entry.balanceBefore.format()).toBe('200.00');
    expect(entry.balanceAfter.format()).toBe('150.00');
  });

  it('deve lançar InsufficientFundsError ao tentar debitar valor maior que o saldo', () => {
    const wallet = Wallet.create('player-1', 'BRL', Money.fromNumber(10, 'BRL'));
    const debitAmount = Money.fromNumber(50, 'BRL');

    expect(() => wallet.debit(debitAmount, 'tx-3')).toThrow(InsufficientFundsError);
  });

  it('deve rejeitar operações com moedas divergentes', () => {
    const wallet = Wallet.create('player-1', 'BRL');
    const usdMoney = Money.fromNumber(10, 'USD');

    expect(() => wallet.credit(usdMoney, 'tx-4')).toThrow(CurrencyMismatchError);
    expect(() => wallet.debit(usdMoney, 'tx-5')).toThrow(CurrencyMismatchError);
  });
});