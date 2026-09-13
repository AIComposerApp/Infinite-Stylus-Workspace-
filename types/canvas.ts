export interface Point {
  x: number;
  y: number;
  pressure?: number;
  time?: number;
}

export type StylusToolType = 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'select' | 'pan';

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
  tool: StylusToolType;
  textEquivalent?: string;
  timestamp: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export interface ThoughtSentenceLine {
  text: string;
  x: number;
  y: number;
  width: number;
}

export interface ThoughtSentence {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lineIndex: number;
  lines?: ThoughtSentenceLine[];
}

export interface AIThought {
  id: string;
  x: number;
  y: number;
  status: 'thinking' | 'writing' | 'completed';
  prompt: string;
  text: string;
  sentences: ThoughtSentence[];
  revealedCount: number;
  color: string;
  fontFamily: string;
  createdAt: number;
  lastUpdated: number;
  writingStartTime?: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasTextItem {
  id: string;
  text: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CanvasImageItem {
  id: string;
  src: string; // base64 or URL
  x: number;
  y: number;
  width: number;
  height: number;
  naturalWidth?: number;
  naturalHeight?: number;
  aspectRatio?: number;
  name?: string;
  caption?: string;
  createdAt: number;
  updatedAt?: number;
}

export type ShapeType =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'circle'
  | 'triangle'
  | 'star'
  | 'diamond'
  | 'line'
  | 'arrow'
  | 'sticky-note';

export interface CanvasShapeItem {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  text?: string;
  textColor?: string;
  fontSize?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CanvasChecklistEntry {
  id: string;
  text: string;
  completed: boolean;
}

export interface CanvasChecklistItem {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  items: CanvasChecklistEntry[];
  hideCompleted: boolean;
  themeColor?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectNote {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  isPinned: boolean;
  strokes: Stroke[];
  thoughts: AIThought[];
  canvasTexts?: CanvasTextItem[];
  images?: CanvasImageItem[];
  shapes?: CanvasShapeItem[];
  checklists?: CanvasChecklistItem[];
  viewport: Viewport;
  previewThumbnail?: string;
}

export interface SelectionState {
  selectedSentenceIds: string[];
  selectedStrokeIds: string[];
  activeText: string;
  screenPosition: { x: number; y: number } | null;
}
