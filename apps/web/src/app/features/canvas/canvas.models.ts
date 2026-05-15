import type {
  CanvasEdgeLineStyle,
  CanvasEdgeType,
  CanvasNodeKind,
  CanvasShapeVariant,
  CanvasTextAlign,
  CanvasTextVerticalAlign
} from '@pdi/contracts';

export type XYPosition = {
  x: number;
  y: number;
};

export type CanvasHandlePosition = 'top' | 'right' | 'bottom' | 'left';

export type CanvasTaskItem = {
  checked: boolean;
  id: string;
  label: string;
};

export type CanvasTextStyle = {
  align?: CanvasTextAlign;
  bold?: boolean;
  fontSize?: number;
  italic?: boolean;
  underline?: boolean;
  verticalAlign?: CanvasTextVerticalAlign;
};

export type CanvasNodeView = {
  backgroundColor?: string;
  checked?: boolean;
  color: string;
  description?: string;
  height: number;
  id: string;
  kind: CanvasNodeKind;
  label: string;
  parentId?: string;
  position: XYPosition;
  taskItems?: CanvasTaskItem[];
  textStyle?: CanvasTextStyle;
  variant?: CanvasShapeVariant;
  width: number;
  zIndex: number;
};

export type CanvasEdgeView = {
  id: string;
  label?: string;
  source: string;
  sourceHandle?: string;
  style: {
    color: string;
    lineStyle: CanvasEdgeLineStyle;
    type: CanvasEdgeType;
  };
  target: string;
  targetHandle?: string;
};

export type CanvasEdgeDirection = 'left-to-right' | 'right-to-left' | 'both';

export type CanvasNodeMeta = {
  action: string;
  color: string;
  defaultDescription?: string;
  height: number;
  iconName: string;
  label: string;
  width: number;
};

export type CanvasNodeDataPatch = Partial<
  Pick<CanvasNodeView, 'checked' | 'description' | 'label' | 'taskItems' | 'textStyle'>
>;

export type CanvasNodeStylePatch = Partial<Pick<CanvasNodeView, 'backgroundColor' | 'color'>>;

export type CanvasEdgePatch = {
  color?: string;
  direction?: CanvasEdgeDirection;
  label?: string;
  lineStyle?: CanvasEdgeLineStyle;
  type?: CanvasEdgeType;
};

export type RgbColor = {
  blue: number;
  green: number;
  red: number;
};
