import { upsertBoardByPdiPlanId, upsertPdiPlanById } from './database.js';
import { createSoftwareDeveloperRoadmapTemplate } from './software-developer-roadmap-template.js';

export const buildDefaultRoadmapPlanId = (ownerId: string) => `default-roadmap-${ownerId}`;

export const upsertDefaultRoadmapForUser = (input: { ownerId: string; planId?: string }) => {
  const template = createSoftwareDeveloperRoadmapTemplate();
  const plan = upsertPdiPlanById({
    id: input.planId ?? buildDefaultRoadmapPlanId(input.ownerId),
    objective: template.plan.objective,
    ownerId: input.ownerId,
    status: template.plan.status,
    title: template.plan.title
  });

  upsertBoardByPdiPlanId({
    edges: template.board.edges,
    nodes: template.board.nodes,
    pdiPlanId: plan.id,
    title: template.board.title
  });

  return plan;
};
