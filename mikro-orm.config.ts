import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import 'dotenv/config';

export default defineConfig({
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  user: process.env.DATABASE_USER ?? 'wagering_user',
  password: process.env.DATABASE_PASSWORD ?? 'wagering_pass',
  dbName: process.env.DATABASE_NAME ?? 'wagering_db',
  entities: ['./dist/**/*.entity.js'],
  entitiesTs: ['./src/**/*.entity.ts'],
  discovery: {
    warnWhenNoEntities: false,},
  extensions: [Migrator],
  migrations: {
    path: './dist/infrastructure/database/migrations',
    pathTs: './src/infrastructure/database/migrations',
    glob: '!(*.d).{js,ts}',
    transactional: true,
  },
  debug: process.env.NODE_ENV === 'development',
});