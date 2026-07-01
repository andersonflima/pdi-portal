# PDI Portal Frontend Redesign Blueprint

## Contexto Atual (Baseline Real)
- Frontend em Angular 21 com componentes standalone, Signals e RxJS.
- Canvas principal concentrado em [`app/web/src/app/features/canvas/canvas-board.component.ts`](../app/web/src/app/features/canvas/canvas-board.component.ts) com ~2669 linhas.
- Regras e contratos de negócio já centralizados em `app/packages/contracts` (deve ser preservado como fonte de verdade).
- Colaboração realtime existente via WebSocket com autosave e histórico local no componente de canvas.
- UI funcional, porém com acoplamento alto entre renderização, interação, estado, sincronização e apresentação.

Objetivo do redesign: elevar qualidade visual e técnica para padrão enterprise premium, sem perda de funcionalidades existentes.

---

## 1) Nova Direção Visual
Direção proposta: **Precision Canvas Workspace**.

Princípios:
- Estética limpa com alta densidade informacional controlada.
- Contraste funcional (não “flat washed”, não “neon”).
- Superfícies em camadas sutis (elevation por tonalidade, não por sombra pesada).
- Foco em leitura, ação rápida e contexto.

Linguagem visual:
- Grade de espaçamento de 4px com tokens semânticos.
- Cantos de raio variável por contexto (`sm/md/lg/pill`) para diferenciar elementos utilitários x conteúdo.
- Feedbacks visuais instantâneos (hover, focus, active, selected, collaborative presence).
- Canvas com textura sutil (dot grid adaptativo por zoom), não poluído.

Tipografia premium:
- Cabeçalhos: `Sora` ou `Manrope`.
- Corpo/UI: `Inter Tight` ou `IBM Plex Sans`.
- Monospace utilitária: `JetBrains Mono`.
- Escala tipográfica semântica (`display`, `title`, `body`, `label`, `caption`) com line-height rígido.

---

## 2) Arquitetura Frontend Completa
Arquitetura alvo: **Feature-Driven + Onion Frontend**.

Camadas:
- `domain`: entidades, regras puras, invariantes, value objects.
- `application`: casos de uso, comandos, queries, orchestration pura.
- `infrastructure`: http/ws adapters, storage, workers, telemetry.
- `realtime`: presence, sync, awareness, optimistic reconciliation.
- `canvas-engine`: render pipeline, spatial index, viewport, hit-testing, interaction state machine.
- `presentation`: smart containers, dumb components, directives.
- `design-system`: tokens, primitives, componentes base, padrões de interação.

Regras:
- `domain` nunca depende de Angular, HTTP, WS, DOM.
- `canvas-engine` é framework-agnostic (TypeScript puro).
- Angular atua como camada de composição e integração.

---

## 3) Estrutura de Pastas Ideal
Estrutura incremental recomendada (sem quebrar monorepo atual):

```text
app/
  web/
    src/app/
      core/
        bootstrap/
        routing/
        platform/
        auth/
      shell/
        workspace-shell/
        command-palette/
        global-search/
      features/
        board/
          presentation/
          application/
          domain/
          infrastructure/
        pdi-management/
        user-management/
        comments/
        notifications/
      shared/
        ui/
        directives/
        pipes/
        a11y/
      realtime/
        application/
        infrastructure/
      canvas-engine/
        domain/
        application/
        rendering/
        interaction/
        workers/
packages/
  contracts/
  design-system/
    tokens/
    primitives/
    components/
    themes/
  frontend-kernel/
    state/
    telemetry/
    utils/
```

Observação:
- Monorepo pode permanecer com npm workspaces.
- Nx é opcional para fase posterior (cache distribuído e graph de dependências).

---

## 4) Estratégia de Estado
Estratégia híbrida por tipo de estado:

- **UI local efêmero**: Angular Signals no componente/feature.
- **Estado de feature durável**: NgRx Signals Store por bounded context (`board`, `plans`, `users`, `comments`).
- **Server state**: TanStack Query Angular (cache, retries, stale-while-revalidate, dedupe).
- **Realtime state**: Yjs docs + awareness store separado.

Regras:
- Não criar store global monolítica.
- Estado de canvas particionado por subdomínio: `viewport`, `selection`, `nodes`, `edges`, `interaction`, `history`.
- Selectors computados por Signals com memoização e granularidade fina.

---

## 5) Estratégia Realtime
Proposta:
- Manter WebSocket backend existente como transporte base.
- Adicionar camada de sincronização CRDT com **Yjs** para edição concorrente resiliente.
- Awareness channel separado (cursores, seleção, presença).

Pipeline:
- `intent local` -> `optimistic apply` -> `emit op` -> `ack/reconcile`.
- Conflitos resolvidos por CRDT nas estruturas colaborativas.
- Fallback offline-first com fila local e replay.

UX realtime:
- Avatares no canvas + cursor colorido por usuário.
- Lock visual “soft” por bloco em edição (sem hard lock bloqueante).
- Comentários inline com threads ancoradas em node/edge/posição.

