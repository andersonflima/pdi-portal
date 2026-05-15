import { z } from 'zod';

export const userRoleSchema = z.enum(['ADMIN', 'MEMBER']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});
export type LoginInput = z.infer<typeof loginSchema>;

export const bootstrapAdminSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8)
});
export type BootstrapAdminInput = z.infer<typeof bootstrapAdminSchema>;

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: userRoleSchema
});
export type User = z.infer<typeof userSchema>;

export const bootstrapStatusSchema = z.object({
  canCreateAdmin: z.boolean()
});
export type BootstrapStatus = z.infer<typeof bootstrapStatusSchema>;

export const pdiStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'DONE']);
export type PdiStatus = z.infer<typeof pdiStatusSchema>;

export const pdiPlanSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  title: z.string(),
  objective: z.string(),
  status: pdiStatusSchema,
  dueDate: z.string().nullable(),
  createdAt: z.string()
});
export type PdiPlan = z.infer<typeof pdiPlanSchema>;

export const canvasNodeKindSchema = z.enum([
  'NOTE',
  'STICKER',
  'CARD',
  'SHAPE',
  'TEXT',
  'TASK',
  'TASK_LIST',
  'GOAL',
  'FRAME'
]);
export type CanvasNodeKind = z.infer<typeof canvasNodeKindSchema>;

export const canvasShapeVariantSchema = z.enum([
  'RECTANGLE',
  'ROUNDED_RECTANGLE',
  'CIRCLE',
  'DIAMOND',
  'TRIANGLE',
  'PARALLELOGRAM',
  'HEXAGON',
  'CYLINDER',
  'DOCUMENT',
  'CLOUD'
]);
export type CanvasShapeVariant = z.infer<typeof canvasShapeVariantSchema>;

export const canvasTextAlignSchema = z.enum(['left', 'center', 'right']);
export type CanvasTextAlign = z.infer<typeof canvasTextAlignSchema>;

export const canvasTextVerticalAlignSchema = z.enum(['top', 'center', 'bottom']);
export type CanvasTextVerticalAlign = z.infer<typeof canvasTextVerticalAlignSchema>;

export const canvasEdgeTypeSchema = z.enum(['default', 'straight', 'step', 'smoothstep']);
export type CanvasEdgeType = z.infer<typeof canvasEdgeTypeSchema>;

export const canvasEdgeLineStyleSchema = z.enum(['solid', 'dashed']);
export type CanvasEdgeLineStyle = z.infer<typeof canvasEdgeLineStyleSchema>;

export const canvasNodeSchema = z.object({
  id: z.string(),
  kind: canvasNodeKindSchema,
  label: z.string(),
  checked: z.boolean().optional(),
  description: z.string().optional(),
  parentId: z.string().optional(),
  taskItems: z
    .array(
      z.object({
        checked: z.boolean(),
        id: z.string(),
        label: z.string()
      })
    )
    .optional(),
  variant: canvasShapeVariantSchema.optional(),
  position: z.object({
    x: z.number(),
    y: z.number()
  }),
  style: z.object({
    backgroundColor: z.string().optional(),
    color: z.string(),
    textStyle: z
      .object({
        align: canvasTextAlignSchema.optional(),
        bold: z.boolean().optional(),
        fontSize: z.number().min(8).max(96).optional(),
        italic: z.boolean().optional(),
        underline: z.boolean().optional(),
        verticalAlign: canvasTextVerticalAlignSchema.optional()
      })
      .optional(),
    width: z.number().optional(),
    height: z.number().optional()
  })
});
export type CanvasNode = z.infer<typeof canvasNodeSchema>;

export const canvasEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceHandle: z.string().optional(),
  target: z.string(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
  style: z
    .object({
      color: z.string().optional(),
      lineStyle: canvasEdgeLineStyleSchema.optional(),
      type: canvasEdgeTypeSchema.optional()
    })
    .optional()
});
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>;

export const boardSchema = z.object({
  id: z.string(),
  pdiPlanId: z.string(),
  title: z.string(),
  nodes: z.array(canvasNodeSchema),
  edges: z.array(canvasEdgeSchema),
  updatedAt: z.string()
});
export type Board = z.infer<typeof boardSchema>;

export const saveBoardSchema = boardSchema.pick({
  title: true,
  nodes: true,
  edges: true
});
export type SaveBoardInput = z.infer<typeof saveBoardSchema>;

export const pdiPlanExportSchema = z.object({
  exportedAt: z.string(),
  version: z.literal(1),
  plan: z.object({
    title: z.string().min(3),
    objective: z.string().min(3),
    status: pdiStatusSchema,
    dueDate: z.string().nullable()
  }),
  board: z.object({
    title: z.string().min(1),
    nodes: z.array(canvasNodeSchema),
    edges: z.array(canvasEdgeSchema)
  })
});
export type PdiPlanExport = z.infer<typeof pdiPlanExportSchema>;
