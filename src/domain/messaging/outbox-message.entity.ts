import { randomUUID } from 'node:crypto';

export interface EnqueueOutboxProps {
  id?: string;
  aggregateId: string;
  eventType: string;
  payload: Readonly<Record<string, unknown>>;
  occurredAt?: Date;
}

export interface OutboxMessageState {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Readonly<Record<string, unknown>>;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt?: Date;
  publishedAt?: Date;
}

export class OutboxMessage {
  private constructor(
    public readonly id: string,
    public readonly aggregateId: string,
    public readonly eventType: string,
    public readonly payload: Readonly<Record<string, unknown>>,
    public readonly occurredAt: Date,
    private _attempts: number,
    private _nextAttemptAt?: Date,
    private _publishedAt?: Date,
  ) {}

  static enqueue(props: EnqueueOutboxProps): OutboxMessage {
    return new OutboxMessage(
      props.id ?? randomUUID(),
      props.aggregateId,
      props.eventType,
      props.payload,
      props.occurredAt ?? new Date(),
      0,
      new Date(),
    );
  }

  static rehydrate(state: OutboxMessageState): OutboxMessage {
    return new OutboxMessage(
      state.id,
      state.aggregateId,
      state.eventType,
      state.payload,
      state.occurredAt,
      state.attempts,
      state.nextAttemptAt,
      state.publishedAt,
    );
  }

  get attempts(): number { return this._attempts; }
  get nextAttemptAt(): Date | undefined { return this._nextAttemptAt; }
  get publishedAt(): Date | undefined { return this._publishedAt; }

  isPending(): boolean {
    return this._publishedAt === undefined;
  }

  isDue(now: Date = new Date()): boolean {
    if (!this.isPending()) return false;
    if (!this._nextAttemptAt) return true;
    return this._nextAttemptAt <= now;
  }

  markPublished(at: Date = new Date()): void {
    this._publishedAt = at;
  }

  scheduleRetry(now: Date = new Date()): void {
    this._attempts += 1;
    // Exponential backoff: 2s, 4s, 8s, 16s...
    const delaySeconds = Math.min(Math.pow(2, this._attempts), 60);
    this._nextAttemptAt = new Date(now.getTime() + delaySeconds * 1000);
  }
}