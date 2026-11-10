import { Decimal } from 'decimal.js';
export class InvalidMoneyAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoneyAmountError';
  }
}

export class Money {
  private readonly _amount: Decimal;
  private readonly _currency: string;

  private constructor(amount: Decimal, currency: string) {
    this._amount = amount;
    this._currency = currency.toUpperCase(); 
  }

  static fromNumber(amount: number, currency: string): Money {
    if (!Number.isFinite(amount)) {
      throw new InvalidMoneyAmountError('Amount must be a finite number');
    }
    return new Money(new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN), currency);
  }

  static fromString(amount: string, currency: string): Money {
    try {
      const dec = new Decimal(amount);
      return new Money(dec.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN), currency);
    } catch {
      throw new InvalidMoneyAmountError(`Invalid money representation: ${amount}`);
    }
  }

  static zero(currency: string): Money {
    return new Money(new Decimal(0), currency);
  }

  add(other: Money): Money {
    this.assertCurrencyMatch(other);
    return new Money(this._amount.plus(other._amount), this._currency);
  }

  subtract(other: Money): Money {
    this.assertCurrencyMatch(other);
    return new Money(this._amount.minus(other._amount), this._currency);
  }

  isLessThan(other: Money): boolean {
    this.assertCurrencyMatch(other);
    return this._amount.lessThan(other._amount);
  }

  isNegative(): boolean {
    return this._amount.isNegative();
  }

  format(): string {
    return this._amount.toFixed(2);
  }

  private assertCurrencyMatch(other: Money): void {
    if (this._currency !== other._currency) {
      throw new Error(`Currency mismatch: ${this._currency} vs ${other._currency}`);
    }
  }

  get amount(): Decimal {
    return this._amount;
  }

  get currency(): string {
    return this._currency;
  }
}