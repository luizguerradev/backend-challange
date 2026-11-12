import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Wallet, InsufficientFundsError } from '../../src/domain/wallet/entity/wallet.entity.js';
import { Money, CurrencyMismatchError } from '../../src/domain/common/money.vo.js';
import { LedgerDirection } from '../../src/domain/wallet/entity/wallet-ledger-entry.entity.js';

describe('Wallet Aggregate', () => {
  it('deve abrir uma carteira com saldo zero sem gerar lançamento de abertura', () => {
    const { wallet, openingEntry } = Wallet.open({
      id: randomUUID(),
      playerId: 'player-1',
      initialBalance: Money.zero('BRL'),
    });

    expect(wallet.balance.amount.toNumber()).toBe(0);
    expect(wallet.currency).toBe('BRL');
    expect(wallet.version).toBe(1);
    expect(openingEntry).toBeUndefined();
  });

  it('deve abrir uma carteira com saldo positivo e gerar lançamento OPENING no ledger', () => {
    const initialMoney = Money.from({ amount: '500.00', currency: 'BRL' });
    const { wallet, openingEntry } = Wallet.open({
      id: randomUUID(),
      playerId: 'player-1',
      initialBalance: initialMoney,
    });

    expect(wallet.balance.toString()).toBe('500.00');
    expect(openingEntry).toBeDefined();
    expect(openingEntry!.direction).toBe(LedgerDirection.CREDIT);
    expect(openingEntry!.balanceBefore.toString()).toBe('0.00');
    expect(openingEntry!.balanceAfter.toString()).toBe('500.00');
  });

  it('deve creditar fundos e gerar um registro de ledger balanceado e incrementar versão', () => {
    const { wallet } = Wallet.open({
      id: randomUUID(),
      playerId: 'player-1',
      initialBalance: Money.zero('BRL'),
    });
    const creditAmount = Money.from({ amount: '100.50', currency: 'BRL' });

    const entry = wallet.credit(creditAmount, 'tx-1');

    expect(wallet.balance.toString()).toBe('100.50');
    expect(wallet.version).toBe(2);
    expect(entry.direction).toBe(LedgerDirection.CREDIT);
    expect(entry.money.toString()).toBe('100.50');
    expect(entry.balanceBefore.toString()).toBe('0.00');
    expect(entry.balanceAfter.toString()).toBe('100.50');
    expect(entry.isBalanced()).toBe(true);
  });

  it('deve debitar fundos quando houver saldo suficiente e incrementar versão', () => {
    const { wallet } = Wallet.open({
      id: randomUUID(),
      playerId: 'player-1',
      initialBalance: Money.from({ amount: '200.00', currency: 'BRL' }),
    });
    const debitAmount = Money.from({ amount: '50.00', currency: 'BRL' });

    const entry = wallet.debit(debitAmount, 'tx-2');

    expect(wallet.balance.toString()).toBe('150.00');
    expect(wallet.version).toBe(2);
    expect(entry.direction).toBe(LedgerDirection.DEBIT);
    expect(entry.balanceBefore.toString()).toBe('200.00');
    expect(entry.balanceAfter.toString()).toBe('150.00');
    expect(entry.isBalanced()).toBe(true);
  });

  it('deve lançar InsufficientFundsError ao tentar debitar valor maior que o saldo', () => {
    const { wallet } = Wallet.open({
      id: randomUUID(),
      playerId: 'player-1',
      initialBalance: Money.from({ amount: '10.00', currency: 'BRL' }),
    });
    const debitAmount = Money.from({ amount: '50.00', currency: 'BRL' });

    expect(() => wallet.debit(debitAmount, 'tx-3')).toThrow(InsufficientFundsError);
    expect(wallet.version).toBe(1); // Não incrementa versão quando a operação falha
  });

  it('deve rejeitar operações com moedas divergentes', () => {
    const { wallet } = Wallet.open({
      id: randomUUID(),
      playerId: 'player-1',
      initialBalance: Money.zero('BRL'),
    });
    const usdMoney = Money.from({ amount: '10.00', currency: 'USD' });

    expect(() => wallet.credit(usdMoney, 'tx-4')).toThrow(Error);
    expect(() => wallet.debit(usdMoney, 'tx-5')).toThrow(Error);
  });
});