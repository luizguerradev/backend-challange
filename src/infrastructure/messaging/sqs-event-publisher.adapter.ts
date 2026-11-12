import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { EventPublisherPort, PublishMessageInput } from '../../domain/messaging/ports/event-publisher.port.js';

export class SqsEventPublisherAdapter implements EventPublisherPort {
  private client: SQSClient;
  private queueUrl: string;

  constructor(queueUrl?: string, endpoint?: string) {
    this.queueUrl = queueUrl ?? process.env.SQS_EVENTS_QUEUE_URL ?? 'http://localhost:4566/000000000000/wager-events.fifo';
    this.client = new SQSClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      endpoint: endpoint ?? process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
      },
    });
  }

  async publish(input: PublishMessageInput): Promise<void> {
    const isFifo = this.queueUrl.endsWith('.fifo');
    const command = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(input.payload),
      MessageDeduplicationId: isFifo ? input.messageId : undefined,
      MessageGroupId: isFifo ? (input.payload.aggregateId as string ?? input.eventType) : undefined,
    });

    await this.client.send(command);
  }

  async publishBatch(inputs: PublishMessageInput[]): Promise<void> {
    for (const input of inputs) {
      await this.publish(input);
    }
  }
}