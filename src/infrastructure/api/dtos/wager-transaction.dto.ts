import { IsString, IsNotEmpty, IsEnum, IsObject, ValidateNested, IsOptional, Matches, NotEquals } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WagerTransactionKind } from '../../../domain/wager/entity/wager-transaction.entity.js';

class MoneyDto {
  @ApiProperty({ example: '25.00', description: 'String decimal exata com 2 casas' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+\.\d{2}$/, { message: 'amount deve ser uma string decimal positiva com exatamente 2 casas decimais (ex: "25.00")' })
  amount!: string;

  @ApiProperty({ example: 'BRL', description: 'Código ISO-4217 de 3 letras' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{3}$/, { message: 'currency deve ser um código ISO-4217 válido de 3 letras maiúsculas' })
  currency!: string;
}

export class CreateWagerTransactionDto {
  @ApiProperty({ example: 'provider-a' })
  @IsString()
  @IsNotEmpty()
  providerId!: string;

  @ApiProperty({ example: 'transaction-123' })
  @IsString()
  @IsNotEmpty()
  externalTransactionId!: string;

  @ApiProperty({ example: '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1' })
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @ApiProperty({ example: '0192f291-27dd-7d3f-8071-5f8685deef37' })
  @IsString()
  @IsNotEmpty()
  walletId!: string;

  @ApiProperty({ example: 'round-987' })
  @IsString()
  @IsNotEmpty()
  roundId!: string;

  @ApiProperty({ example: 'fortune-chimp' })
  @IsString()
  @IsNotEmpty()
  gameId!: string;

  @ApiProperty({
    enum: [
      WagerTransactionKind.BET,
      WagerTransactionKind.WIN,
      WagerTransactionKind.LOSS,
      WagerTransactionKind.REFUND,
      WagerTransactionKind.ROLLBACK,
    ],
    example: WagerTransactionKind.BET,
  })
  @IsEnum(WagerTransactionKind)
  @NotEquals(WagerTransactionKind.OPENING, { message: 'Operação OPENING é exclusiva para uso interno e não pode ser submetida via API' })
  kind!: WagerTransactionKind;

  @ApiProperty({ type: MoneyDto })
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyDto)
  money!: MoneyDto;

  @ApiPropertyOptional({ example: 'transaction-122', description: 'Obrigatório para REFUND e ROLLBACK' })
  @IsOptional()
  @IsString()
  referenceExternalTransactionId?: string;
}