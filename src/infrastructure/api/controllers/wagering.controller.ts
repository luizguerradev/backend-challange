import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  Res,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiSecurity } from '@nestjs/swagger';
import type { Response } from 'express';
import { CreateWagerTransactionDto } from '../dtos/wager-transaction.dto.js';
import { ProcessWagerTransactionUseCase } from '../../../application/wager/process-wager-transaction.use-case.js';
import { WagerTransactionStatus } from '../../../domain/wager/entity/wager-transaction.entity.js';

@ApiTags('Wagering')
@Controller()
export class WageringController {
  constructor(private readonly processWagerUseCase: ProcessWagerTransactionUseCase) {}

  @Post('wagering/transactions')
  @ApiSecurity('Idempotency-Key')
  @ApiOperation({ summary: 'Submeter transação de aposta (BET, WIN, LOSS, REFUND, ROLLBACK)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Chave única de idempotência do provedor' })
  @ApiResponse({ status: 200, description: 'Transação processada com sucesso (ou replay idêntico).' })
  @ApiResponse({ status: 202, description: 'Transação aceita, aguardando transação referenciada (PENDING_REFERENCE).' })
  @ApiResponse({ status: 400, description: 'Payload inválido ou ausência de Idempotency-Key.' })
  @ApiResponse({ status: 409, description: 'Conflito de chave de idempotência com payload divergente.' })
  @ApiResponse({ status: 422, description: 'Rejeição por regra de negócio (ex: saldo insuficiente, referência já revertida).' })
  async submitTransaction(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CreateWagerTransactionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw new BadRequestException('O cabeçalho Idempotency-Key é obrigatório.');
    }

    const result = await this.processWagerUseCase.execute({
      idempotencyKey: idempotencyKey.trim(),
      providerId: dto.providerId,
      externalTransactionId: dto.externalTransactionId,
      playerId: dto.playerId,
      walletId: dto.walletId,
      roundId: dto.roundId,
      gameId: dto.gameId,
      kind: dto.kind,
      money: dto.money,
      referenceExternalTransactionId: dto.referenceExternalTransactionId,
    });

    // Distingue claramente no status HTTP conforme exigido na Seção 9:
    // 200 OK -> PROCESSED
    // 202 Accepted -> PENDING_REFERENCE
    // 422 Unprocessable Entity -> REJECTED (mantendo o corpo com transactionId, status, balance e failureCode)
    if (result.status === WagerTransactionStatus.REJECTED) {
      res.status(HttpStatus.UNPROCESSABLE_ENTITY);
    } else if (result.status === WagerTransactionStatus.PENDING_REFERENCE) {
      res.status(HttpStatus.ACCEPTED);
    } else {
      res.status(HttpStatus.OK);
    }

    return result;
  }

  @Get('wagering/transactions/:transactionId')
  @ApiOperation({ summary: 'Consultar transação pelo ID interno' })
  @ApiResponse({ status: 200, description: 'Detalhes da transação.' })
  @ApiResponse({ status: 404, description: 'Transação não encontrada.' })
  async getTransactionById(@Param('transactionId') transactionId: string) {
    return this.processWagerUseCase.getTransactionById(transactionId);
  }

  @Get('providers/:providerId/wagering/transactions/:externalTransactionId')
  @ApiOperation({ summary: 'Consultar transação pelo providerId e externalTransactionId' })
  @ApiResponse({ status: 200, description: 'Detalhes da transação no provedor.' })
  @ApiResponse({ status: 404, description: 'Transação não encontrada.' })
  async getTransactionByExternalId(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
  ) {
    return this.processWagerUseCase.getTransactionByExternalId(providerId, externalTransactionId);
  }
}