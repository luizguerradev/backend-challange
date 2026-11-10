# 🎰 Wagering & Real-Time Wallet Core Engine

Motor financeiro distribuído de alta concorrência e processamento de apostas (Wagering API), desenhado sob os padrões de **Domain-Driven Design (DDD)**, **Double-Entry Bookkeeping (Ledger Imutável)** e mensageria confiável com **Transactional Outbox & Inbox Pattern**.

Projetado para operar com **zero tolerância a balance drift**, proteção estrita contra **race conditions** em carteiras de alta concorrência (*hot-wallets*) e garantia de **exatamente-uma-vez (effectively once)** no processamento de webhooks de provedores de jogos.

---

## 🏛️ Destaques de Arquitetura & Engenharia

* **Domínio Rico & Puro (DDD):** Entidades `Wallet`, `WalletLedgerEntry` e `WagerTransaction` totalmente desacopladas de frameworks e ORM, protegendo invariantes de negócio na memória antes da persistência.
* **Aritmética Financeira Determinística:** Value Object `Money` baseado em `Decimal.js` com arredondamento bancário (`HALF_EVEN`) a 2 casas decimais, eliminando imprecisões de ponto flutuante binário.
* **Ledger Imutável (Append-Only):** Todo débito ou crédito na carteira gera um registro estático de extrato contendo `balance_before` e `balance_after`. Uma trigger nativa em PL/pgSQL no PostgreSQL bloqueia fisicamente qualquer tentativa de `UPDATE` ou `DELETE` na tabela de extrato.
* **Controle de Concorrência Pessimista:** Utilização de `SELECT ... FOR UPDATE` nas consultas de saldo para enfileirar operações na mesma carteira sem risco de saldo negativo ou leitura inconsistente sob tráfego concorrente.
* **Idempotência Atômica:** Chave composta única em banco (`provider_id` + `external_transaction_id`) associada a verificação de hash SHA-256 do payload, detectando tentativas de repetição e impedindo adulteração de dados.
* **Garantia de Entrega Distribuída:** 
  * **Transactional Outbox:** Eventos publicados na mesma transação atômica do saldo.
  * **Inbox Pattern:** Consumo de filas **AWS SQS FIFO** com controle de deduplicação e roteamento para **Dead Letter Queue (DLQ)**.

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
| :--- | :--- |
| **Runtime & Package Manager** | [Bun](https://bun.sh/) (Engine nativo de alta performance) |
| **Linguagem** | TypeScript 5.x (Strict mode ativo) |
| **Framework Web** | NestJS |
| **Banco de Dados Relacional** | PostgreSQL 16 (Alpine) via Docker |
| **Mapeamento & Migrations** | MikroORM v7 (Driver PostgreSQL) |
| **Mensageria & Cloud Mock** | AWS SQS FIFO emulado via LocalStack |
| **Test Runner & Asserções** | Vitest |

---

## 📂 Estrutura de Pastas

```text
src/
├── domain/                      # Camada de Domínio Puro (Agnóstica a Frameworks)
│   ├── common/                  # Value Objects compartilhados (Money VO)
│   ├── wallet/                  # Agregado Wallet, Ledger e Regras de Saldo
│   │   ├── entity/
│   │   ├── value-objects/
│   │   └── repository/
│   └── wager/                   # Transações de apostas, Máquina de Estados e Idempotência
│       ├── entity/
│       ├── value-objects/
│       └── repository/
├── infrastructure/              # Adaptadores de Entrada e Saída
│   ├── database/                # Entidades MikroORM, Mappers e Migrações SQL
│   │   ├── entities/
│   │   ├── mappers/
│   │   └── migrations/
│   └── messaging/               # Clientes AWS SQS, Poller de Outbox e Consumer de Inbox
└── presentation/                # Controladores HTTP, DTOs e Swagger OpenAPI
    └── http/
```

---

## 🚀 Como Executar o Ambiente

### 1. Pré-requisitos
* Docker e Docker Compose instalados.
* Bun instalado (`>= 1.2`).

### 2. Subir os Contêineres (PostgreSQL + LocalStack SQS)
```bash
docker compose up -d
```

### 3. Instalar Dependências
```bash
bun install
```

### 4. Executar as Migrações do Banco de Dados
Aplica o schema, restrições e triggers de imutabilidade no PostgreSQL:
```bash
bun run run-migrations.ts
```

### 5. Executar a Aplicação em Desenvolvimento
```bash
bun run start:dev
```

---

## 🧪 Testes Automatizados

O projeto mantém suítes isoladas de testes unitários rápidos e testes de estresse/concorrência:

```bash
# Executa todos os testes unitários do domínio
bun run test

# Executa os testes de integração e ponta a ponta (E2E)
bun run test:e2e

# Executa testes com relatório de cobertura
bun test --coverage
```

---

## 🗺️ Roadmap de Implementação

- [x] **Issue #1:** Core Aggregates & Value Objects (`Wallet`, `Ledger`, `Wager`, `Money VO`)
- [ ] **Issue #2:** Mapeamentos MikroORM e Repositórios com Pessimistic Locking
- [ ] **Issue #3:** Filtro Atômico de Idempotência e Validação de Payload Hash
- [ ] **Issue #4:** Transactional Outbox Pattern & Background SQS FIFO Publisher
- [ ] **Issue #5:** Consumidor SQS FIFO com Inbox Pattern e DLQ
- [ ] **Issue #6:** Endpoints HTTP Webhooks (`/bet`, `/win`, `/rollback`) e Swagger
- [ ] **Issue #7:** Testes de Carga & Estresse de Concorrência (100 requisições simultâneas sem drift)