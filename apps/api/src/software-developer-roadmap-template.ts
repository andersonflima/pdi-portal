import type { CanvasEdge, CanvasNode } from '@pdi/contracts';


type TextStyle = {
  align: NonNullable<NonNullable<CanvasNode['style']['textStyle']>['align']>;
  verticalAlign: NonNullable<NonNullable<CanvasNode['style']['textStyle']>['verticalAlign']>;
  fontSize: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

type SeedNodeInput = {
  backgroundColor?: string;
  checked?: CanvasNode['checked'];
  description?: string;
  fontSize?: number;
  taskItems?: NonNullable<CanvasNode['taskItems']>;
  textStyle?: TextStyle;
  variant?: CanvasNode['variant'];
};

type SeedEdgeInput = {
  color?: string;
  lineStyle?: NonNullable<NonNullable<CanvasEdge['style']>['lineStyle']>;
  sourceHandle?: string;
  targetHandle?: string;
  type?: NonNullable<NonNullable<CanvasEdge['style']>['type']>;
};

const textStyle = (
  align: TextStyle['align'] = 'center',
  verticalAlign: TextStyle['verticalAlign'] = 'center',
  fontSize = 16,
  extra: Partial<Omit<TextStyle, 'align' | 'fontSize' | 'verticalAlign'>> = {}
) => ({ align, verticalAlign, fontSize, ...extra });

const taskSteps = (group: string, labels: string[]) =>
  labels.map((label, index) => ({
    checked: false,
    id: `${group}-${index}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    label
  }));

const node = (
  id: string,
  kind: CanvasNode['kind'],
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  input: SeedNodeInput = {}
): CanvasNode => ({
  id,
  kind,
  label,
  position: { x, y },
  style: {
    color,
    height,
    textStyle: input.textStyle ?? textStyle('center', 'center', input.fontSize ?? 16),
    width,
    ...(input.backgroundColor ? { backgroundColor: input.backgroundColor } : {})
  },
  ...(input.checked === undefined ? {} : { checked: input.checked }),
  ...(input.description ? { description: input.description } : {}),
  ...(input.taskItems ? { taskItems: input.taskItems } : {}),
  ...(input.variant ? { variant: input.variant } : {})
});

const edge = (
  id: string,
  source: string,
  target: string,
  label: string,
  input: SeedEdgeInput = {}
): CanvasEdge => ({
  id,
  label,
  source,
  sourceHandle: input.sourceHandle ?? 'right-source',
  style: {
    color: input.color ?? '#64748b',
    lineStyle: input.lineStyle ?? 'solid',
    type: input.type ?? 'smoothstep'
  },
  target,
  targetHandle: input.targetHandle ?? 'left-target'
});

const templateBoardSize = { height: 2400, width: 4000 };

const nodeSize = (node: CanvasNode) => ({
  height: node.style.height ?? 0,
  width: node.style.width ?? 0
});

const nodeCenter = (node: CanvasNode) => {
  const size = nodeSize(node);

  return {
    x: node.position.x + size.width / 2,
    y: node.position.y + size.height / 2
  };
};

const isPointInsideFrame = (point: { x: number; y: number }, frame: CanvasNode) => {
  const size = nodeSize(frame);

  return (
    point.x >= frame.position.x &&
    point.x <= frame.position.x + size.width &&
    point.y >= frame.position.y &&
    point.y <= frame.position.y + size.height
  );
};

const sortFramesByAreaAscending = (frames: CanvasNode[]) =>
  [...frames].sort((leftFrame, rightFrame) => {
    const leftSize = nodeSize(leftFrame);
    const rightSize = nodeSize(rightFrame);

    return leftSize.width * leftSize.height - rightSize.width * rightSize.height;
  });

const withoutParentId = (node: CanvasNode): CanvasNode => {
  const copy = { ...node };
  delete copy.parentId;

  return copy;
};

const centerNodesOnBoard = (nodes: CanvasNode[]) => {
  if (nodes.length === 0) return nodes;

  const bounds = nodes.reduce(
    (accumulator, currentNode) => {
      const size = nodeSize(currentNode);
      const left = currentNode.position.x;
      const top = currentNode.position.y;
      const right = currentNode.position.x + size.width;
      const bottom = currentNode.position.y + size.height;

      return {
        bottom: Math.max(accumulator.bottom, bottom),
        left: Math.min(accumulator.left, left),
        right: Math.max(accumulator.right, right),
        top: Math.min(accumulator.top, top)
      };
    },
    { bottom: Number.NEGATIVE_INFINITY, left: Number.POSITIVE_INFINITY, right: Number.NEGATIVE_INFINITY, top: Number.POSITIVE_INFINITY }
  );

  const currentCenter = {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2
  };
  const boardCenter = {
    x: templateBoardSize.width / 2,
    y: templateBoardSize.height / 2
  };
  const offset = {
    x: boardCenter.x - currentCenter.x,
    y: boardCenter.y - currentCenter.y
  };

  return nodes.map((currentNode) => ({
    ...currentNode,
    position: {
      x: currentNode.position.x + offset.x,
      y: currentNode.position.y + offset.y
    }
  }));
};

export const normalizeNodesParentingByFrames = (nodes: CanvasNode[]): CanvasNode[] => {
  const frames = sortFramesByAreaAscending(nodes.filter((node) => node.kind === 'FRAME'));

  return nodes.map((node) => {
    if (node.kind === 'FRAME') {
      return withoutParentId(node);
    }

    const center = nodeCenter(node);
    const parentFrame = frames.find((frame) => frame.id !== node.id && isPointInsideFrame(center, frame));

    if (!parentFrame) {
      return withoutParentId(node);
    }

    return {
      ...node,
      parentId: parentFrame.id,
      position: {
        x: node.position.x - parentFrame.position.x,
        y: node.position.y - parentFrame.position.y
      }
    };
  });
};

const seedNodes: CanvasNode[] = [
  node('title', 'TEXT', 'Software Developer Skills Roadmap', 80, 40, 520, 88, '#172033', {
    textStyle: textStyle('left', 'center', 34, { bold: true })
  }),
  node(
    'north-star',
    'GOAL',
    'North Star\nDesign and operate reliable backend services with senior ownership',
    670,
    24,
    260,
    260,
    '#2563eb',
    { textStyle: textStyle('center', 'center', 18, { bold: true }) }
  ),
  node(
    'principles',
    'CARD',
    'Operating principles\nSmall slices, explicit tradeoffs, testable architecture, production feedback loops.',
    1000,
    64,
    420,
    150,
    '#0f172a',
    { textStyle: textStyle('left', 'center', 17) }
  ),
  node('phase-1', 'FRAME', 'Phase 1: Foundations and daily engineering habits', 80, 360, 620, 430, '#0f766e', {
    backgroundColor: '#dcfdfa',
    textStyle: textStyle('left', 'top', 22, { bold: true })
  }),
  node('phase-2', 'FRAME', 'Phase 2: Backend implementation depth', 760, 360, 620, 430, '#7c3aed', {
    backgroundColor: '#f3e8ff',
    textStyle: textStyle('left', 'top', 22, { bold: true })
  }),
  node('phase-3', 'FRAME', 'Phase 3: Data, architecture and quality', 1440, 360, 620, 430, '#ca8a04', {
    backgroundColor: '#fef3c7',
    textStyle: textStyle('left', 'top', 22, { bold: true })
  }),
  node('phase-4', 'FRAME', 'Phase 4: Operations, scale and reliability', 2120, 360, 620, 430, '#16a34a', {
    backgroundColor: '#dcfce7',
    textStyle: textStyle('left', 'top', 22, { bold: true })
  }),
  node('foundation-ts', 'TASK_LIST', 'Backend foundations', 120, 440, 250, 170, '#0f766e', {
    taskItems: taskSteps('foundation-ts', [
      'How internet and HTTP work',
      'DNS, hosting and networking basics',
      'Linux terminal and processes',
      'Pick one backend language deeply'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node('foundation-craft', 'TASK_LIST', 'Engineering workflow', 410, 440, 250, 170, '#0f766e', {
    taskItems: taskSteps('foundation-craft', [
      'Git and branching strategy',
      'GitHub/GitLab pull requests',
      'Debugging and profiling',
      'Readable commits and ADR notes'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node(
    'foundation-kata',
    'TASK',
    'Weekly kata: build CRUD API with validation, auth and persistence',
    120,
    650,
    330,
    76,
    '#0f766e',
    { textStyle: textStyle('left', 'center', 15) }
  ),
  node(
    'foundation-output',
    'STICKER',
    'Output: running API with logs, tests and versioned docs',
    480,
    642,
    170,
    92,
    '#0f766e',
    { textStyle: textStyle('center', 'center', 14, { bold: true }) }
  ),
  node('product-frontend', 'TASK_LIST', 'Databases and persistence', 800, 440, 250, 170, '#7c3aed', {
    taskItems: taskSteps('product-frontend', [
      'Relational modeling and SQL',
      'Indexes, transactions and ACID',
      'NoSQL use cases',
      'Migrations and failure modes'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node('product-backend', 'TASK_LIST', 'APIs and communication', 1090, 440, 250, 170, '#7c3aed', {
    taskItems: taskSteps('product-backend', [
      'REST, JSON and OpenAPI',
      'GraphQL or gRPC basics',
      'Authentication and authorization',
      'Caching strategy (client/server)'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node('product-slice', 'CARD', 'Backend slice\nAPI + DB + cache + tests', 820, 650, 230, 96, '#7c3aed', {
    textStyle: textStyle('center', 'center', 16, { bold: true })
  }),
  node(
    'product-output',
    'STICKER',
    'Output: one backend module with contract tests and docs',
    1090,
    642,
    190,
    92,
    '#7c3aed',
    { textStyle: textStyle('center', 'center', 14, { bold: true }) }
  ),
  node('architecture-boundaries', 'TASK_LIST', 'Architecture patterns', 1480, 440, 250, 170, '#ca8a04', {
    taskItems: taskSteps('architecture-boundaries', [
      'Monolith vs microservices',
      'DDD and bounded contexts',
      'Event-driven and CQRS',
      'Twelve-factor principles'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node('quality-system', 'TASK_LIST', 'Security and quality', 1770, 440, 250, 170, '#ca8a04', {
    taskItems: taskSteps('quality-system', [
      'Unit and integration tests',
      'TDD for core use cases',
      'OWASP API security',
      'Hashing and secrets handling'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node(
    'quality-refactor',
    'CARD',
    'Evolution rule\nNo structural change without tests, migration strategy and rollback path.',
    1490,
    650,
    270,
    96,
    '#ca8a04',
    { textStyle: textStyle('left', 'center', 15) }
  ),
  node(
    'quality-output',
    'STICKER',
    'Output: ADR set, test strategy and API security checklist',
    1810,
    642,
    170,
    92,
    '#ca8a04',
    { textStyle: textStyle('center', 'center', 14, { bold: true }) }
  ),
  node('ops-devops', 'TASK_LIST', 'Platform and runtime', 2160, 440, 250, 170, '#16a34a', {
    taskItems: taskSteps('ops-devops', [
      'Docker and container lifecycle',
      'Kubernetes fundamentals',
      'Web server and reverse proxy',
      'CI/CD pipelines and rollback'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node('delivery-leadership', 'TASK_LIST', 'Scalability and reliability', 2450, 440, 250, 170, '#16a34a', {
    taskItems: taskSteps('delivery-leadership', [
      'Message brokers (RabbitMQ/Kafka)',
      'WebSockets, SSE and polling',
      'Search engines (Elasticsearch)',
      'Scaling and graceful degradation'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node('ops-observe', 'CARD', 'Observe\nmetrics + logs + traces', 2170, 650, 230, 96, '#16a34a', {
    textStyle: textStyle('center', 'center', 15, { bold: true })
  }),
  node(
    'delivery-output',
    'STICKER',
    'Output: production-ready backend service with dashboard and runbook',
    2440,
    642,
    190,
    92,
    '#16a34a',
    { textStyle: textStyle('center', 'center', 14, { bold: true }) }
  ),
  node('timeline', 'FRAME', '30 / 60 / 90 day execution plan', 420, 860, 1700, 330, '#2563eb', {
    backgroundColor: '#dbeafe',
    textStyle: textStyle('left', 'top', 22, { bold: true })
  }),
  node('day-30', 'GOAL', '30 days\nFoundations + first API', 480, 940, 190, 190, '#0f766e', {
    textStyle: textStyle('center', 'center', 16, { bold: true })
  }),
  node('day-60', 'GOAL', '60 days\nDatabase + contracts + auth', 760, 940, 190, 190, '#7c3aed', {
    textStyle: textStyle('center', 'center', 16, { bold: true })
  }),
  node('day-90', 'GOAL', '90 days\nScale + observability + operations', 1040, 940, 190, 190, '#ca8a04', {
    textStyle: textStyle('center', 'center', 16, { bold: true })
  }),
  node('measure', 'TASK_LIST', 'Measurement checklist', 1320, 930, 330, 180, '#2563eb', {
    taskItems: taskSteps('measure', [
      'Latency and error rate trending down',
      'Critical flows covered by tests',
      'Incidents with postmortem actions',
      'Release pipeline stays stable'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node(
    'cadence',
    'CARD',
    'Weekly cadence\nPlan one backend focus, ship one incremental API change and write one operational note.',
    1710,
    950,
    330,
    130,
    '#2563eb',
    { textStyle: textStyle('left', 'center', 15) }
  ),
  node('risk-frame', 'FRAME', 'Risks and guardrails', 80, 1260, 1320, 280, '#dc2626', {
    backgroundColor: '#fee2e2',
    textStyle: textStyle('left', 'top', 22, { bold: true })
  }),
  node(
    'risk-1',
    'NOTE',
    'Do not study passively. Every topic must produce code, docs or operational evidence.',
    130,
    1340,
    260,
    110,
    '#dc2626',
    { textStyle: textStyle('center', 'center', 15, { bold: true }) }
  ),
  node(
    'risk-2',
    'NOTE',
    'Avoid broad rewrites. Improve boundaries through small safe refactors.',
    430,
    1340,
    260,
    110,
    '#dc2626',
    { textStyle: textStyle('center', 'center', 15, { bold: true }) }
  ),
  node(
    'risk-3',
    'NOTE',
    'No ownership without observability, rollback and explicit acceptance criteria.',
    730,
    1340,
    260,
    110,
    '#dc2626',
    { textStyle: textStyle('center', 'center', 15, { bold: true }) }
  ),
  node('risk-4', 'NOTE', 'Track outcomes, not hours. Evidence beats intention.', 1030, 1340, 260, 110, '#dc2626', {
    textStyle: textStyle('center', 'center', 15, { bold: true })
  })
];

const seedEdges: CanvasEdge[] = [
  edge('e-title-north', 'title', 'north-star', 'purpose', { color: '#2563eb' }),
  edge('e-north-principles', 'north-star', 'principles', 'operating model', {
    color: '#0f172a',
    lineStyle: 'dashed'
  }),
  edge('e-north-p1', 'north-star', 'phase-1', 'build habits', {
    color: '#0f766e',
    sourceHandle: 'bottom-source',
    targetHandle: 'top-target'
  }),
  edge('e-p1-p2', 'phase-1', 'phase-2', 'apply', { color: '#7c3aed' }),
  edge('e-p2-p3', 'phase-2', 'phase-3', 'harden', { color: '#ca8a04' }),
  edge('e-p3-p4', 'phase-3', 'phase-4', 'operate', { color: '#16a34a' }),
  edge('e-foundation-output-30', 'foundation-output', 'day-30', 'evidence', {
    color: '#0f766e',
    lineStyle: 'dashed',
    sourceHandle: 'bottom-source',
    targetHandle: 'top-target'
  }),
  edge('e-product-output-60', 'product-output', 'day-60', 'evidence', {
    color: '#7c3aed',
    lineStyle: 'dashed',
    sourceHandle: 'bottom-source',
    targetHandle: 'top-target'
  }),
  edge('e-quality-output-90', 'quality-output', 'day-90', 'evidence', {
    color: '#ca8a04',
    lineStyle: 'dashed',
    sourceHandle: 'bottom-source',
    targetHandle: 'top-target'
  }),
  edge('e-delivery-output-90', 'delivery-output', 'day-90', 'production', {
    color: '#16a34a',
    lineStyle: 'dashed',
    sourceHandle: 'bottom-source',
    targetHandle: 'right-target'
  }),
  edge('e-30-60', 'day-30', 'day-60', 'compound', { color: '#2563eb' }),
  edge('e-60-90', 'day-60', 'day-90', 'compound', { color: '#2563eb' }),
  edge('e-90-measure', 'day-90', 'measure', 'measure', { color: '#2563eb' }),
  edge('e-measure-cadence', 'measure', 'cadence', 'cadence', { color: '#2563eb' }),
  edge('e-risks-timeline', 'risk-frame', 'timeline', 'guardrails', {
    color: '#dc2626',
    lineStyle: 'dashed',
    sourceHandle: 'top-source',
    targetHandle: 'bottom-target'
  })
];


export const softwareDeveloperRoadmapPlanTitle = 'Software Developer Skills Roadmap';
export const softwareDeveloperRoadmapPlanObjective =
  'Develop senior-level backend engineering skills through foundations, APIs, databases, security, architecture, observability and scalable operations.';
export const softwareDeveloperRoadmapPlanStatus = 'ACTIVE' as const;

const toRoadmapBoardTitle = (planTitle: string) => `${planTitle} board`;

export const createSoftwareDeveloperRoadmapTemplate = () => {
  const planTitle = softwareDeveloperRoadmapPlanTitle;
  const centeredNodes = centerNodesOnBoard(structuredClone(seedNodes));
  const nodes = normalizeNodesParentingByFrames(centeredNodes);

  return {
    board: {
      edges: structuredClone(seedEdges),
      nodes,
      title: toRoadmapBoardTitle(planTitle)
    },
    plan: {
      objective: softwareDeveloperRoadmapPlanObjective,
      status: softwareDeveloperRoadmapPlanStatus,
      title: planTitle
    }
  };
};
