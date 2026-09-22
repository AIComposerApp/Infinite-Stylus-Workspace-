import {
  Stroke,
  CanvasTextItem,
  CanvasShapeItem,
  CanvasImageItem,
  CanvasChecklistItem,
  CanvasConnectorItem,
} from '@/types/canvas';
import { calculateStrokeBounds } from '@/lib/canvas-utils';

export interface ParsedThoughtCanvas {
  strokes: Stroke[];
  canvasTexts: CanvasTextItem[];
  shapes: CanvasShapeItem[];
  images: CanvasImageItem[];
  checklists: CanvasChecklistItem[];
  connectors: CanvasConnectorItem[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * Parses existing serialized canvas payload or generates authentic hand-drawn strokes,
 * shapes, sticky notes, checklists, and handwritten texts for any shared thought.
 */
export function parseOrGenerateThoughtCanvas(
  title: string,
  category: string,
  rawPayload?: string
): ParsedThoughtCanvas {
  const now = Date.now();

  if (rawPayload && rawPayload.trim().length > 10) {
    try {
      const parsed = JSON.parse(rawPayload);
      const strokes: Stroke[] = Array.isArray(parsed.strokes) ? parsed.strokes : [];
      const canvasTexts: CanvasTextItem[] = Array.isArray(parsed.canvasTexts) ? parsed.canvasTexts : [];
      const shapes: CanvasShapeItem[] = Array.isArray(parsed.shapes) ? parsed.shapes : [];
      const images: CanvasImageItem[] = Array.isArray(parsed.images) ? parsed.images : [];
      const checklists: CanvasChecklistItem[] = Array.isArray(parsed.checklists) ? parsed.checklists : [];
      const connectors: CanvasConnectorItem[] = Array.isArray(parsed.connectors) ? parsed.connectors : [];

      if (
        strokes.length > 0 ||
        canvasTexts.length > 0 ||
        shapes.length > 0 ||
        images.length > 0 ||
        checklists.length > 0
      ) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        strokes.forEach((s) => {
          s.points.forEach((p) => {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
          });
        });

        canvasTexts.forEach((t) => {
          if (t.x < minX) minX = t.x;
          if (t.y < minY) minY = t.y;
          if (t.x + 280 > maxX) maxX = t.x + 280;
          if (t.y + 60 > maxY) maxY = t.y + 60;
        });

        shapes.forEach((s) => {
          if (s.x < minX) minX = s.x;
          if (s.y < minY) minY = s.y;
          if (s.x + s.width > maxX) maxX = s.x + s.width;
          if (s.y + s.height > maxY) maxY = s.y + s.height;
        });

        images.forEach((img) => {
          if (img.x < minX) minX = img.x;
          if (img.y < minY) minY = img.y;
          if (img.x + img.width > maxX) maxX = img.x + img.width;
          if (img.y + img.height > maxY) maxY = img.y + img.height;
        });

        checklists.forEach((c) => {
          if (c.x < minX) minX = c.x;
          if (c.y < minY) minY = c.y;
          if (c.x + c.width > maxX) maxX = c.x + c.width;
          if (c.y + 200 > maxY) maxY = c.y + 200;
        });

        connectors.forEach((conn) => {
          if (conn.from.x < minX) minX = conn.from.x;
          if (conn.from.y < minY) minY = conn.from.y;
          if (conn.to.x > maxX) maxX = conn.to.x;
          if (conn.to.y > maxY) maxY = conn.to.y;
        });

        if (minX === Infinity) {
          minX = 100;
          minY = 100;
          maxX = 700;
          maxY = 500;
        }

        return {
          strokes,
          canvasTexts,
          shapes,
          images,
          checklists,
          connectors,
          bounds: { minX, minY, maxX, maxY },
        };
      }
    } catch {
      // Fallback to generated canvas
    }
  }

  // Generate authentic multidimensional thought sketches
  const strokes: Stroke[] = [];
  const canvasTexts: CanvasTextItem[] = [];
  const shapes: CanvasShapeItem[] = [];
  const images: CanvasImageItem[] = [];
  const checklists: CanvasChecklistItem[] = [];
  const connectors: CanvasConnectorItem[] = [];

  const categoryColors: Record<string, { stroke: string; accent: string; sticky: string }> = {
    Engineering: { stroke: '#1E293B', accent: '#2563EB', sticky: '#EFF6FF' },
    'Creative Vision': { stroke: '#18181B', accent: '#D97706', sticky: '#FEF3C7' },
    Introspection: { stroke: '#1C1917', accent: '#059669', sticky: '#ECFDF5' },
    'Philosophy & Study': { stroke: '#0F172A', accent: '#7C3AED', sticky: '#F5F3FF' },
    'Ventures & Work': { stroke: '#1E1E1E', accent: '#DC2626', sticky: '#FEF2F2' },
  };

  const colors = categoryColors[category] || { stroke: '#1E1E1E', accent: '#2563EB', sticky: '#FEF3C7' };

  // 1. Central handwritten title
  canvasTexts.push({
    id: `text_title_${now}_1`,
    x: 220,
    y: 110,
    text: title,
    color: colors.stroke,
    fontSize: 26,
    createdAt: now,
    updatedAt: now,
  });

  // 2. Sticky Note card with core observation
  shapes.push({
    id: `shape_sticky_${now}`,
    type: 'sticky-note',
    x: 600,
    y: 150,
    width: 200,
    height: 180,
    strokeColor: colors.accent,
    strokeWidth: 1.5,
    fillColor: colors.sticky,
    text: `Core Focus:\n• Iterate spontaneously\n• Preserve creative momentum`,
    textColor: '#1E1E1E',
    fontSize: 14,
    createdAt: now,
    updatedAt: now,
  });

  // 3. Checklist Card
  checklists.push({
    id: `checklist_${now}`,
    title: 'Key Milestones',
    x: 180,
    y: 430,
    width: 260,
    hideCompleted: false,
    themeColor: colors.accent,
    items: [
      { id: `c1_${now}`, text: 'Establish spatial anchors', completed: true },
      { id: `c2_${now}`, text: 'Bridge analytical & visual models', completed: true },
      { id: `c3_${now}`, text: 'Refine living ink transitions', completed: false },
    ],
    createdAt: now,
    updatedAt: now,
  });

  // 4. Hand-drawn enclosing thought frame
  const framePoints: { x: number; y: number; pressure: number }[] = [];
  const originX = 180;
  const originY = 90;
  const frameWidth = 660;
  const frameHeight = 560;

  for (let x = 0; x <= frameWidth; x += 15) {
    const wobble = Math.sin(x * 0.05) * 3;
    framePoints.push({ x: originX + x, y: originY + wobble, pressure: 0.65 });
  }
  for (let y = 0; y <= frameHeight; y += 15) {
    const wobble = Math.cos(y * 0.05) * 3;
    framePoints.push({ x: originX + frameWidth + wobble, y: originY + y, pressure: 0.7 });
  }
  for (let x = frameWidth; x >= 0; x -= 15) {
    const wobble = Math.sin(x * 0.05) * 3;
    framePoints.push({ x: originX + x, y: originY + frameHeight + wobble, pressure: 0.65 });
  }
  for (let y = frameHeight; y >= 0; y -= 15) {
    const wobble = Math.cos(y * 0.05) * 3;
    framePoints.push({ x: originX + wobble, y: originY + y, pressure: 0.7 });
  }

  strokes.push({
    id: `stroke_frame_${now}_1`,
    points: framePoints,
    color: '#CBD5E1',
    width: 1.8,
    tool: 'pen',
    timestamp: now,
    bounds: calculateStrokeBounds(framePoints),
  });

  // 5. Hand-drawn accent highlight under title
  const underlinePoints: { x: number; y: number; pressure: number }[] = [];
  for (let x = 0; x <= 280; x += 10) {
    const wobble = Math.sin(x * 0.08) * 2;
    underlinePoints.push({ x: 220 + x, y: 148 + wobble, pressure: 0.8 });
  }
  strokes.push({
    id: `stroke_ul_${now}_2`,
    points: underlinePoints,
    color: colors.accent,
    width: 3.5,
    tool: 'highlighter',
    timestamp: now,
    bounds: calculateStrokeBounds(underlinePoints),
  });

  // 6. Connector arrow linking ideas
  connectors.push({
    id: `connector_${now}`,
    from: { x: 380, y: 260 },
    to: { x: 590, y: 230 },
    label: 'feeds into',
    color: colors.accent,
    width: 2,
    style: 'curved',
    arrowHead: 'end',
    createdAt: now,
    updatedAt: now,
  });

  // 7. Conceptual node clusters
  const nodeCenters = [
    { x: 300, y: 260, label: 'Core Insight' },
    { x: 490, y: 350, label: 'Horizon' },
  ];

  nodeCenters.forEach((n, idx) => {
    const circlePoints: { x: number; y: number; pressure: number }[] = [];
    const rad = 34;
    for (let a = 0; a <= Math.PI * 2 + 0.3; a += 0.2) {
      const wobble = (Math.random() - 0.5) * 2;
      circlePoints.push({
        x: n.x + Math.cos(a) * (rad + wobble),
        y: n.y + Math.sin(a) * (rad + wobble),
        pressure: 0.6,
      });
    }
    strokes.push({
      id: `stroke_node_${idx}_${now}`,
      points: circlePoints,
      color: colors.accent,
      width: 2,
      tool: 'pen',
      timestamp: now,
      bounds: calculateStrokeBounds(circlePoints),
    });

    canvasTexts.push({
      id: `text_node_${idx}_${now}`,
      x: n.x - 28,
      y: n.y - 8,
      text: n.label,
      color: colors.stroke,
      fontSize: 14,
      createdAt: now,
      updatedAt: now,
    });
  });

  return {
    strokes,
    canvasTexts,
    shapes,
    images,
    checklists,
    connectors,
    bounds: {
      minX: originX - 40,
      minY: originY - 40,
      maxX: originX + frameWidth + 60,
      maxY: originY + frameHeight + 60,
    },
  };
}
