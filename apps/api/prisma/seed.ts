import { PrismaClient, type Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

type TextStyle = {
  align: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'center' | 'bottom';
  fontSize: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

type SeedNodeInput = {
  backgroundColor?: string;
  checked?: boolean;
  description?: string;
  fontSize?: number;
  taskItems?: Array<{ checked: boolean; id: string; label: string }>;
  textStyle?: TextStyle;
  variant?: string;
};

type SeedEdgeInput = {
  color?: string;
  lineStyle?: 'solid' | 'dashed';
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
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
  kind: string,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  input: SeedNodeInput = {}
) => ({
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
) => ({
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

const seedNodes = [
  node('title', 'TEXT', 'Software Developer Skills Roadmap', 80, 40, 520, 88, '#172033', {
    textStyle: textStyle('left', 'center', 34, { bold: true })
  }),
  node(
    'north-star',
    'GOAL',
    'North Star\nShip reliable features end-to-end with senior ownership',
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
    'Operating principles\nSmall slices, explicit tradeoffs, tests before refactors, production feedback loops.',
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
  node('phase-2', 'FRAME', 'Phase 2: Product implementation depth', 760, 360, 620, 430, '#7c3aed', {
    backgroundColor: '#f3e8ff',
    textStyle: textStyle('left', 'top', 22, { bold: true })
  }),
  node('phase-3', 'FRAME', 'Phase 3: Architecture, scale and quality', 1440, 360, 620, 430, '#ca8a04', {
    backgroundColor: '#fef3c7',
    textStyle: textStyle('left', 'top', 22, { bold: true })
  }),
  node('phase-4', 'FRAME', 'Phase 4: Operations, delivery and leadership', 2120, 360, 620, 430, '#16a34a', {
    backgroundColor: '#dcfce7',
    textStyle: textStyle('left', 'top', 22, { bold: true })
  }),
  node('foundation-ts', 'TASK_LIST', 'Language mastery', 120, 440, 250, 170, '#0f766e', {
    taskItems: taskSteps('foundation-ts', [
      'TypeScript generics and narrowing',
      'Async/event loop and promises',
      'Functional composition in JS',
      'Debug runtime behavior'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node('foundation-craft', 'TASK_LIST', 'Engineering craft', 410, 440, 250, 170, '#0f766e', {
    taskItems: taskSteps('foundation-craft', [
      'Gitflow and clean PRs',
      'Readable commits',
      'Small refactors',
      'Terminal/editor fluency'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node(
    'foundation-kata',
    'TASK',
    'Weekly kata: algorithms, data structures and complexity analysis',
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
    'Output: 4 reviewed PRs with tests and clear review notes',
    480,
    642,
    170,
    92,
    '#0f766e',
    { textStyle: textStyle('center', 'center', 14, { bold: true }) }
  ),
  node('product-frontend', 'TASK_LIST', 'Frontend depth', 800, 440, 250, 170, '#7c3aed', {
    taskItems: taskSteps('product-frontend', [
      'Component boundaries',
      'Server state and forms',
      'A11y and keyboard flows',
      'Performance profiling'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node('product-backend', 'TASK_LIST', 'Backend depth', 1090, 440, 250, 170, '#7c3aed', {
    taskItems: taskSteps('product-backend', [
      'API contracts',
      'Auth and authorization',
      'Validation and errors',
      'SQL modeling and indexes'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node('product-slice', 'SHAPE', 'Vertical slice\nUI + API + DB + tests', 820, 650, 210, 92, '#7c3aed', {
    textStyle: textStyle('center', 'center', 16, { bold: true }),
    variant: 'ROUNDED_RECTANGLE'
  }),
  node(
    'product-output',
    'STICKER',
    'Output: one feature shipped behind a safe release path',
    1090,
    642,
    190,
    92,
    '#7c3aed',
    { textStyle: textStyle('center', 'center', 14, { bold: true }) }
  ),
  node('architecture-boundaries', 'TASK_LIST', 'Architecture decisions', 1480, 440, 250, 170, '#ca8a04', {
    taskItems: taskSteps('architecture-boundaries', [
      'Use cases and boundaries',
      'Ports/adapters',
      'ADR writing',
      'Tradeoff evaluation'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node('quality-system', 'TASK_LIST', 'Quality system', 1770, 440, 250, 170, '#ca8a04', {
    taskItems: taskSteps('quality-system', ['Unit tests', 'Integration tests', 'Contract tests', 'E2E smoke tests']),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node(
    'quality-refactor',
    'CARD',
    'Refactor rule\nNo structural change without behavioral safety net and rollback path.',
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
    'Output: documented architecture decision and test strategy',
    1810,
    642,
    170,
    92,
    '#ca8a04',
    { textStyle: textStyle('center', 'center', 14, { bold: true }) }
  ),
  node('ops-devops', 'TASK_LIST', 'DevOps baseline', 2160, 440, 250, 170, '#16a34a', {
    taskItems: taskSteps('ops-devops', [
      'Docker image quality',
      'Kubernetes fundamentals',
      'Config and secrets',
      'Rollback and deploy checks'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node('delivery-leadership', 'TASK_LIST', 'Delivery leadership', 2450, 440, 250, 170, '#16a34a', {
    taskItems: taskSteps('delivery-leadership', [
      'Clarify outcomes',
      'Slice scope',
      'Escalate risks',
      'Mentor through reviews'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node('ops-observe', 'SHAPE', 'Observe\nmetrics + logs + traces', 2170, 650, 210, 92, '#16a34a', {
    textStyle: textStyle('center', 'center', 15, { bold: true }),
    variant: 'HEXAGON'
  }),
  node(
    'delivery-output',
    'STICKER',
    'Output: production feature with dashboard and runbook',
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
  node('day-30', 'GOAL', '30 days\nConsistent engineering habits', 480, 940, 190, 190, '#0f766e', {
    textStyle: textStyle('center', 'center', 16, { bold: true })
  }),
  node('day-60', 'GOAL', '60 days\nOwn vertical slices', 760, 940, 190, 190, '#7c3aed', {
    textStyle: textStyle('center', 'center', 16, { bold: true })
  }),
  node('day-90', 'GOAL', '90 days\nProduction-grade ownership', 1040, 940, 190, 190, '#ca8a04', {
    textStyle: textStyle('center', 'center', 16, { bold: true })
  }),
  node('measure', 'TASK_LIST', 'Measurement checklist', 1320, 930, 330, 180, '#2563eb', {
    taskItems: taskSteps('measure', [
      'Cycle time trending down',
      'Review comments become architectural',
      'Defects found earlier',
      'Incidents have runbooks'
    ]),
    textStyle: textStyle('left', 'top', 15, { bold: true })
  }),
  node(
    'cadence',
    'CARD',
    'Weekly cadence\nPlan 1 skill focus, pair once, ship one small increment, write one learning note.',
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
    'Do not study passively. Every skill must produce code, docs or operational evidence.',
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
] satisfies Prisma.InputJsonValue;

const seedEdges = [
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
] satisfies Prisma.InputJsonValue;

const createUser = async (input: {
  email: string;
  name: string;
  password: string;
  role: 'ADMIN' | 'MEMBER';
}) =>
  prisma.user.upsert({
    create: {
      email: input.email,
      name: input.name,
      passwordHash: await hash(input.password, 10),
      role: input.role
    },
    update: {
      name: input.name,
      role: input.role
    },
    where: { email: input.email }
  });

const main = async () => {
  const admin = await createUser({
    email: 'admin@pdi.local',
    name: 'Anderson Espindola',
    password: 'admin123',
    role: 'ADMIN'
  });

  const member = await createUser({
    email: 'member@pdi.local',
    name: 'Pessoa Colaboradora',
    password: 'member123',
    role: 'MEMBER'
  });

  const pdiPlan = await prisma.pdiPlan.upsert({
    create: {
      id: 'seed-pdi-plan',
      objective:
        'Develop senior-level software engineering skills through foundations, frontend, backend, architecture, quality, DevOps and delivery habits.',
      ownerId: member.id,
      status: 'ACTIVE',
      title: 'Software Developer Skills Roadmap'
    },
    update: {
      objective:
        'Develop senior-level software engineering skills through foundations, frontend, backend, architecture, quality, DevOps and delivery habits.',
      ownerId: member.id,
      status: 'ACTIVE',
      title: 'Software Developer Skills Roadmap'
    },
    where: { id: 'seed-pdi-plan' }
  });

  await prisma.board.upsert({
    create: {
      edges: seedEdges,
      nodes: seedNodes,
      pdiPlanId: pdiPlan.id,
      title: 'Software Developer Skills Roadmap board'
    },
    update: {
      edges: seedEdges,
      nodes: seedNodes,
      title: 'Software Developer Skills Roadmap board'
    },
    where: { pdiPlanId: pdiPlan.id }
  });

  return { admin, member };
};

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
