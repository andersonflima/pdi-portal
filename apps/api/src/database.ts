import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { env } from './env.js';

export type UserRole = 'ADMIN' | 'MEMBER';
export type PdiStatus = 'DRAFT' | 'ACTIVE' | 'DONE';

type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

type PdiPlanRow = {
  id: string;
  owner_id: string;
  title: string;
  objective: string;
  status: PdiStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

type BoardRow = {
  id: string;
  pdi_plan_id: string;
  title: string;
  nodes_json: string;
  edges_json: string;
  created_at: string;
  updated_at: string;
};

export type DatabaseUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};

export type DatabasePdiPlan = {
  id: string;
  ownerId: string;
  title: string;
  objective: string;
  status: PdiStatus;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DatabaseBoard = {
  id: string;
  pdiPlanId: string;
  title: string;
  nodes: unknown[];
  edges: unknown[];
  createdAt: Date;
  updatedAt: Date;
};

export type DatabasePdiPlanWithBoard = DatabasePdiPlan & {
  board: DatabaseBoard | null;
};

const resolveDatabasePath = (databaseUrl: string) => {
  if (!databaseUrl.startsWith('file:')) {
    return resolve(process.cwd(), databaseUrl);
  }

  const urlWithoutQuery = databaseUrl.split('?')[0] ?? databaseUrl;

  if (urlWithoutQuery.startsWith('file://')) {
    const parsedUrl = new URL(urlWithoutQuery);
    return parsedUrl.pathname;
  }

  const sqlitePath = urlWithoutQuery.slice('file:'.length);
  return resolve(process.cwd(), sqlitePath);
};

const databasePath = resolveDatabasePath(env.DATABASE_URL);
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec('PRAGMA foreign_keys = ON;');

database.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MEMBER')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pdi_plans (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'DONE')),
  due_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pdi_plans_owner_id ON pdi_plans(owner_id);

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  pdi_plan_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  nodes_json TEXT NOT NULL,
  edges_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (pdi_plan_id) REFERENCES pdi_plans(id) ON DELETE CASCADE
);
`);

const nowIso = () => new Date().toISOString();

const parseJsonArray = (rawJson: string) => {
  try {
    const parsed = JSON.parse(rawJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const toUser = (row: UserRow): DatabaseUser => ({
  id: row.id,
  name: row.name,
  email: row.email,
  passwordHash: row.password_hash,
  role: row.role,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at)
});

const toPlan = (row: PdiPlanRow): DatabasePdiPlan => ({
  id: row.id,
  ownerId: row.owner_id,
  title: row.title,
  objective: row.objective,
  status: row.status,
  dueDate: row.due_date ? new Date(row.due_date) : null,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at)
});

const toBoard = (row: BoardRow): DatabaseBoard => ({
  id: row.id,
  pdiPlanId: row.pdi_plan_id,
  title: row.title,
  nodes: parseJsonArray(row.nodes_json),
  edges: parseJsonArray(row.edges_json),
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at)
});

const userByEmailStatement = database.prepare(`
SELECT id, name, email, password_hash, role, created_at, updated_at
FROM users
WHERE email = ?
LIMIT 1
`);

const userByIdStatement = database.prepare(`
SELECT id, name, email, password_hash, role, created_at, updated_at
FROM users
WHERE id = ?
LIMIT 1
`);

const createUserStatement = database.prepare(`
INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const updateUserByEmailStatement = database.prepare(`
UPDATE users
SET name = ?, password_hash = ?, role = ?, updated_at = ?
WHERE email = ?
`);

const countAdminsStatement = database.prepare(`
SELECT COUNT(1) AS total
FROM users
WHERE role = 'ADMIN'
`);

const listUsersStatement = database.prepare(`
SELECT id, name, email, password_hash, role, created_at, updated_at
FROM users
ORDER BY name ASC
`);

const plansByOwnerStatement = database.prepare(`
SELECT id, owner_id, title, objective, status, due_date, created_at, updated_at
FROM pdi_plans
WHERE owner_id = ?
ORDER BY created_at DESC
`);

const plansCountByOwnerStatement = database.prepare(`
SELECT COUNT(1) AS total
FROM pdi_plans
WHERE owner_id = ?
`);

const plansAllStatement = database.prepare(`
SELECT id, owner_id, title, objective, status, due_date, created_at, updated_at
FROM pdi_plans
ORDER BY created_at DESC
`);

