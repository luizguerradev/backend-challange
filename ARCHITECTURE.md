# Architecture Decision Records (ADR) - Wagering & Wallet Engine

Este documento registra as decisões arquiteturais fundamentais tomadas durante o design e a implementação do backend de pagamentos e carteiras para a plataforma de wagering, cobrindo consistência transacional, concorrência, idempotência e resiliência.

---

## ADR 01: Escolha do Banco de Dados PostgreSQL & MikroORM (SQL EntitySchema)
* **Status:** Aceito
* **Contexto:** Precisávamos de garantias ACID estritas, tipos decimais exatos para valores monetários (evitando erros de ponto flutuante de IEE 754) e suporte a locks pessimistas nativos.
* **Decisão:** Utilização do PostgreSQL em conjunto com o MikroORM configurado com `EntitySchema` explícito (sem decoradores mágicos de ORM acoplados às entidades de domínio).
* **Consequências:** Isolamento completo entre o domínio puro (Domain Layer) e a persistência (ORM/Database), controle total sobre transações SQL nativas e máxima performance em consultas complexas e concorrência.

---

## ADR 02: Padrão Transacional de Outbox para Integração Asíncrona (SQS)
* **Status:** Aceito
* **Contexto:** Mensageria distribuída (como AWS SQS) não participa nativamente da transação de banco de dados relacional. Se publicarmos diretamente no broker após o commit, falhas de rede podem causar perda de eventos; se publicarmos antes, transações abortadas geram mensagens fantasmas.
* **Decisão:** Implementação do **Transactional Outbox Pattern**. Os eventos de domínio (ex: `WalletBalanceChanged`, `WagerTransactionProcessed`) são gravados na tabela `outbox_messages` na **mesma transação atômica** que atualiza a carteira e o ledger. Um worker em background drena a outbox usando `SELECT ... FOR UPDATE SKIP LOCKED`.
* **Consequências:** Garantia de consistência eventual (*At-Least-Once Delivery*), imunidade a falhas de rede do broker durante transações de aposta e recuperação automática de falhas via backoff exponencial.

---

## ADR 03: Controle de Concorrência & Lock Pessimista (`SELECT FOR UPDATE`)
* **Status:** Aceito
* **Contexto:** Plataformas de wagering sofrem com alta concorrência em contas de jogadores (ex: apostas simultâneas em múltiplos jogos ou crash games disparadas no mesmo segundo). Abordagens otimistas com version check causam muitas colisões e rollbacks desnecessários.
* **Decisão:** Utilização de Lock Pessimista (`SELECT ... FOR UPDATE`) na tabela de carteiras durante a transação de débito/crédito, forçando a serialização das operações de saldo por carteira no PostgreSQL.
* **Consequências:** Eliminação absoluta de condições de corrida (Race Conditions), garantia de que o saldo nunca fique negativo (rejeitando com `INSUFFICIENT_FUNDS` de forma determinística) e integridade contábil inviolável.

---

## ADR 04: Idempotência Rigorosa com Replay de Resposta & Hash de Payload
* **Status:** Aceito
* **Contexto:** Provedores de jogos reenviam webhooks e requisições HTTP em caso de timeout de rede, o que poderia duplicar débitos ou créditos nas carteiras.
* **Decisão:** Enforço obrigatório do header `Idempotency-Key` (ou chave composta por `providerId + externalTransactionId`). Se uma requisição duplicada chega com a mesma chave e payload idêntico, o sistema retorna imediatamente o resultado armazenado anteriormente com `idempotentReplay: true` e o saldo histórico observado na época. Se a chave for reutilizada com um payload diferente, rejeita-se com `409 Conflict` (`IdempotencyConflictError`).
* **Consequências:** Proteção contra double-spending, confiabilidade para integrações com terceiros e rastreabilidade total de auditoria.

---

## ADR 05: Imutabilidade do Ledger Contábil & Trigger PL/pgSQL
* **Status:** Aceito
* **Contexto:** Em sistemas financeiros e de wagering, o histórico de transações e lançamentos contábeis (Ledger) nunca pode ser modificado ou deletado por falhas ou bugs de aplicação.
* **Decisão:** Criação de uma trigger em PL/pgSQL no PostgreSQL associada à tabela `wallet_ledger_entries` que intercepta qualquer comando `UPDATE` ou `DELETE` e aborta a query imediatamente.
* **Consequências:** Segurança em nível de banco de dados (*Defense in Depth*), garantindo que mesmo um acesso administrativo direto ao banco não consiga adulterar o histórico contábil.