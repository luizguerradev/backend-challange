# Wagering & Wallet Microservice

API backend para gestão de carteiras digitais e processamento de transações de apostas em um ambiente de gaming. A aplicação foi construída com NestJS, Bun, PostgreSQL e MikroORM, seguindo princípios de DDD, Clean Architecture e Transactional Outbox.

## Visão geral

Este serviço foi desenhado para atender cenários de iGaming com:

- criação e consulta de carteiras por jogador;
- manutenção de saldo e extrato contábil;
- processamento de transações de aposta (`BET`, `WIN`, `LOSS`, `REFUND`, `ROLLBACK`);
- idempotência por `Idempotency-Key` para evitar processamento duplicado;
- auditoria de reconciliação entre saldo materializado e soma do ledger;
- publicação de eventos via outbox para integrações assíncronas.

## Stack principal

- Node.js / TypeScript
- NestJS
- Bun
- PostgreSQL
- MikroORM
- LocalStack (SQS)
- Swagger / OpenAPI

## Arquitetura

A estrutura do projeto organiza responsabilidades em camadas bem definidas:

```text
src/
├── domain/                  # Entidades, value objects e regras de negócio puras
│   ├── wallet/              # Agregado de Carteiras (Regras de saldo, crédito, débito e moedas)
│   ├── wagering/            # Entidades de Apostas e Transações (BET, WIN, LOSS, REFUND, ROLLBACK)
│   └── shared/              # Objetos de valor compartilhados (Money, Eventos de Domínio)
├── application/             # Casos de uso e serviços de aplicação
│   ├── wallet/              # Serviços de gestão de carteiras e reconciliação
│   └── wager/               # Processamento transacional de apostas com recuperação de fora de ordem
└── infrastructure/          # Camada externa e adaptadores
├── api/                 # Controladores HTTP (REST), DTOs, Filtros de Exceção Globais
├── persistence/         # Repositórios MikroORM, EntitySchemas, Mapeadores e Migrations
└── observability/       # Middleware de Correlation IDs, Structured JSON Logging e Health Checks
```

### Principais Padrões e Decisões Aplicadas:

* **Clean Architecture & DDD:** Isolamento total da regra de negócio na camada de domínio, livre de acoplamento direto com frameworks ou ORM.
* **Lock Pessimista (`SELECT FOR UPDATE`):** Utilizado nativamente nas transações de saldo para serializar acessos simultâneos na mesma carteira, prevenindo condições de corrida (*race conditions*) e garantindo que o saldo nunca fique negativo.
* **Transactional Outbox Pattern:** Garante consistência eventual e publicação atômica de eventos de integração via tabela outbox e workers com `SKIP LOCKED`.
* **Idempotência Rigorosa:** Enforço de chaves de idempotência (`Idempotency-Key` / hash de payload) para evitar *double-spending* e garantir replay seguro de requisições.
* **Imutabilidade do Ledger Contábil:** Proteção em nível de banco de dados por meio de triggers PL/pgSQL que impedem qualquer comando de `UPDATE` ou `DELETE` no histórico de lançamentos.

## Pré-requisitos

Antes de iniciar o projeto, certifique-se de ter instalado:

- [Bun](https://bun.sh/)
- [Docker Compose](https://docs.docker.com/compose/)

## Inicialização rápida

### 1) Subir infraestrutura local

```bash
docker compose up -d
```

Esse comando inicia:

- PostgreSQL em `localhost:5432`
- LocalStack em `localhost:4566` para SQS

### 2) Instalar dependências

```bash
bun install
```

### 3) Executar migrations

```bash
bun run migration:up
```

### 4) Rodar a aplicação em desenvolvimento

```bash
bun run start:dev
```

A API será iniciada em:

- `http://localhost:3000/api/v1`
- documentação Swagger em `http://localhost:3000/docs`

## Variáveis de ambiente

O projeto usa valores padrão para desenvolvimento local, mas também aceita overrides por variáveis de ambiente:

```bash
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=wagering_user
DATABASE_PASSWORD=wagering_pass
DATABASE_NAME=wagering_db
PORT=3000
```

## Fluxo de uso

### Carteiras

#### Criar carteira

```http
POST /api/v1/wallets
Content-Type: application/json
```

```json
{
  "playerId": "player-123",
  "initialBalance": 100.00
}
```

#### Consultar carteira

```http
GET /api/v1/wallets/:walletId
```

#### Consultar ledger

```http
GET /api/v1/wallets/:walletId/ledger?limit=50&cursor=...
```

#### Reconciliar carteira

```http
POST /api/v1/wallets/:walletId/reconciliation
```

### Wagering / transações

#### Processar transação

```http
POST /api/v1/wagering/transactions
Idempotency-Key: <chave-unica>
Content-Type: application/json
```

```json
{
  "providerId": "provider-1",
  "externalTransactionId": "txn-001",
  "playerId": "player-123",
  "walletId": "wallet-456",
  "roundId": "round-9",
  "gameId": "game-abc",
  "kind": "BET",
  "money": {
    "amount": 25.00,
    "currency": "BRL"
  }
}
```

Condições importantes:

- o header `Idempotency-Key` é obrigatório;
- transações duplicadas com mesma chave e payload idêntico são tratadas como replay;
- divergência de payload com a mesma chave gera conflito;
- regras de negócio podem rejeitar operações, como saldo insuficiente.

#### Consultar transação por ID interno

```http
GET /api/v1/wagering/transactions/:transactionId
```

#### Consultar transação por provedor e ID externo

```http
GET /api/v1/providers/:providerId/wagering/transactions/:externalTransactionId
```

## Testes

Para executar a suíte de testes do projeto:

```bash
bun test
```

Para rodar a suíte e2e:

```bash
bun run test:e2e
```

Para checar o código com lint:

```bash
bun run lint
```

## Observabilidade e documentação

- Swagger/OpenAPI: `http://localhost:3000/docs`
- A aplicação expõe documentação e status de operação por meio do NestJS e do padrão de arquitetura adotado

## Observações importantes

- a API usa prefixo global `api/v1`;
- a documentação OpenAPI descreve melhor os contratos esperados;
- a camada de domínio e as regras de negócio ficam isoladas da infraestrutura;
- o processamento assíncrono de eventos é feito por outbox, favorecendo consistência e resiliência.

## Licença

Este projeto está sob licença pública, pois é um desafio técnico [link](https://github.com/junglegaming/backend-challenge)
