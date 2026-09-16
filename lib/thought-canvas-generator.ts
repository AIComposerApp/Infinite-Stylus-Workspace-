import { Stroke, CanvasTextItem } from '@/types/canvas';
import { calculateStrokeBounds } from '@/lib/canvas-utils';

export interface ParsedThoughtCanvas {
  strokes: Stroke[];
  canvasTexts: CanvasTextItem[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * Parses existing serialized canvas payload or generates authentic hand-drawn strokes
 * and handwritten texts for any shared thought.
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

      if (strokes.length > 0 || canvasTexts.length > 0) {
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
          if (t.x + 300 > maxX) maxX = t.x + 300;
          if (t.y + 100 > maxY) maxY = t.y + 100;
        });

        if (minX === Infinity) {
          minX = 100;
          minY = 100;
          maxX = 700;
          maxY = 500;
        }

        return { strokes, canvasTexts, bounds: { minX, minY, maxX, maxY } };
      }
    } catch {
      // Fallback to generated canvas
    }
  }

  // Generate authentic thought sketches
  const strokes: Stroke[] = [];
  const canvasTexts: CanvasTextItem[] = [];

  const categoryColors: Record<string, { stroke: string; accent: string }> = {
    Engineering: { stroke: '#1E293B', accent: '#2563EB' },
    'Creative Vision': { stroke: '#18181B', accent: '#D97706' },
    Introspection: { stroke: '#1C1917', accent: '#059669' },
    'Philosophy & Study': { stroke: '#0F172A', accent: '#7C3AED' },
    'Ventures & Work': { stroke: '#1E1E1E', accent: '#DC2626' },
  };

  const colors = categoryColors[category] || { stroke: '#1E1E1E', accent: '#2563EB' };

  // 1. Central handwritten title
  canvasTexts.push({
    id: `text_title_${now}_1`,
    x: 220,
    y: 120,
    text: title,
    color: colors.stroke,
    fontSize: 28,
    createdAt: now,
    updatedAt: now,
  });

  // 2. Hand-drawn enclosing thought frame / cloud
  const framePoints: { x: number; y: number; pressure: number }[] = [];
  const originX = 200;
  const originY = 100;
  const frameWidth = 520;
  const frameHeight = 360;

  // Top wavy edge
  for (let x = 0; x <= frameWidth; x += 15) {
    const wobble = Math.sin(x * 0.05) * 4;
    framePoints.push({ x: originX + x, y: originY + wobble, pressure: 0.65 });
  }
  // Right wavy edge
  for (let y = 0; y <= frameHeight; y += 15) {
    const wobble = Math.cos(y * 0.05) * 4;
    framePoints.push({ x: originX + frameWidth + wobble, y: originY + y, pressure: 0.7 });
  }
  // Bottom wavy edge
  for (let x = frameWidth; x >= 0; x -= 15) {
    const wobble = Math.sin(x * 0.05) * 4;
    framePoints.push({ x: originX + x, y: originY + frameHeight + wobble, pressure: 0.65 });
  }
  // Left wavy edge
  for (let y = frameHeight; y >= 0; y -= 15) {
    const wobble = Math.cos(y * 0.05) * 4;
    framePoints.push({ x: originX + wobble, y: originY + y, pressure: 0.7 });
  }

  strokes.push({
    id: `stroke_frame_${now}_1`,
    points: framePoints,
    color: '#94A3B8',
    width: 2.2,
    tool: 'pen',
    timestamp: now,
    bounds: calculateStrokeBounds(framePoints),
  });

  // 3. Hand-drawn underline under title
  const underlinePoints: { x: number; y: number; pressure: number }[] = [];
  for (let x = 0; x <= 320; x += 10) {
    const wobble = Math.sin(x * 0.08) * 2;
    underlinePoints.push({ x: 220 + x, y: 162 + wobble, pressure: 0.8 });
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

  // 4. Conceptual sketch diagram: Central node + radiated sub-ideas
  const nodeCenters = [
    { x: 300, y: 240, label: 'Core Insight' },
    { x: 480, y: 220, label: 'Convergence' },
    { x: 390, y: 350, label: 'Future Horizon' },
  ];

  nodeCenters.forEach((n, idx) => {
    // Circle stroke
    const circlePoints: { x: number; y: number; pressure: number }[] = [];
    const rad = 36;
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
      x: n.x - 30,
      y: n.y - 10,
      text: n.label,
      color: colors.stroke,
      fontSize: 14,
      createdAt: now,
      updatedAt: now,
    });
  });

  // 5. Connective living ink branches
  const branch1: { x: number; y: number; pressure: number }[] = [];
  for (let t = 0; t <= 1; t += 0.05) {
    const bx = (1 - t) * 336 + t * 444;
    const by = (1 - t) * 240 + t * 220 + Math.sin(t * Math.PI) * -16;
    branch1.push({ x: bx, y: by, pressure: 0.7 });
  }
  strokes.push({
    id: `stroke_branch_1_${now}`,
    points: branch1,
    color: '#64748B',
    width: 2,
    tool: 'pen',
    timestamp: now,
    bounds: calculateStrokeBounds(branch1),
  });

  const branch2: { x: number; y: number; pressure: number }[] = [];
  for (let t = 0; t <= 1; t += 0.05) {
    const bx = (1 - t) * 300 + t * 390;
    const by = (1 - t) * 276 + t * 320 + Math.sin(t * Math.PI) * 12;
    branch2.push({ x: bx, y: by, pressure: 0.7 });
  }
  strokes.push({
    id: `stroke_branch_2_${now}`,
    points: branch2,
    color: '#64748B',
    width: 2,
    tool: 'pen',
    timestamp: now,
    bounds: calculateStrokeBounds(branch2),
  });

  const branch3: { x: number; y: number; pressure: number }[] = [];
  for (let t = 0; t <= 1; t += 0.05) {
    const bx = (1 - t) * 480 + t * 410;
    const by = (1 - t) * 256 + t * 330 + Math.sin(t * Math.PI) * 14;
    branch3.push({ x: bx, y: by, pressure: 0.7 });
  }
  strokes.push({
    id: `stroke_branch_3_${now}`,
    points: branch3,
    color: '#64748B',
    width: 2,
    tool: 'pen',
    timestamp: now,
    bounds: calculateStrokeBounds(branch3),
  });

  return {
    strokes,
    canvasTexts,
    bounds: {
      minX: originX - 40,
      minY: originY - 40,
      maxX: originX + frameWidth + 60,
      maxY: originY + frameHeight + 60,
    },
  };
}