---

## 6) Estratégia do Canvas
Decisão arquitetural:
- Separar engine de canvas da camada Angular.
- Angular renderiza shell, painéis, menus e overlays.
- Engine renderiza cena principal via `Canvas/WebGL` (PixiJS recomendado).

Submódulos da engine:
- `SceneGraphStore`
- `SpatialIndex` (RBush/Quadtree)
- `ViewportController` (pan/zoom/inertia)
- `SelectionController`
- `SnapController` (grid, guides, smart align)
- `ConnectorRouter`
- `HistoryController` (command stack + batching)
- `RenderScheduler` (dirty regions + frame budget)

Resultado:
- Suporte escalável para milhares de elementos com FPS estável.

---

## 7) Estratégia de Performance
Angular:
- `ChangeDetectionStrategy.OnPush` em toda árvore de UI de alto tráfego.
- Signals para updates granulares.
- `@for track` obrigatório em listas.
- Isolamento de zonas (`provideZoneChangeDetection` já existe; evoluir para render loops fora de zona quando possível).

Canvas/Render:
- Virtualização por viewport.
- Culling por bounds + nível de zoom.
- Incremental rendering com frame budget (ex.: 4–6ms por frame para mutações pesadas).
- Chunk updates para bulk operations (drag multi-seleção, import JSON).
- Pooling de objetos para reduzir pressão de GC.

Threading:
- Web Workers para layout pesado, roteamento de conexões, normalização/import/export.
- OffscreenCanvas quando disponível (feature detection + fallback).

---

## 8) Design System Completo
Pacote dedicado: `packages/design-system`.

Conteúdo:
- Tokens semânticos: `color`, `space`, `radius`, `border`, `elevation`, `motion`, `typography`, `z-index`.
- Temas: `light`, `dark`, `high-contrast`.
- Primitives: `Button`, `IconButton`, `Input`, `Select`, `Tooltip`, `Badge`, `Avatar`, `Surface`, `FocusRing`.
- Compostos: `Topbar`, `Sidebar`, `CommandPalette`, `ContextMenu`, `InspectorPanel`, `ToastCenter`.

Acessibilidade:
- Contraste AA/AAA por token.
- Focus ring consistente e visível.
- Estados disabled/readonly com leitura clara.

Semântica de cor (exemplo):
- `--color-surface/base`, `--color-surface/raised`, `--color-surface/floating`
- `--color-content/primary`, `--color-content/muted`
- `--color-action/primary`, `--color-action/primary-hover`
- `--color-canvas/grid`, `--color-canvas/guide`, `--color-canvas/selection`

---

## 9) Fluxos UX Modernos
Fluxos obrigatórios:
- Command Palette (`Cmd/Ctrl+K`) com ações globais e contextuais.
- Quick Actions contextuais por seleção (node, edge, grupo).
- Global Search unificada: PDIs, pessoas, nodes, comentários, comandos.
- Multi-select avançada com handles e ações em massa.
- Inline editing sem ruptura de foco.
- Histórico visual com undo/redo semântico.

Comportamento:
- Menus contextuais inteligentes por tipo de entidade.
- Navegação por teclado entre painéis (canvas, sidebar, inspector).
- Onboarding progressivo por role (Tech Lead vs Member).

---

## 10) Melhorias de Acessibilidade
Padrão enterprise:
- Navegação keyboard-first em 100% das ações críticas.
- ARIA landmarks e roles consistentes.
- `aria-live` para eventos colaborativos e notificações.
- Modo `prefers-reduced-motion` respeitado.
- Ordem de foco previsível (topbar -> sidebar -> canvas toolbar -> canvas -> inspector).
- Atalhos documentados e customizáveis.

Canvas a11y:
- Modo alternativo de navegação por lista/estrutura para screen reader.
- Seleção e propriedades editáveis fora do canvas visual.

---

## 11) Estratégia de Animações
Diretriz: animações informativas, curtas e discretas.

Padrões:
- Entrada de painéis: 120–180ms, easing suave.
- Drag/ghost feedback: 60fps com transforms GPU-friendly.
- Seleção, snap e guidelines com microtransições de 80–120ms.
- Notificações/menus com spring leve (sem excesso).

Stack:
- Angular Animations para fluxos estruturais.
- Motion One opcional para microinterações complexas no shell.

---

## 12) Estratégia de Escalabilidade
Escala funcional e organizacional:
- Bounded contexts independentes (`board`, `plans`, `users`, `comments`, `notifications`).
- Contratos estritos no `app/packages/contracts`.
- Feature flags para rollout incremental sem risco.
- Observabilidade frontend: métricas de FPS, input latency, commit time, ws reconnect.

Escala de produto:
- Infra para plugins internos de widgets de PDI (extensibilidade controlada).
- Sistema de permissões no frontend por capacidade, não por ifs dispersos.

---

