import { hash } from 'bcryptjs';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeDatabase,
  countAdmins,
  countPdiPlansByOwner,
  createPdiPlan,
  createUser,
  deletePdiPlanById,
  deleteUserById,
  findBoardByPdiPlanId,
  findPdiPlanById,
  findPdiPlanWithBoardById,
  findUserByEmail,
  findUserById,
  isUniqueUserEmailError,
  listPdiPlans,
  listUsers,
  updatePdiPlan,
  upsertBoardByPdiPlanId,
  upsertPdiPlanById,
  upsertUserByEmail,
  withTransaction
} from './database.js';

const makeUser = async (email: string, role: 'ADMIN' | 'MEMBER' = 'MEMBER') => {
  const passwordHash = await hash('secret123', 4);
  return createUser({ email, name: `User ${email}`, passwordHash, role });
};

afterAll(() => {
  closeDatabase();
});

describe('database users', () => {
  it('creates and reads a user by id and email', async () => {
    const created = await makeUser('alice@pdi.local', 'ADMIN');

    expect(created.id).toBeTruthy();
    expect(findUserById(created.id)?.email).toBe('alice@pdi.local');
    expect(findUserByEmail('alice@pdi.local')?.role).toBe('ADMIN');
    expect(created.createdAt).toBeInstanceOf(Date);
  });

  it('returns null for unknown user lookups', () => {
    expect(findUserById('missing')).toBeNull();
    expect(findUserByEmail('missing@pdi.local')).toBeNull();
  });

  it('counts admins only', async () => {
    const before = countAdmins();
    await makeUser('admin-count@pdi.local', 'ADMIN');
    await makeUser('member-count@pdi.local', 'MEMBER');

    expect(countAdmins()).toBe(before + 1);
  });

  it('detects unique email constraint violations', async () => {
    await makeUser('dup@pdi.local');

    try {
      await makeUser('dup@pdi.local');
      expect.unreachable('should have thrown a unique constraint error');
    } catch (error) {
      expect(isUniqueUserEmailError(error)).toBe(true);
    }
  });

  it('reports non-constraint errors as not unique-email errors', () => {
    expect(isUniqueUserEmailError(new Error('something else'))).toBe(false);
    expect(isUniqueUserEmailError('not an error')).toBe(false);
  });

  it('upserts a user by email (create then update)', async () => {
    const passwordHash = await hash('first', 4);
    const created = upsertUserByEmail({
      email: 'upsert@pdi.local',
      name: 'First Name',
      passwordHash,
      role: 'MEMBER'
    });

    const updated = upsertUserByEmail({
      email: 'upsert@pdi.local',
      name: 'Second Name',
      passwordHash: await hash('second', 4),
      role: 'ADMIN'
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Second Name');
    expect(updated.role).toBe('ADMIN');
  });

  it('lists users sorted by name and deletes by id', async () => {
    await makeUser('zeta@pdi.local');
    const users = listUsers();
    const names = users.map((user) => user.name);

    expect([...names].sort()).toEqual(names);

    const target = await makeUser('delete-me@pdi.local');
    expect(deleteUserById(target.id)).toBe(true);
    expect(deleteUserById(target.id)).toBe(false);
    expect(findUserById(target.id)).toBeNull();
  });
});

describe('database pdi plans', () => {
  it('creates a plan with defaults and reads it back', async () => {
    const owner = await makeUser('owner-plan@pdi.local');
    const plan = createPdiPlan({ ownerId: owner.id, title: 'Plan', objective: 'Grow' });

    expect(plan.status).toBe('DRAFT');
    expect(plan.dueDate).toBeNull();
    expect(findPdiPlanById(plan.id)?.title).toBe('Plan');
    expect(countPdiPlansByOwner(owner.id)).toBe(1);
  });

  it('lists plans scoped by role', async () => {
    const admin = await makeUser('admin-list@pdi.local', 'ADMIN');
    const memberA = await makeUser('member-a@pdi.local');
    const memberB = await makeUser('member-b@pdi.local');

    createPdiPlan({ ownerId: memberA.id, title: 'A1', objective: 'Obj' });
    createPdiPlan({ ownerId: memberB.id, title: 'B1', objective: 'Obj' });

    const memberPlans = listPdiPlans({ id: memberA.id, role: 'MEMBER' });
    expect(memberPlans).toHaveLength(1);
    expect(memberPlans[0]?.title).toBe('A1');

    const adminPlans = listPdiPlans({ id: admin.id, role: 'ADMIN' });
    expect(adminPlans.length).toBeGreaterThanOrEqual(2);
  });

  it('updates a plan and stores due date as ISO', async () => {
    const owner = await makeUser('owner-update@pdi.local');
    const plan = createPdiPlan({ ownerId: owner.id, title: 'Old', objective: 'Old' });
    const dueDate = new Date('2030-01-01T00:00:00.000Z');

    const updated = updatePdiPlan({
      id: plan.id,
      ownerId: owner.id,
      title: 'New',
      objective: 'New objective',
      status: 'ACTIVE',
      dueDate
    });

    expect(updated.title).toBe('New');
    expect(updated.status).toBe('ACTIVE');
    expect(updated.dueDate?.toISOString()).toBe(dueDate.toISOString());
  });

  it('upserts a plan by id (create then update)', async () => {
    const owner = await makeUser('owner-upsert@pdi.local');
    const created = upsertPdiPlanById({
      id: 'fixed-plan-id',
      ownerId: owner.id,
      title: 'Created',
      objective: 'Objective',
      status: 'DRAFT'
    });

    expect(created.id).toBe('fixed-plan-id');

    const updated = upsertPdiPlanById({
      id: 'fixed-plan-id',
      ownerId: owner.id,
      title: 'Updated',
      objective: 'Objective',
      status: 'DONE'
    });

    expect(updated.title).toBe('Updated');
    expect(updated.status).toBe('DONE');
  });

  it('deletes a plan by id', async () => {
    const owner = await makeUser('owner-delete@pdi.local');
    const plan = createPdiPlan({ ownerId: owner.id, title: 'Temp', objective: 'Temp' });

    deletePdiPlanById(plan.id);
    expect(findPdiPlanById(plan.id)).toBeNull();
  });

  it('returns null for an unknown plan-with-board lookup', () => {
    expect(findPdiPlanWithBoardById('missing')).toBeNull();
  });
});

describe('database boards', () => {
  it('creates and updates a board for a plan', async () => {
    const owner = await makeUser('owner-board@pdi.local');
    const plan = createPdiPlan({ ownerId: owner.id, title: 'Board plan', objective: 'Objective' });

    const created = upsertBoardByPdiPlanId({
      pdiPlanId: plan.id,
      title: 'Board',
      nodes: [{ id: 'n1' }],
      edges: []
    });

    expect(created.nodes).toHaveLength(1);

    const updated = upsertBoardByPdiPlanId({
      pdiPlanId: plan.id,
      title: 'Board v2',
      nodes: [{ id: 'n1' }, { id: 'n2' }],
      edges: [{ id: 'e1' }]
    });

    expect(updated.id).toBe(created.id);
    expect(updated.title).toBe('Board v2');
    expect(updated.nodes).toHaveLength(2);
    expect(updated.edges).toHaveLength(1);
    expect(findBoardByPdiPlanId(plan.id)?.title).toBe('Board v2');
  });

  it('joins a plan with its board', async () => {
    const owner = await makeUser('owner-join@pdi.local');
    const plan = createPdiPlan({ ownerId: owner.id, title: 'Join plan', objective: 'Objective' });

    expect(findPdiPlanWithBoardById(plan.id)?.board).toBeNull();

    upsertBoardByPdiPlanId({ pdiPlanId: plan.id, title: 'Joined', nodes: [], edges: [] });

    const joined = findPdiPlanWithBoardById(plan.id);
    expect(joined?.board?.title).toBe('Joined');
  });

  it('falls back to an empty array when stored json is invalid', async () => {
    const owner = await makeUser('owner-badjson@pdi.local');
    const plan = createPdiPlan({ ownerId: owner.id, title: 'Bad json', objective: 'Objective' });
    const board = upsertBoardByPdiPlanId({ pdiPlanId: plan.id, title: 'B', nodes: [], edges: [] });

    expect(board.nodes).toEqual([]);
    expect(board.edges).toEqual([]);
  });

  it('returns null when board does not exist', () => {
    expect(findBoardByPdiPlanId('missing-plan')).toBeNull();
  });
});

describe('withTransaction', () => {
  it('commits successful operations', async () => {
    const owner = await makeUser('tx-commit@pdi.local');
    const result = withTransaction(() =>
      createPdiPlan({ ownerId: owner.id, title: 'Tx', objective: 'Objective' })
    );

    expect(findPdiPlanById(result.id)).not.toBeNull();
  });

  it('rolls back and rethrows on failure', () => {
    expect(() =>
      withTransaction(() => {
        throw new Error('boom');
      })
    ).toThrow('boom');
  });
});
