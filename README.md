# PDI Portal

Monorepo TypeScript para uma plataforma de PDI com backend, frontend, canvas colaborativo em tempo real e manifestos para execução em cluster Kubernetes.

## Visao Geral

O projeto entrega uma experiencia de PDI com login, administracao de usuarios, gerenciamento de PDIs e um board visual inspirado em ferramentas de whiteboard colaborativo. O ambiente local sobe com um PDI de exemplo chamado `Software Developer Skills Roadmap`, pronto para validar o fluxo completo.

## Stack

- `Node.js` com `Fastify` no backend
- `Angular` no frontend
- Canvas visual modular com componentes Angular
- `Prisma` com `PostgreSQL`
- `Zod` para contratos compartilhados
- `Docker Compose` para ambiente local
- Manifestos Kubernetes em `infra/k8s`

## Estrutura

```text
apps/
  api/       API HTTP/WebSocket, autenticacao, usuarios, PDIs e boards
  web/       Interface web, login, area admin e canvas colaborativo
packages/
  contracts/ Schemas e tipos compartilhados entre frontend e backend
infra/
  k8s/       Manifests base para namespace, PostgreSQL, API e Web
```

## Funcionalidades

- Login de administrador e colaborador
- Gerenciamento de usuarios pelo administrador
- Criacao, edicao e remocao de PDIs
- Vinculo de PDI com usuario responsavel
- Board visual por PDI
- Colaboracao em tempo real via WebSocket
- Elementos de canvas: texto, post-it, sticker, task, lista de tasks, goal, card, frame e shapes
- Edicao de texto inline nos elementos
- Redimensionamento de elementos com ajuste automatico de fonte
- Formatacao de texto com alinhamento horizontal e vertical
- Alteracao de cor e background
- Conectores entre elementos com handles visiveis no item selecionado
- Edges com texto, cor, linha continua ou tracejada
- Seed padrao com o board `Software Developer Skills Roadmap`

## Requisitos

- `Node.js` 22+
- `npm` 10+
- `Docker` e `Docker Compose`

## Ambiente Local com Docker

Suba toda a stack local:

```bash
docker compose up -d --build
```

Servicos:

- Web: `http://localhost:5173`
- API: `http://localhost:3333`
- PostgreSQL: `localhost:5432`

O servico da API executa automaticamente:

```bash
npm run db:push && npm run db:seed && node dist/server.js
```

Isso sincroniza o schema, popula os dados iniciais e inicia o servidor.

## Acessos Iniciais

O seed cria dois usuarios:

| Perfil | Email | Senha |
| --- | --- | --- |
| Admin | `admin@pdi.local` | `admin123` |
| Colaborador | `member@pdi.local` | `member123` |

## Primeiro Acesso

Em um banco sem administrador cadastrado, a tela de login muda automaticamente para o cadastro do primeiro admin.

A API expoe duas rotas publicas para esse bootstrap:

- `GET /api/auth/bootstrap-status`
- `POST /api/auth/bootstrap-admin`

Depois que um usuario `ADMIN` existe, o bootstrap fica bloqueado e novos usuarios devem ser criados por um administrador autenticado.

## Board Padrao

Ao subir o ambiente, o seed cria o PDI `Software Developer Skills Roadmap` para o usuario colaborador.

Esse board possui uma trilha de evolucao para desenvolvimento de software, cobrindo:

- Fundamentos de TypeScript, runtime JavaScript e engenharia diaria
- Profundidade em frontend e backend
- Arquitetura, qualidade e estrategia de testes
- DevOps, operacao, observabilidade e lideranca tecnica
- Plano 30/60/90 dias
- Riscos e guardrails de execucao

## Desenvolvimento sem Docker

Instale as dependencias:

```bash
npm install
```

Gere o Prisma Client:

```bash
npm run prisma:generate --workspace @pdi/api
```

Configure `DATABASE_URL`, `JWT_SECRET`, `PORT` e `WEB_ORIGIN` no ambiente da API.

Sincronize o banco e rode o seed:

```bash
npm run db:push --workspace @pdi/api
npm run db:seed --workspace @pdi/api
```

Suba os servicos em modo desenvolvimento:

```bash
npm run dev
```

## Qualidade

Execute a validacao completa:

```bash
npm run build
npm run lint
npm run test
```

## Kubernetes

Os manifests base ficam em `infra/k8s`:

- `namespace.yaml`
- `postgres.yaml`
- `api.yaml`
- `web.yaml`

Aplicacao:

```bash
kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/postgres.yaml
kubectl apply -f infra/k8s/api.yaml
kubectl apply -f infra/k8s/web.yaml
```

Antes de usar em producao, revise secrets, imagens, storage, ingress, TLS, politicas de rede e estrategia de backup.
