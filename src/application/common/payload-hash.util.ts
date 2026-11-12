import { createHash } from 'node:crypto';

export interface WagerPayloadHashInput {
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: {
    amount: string;
    currency: string;
  };
  referenceExternalTransactionId?: string;
}

/**
 * Gera um SHA-256 determinístico a partir de um JSON canônico (chaves ordenadas)
 * contendo exclusivamente os campos de negócio (Seção 9).
 */
export function computeCanonicalPayloadHash(input: WagerPayloadHashInput): string {
  const canonicalObject = {
    externalTransactionId: input.externalTransactionId,
    gameId: input.gameId,
    kind: input.kind,
    money: {
      amount: input.money.amount,
      currency: input.money.currency,
    },
    playerId: input.playerId,
    providerId: input.providerId,
    referenceExternalTransactionId: input.referenceExternalTransactionId ?? null,
    roundId: input.roundId,
    walletId: input.walletId,
  };

  return createHash('sha256').update(JSON.stringify(canonicalObject)).digest('hex');
}