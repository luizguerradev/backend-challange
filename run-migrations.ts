import process from 'node:process';
import { MikroORM } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import config from './mikro-orm.config.js';
import Migration20261110000001_InitialSchema from './src/infrastructure/database/migrations/Migration20261111000001_InitialCoreTables.js';

async function run() {
  console.log('🔄 Conectando ao PostgreSQL...');
  const orm = await MikroORM.init(config);

  try {
    console.log('🚀 Executando migration inicial...');
    const migrator = new Migrator(orm.em);
    
    // Executa a migration inicial diretamente
    const migration = new Migration20261110000001_InitialSchema(orm.em.getDriver(), orm.config);
    await migration.up();

    // Executa todos os comandos SQL gerados dentro da transação
    const queries = migration.getQueries();
    await orm.em.transactional(async (em) => {
      for (const query of queries) {
        await em.execute(query);
      }
    });

    console.log(`✅ ${queries.length} queries executadas com sucesso no PostgreSQL!`);
  } finally {
    await orm.close(true);
  }
}

run().catch((err) => {
  console.error('❌ Falha ao rodar migrations:', err);
  process.exit(1);
});