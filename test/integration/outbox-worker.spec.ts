import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { randomUUID } from 'node:crypto';
import config from '../../mikro-orm.config';
import { MikroOutboxRepository } from '../../src/infrastructure/database/repositories/mikro-outbox.repository';
import { OutboxMessage } from '../../src/domain/messaging/outbox-message.entity';
import { WalletBalanceChanged } from '../../src/domain/messaging/events/wallet-balance-changed.event';
import { LedgerDirection } from '../../src/domain/wallet/entity/wallet-ledger-entry.entity';
import { OutboxPublisherWorker } from '../../src/application/messaging/outbox-publisher.worker';
import type { EventPublisherPort, PublishMessageInput } from '../../src/domain/messaging/ports/event-publisher.port';

class InMemoryPublisherMock implements EventPublisherPort {
  public published: PublishMessageInput[] = [];
  public shouldFail = false;

  async publish(input: PublishMessageInput): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Broker connection refused');
    }
    this.published.push(input);
  }

  async publishBatch(inputs: PublishMessageInput[]): Promise<void> {
    for (const input of inputs) {
      await this.publish(input);
    }
  }
}

describe('Outbox Publisher & Concurrency Integration (PostgreSQL Real)', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init(config);
  });

  // Limpa a tabela antes de CADA teste para garantir determinismo absoluto
  beforeEach(async () => {
    await orm.em.getConnection().execute('TRUNCATE TABLE outbox_messages;');
  });

  afterAll(async () => {
    await orm.close(true);
  });

  it('dois workers simultâneos devem drenar eventos sem duplicar publicações (SKIP LOCKED)', async () => {
    const em = orm.em.fork();
    const repo = new MikroOutboxRepository(em);

    // 1. Enfileira 10 mensagens na outbox
    const messages: OutboxMessage[] = [];
    for (let i = 0; i < 10; i++) {
      const event = WalletBalanceChanged.create({
        context: { correlationId: `corr-${i}` },
        data: {
          walletId: randomUUID(),
          transactionId: randomUUID(),
          direction: LedgerDirection.CREDIT,
          money: { amount: '10.00', currency: 'BRL' },
          balanceBefore: { amount: '0.00', currency: 'BRL' },
          balanceAfter: { amount: '10.00', currency: 'BRL' },
          walletVersion: 1,
        },
      });
      messages.push(OutboxMessage.enqueue(event));
    }
    await repo.saveBatch(messages);

    // 2. Cria dois publishers e dois workers concorrentes com conexões isoladas
    const pubMock1 = new InMemoryPublisherMock();
    const pubMock2 = new InMemoryPublisherMock();

    const worker1 = new OutboxPublisherWorker(orm.em.fork(), pubMock1, { batchSize: 5 });
    const worker2 = new OutboxPublisherWorker(orm.em.fork(), pubMock2, { batchSize: 5 });
    
    // Dispara ambos em paralelo
    await Promise.all([worker1.processDueBatch(), worker2.processDueBatch()]);

    const totalPublished = pubMock1.published.length + pubMock2.published.length;
    expect(totalPublished).toBe(10);

    // Assegura que nenhum evento foi publicado mais de uma vez entre os dois workers
    const ids1 = pubMock1.published.map((p) => p.messageId);
    const ids2 = pubMock2.published.map((p) => p.messageId);
    const duplicates = ids1.filter((id) => ids2.includes(id));
    expect(duplicates).toHaveLength(0);
  });

  it('deve agendar retry com backoff quando o broker falha e recuperar na rodada seguinte', async () => {
    const em = orm.em.fork();
    const repo = new MikroOutboxRepository(em);

    const event = WalletBalanceChanged.create({
      context: { correlationId: 'corr-retry' },
      data: {
        walletId: randomUUID(),
        transactionId: randomUUID(),
        direction: LedgerDirection.DEBIT,
        money: { amount: '5.00', currency: 'BRL' },
        balanceBefore: { amount: '10.00', currency: 'BRL' },
        balanceAfter: { amount: '5.00', currency: 'BRL' },
        walletVersion: 2,
      },
    });

    const msg = OutboxMessage.enqueue(event);
    await repo.save(msg);

    const pubMock = new InMemoryPublisherMock();
    pubMock.shouldFail = true;

    // Configura o delay para apenas 100ms em vez de 1000ms para acelerar o teste
    const worker = new OutboxPublisherWorker(em, pubMock, { batchSize: 1, baseDelayMs: 100 });
    
    // Tentativa 1: falha do broker (hora 0)
    const baseTime = new Date();
    const countFailed = await worker.processDueBatch(baseTime);
    expect(countFailed).toBe(0);

    // Usa um NOVO fork do ORM para ler puramente do banco de dados, sem sujar com o cache anterior
    const queryEm = orm.em.fork();
    const queryRepo = new MikroOutboxRepository(queryEm);

    const updated = await queryRepo.findById(msg.id);
    expect(updated?.attempts).toBe(1);
    expect(updated?.isPending()).toBe(true);
    expect(updated?.nextAttemptAt).toBeDefined();

    // Tentativa 2: broker recuperado após o tempo de backoff
    pubMock.shouldFail = false;
    
    // Adiciona 5 segundos artificiais para garantir que o worker vê a mensagem novamente
    const futureTime = new Date(baseTime.getTime() + 5000); 
    const countSuccess = await worker.processDueBatch(futureTime);
    expect(countSuccess).toBe(1);

    const published = await queryRepo.findById(msg.id);
    expect(published?.isPending()).toBe(false);
    expect(published?.publishedAt).toBeDefined();
  });
});