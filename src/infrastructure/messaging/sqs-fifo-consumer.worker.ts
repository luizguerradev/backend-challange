import type { SQSClient } from '@aws-sdk/client-sqs';
import { ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { EntityManager } from '@mikro-orm/postgresql';
import { MikroInboxRepository } from '../../infrastructure/database/repositories/mikro-inbox.repository';
import { InboxMessage } from '../../domain/messaging/inbox-message.entity';

export interface SqsConsumerOptions {
  queueUrl: string;
  dlqUrl: string;
  consumerName: string;
  maxAttempts: number;
}

export class SqsFifoConsumerWorker {
  constructor(
    private readonly sqs: SQSClient,
    private readonly em: EntityManager,
    private readonly options: SqsConsumerOptions,
    // Delegate para injetar a lógica de negócio (ex: WagerUseCase)
    private readonly processUseCase: (payload: any, txEm: EntityManager) => Promise<void>
  ) {}

  async processSingleMessage(message: any): Promise<void> {
    const messageId = message.MessageId;
    const receiptHandle = message.ReceiptHandle;
    const receiveCount = Number(message.Attributes?.ApproximateReceiveCount || 1);
    
    try {
      // 1. Transação Atômica: Wager + Ledger + Outbox + Inbox
      await this.em.transactional(async (txEm) => {
        const inboxRepo = new MikroInboxRepository(txEm);
        
        // 2. Deduplicação
        const existing = await inboxRepo.findById(messageId, this.options.consumerName);
        if (existing?.isProcessed()) {
          return; // Já processada, sai da transação para fazer ACK
        }

        const payload = JSON.parse(message.Body);
        
        // 3. Executa a regra de negócio
        await this.processUseCase(payload, txEm);

        // 4. Marca no Inbox
        const inboxMsg = InboxMessage.receive({
          messageId,
          consumerName: this.options.consumerName,
          payloadHash: payload.idempotencyKey || messageId,
        });
        inboxMsg.markProcessed();
        await inboxRepo.save(inboxMsg);
      });

      // 5. ACK (Deleta do SQS) APENAS após commit bem-sucedido
      await this.ackMessage(receiptHandle);

    } catch (error: any) {
      const isBusinessError = error.name === 'DomainError' || error.name === 'InvalidTransactionStateError';

      if (isBusinessError) {
        // Erro de domínio terminal: ACK para não travar a fila FIFO
        await this.ackMessage(receiptHandle);
      } else if (receiveCount >= this.options.maxAttempts) {
        // Falha de infra/banco excedeu tentativas: Move para DLQ
        await this.moveToDlq(message);
        await this.ackMessage(receiptHandle);
      } else {
        // Falha transitória (lock, rede): Lança erro para NACK silencioso (tentativa)
        throw error;
      }
    }
  }

  private async ackMessage(receiptHandle: string): Promise<void> {
    await this.sqs.send(new DeleteMessageCommand({
      QueueUrl: this.options.queueUrl,
      ReceiptHandle: receiptHandle,
    }));
  }

  private async moveToDlq(message: any): Promise<void> {
    await this.sqs.send(new SendMessageCommand({
      QueueUrl: this.options.dlqUrl,
      MessageBody: message.Body,
      MessageGroupId: message.Attributes?.MessageGroupId || 'dlq-group',
    }));
  }
}