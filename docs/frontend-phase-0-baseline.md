# Frontend Phase 0 Baseline

## Objetivo
Estabelecer baseline operacional de frontend/canvas antes de migracoes maiores, preservando paridade funcional.

## Metricas Coletadas em Runtime
- FPS atual do canvas
- FPS medio da sessao
- contador acumulado de long tasks
- heap JS utilizado (quando suportado pelo browser)

As metricas aparecem no header do board em tempo real.

## Fluxos de Regressao Cobertos
Suíte automatizada inicial em `app/api/src/software-developer-roadmap-template.test.ts` valida:
- estabilidade do metadado principal do roadmap
- densidade minima de nodes/edges do board seed
- regra de parent/position relativa por frames (centro do node)

## Procedimento de Baseline (Manual)
1. Abrir board com seed padrao.
2. Executar pan + zoom continuo por 30s.
3. Realizar multi-selecao com marquee e mover elementos.
4. Criar node + edge e editar texto inline.
5. Exportar PNG e SVG.
6. Registrar valores minimos observados no chip de performance.

## Metas Iniciais
- FPS atual >= 50 durante interacao regular
- Long tasks controladas durante drag/zoom
- Nenhuma perda funcional em fluxos de criacao/edicao/export
