import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@pdi/contracts';
import {
  createSoftwareDeveloperRoadmapTemplate,
  normalizeNodesParentingByFrames,
  softwareDeveloperRoadmapPlanObjective,
  softwareDeveloperRoadmapPlanStatus,
  softwareDeveloperRoadmapPlanTitle
} from './software-developer-roadmap-template.js';

const frameNode = (id: string, x: number, y: number, width: number, height: number): CanvasNode => ({
  id,
  kind: 'FRAME',
  label: `frame-${id}`,
  position: { x, y },
  style: {
    color: '#1f2937',
    height,
    textStyle: { align: 'left', fontSize: 14, verticalAlign: 'top' },
    width
  }
});

const noteNode = (id: string, x: number, y: number): CanvasNode => ({
  id,
  kind: 'NOTE',
  label: `note-${id}`,
  position: { x, y },
  style: {
    color: '#2563eb',
    height: 80,
    textStyle: { align: 'left', fontSize: 14, verticalAlign: 'top' },
    width: 120
  }
});

describe('software developer roadmap template regression', () => {
  it('should keep roadmap metadata stable', () => {
    const template = createSoftwareDeveloperRoadmapTemplate();

    expect(template.plan.title).toBe(softwareDeveloperRoadmapPlanTitle);
    expect(template.plan.objective).toBe(softwareDeveloperRoadmapPlanObjective);
    expect(template.plan.status).toBe(softwareDeveloperRoadmapPlanStatus);
    expect(template.board.title).toContain(softwareDeveloperRoadmapPlanTitle);
  });

  it('should generate a dense board for collaboration', () => {
    const template = createSoftwareDeveloperRoadmapTemplate();

    expect(template.board.nodes.length).toBeGreaterThan(20);
    expect(template.board.edges.length).toBeGreaterThan(10);
    expect(template.board.nodes.some((node) => node.kind === 'FRAME')).toBe(true);
    expect(template.board.nodes.some((node) => node.kind === 'TASK_LIST')).toBe(true);
  });

  it('should assign parent frame by node center and keep relative position', () => {
    const nodes = [
      frameNode('frame-root', 100, 100, 500, 400),
      frameNode('frame-nested', 240, 220, 180, 150),
      noteNode('inside-smallest-frame', 270, 250),
      noteNode('inside-root-only', 540, 390),
      noteNode('outside-any-frame', 20, 20)
    ];

    const normalized = normalizeNodesParentingByFrames(nodes);
    const nested = normalized.find((node) => node.id === 'inside-smallest-frame');
    const rootOnly = normalized.find((node) => node.id === 'inside-root-only');
    const outside = normalized.find((node) => node.id === 'outside-any-frame');

    expect(nested?.parentId).toBe('frame-nested');
    expect(nested?.position).toEqual({ x: 30, y: 30 });

    expect(rootOnly?.parentId).toBe('frame-root');
    expect(rootOnly?.position).toEqual({ x: 440, y: 290 });

    expect(outside?.parentId).toBeUndefined();
    expect(outside?.position).toEqual({ x: 20, y: 20 });
  });
});
