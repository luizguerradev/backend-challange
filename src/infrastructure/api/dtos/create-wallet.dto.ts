import { IsString, IsNotEmpty, IsObject, ValidateNested, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class InitialMoneyDto {
  @ApiProperty({ example: '1000.00', description: 'Valor decimal estrito com 2 casas' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+\.\d{2}$/, { message: 'amount deve ser uma string decimal positiva com exatamente 2 casas decimais (ex: "1000.00")' })
  amount!: string;

  @ApiProperty({ example: 'BRL', description: 'Código da moeda ISO-4217' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{3}$/, { message: 'currency deve ser um código ISO-4217 válido de 3 letras maiúsculas' })
  currency!: string;
}

export class CreateWalletDto {
  @ApiProperty({ example: '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1' })
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @ApiProperty({ type: InitialMoneyDto })
  @IsObject()
  @ValidateNested()
  @Type(() => InitialMoneyDto)
  initialBalance!: InitialMoneyDto;
}