const planByIdStatement = database.prepare(`
SELECT id, owner_id, title, objective, status, due_date, created_at, updated_at
FROM pdi_plans
WHERE id = ?
LIMIT 1
`);

const createPlanStatement = database.prepare(`
INSERT INTO pdi_plans (id, owner_id, title, objective, status, due_date, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const updatePlanStatement = database.prepare(`
UPDATE pdi_plans
SET owner_id = ?, title = ?, objective = ?, status = ?, due_date = ?, updated_at = ?
WHERE id = ?
`);

const deletePlanStatement = database.prepare(`
DELETE FROM pdi_plans
WHERE id = ?
`);

const boardByPlanIdStatement = database.prepare(`
SELECT id, pdi_plan_id, title, nodes_json, edges_json, created_at, updated_at
FROM boards
WHERE pdi_plan_id = ?
LIMIT 1
`);

const createBoardStatement = database.prepare(`
INSERT INTO boards (id, pdi_plan_id, title, nodes_json, edges_json, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const updateBoardByPlanIdStatement = database.prepare(`
UPDATE boards
SET title = ?, nodes_json = ?, edges_json = ?, updated_at = ?
WHERE pdi_plan_id = ?
`);

const planWithBoardStatement = database.prepare(`
SELECT
  p.id,
  p.owner_id,
  p.title,
  p.objective,
  p.status,
  p.due_date,
  p.created_at,
  p.updated_at,
  b.id AS board_id,
  b.pdi_plan_id,
  b.title AS board_title,
  b.nodes_json,
  b.edges_json,
  b.created_at AS board_created_at,
  b.updated_at AS board_updated_at
FROM pdi_plans p
LEFT JOIN boards b ON b.pdi_plan_id = p.id
WHERE p.id = ?
LIMIT 1
`);

const constraintMessages = {
  userEmail: 'UNIQUE constraint failed: users.email',
  planId: 'UNIQUE constraint failed: pdi_plans.id',
  boardPlan: 'UNIQUE constraint failed: boards.pdi_plan_id'
};

const isSqliteConstraint = (error: unknown, constraintMessage: string) => {
  if (!(error instanceof Error)) return false;
  return error.message.includes(constraintMessage);
};

export const isUniqueUserEmailError = (error: unknown) =>
  isSqliteConstraint(error, constraintMessages.userEmail);

export const withTransaction = <T>(operation: () => T): T => {
  database.exec('BEGIN IMMEDIATE');

  try {
    const result = operation();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
};

export const countAdmins = () => {
  const result = countAdminsStatement.get() as { total: number } | undefined;
  return result?.total ?? 0;
};

export const findUserByEmail = (email: string) => {
  const row = userByEmailStatement.get(email) as UserRow | undefined;
  return row ? toUser(row) : null;
};

export const findUserById = (id: string) => {
  const row = userByIdStatement.get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
};

export const createUser = (input: {
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  id?: string;
}) => {
  const createdAt = nowIso();
  const userId = input.id ?? randomUUID();

  createUserStatement.run(userId, input.name, input.email, input.passwordHash, input.role, createdAt, createdAt);

  const user = findUserById(userId);

  if (!user) {
    throw new Error('Failed to create user');
  }

  return user;
};

export const upsertUserByEmail = (input: {
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  id?: string;
}) => {
  const existingUser = findUserByEmail(input.email);

  if (!existingUser) {
    return createUser(input);
  }

  const updatedAt = nowIso();
  updateUserByEmailStatement.run(input.name, input.passwordHash, input.role, updatedAt, input.email);

  const updatedUser = findUserByEmail(input.email);

  if (!updatedUser) {
    throw new Error('Failed to upsert user');
  }

  return updatedUser;
};

export const listUsers = () => {
  const rows = listUsersStatement.all() as UserRow[];
  return rows.map(toUser);
};

export const listPdiPlans = (user: { id: string; role: UserRole }) => {
  const rows =
    user.role === 'ADMIN'
      ? (plansAllStatement.all() as PdiPlanRow[])
      : (plansByOwnerStatement.all(user.id) as PdiPlanRow[]);

  return rows.map(toPlan);
};

export const countPdiPlansByOwner = (ownerId: string) => {
  const result = plansCountByOwnerStatement.get(ownerId) as { total: number } | undefined;
  return result?.total ?? 0;
};

export const createPdiPlan = (input: {
  ownerId: string;
  title: string;
  objective: string;
  status?: PdiStatus;
  dueDate?: Date | null;
  id?: string;
}) => {
  const planId = input.id ?? randomUUID();
  const createdAt = nowIso();

  createPlanStatement.run(
    planId,
    input.ownerId,
    input.title,
    input.objective,
    input.status ?? 'DRAFT',
    input.dueDate?.toISOString() ?? null,
    createdAt,
    createdAt
  );

  const plan = findPdiPlanById(planId);

  if (!plan) {
    throw new Error('Failed to create PDI plan');
  }

  return plan;
};

export const findPdiPlanById = (id: string) => {
  const row = planByIdStatement.get(id) as PdiPlanRow | undefined;
  return row ? toPlan(row) : null;
};

export const findPdiPlanWithBoardById = (id: string) => {
  const row = planWithBoardStatement.get(id) as
    | (PdiPlanRow & {
        board_id: string | null;
        pdi_plan_id: string | null;
        board_title: string | null;
        nodes_json: string | null;
        edges_json: string | null;
        board_created_at: string | null;
        board_updated_at: string | null;
      })
    | undefined;

  if (!row) return null;

  const plan = toPlan(row);

  if (!row.board_id || !row.pdi_plan_id || !row.board_title || !row.nodes_json || !row.edges_json) {
    return { ...plan, board: null } satisfies DatabasePdiPlanWithBoard;
  }

  return {
    ...plan,
    board: toBoard({
      id: row.board_id,
      pdi_plan_id: row.pdi_plan_id,
      title: row.board_title,
      nodes_json: row.nodes_json,
      edges_json: row.edges_json,
      created_at: row.board_created_at ?? nowIso(),
      updated_at: row.board_updated_at ?? nowIso()
    })
  } satisfies DatabasePdiPlanWithBoard;
};

export const updatePdiPlan = (input: {
  id: string;
  ownerId: string;
  title: string;
  objective: string;
  status: PdiStatus;
  dueDate: Date | null;
}) => {
  updatePlanStatement.run(
    input.ownerId,
    input.title,
    input.objective,
    input.status,
    input.dueDate?.toISOString() ?? null,
    nowIso(),
    input.id
  );

  const plan = findPdiPlanById(input.id);

  if (!plan) {
    throw new Error('Failed to update PDI plan');
  }

  return plan;
};

export const upsertPdiPlanById = (input: {
  id: string;
  ownerId: string;
  title: string;
  objective: string;
  status: PdiStatus;
  dueDate?: Date | null;
}) => {
  const currentPlan = findPdiPlanById(input.id);

  if (!currentPlan) {
    return createPdiPlan({
      id: input.id,
      ownerId: input.ownerId,
      title: input.title,
      objective: input.objective,
      status: input.status,
      dueDate: input.dueDate ?? null
    });
  }

  return updatePdiPlan({
    id: input.id,
    ownerId: input.ownerId,
    title: input.title,
    objective: input.objective,
    status: input.status,
    dueDate: input.dueDate ?? null
  });
};

export const deletePdiPlanById = (id: string) => {
  deletePlanStatement.run(id);
};

export const upsertBoardByPdiPlanId = (input: {
  pdiPlanId: string;
  title: string;
  nodes: unknown[];
  edges: unknown[];
}) => {
  const existingBoard = findBoardByPdiPlanId(input.pdiPlanId);
  const now = nowIso();

  if (!existingBoard) {
    const boardId = randomUUID();

    createBoardStatement.run(
      boardId,
      input.pdiPlanId,
      input.title,
      JSON.stringify(input.nodes),
      JSON.stringify(input.edges),
      now,
      now
    );

    const createdBoard = findBoardByPdiPlanId(input.pdiPlanId);

    if (!createdBoard) {
      throw new Error('Failed to create board');
    }

    return createdBoard;
  }

  updateBoardByPlanIdStatement.run(
    input.title,
    JSON.stringify(input.nodes),
    JSON.stringify(input.edges),
    now,
    input.pdiPlanId
  );

  const updatedBoard = findBoardByPdiPlanId(input.pdiPlanId);

  if (!updatedBoard) {
    throw new Error('Failed to update board');
  }

  return updatedBoard;
};

export const findBoardByPdiPlanId = (pdiPlanId: string) => {
  const row = boardByPlanIdStatement.get(pdiPlanId) as BoardRow | undefined;
  return row ? toBoard(row) : null;
};

export const closeDatabase = () => {
  database.close();
};
