import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import {
  closeDatabase,
  createUser,
  findBoardByPdiPlanId,
  findPdiPlanById
} from './database.js';
import { buildDefaultRoadmapPlanId, upsertDefaultRoadmapForUser } from './default-roadmap-plan.js';
import { softwareDeveloperRoadmapPlanTitle } from './software-developer-roadmap-template.js';

const seedOwner = (id: string) =>
  createUser({ id, email: `${id}@pdi.local`, name: id, passwordHash: 'hash', role: 'MEMBER' });

beforeAll(() => {
  seedOwner('owner-42');
  seedOwner('owner-idempotent');
  seedOwner('owner-x');
});

afterAll(() => {
  closeDatabase();
});

describe('default roadmap plan', () => {
  it('builds a deterministic plan id for an owner', () => {
    expect(buildDefaultRoadmapPlanId('owner-42')).toBe('default-roadmap-owner-42');
  });

  it('creates the roadmap plan and a populated board for a user', () => {
    const plan = upsertDefaultRoadmapForUser({ ownerId: 'owner-42' });

    expect(plan.id).toBe('default-roadmap-owner-42');
    expect(plan.title).toBe(softwareDeveloperRoadmapPlanTitle);

    const board = findBoardByPdiPlanId(plan.id);
    expect(board?.nodes.length).toBeGreaterThan(0);
    expect(board?.edges.length).toBeGreaterThan(0);
  });

  it('is idempotent across repeated calls', () => {
    const first = upsertDefaultRoadmapForUser({ ownerId: 'owner-idempotent' });
    const second = upsertDefaultRoadmapForUser({ ownerId: 'owner-idempotent' });

    expect(first.id).toBe(second.id);
    expect(findPdiPlanById(first.id)).not.toBeNull();
  });

  it('honors an explicit plan id', () => {
    const plan = upsertDefaultRoadmapForUser({ ownerId: 'owner-x', planId: 'custom-plan-id' });
    expect(plan.id).toBe('custom-plan-id');
  });
});
