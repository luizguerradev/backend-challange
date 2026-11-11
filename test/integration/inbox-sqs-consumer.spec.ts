import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import { SQSClient } from '@aws-sdk/client-sqs';
import config from '../../mikro-orm.config';
import { SqsFifoConsumerWorker } from '../../src/infrastructure/messaging/sqs-fifo-consumer.worker';
import { MikroInboxRepository } from '../../src/infrastructure/database/repositories/mikro-inbox.repository';

// Mock do SQS Client corrigido para utilizar classes ES6
vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: class {
    send = vi.fn();
  },
  DeleteMessageCommand: class {
    type = 'Delete';
    constructor(public input: any) {}
  },
  SendMessageCommand: class {
    type = 'Send';
    constructor(public input: any) {}
  }
}));

describe('Inbox & SQS FIFO Consumer Integration', () => {
  let orm: MikroORM;
  let sqsMock: any;

  beforeAll(async () => {
    orm = await MikroORM.init(config);
  });

  beforeEach(async () => {
    await orm.em.getConnection().execute('TRUNCATE TABLE inbox_messages;');
    sqsMock = new SQSClient({}); // Agora instancia perfeitamente
  });

  afterAll(async () => {
    await orm.close(true);
  });

  it('deve processar uma mensagem exatamente uma vez (Exactly-Once)', async () => {
    let executions = 0;
    const useCaseMock = async () => { executions++; };

    const worker = new SqsFifoConsumerWorker(sqsMock, orm.em.fork(), {
      queueUrl: 'main-queue',
      dlqUrl: 'dlq-queue',
      consumerName: 'wager-processor',
      maxAttempts: 3,
    }, useCaseMock);

    const fakeMessage = {
      MessageId: 'msg-dedup-1',
      ReceiptHandle: 'handle-1',
      Body: JSON.stringify({ idempotencyKey: 'key-1' }),
      Attributes: { ApproximateReceiveCount: '1' }
    };

    // Primeira entrega
    await worker.processSingleMessage(fakeMessage);
    expect(executions).toBe(1);
    
    // Verifica se o ACK (Delete) foi chamado
    expect(sqsMock.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'Delete' }));

    // Simula redelivery do SQS (Mensagem duplicada)
    sqsMock.send.mockClear();
    await worker.processSingleMessage(fakeMessage);
    
    // A execução não deve aumentar, mas o ACK deve ser enviado novamente para limpar a fila
    expect(executions).toBe(1); 
    expect(sqsMock.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'Delete' }));

    // Verifica no banco se a deduplicação foi gravada
    const repo = new MikroInboxRepository(orm.em.fork());
    const inbox = await repo.findById('msg-dedup-1', 'wager-processor');
    expect(inbox?.isProcessed()).toBe(true);
  });

  it('deve enviar para a DLQ após falhas persistentes (> maxAttempts)', async () => {
    const errorUseCase = async () => { throw new Error('DB Lock Timeout'); };

    const worker = new SqsFifoConsumerWorker(sqsMock, orm.em.fork(), {
      queueUrl: 'main-queue',
      dlqUrl: 'dlq-queue',
      consumerName: 'wager-processor',
      maxAttempts: 3,
    }, errorUseCase);

    const fakeMessage = {
      MessageId: 'msg-fail-1',
      ReceiptHandle: 'handle-2',
      Body: JSON.stringify({ idempotencyKey: 'key-2' }),
      Attributes: { ApproximateReceiveCount: '3' } // Limite atingido
    };

    await worker.processSingleMessage(fakeMessage);

    // Verifica se mandou pra DLQ
    expect(sqsMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Send',
        input: expect.objectContaining({ QueueUrl: 'dlq-queue' })
      })
    );
    
    // E depois se deletou da fila principal (ACK da fila de entrada)
    expect(sqsMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Delete',
        input: expect.objectContaining({ QueueUrl: 'main-queue' })
      })
    );
  });
});