## 13) Bibliotecas Ideais
Adotar:
- `@angular/cdk` (overlay, a11y, drag primitives, focus management).
- `NgRx Signals Store` (estado de feature).
- `@tanstack/angular-query` (server state).
- `pixi.js` (renderização de cena em larga escala).
- `yjs` (+ provider WS custom) para colaboração concorrente.
- `floating-ui` para menus/tooltips/context overlays.
- `monaco-editor` apenas em áreas que realmente precisem edição estruturada.

Opcional por fase:
- `konva` como fallback se houver necessidade de curva menor para equipe.
- `liveblocks` apenas se quiser terceirizar presence/realtime infra.

---

## 14) Estratégia de Renderização
Modelo híbrido recomendado:
- **Layer 1 (WebGL/Canvas)**: nós, arestas, seleção, guidelines, minimap.
- **Layer 2 (DOM overlay)**: inputs inline, menus, tooltips, painéis, acessibilidade.

Técnicas:
- Dirty rectangles + render queue priorizada.
- Snapshot caching por cluster/grupo.
- Text rendering strategy: cache de labels por zoom bucket.
- Edge routing recalculado sob demanda (não em toda frame).

Angular integration:
- `CanvasHostComponent` mínimo, com bridge unidirecional para engine.
- Engine em serviço isolado + worker adapters.

---

## 15) Roadmap de Migração Incremental (Sem Quebra)

### Fase 0 - Baseline e Segurança
- Instrumentar métricas atuais: FPS, TTI, memória, tempo de save, latência realtime.
- Congelar contratos de API e snapshots de fluxos críticos (golden paths).
- Criar suíte de regressão E2E para funcionalidades existentes.

### Fase 1 - Foundation UI + Design Tokens
- Introduzir `packages/design-system` e tema semântico.
- Refatorar shell (`workspace`, `topbar`, `sidebar`) mantendo comportamento.
- Entregar command palette e sistema de atalhos base.

### Fase 2 - State e Data Layer
- Migrar `workspace.service` para stores por contexto (signals store).
- Introduzir TanStack Query para server-state sem alterar endpoints.
- Separar intents/commands de UI.

### Fase 3 - Canvas Engine Extraction
- Extrair lógica pura de geometria/interação de `canvas-board.component.ts` para `canvas-engine`.
- Manter render atual inicialmente (compat mode), com testes de paridade.
- Criar adaptador `CanvasFacade` para preservar API interna dos componentes.

### Fase 4 - Render Pipeline Upgrade
- Introduzir PixiJS layer progressivamente (edge layer -> nodes -> selection).
- Ativar viewport culling, chunk rendering, pooling, workerized edge routing.
- Implementar minimap nova conectada ao scene graph.

### Fase 5 - Realtime 2.0
- Integrar Yjs para edição concorrente com fallback para fluxo atual.
- Awareness completa (cursores, presença, locks visuais soft).
- Resolver reconexão e merge resiliente.

### Fase 6 - UX Premium + A11y Hardening
- Context menus inteligentes, quick actions, onboarding contextual.
- Auditoria AA/AAA, navegação por teclado e modo reduzido de movimento.
- Polimento de microinterações e consistência motion.

### Fase 7 - Cutover Final e Remoção de Legado
- Remover camadas antigas de canvas após paridade validada.
- Limpar código obsoleto, adapters temporários e flags expiradas.
- Atualizar documentação operacional e técnica.

Critério de avanço entre fases:
- Sem regressão funcional.
- Métricas estáveis ou melhores.
- Testes E2E críticos verdes.

---

## Backlog Inicial (Primeiros 30 Dias)
1. Criar `design-system` com tokens e tema light/dark/high-contrast.
2. Extrair `board domain` (entidades + comandos puros) do componente monolítico.
3. Implementar `CanvasFacade` para desacoplar Angular da engine.
4. Entregar command palette + teclado global.
5. Implementar telemetria de performance no canvas.
6. Definir protocolo realtime versionado (ops + awareness + ack).
7. Criar testes de regressão para: criação/edição de nodes, edges, zoom/pan, save, import/export, colaboração.

---

## Riscos e Mitigações
- Risco: regressão em interações do canvas.
  - Mitigação: estratégia de paridade com compat mode + testes por fluxo.
- Risco: aumento de complexidade com engine nova.
  - Mitigação: extração por módulos puros e interfaces explícitas.
- Risco: inconsistência visual durante migração.
  - Mitigação: design system obrigatório antes de refatorações amplas de UI.
- Risco: conflitos realtime em transição.
  - Mitigação: dual-write controlado + flag de rollout por squad.

---

## KPIs de Sucesso
- FPS em canvas com 2k+ nós: >= 55 fps em hardware alvo.
- Tempo de interação (click-to-feedback): < 50ms.
- Tempo de load inicial do board: redução >= 35%.
- Erros de sincronização realtime: < 0.5% por sessão.
- Taxa de sucesso em fluxos críticos (E2E): >= 99%.

