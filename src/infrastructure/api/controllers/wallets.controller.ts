import { Controller, Post, Body, Get, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CreateWalletDto } from '../dtos/create-wallet.dto.js';
import { WalletsApplicationService } from '../../../application/wallet/wallets.service.js';

@ApiTags('Wallets')
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsApplicationService) {}

  @Post()
  @ApiOperation({ summary: 'Criar nova carteira para o jogador (gera transação OPENING se saldo > 0)' })
  @ApiResponse({ status: 201, description: 'Carteira criada com sucesso.' })
  @ApiResponse({ status: 409, description: 'Conflito de carteira duplicada para o playerId + currency.' })
  async createWallet(@Body() dto: CreateWalletDto) {
    return this.walletsService.createWallet({
      playerId: dto.playerId,
      initialBalance: dto.initialBalance,
    });
  }

  @Get(':walletId')
  @ApiOperation({ summary: 'Consultar saldo e dados da carteira' })
  @ApiResponse({ status: 200, description: 'Dados atuais da carteira.' })
  @ApiResponse({ status: 404, description: 'Carteira não encontrada.' })
  async getWallet(@Param('walletId') walletId: string) {
    return this.walletsService.getWallet(walletId);
  }

  @Get(':walletId/ledger')
  @ApiOperation({ summary: 'Consultar extrato do ledger com paginação por cursor estável' })
  @ApiResponse({ status: 200, description: 'Lista paginada de entradas do ledger.' })
  async getLedger(
    @Param('walletId') walletId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 50,
  ) {
    return this.walletsService.getLedger(walletId, cursor, Number(limit));
  }

  @Post(':walletId/reconciliation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reconciliar saldo materializado da wallet contra a soma do ledger' })
  @ApiResponse({ status: 200, description: 'Resultado da auditoria de reconciliação.' })
  async reconcileWallet(@Param('walletId') walletId: string) {
    return this.walletsService.reconcileWallet(walletId);
  }
}