import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import mikroOrmConfig from '../mikro-orm.config.js';
import { WalletsController } from './infrastructure/api/controllers/wallets.controller.js';
import { WageringController } from './infrastructure/api/controllers/wagering.controller.js';
import { WalletsApplicationService } from './application/wallet/wallets.service.js';
import { ProcessWagerTransactionUseCase } from './application/wager/process-wager-transaction.use-case.js';

@Module({
  imports: [MikroOrmModule.forRoot(mikroOrmConfig)],
  controllers: [WalletsController, WageringController],
  providers: [WalletsApplicationService, ProcessWagerTransactionUseCase],
  exports: [WalletsApplicationService, ProcessWagerTransactionUseCase],
})
export class AppModule {}