import { Decimal } from 'decimal.js';

export interface MoneyProps {
  amount: string;   
  currency: string; 
}

export class InvalidMoneyAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoneyAmountError';
  }
}

export class CurrencyMismatchError extends Error {
  constructor(expected: string, received: string) {
    super(`Currency mismatch: expected ${expected}, got ${received}`);
    this.name = 'CurrencyMismatchError';
  }
}

export class Money {
  private static readonly DECIMAL_REGEX = /^-?\d+(\.\d{1,2})?$/;

  private constructor(
    private readonly value: Decimal,
    public readonly currency: string,
  ) {}

  static from(props: MoneyProps): Money {
    if (!props.amount || typeof props.amount !== 'string') {
      throw new InvalidMoneyAmountError('Amount must be a non-empty string');
    }

    const trimmed = props.amount.trim();
    if (!Money.DECIMAL_REGEX.test(trimmed)) {
      throw new InvalidMoneyAmountError(`Invalid amount format: "${props.amount}". Max 2 decimal places allowed.`);
    }

    try {
      const dec = new Decimal(trimmed);
      if (!dec.isFinite()) {
        throw new InvalidMoneyAmountError('Amount must be finite');
      }
      return new Money(dec.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN), props.currency.toUpperCase());
    } catch {
      throw new InvalidMoneyAmountError(`Invalid money amount: "${props.amount}"`);
    }
  }

  static zero(currency: string): Money {
    return new Money(new Decimal(0), currency.toUpperCase());
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.plus(other.value), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.minus(other.value), this.currency);
  }

  negate(): Money {
    return new Money(this.value.negated(), this.currency);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.isPositive() && !this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative();
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThan(other.value);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  toJSON(): MoneyProps {
    return {
      amount: this.toString(),
      currency: this.currency,
    };
  }

  toString(): string {
    return this.value.toFixed(2);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  get amount(): Decimal {
    return this.value;
  }
}