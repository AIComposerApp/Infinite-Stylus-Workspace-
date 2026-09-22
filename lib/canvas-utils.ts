import {
  Point,
  Stroke,
  AIThought,
  ThoughtSentence,
  ThoughtSentenceLine,
  Viewport,
  ProjectNote,
  CanvasTextItem,
  CanvasImageItem,
  CanvasShapeItem,
  CanvasChecklistItem,
  CanvasConnectorItem,
  CanvasConnectorEndpoint,
  ConnectorAnchorSide,
} from '@/types/canvas';
import { jsPDF } from 'jspdf';

// Calculate bounds for a set of points
export function calculateStrokeBounds(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return { minX, minY, maxX, maxY };
}

// Calculate exact visual bounds for a typed or pasted text item, taking line-wrapping into account
export function calculateCanvasTextBounds(
  text: string,
  x: number,
  y: number,
  maxWidth: number = 640,
  lineHeight: number = 32,
  charWidthApprox: number = 11.5
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  if (!text || !text.trim()) {
    return { minX: x, minY: y, maxX: x + 100, maxY: y + lineHeight, width: 100, height: lineHeight };
  }

  const rawLines = text.split('\n');
  let currentY = y;
  let maxW = 0;

  for (const rLine of rawLines) {
    if (!rLine) {
      currentY += lineHeight;
      continue;
    }
    const words = rLine.split(/\s+/);
    let currentLine = words[0] || '';

    for (let w = 1; w < words.length; w++) {
      const testLine = `${currentLine} ${words[w]}`;
      if (testLine.length * charWidthApprox > maxWidth && currentLine.length > 0) {
        maxW = Math.max(maxW, currentLine.length * charWidthApprox);
        currentY += lineHeight;
        currentLine = words[w];
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine.length > 0) {
      maxW = Math.max(maxW, currentLine.length * charWidthApprox);
      currentY += lineHeight;
    }
  }

  const finalWidth = Math.min(maxWidth, Math.max(80, maxW));
  const finalHeight = Math.max(lineHeight, currentY - y);

  return {
    minX: x,
    minY: y,
    maxX: x + finalWidth,
    maxY: y + finalHeight,
    width: finalWidth,
    height: finalHeight,
  };
}

// Find a completely non-overlapping spawn point for AI assistant response, regardless of text length
export function findCollisionFreeAssistantSpawn(
  targetText: CanvasTextItem | null,
  canvasTexts: CanvasTextItem[],
  thoughts: AIThought[],
  strokes: Stroke[],
  fallbackCenter: { x: number; y: number }
): { x: number; y: number } {
  let spawnX = fallbackCenter.x - 120;
  let spawnY = fallbackCenter.y - 40;

  if (targetText && targetText.text && targetText.text.trim()) {
    const targetBounds = calculateCanvasTextBounds(targetText.text, targetText.x, targetText.y);
    spawnX = targetText.x;
    let candidateY = targetBounds.maxY + 36; // Generous breathing room below the text

    // Check against any other canvas items that lie below or around this horizontal band [spawnX - 40, spawnX + 760]
    const bandLeft = spawnX - 40;
    const bandRight = spawnX + 760;

    // Check all other canvas texts
    for (const item of canvasTexts) {
      if (item.id === targetText.id || !item.text || !item.text.trim()) continue;
      const b = calculateCanvasTextBounds(item.text, item.x, item.y);
      const horizontalOverlap = !(b.maxX < bandLeft || b.minX > bandRight);
      if (horizontalOverlap && b.maxY >= candidateY - 10 && b.minY <= candidateY + 320) {
        candidateY = Math.max(candidateY, b.maxY + 36);
      }
    }

    // Check thoughts
    for (const th of thoughts) {
      if (!th.bounds) continue;
      const horizontalOverlap = !(th.bounds.maxX < bandLeft || th.bounds.minX > bandRight);
      if (horizontalOverlap && th.bounds.maxY >= candidateY - 10 && th.bounds.minY <= candidateY + 320) {
        candidateY = Math.max(candidateY, th.bounds.maxY + 36);
      }
    }

    // Check strokes
    for (const st of strokes) {
      if (!st.bounds) continue;
      const horizontalOverlap = !(st.bounds.maxX < bandLeft || st.bounds.minX > bandRight);
      if (horizontalOverlap && st.bounds.maxY >= candidateY - 10 && st.bounds.minY <= candidateY + 320) {
        candidateY = Math.max(candidateY, st.bounds.maxY + 36);
      }
    }

    spawnY = candidateY;
  } else {
    // If no target text, check the lowest completed element
    let lowestY = -Infinity;
    let refX = spawnX;

    for (const item of canvasTexts) {
      if (!item.text || !item.text.trim()) continue;
      const b = calculateCanvasTextBounds(item.text, item.x, item.y);
      if (b.maxY > lowestY) {
        lowestY = b.maxY;
        refX = b.minX;
      }
    }

    for (const th of thoughts) {
      if (th.bounds && th.bounds.maxY > lowestY) {
        lowestY = th.bounds.maxY;
        refX = th.bounds.minX;
      }
    }

    if (lowestY > -Infinity) {
      spawnX = refX;
      spawnY = lowestY + 40;
    }
  }

  return { x: spawnX, y: spawnY };
}

// Smooth natural stroke drawing with pressure sensitivity and Bezier interpolation
export function drawSmoothStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  scale: number = 1
) {
  const { points, color, width, tool } = stroke;
  if (points.length < 2) {
    if (points.length === 1) {
      const p = points[0];
      const press = typeof p.pressure === 'number' && p.pressure > 0 ? p.pressure : 0.5;
      const dotRadius = Math.max(0.8, (width * (0.4 + 0.8 * press)) / 2);
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return;
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (tool === 'highlighter') {
    ctx.strokeStyle = color.startsWith('#') ? `${color}4D` : 'rgba(254, 240, 138, 0.45)';
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineWidth = width * 3.5;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    ctx.quadraticCurveTo(prev.x, prev.y, last.x, last.y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Check if stroke has variable pressure (e.g. from S-Pen or stylus digitizer)
  const hasPressureVariation = points.some(
    (p) => typeof p.pressure === 'number' && Math.abs(p.pressure - 0.5) > 0.04
  );

  if (tool === 'pencil') {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.72;

    if (!hasPressureVariation) {
      ctx.lineWidth = width * 0.9;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      const last = points[points.length - 1];
      const prev = points[points.length - 2];
      ctx.quadraticCurveTo(prev.x, prev.y, last.x, last.y);
      ctx.stroke();
    } else {
      let prevMidX = (points[0].x + points[1].x) / 2;
      let prevMidY = (points[0].y + points[1].y) / 2;

      for (let i = 1; i < points.length - 1; i++) {
        const curr = points[i];
        const next = points[i + 1];
        const nextMidX = (curr.x + next.x) / 2;
        const nextMidY = (curr.y + next.y) / 2;
        const pr = typeof curr.pressure === 'number' && curr.pressure > 0 ? curr.pressure : 0.5;
        ctx.lineWidth = Math.max(0.6, width * 0.85 * (0.5 + 0.8 * pr));

        ctx.beginPath();
        ctx.moveTo(prevMidX, prevMidY);
        ctx.quadraticCurveTo(curr.x, curr.y, nextMidX, nextMidY);
        ctx.stroke();

        prevMidX = nextMidX;
        prevMidY = nextMidY;
      }
    }
    ctx.restore();
    return;
  }

  // Pen Tool: Natural ink rendering with pressure responsiveness
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.95;

  if (hasPressureVariation) {
    // Render with variable-width quadratic Bézier curves for calligraphic S-Pen feel
    const p0 = points[0];
    const p1 = points[1];
    let prevMidX = (p0.x + p1.x) / 2;
    let prevMidY = (p0.y + p1.y) / 2;

    // Start tip
    const p0Press = typeof p0.pressure === 'number' && p0.pressure > 0 ? p0.pressure : 0.4;
    ctx.lineWidth = Math.max(0.8, width * (0.35 + 0.95 * p0Press));
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(prevMidX, prevMidY);
    ctx.stroke();

    for (let i = 1; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const nextMidX = (curr.x + next.x) / 2;
      const nextMidY = (curr.y + next.y) / 2;

      // Smooth pressure with neighbors to eliminate micro-steps
      const prevP = points[i - 1];
      const prPrev = typeof prevP.pressure === 'number' && prevP.pressure > 0 ? prevP.pressure : 0.5;
      const prCurr = typeof curr.pressure === 'number' && curr.pressure > 0 ? curr.pressure : 0.5;
      const prNext = typeof next.pressure === 'number' && next.pressure > 0 ? next.pressure : 0.5;
      const smoothedPress = prPrev * 0.25 + prCurr * 0.5 + prNext * 0.25;

      const segWidth = Math.max(0.8, width * (0.35 + 0.95 * smoothedPress));
      ctx.lineWidth = segWidth;

      ctx.beginPath();
      ctx.moveTo(prevMidX, prevMidY);
      ctx.quadraticCurveTo(curr.x, curr.y, nextMidX, nextMidY);
      ctx.stroke();

      prevMidX = nextMidX;
      prevMidY = nextMidY;
    }

    // End tail
    const last = points[points.length - 1];
    const lastPress = typeof last.pressure === 'number' && last.pressure > 0 ? last.pressure : 0.35;
    ctx.lineWidth = Math.max(0.8, width * (0.35 + 0.95 * lastPress));
    ctx.beginPath();
    ctx.moveTo(prevMidX, prevMidY);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  } else {
    // Fast single path for uniform pointer inputs
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }

    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    ctx.quadraticCurveTo(prev.x, prev.y, last.x, last.y);
    ctx.stroke();
  }

  ctx.restore();
}

// Split generated text into natural sentences with laid-out coordinates
export function layoutHandwrittenText(
  text: string,
  startX: number,
  startY: number,
  maxWidth: number = 420,
  lineHeight: number = 32,
  charWidthApprox: number = 9
): { sentences: ThoughtSentence[]; totalBounds: { minX: number; minY: number; maxX: number; maxY: number } } {
  // Regex to split into sentences while preserving text
  const sentenceRegex = /[^.!?\n]+[.!?\n]+/g;
  const rawSentences = text.match(sentenceRegex) || [text];
  
  const sentences: ThoughtSentence[] = [];
  let currentY = startY;
  let currentX = startX;
  let overallMinX = startX;
  let overallMinY = startY;
  let overallMaxX = startX;
  let overallMaxY = startY;

  let lineIdx = 0;

  for (let sIdx = 0; sIdx < rawSentences.length; sIdx++) {
    const raw = rawSentences[sIdx].trim();
    if (!raw) continue;

    // Word wrap this sentence into discrete rendered lines
    const words = raw.split(/\s+/);
    const sentenceLines: ThoughtSentenceLine[] = [];
    let currentLineWords: string[] = [];
    const sentenceStartX = currentX;
    const sentenceStartY = currentY;
    let sentenceMaxX = currentX;

    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const word = words[wIdx];
      const testLine = [...currentLineWords, word].join(' ');
      const testWidth = testLine.length * charWidthApprox;

      if (testWidth > maxWidth && currentLineWords.length > 0) {
        const lineText = currentLineWords.join(' ');
        const lineWidth = lineText.length * charWidthApprox;
        sentenceLines.push({
          text: lineText,
          x: currentX,
          y: currentY,
          width: lineWidth,
        });
        sentenceMaxX = Math.max(sentenceMaxX, currentX + lineWidth);
        currentY += lineHeight;
        lineIdx++;
        currentLineWords = [word];
      } else {
        currentLineWords.push(word);
      }
    }

    if (currentLineWords.length > 0) {
      const lineText = currentLineWords.join(' ');
      const lineWidth = lineText.length * charWidthApprox;
      sentenceLines.push({
        text: lineText,
        x: currentX,
        y: currentY,
        width: lineWidth,
      });
      sentenceMaxX = Math.max(sentenceMaxX, currentX + lineWidth);
      currentY += lineHeight;
      lineIdx++;
    }

    const approxWidth = Math.min(maxWidth, Math.max(120, sentenceMaxX - sentenceStartX));
    const approxHeight = Math.max(lineHeight, currentY - sentenceStartY);

    sentences.push({
      id: `sent-${Date.now()}-${sIdx}-${Math.random().toString(36).slice(2, 6)}`,
      text: raw,
      x: sentenceStartX,
      y: sentenceStartY,
      width: approxWidth,
      height: approxHeight,
      lineIndex: lineIdx,
      lines: sentenceLines,
    });

    currentY += lineHeight * 0.35; // gentle pause between sentences
    currentX = startX;

    overallMaxX = Math.max(overallMaxX, sentenceMaxX);
    overallMaxY = Math.max(overallMaxY, currentY);
  }

  return {
    sentences,
    totalBounds: {
      minX: overallMinX - 10,
      minY: overallMinY - 10,
      maxX: overallMaxX + 20,
      maxY: overallMaxY + 20,
    },
  };
}

// Calculate off-screen indicator position and angle for thought bubble
export function getOffScreenBubblePosition(
  targetCanvasX: number,
  targetCanvasY: number,
  viewport: Viewport,
  screenWidth: number,
  screenHeight: number,
  margin: number = 48
): { isOffScreen: boolean; screenX: number; screenY: number; angleRad: number } {
  const screenX = targetCanvasX * viewport.zoom + viewport.x;
  const screenY = targetCanvasY * viewport.zoom + viewport.y;

  const isInside =
    screenX >= margin &&
    screenX <= screenWidth - margin &&
    screenY >= margin &&
    screenY <= screenHeight - margin;

  if (isInside) {
    return { isOffScreen: false, screenX, screenY, angleRad: 0 };
  }

  // Vector from screen center
  const centerX = screenWidth / 2;
  const centerY = screenHeight / 2;
  const dx = screenX - centerX;
  const dy = screenY - centerY;
  const angleRad = Math.atan2(dy, dx);

  // Clamp to rectangular screen bounds minus margin
  const minX = margin;
  const maxX = screenWidth - margin;
  const minY = margin;
  const maxY = screenHeight - margin;

  let clampedX = centerX;
  let clampedY = centerY;

  if (dx === 0 && dy === 0) {
    return { isOffScreen: true, screenX: centerX, screenY: margin, angleRad: -Math.PI / 2 };
  }

  // Ray intersection with the 4 bounding box edges
  const tCandidates: number[] = [];

  if (dx > 0) tCandidates.push((maxX - centerX) / dx);
  if (dx < 0) tCandidates.push((minX - centerX) / dx);
  if (dy > 0) tCandidates.push((maxY - centerY) / dy);
  if (dy < 0) tCandidates.push((minY - centerY) / dy);

  const t = Math.min(...tCandidates.filter((v) => v > 0));

  clampedX = Math.max(minX, Math.min(maxX, centerX + dx * t));
  clampedY = Math.max(minY, Math.min(maxY, centerY + dy * t));

  return {
    isOffScreen: true,
    screenX: clampedX,
    screenY: clampedY,
    angleRad,
  };
}

// Draw vector shapes, lines, arrows, and sticky notes
export function drawCanvasShape(ctx: CanvasRenderingContext2D, shape: CanvasShapeItem) {
  const { type, x, y, width, height, strokeColor, strokeWidth, fillColor, text, textColor, fontSize = 18 } = shape;
  ctx.save();
  ctx.strokeStyle = strokeColor || '#1E1E1E';
  ctx.lineWidth = Math.max(1, strokeWidth || 2);
  ctx.fillStyle = fillColor || 'transparent';

  if (type === 'rectangle') {
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    if (fillColor && fillColor !== 'transparent') ctx.fill();
    if (strokeWidth > 0) ctx.stroke();
  } else if (type === 'rounded-rectangle') {
    ctx.beginPath();
    const radius = Math.min(16, Math.min(Math.abs(width), Math.abs(height)) / 4);
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(x, y, width, height, radius);
    } else {
      ctx.rect(x, y, width, height);
    }
    if (fillColor && fillColor !== 'transparent') ctx.fill();
    if (strokeWidth > 0) ctx.stroke();
  } else if (type === 'circle') {
    ctx.beginPath();
    ctx.ellipse(x + width / 2, y + height / 2, Math.abs(width / 2), Math.abs(height / 2), 0, 0, Math.PI * 2);
    if (fillColor && fillColor !== 'transparent') ctx.fill();
    if (strokeWidth > 0) ctx.stroke();
  } else if (type === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(x + width / 2, y);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.closePath();
    if (fillColor && fillColor !== 'transparent') ctx.fill();
    if (strokeWidth > 0) ctx.stroke();
  } else if (type === 'diamond') {
    ctx.beginPath();
    ctx.moveTo(x + width / 2, y);
    ctx.lineTo(x + width, y + height / 2);
    ctx.lineTo(x + width / 2, y + height);
    ctx.lineTo(x, y + height / 2);
    ctx.closePath();
    if (fillColor && fillColor !== 'transparent') ctx.fill();
    if (strokeWidth > 0) ctx.stroke();
  } else if (type === 'star') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const spikes = 5;
    const outerRadius = Math.min(Math.abs(width), Math.abs(height)) / 2;
    const innerRadius = outerRadius * 0.44;
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      let sx = cx + Math.cos(rot) * outerRadius;
      let sy = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(sx, sy);
      rot += step;

      sx = cx + Math.cos(rot) * innerRadius;
      sy = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(sx, sy);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    if (fillColor && fillColor !== 'transparent') ctx.fill();
    if (strokeWidth > 0) ctx.stroke();
  } else if (type === 'line') {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y + height);
    ctx.stroke();
  } else if (type === 'arrow') {
    const fromX = x;
    const fromY = y;
    const toX = x + width;
    const toY = y + height;
    const headlen = Math.min(22, Math.max(12, Math.hypot(width, height) * 0.2));
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = strokeColor || '#1E1E1E';
    ctx.fill();
  } else if (type === 'sticky-note') {
    // High-performance clean paper drop tint (avoids GPU blur pipeline stall during zoom/pan)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(x + 2, y + 2, width, height);

    ctx.fillStyle = fillColor || '#FEF08A';
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(x, y, width, height, 4);
    } else {
      ctx.rect(x, y, width, height);
    }
    ctx.fill();

    ctx.strokeStyle = strokeColor || 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Top paper tape indicator
    ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
    ctx.fillRect(x, y, width, Math.min(18, height * 0.12));
  }

  // Draw text if present (for sticky notes or labeled shapes)
  if (text && text.trim()) {
    ctx.font = `${fontSize}px "Kalam", "Caveat", cursive`;
    ctx.fillStyle = textColor || (fillColor === '#18181B' ? '#FFFFFF' : '#1E1E1E');

    const isSticky = type === 'sticky-note';
    const paddingX = isSticky ? 14 : Math.max(12, Math.abs(width) * 0.1);
    const maxTextW = Math.max(30, Math.abs(width) - paddingX * 2);
    const rawParagraphs = text.split('\n');
    const wrappedLines: string[] = [];

    for (const rawLine of rawParagraphs) {
      if (!rawLine.trim()) {
        wrappedLines.push('');
        continue;
      }
      const words = rawLine.split(' ');
      let lineBuf = '';
      for (let w = 0; w < words.length; w++) {
        const testLine = lineBuf ? `${lineBuf} ${words[w]}` : words[w];
        if (ctx.measureText(testLine).width > maxTextW && lineBuf) {
          wrappedLines.push(lineBuf);
          lineBuf = words[w];
        } else {
          lineBuf = testLine;
        }
      }
      if (lineBuf) wrappedLines.push(lineBuf);
    }

    const lineH = fontSize * 1.32;
    const totalTextH = wrappedLines.length * lineH;

    if (isSticky) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      let curY = y + 22;
      for (const line of wrappedLines) {
        if (line) ctx.fillText(line, x + paddingX, curY);
        curY += lineH;
        if (curY > y + height - 10) break;
      }
    } else {
      // Geometric shapes: cleanly centered horizontally & vertically
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const startY = y + height / 2 - totalTextH / 2 + lineH / 2;
      const centerX = x + width / 2;
      for (let i = 0; i < wrappedLines.length; i++) {
        const line = wrappedLines[i];
        const lineY = startY + i * lineH;
        if (lineY >= y + 6 && lineY <= y + height - 6) {
          if (line) ctx.fillText(line, centerX, lineY);
        }
      }
    }
  }

  ctx.restore();
}

// Export canvas contents as high-resolution PNG image
export async function exportCanvasToImage(
  strokes: Stroke[],
  thoughts: AIThought[],
  canvasTexts: CanvasTextItem[] = [],
  images: CanvasImageItem[] = [],
  shapes: CanvasShapeItem[] = [],
  checklists: CanvasChecklistItem[] = [],
  options: { padding?: number; background?: string } = {}
): Promise<string> {
  const padding = options.padding ?? 60;
  const bgColor = options.background ?? '#FAF9F6';

  if (
    strokes.length === 0 &&
    thoughts.length === 0 &&
    canvasTexts.length === 0 &&
    images.length === 0 &&
    shapes.length === 0 &&
    checklists.length === 0
  ) {
    // Empty canvas default size
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const s of strokes) {
    minX = Math.min(minX, s.bounds.minX);
    minY = Math.min(minY, s.bounds.minY);
    maxX = Math.max(maxX, s.bounds.maxX);
    maxY = Math.max(maxY, s.bounds.maxY);
  }

  for (const t of thoughts) {
    minX = Math.min(minX, t.bounds.minX);
    minY = Math.min(minY, t.bounds.minY);
    maxX = Math.max(maxX, t.bounds.maxX);
    maxY = Math.max(maxY, t.bounds.maxY);
  }

  for (const ct of canvasTexts) {
    minX = Math.min(minX, ct.x);
    minY = Math.min(minY, ct.y);
    maxX = Math.max(maxX, ct.x + (ct.width || 300));
    maxY = Math.max(maxY, ct.y + (ct.height || 100));
  }

  for (const img of images) {
    minX = Math.min(minX, img.x);
    minY = Math.min(minY, img.y);
    maxX = Math.max(maxX, img.x + img.width);
    maxY = Math.max(maxY, img.y + img.height);
  }

  for (const sh of shapes) {
    minX = Math.min(minX, Math.min(sh.x, sh.x + sh.width));
    minY = Math.min(minY, Math.min(sh.y, sh.y + sh.height));
    maxX = Math.max(maxX, Math.max(sh.x, sh.x + sh.width));
    maxY = Math.max(maxY, Math.max(sh.y, sh.y + sh.height));
  }

  for (const ch of checklists) {
    const cardW = ch.width || 300;
    const itemsCount = ch.hideCompleted
      ? ch.items.filter((i) => !i.completed).length
      : ch.items.length;
    const cardH = 50 + itemsCount * 28;
    minX = Math.min(minX, ch.x);
    minY = Math.min(minY, ch.y);
    maxX = Math.max(maxX, ch.x + cardW);
    maxY = Math.max(maxY, ch.y + cardH);
  }

  // Pre-load all images asynchronously
  const loadedImages: { item: CanvasImageItem; element: HTMLImageElement }[] = [];
  if (images.length > 0) {
    await Promise.all(
      images.map((img) => {
        return new Promise<void>((resolve) => {
          const el = new Image();
          el.crossOrigin = 'anonymous';
          el.onload = () => {
            loadedImages.push({ item: img, element: el });
            resolve();
          };
          el.onerror = () => resolve();
          el.src = img.src;
        });
      })
    );
  }

  const width = Math.max(600, maxX - minX + padding * 2);
  const height = Math.max(400, maxY - minY + padding * 2);

  const canvas = document.createElement('canvas');
  canvas.width = width * 2; // 2x DPI
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Subtle dot grid
  ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  for (let x = 0; x < width; x += 28) {
    for (let y = 0; y < height; y += 28) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.save();
  ctx.translate(-minX + padding, -minY + padding);

  // 1. Draw shapes & sticky notes (bottom layer)
  for (const shape of shapes) {
    drawCanvasShape(ctx, shape);
  }

  // 2. Draw images
  for (const { item, element } of loadedImages) {
    try {
      ctx.drawImage(element, item.x, item.y, item.width, item.height);
    } catch (_) {}
  }

  // 3. Draw strokes
  for (const stroke of strokes) {
    drawSmoothStroke(ctx, stroke);
  }

  // 4. Draw user typed canvas texts in exact same handwriting style
  ctx.fillStyle = '#1E1E1E';
  ctx.font = '22px "Kalam", "Caveat", cursive';
  ctx.textBaseline = 'top';
  for (const ct of canvasTexts) {
    if (ct.text) {
      const rawLines = ct.text.split('\n');
      const maxLineWidth = ct.width || 720;
      const wrappedLines: string[] = [];
      for (const rLine of rawLines) {
        if (!rLine) {
          wrappedLines.push('');
          continue;
        }
        const words = rLine.split(' ');
        let currentLine = words[0] || '';
        for (let w = 1; w < words.length; w++) {
          const testLine = `${currentLine} ${words[w]}`;
          if (ctx.measureText(testLine).width > maxLineWidth) {
            wrappedLines.push(currentLine);
            currentLine = words[w];
          } else {
            currentLine = testLine;
          }
        }
        wrappedLines.push(currentLine);
      }

      let lineY = ct.y;
      for (const line of wrappedLines) {
        ctx.fillText(line, ct.x, lineY);
        lineY += 32;
      }
    }
  }

  // 5. Draw thoughts text in handwriting style
  for (const thought of thoughts) {
    ctx.fillStyle = thought.color || '#222222';
    if (thought.sentences && thought.sentences.length > 0) {
      for (const sentence of thought.sentences) {
        if (sentence.lines && sentence.lines.length > 0) {
          for (const line of sentence.lines) {
            ctx.fillText(line.text, line.x, line.y);
          }
        } else {
          ctx.fillText(sentence.text, sentence.x, sentence.y);
        }
      }
    } else {
      const lines = thought.text.split('\n');
      let lineY = thought.y;
      for (const line of lines) {
        ctx.fillText(line, thought.x, lineY);
        lineY += 30;
      }
    }
  }

  // 6. Draw checklists (dark theme card)
  for (const ch of checklists) {
    const cardW = ch.width || 300;
    const itemsToDraw = ch.hideCompleted
      ? ch.items.filter((i) => !i.completed)
      : ch.items;
    const cardH = 46 + Math.max(1, itemsToDraw.length) * 26 + 12;

    ctx.save();
    ctx.fillStyle = '#18181B';
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(ch.x, ch.y, cardW, cardH, 12);
    } else {
      ctx.rect(ch.x, ch.y, cardW, cardH);
    }
    ctx.fill();

    // Card border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Title
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(ch.title || 'Checklist', ch.x + 16, ch.y + 16);

    // Items
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    let itemY = ch.y + 40;
    for (const itm of itemsToDraw) {
      // Checkbox box
      ctx.strokeStyle = itm.completed ? '#10B981' : '#71717A';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ch.x + 16, itemY, 12, 12);
      if (itm.completed) {
        ctx.fillStyle = '#10B981';
        ctx.fillRect(ch.x + 16, itemY, 12, 12);
      }

      ctx.fillStyle = itm.completed ? '#71717A' : '#F4F4F5';
      ctx.fillText(itm.text, ch.x + 36, itemY + 2);
      itemY += 26;
    }
    ctx.restore();
  }

  ctx.restore();
  return canvas.toDataURL('image/png');
}

// Export canvas as vector/raster PDF
export async function exportCanvasToPDF(
  strokes: Stroke[],
  thoughts: AIThought[],
  canvasTexts: CanvasTextItem[] = [],
  images: CanvasImageItem[] = [],
  shapes: CanvasShapeItem[] = [],
  checklists: CanvasChecklistItem[] = [],
  title: string = 'Stylus Workspace Note'
): Promise<void> {
  const dataUrl = await exportCanvasToImage(strokes, thoughts, canvasTexts, images, shapes, checklists);
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [1200, 800],
  });

  pdf.addImage(dataUrl, 'PNG', 0, 0, 1200, 800);
  pdf.save(`${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.pdf`);
}

// Local storage project persistence
const STORAGE_KEY = 'stylus_infinite_workspace_projects_v2';
const ACTIVE_PROJECT_KEY = 'stylus_infinite_workspace_active_id_v2';

const DEFAULT_INITIAL_PROJECT_ID = 'proj-seed-default-1';

function getDefaultProjects(): ProjectNote[] {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  return [
    {
      id: 'proj-seed-pinned-1',
      title: 'Building a client website part 1',
      createdAt: now - 7 * ONE_DAY,
      updatedAt: now - 7 * ONE_DAY,
      isPinned: true,
      strokes: [
        {
          id: 'stroke-seed-1',
          points: [{ x: 120, y: 150 }, { x: 220, y: 190 }, { x: 280, y: 160 }],
          color: '#141414',
          width: 2.5,
          tool: 'pen',
          timestamp: now,
          bounds: { minX: 120, minY: 150, maxX: 280, maxY: 190 },
        },
        {
          id: 'stroke-seed-2',
          points: [{ x: 140, y: 220 }, { x: 260, y: 240 }],
          color: '#E08A1E',
          width: 2,
          tool: 'pen',
          timestamp: now,
          bounds: { minX: 140, minY: 220, maxX: 260, maxY: 240 },
        },
      ],
      thoughts: [],
      canvasTexts: [],
      images: [],
      shapes: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    {
      id: DEFAULT_INITIAL_PROJECT_ID,
      title: 'Idea Stream 8',
      createdAt: now - 2 * 3600 * 1000,
      updatedAt: now - 1800 * 1000,
      isPinned: false,
      strokes: [
        {
          id: 'stroke-seed-3',
          points: [{ x: 180, y: 140 }, { x: 240, y: 180 }, { x: 300, y: 140 }],
          color: '#7B8CB0',
          width: 2,
          tool: 'pen',
          timestamp: now,
          bounds: { minX: 180, minY: 140, maxX: 300, maxY: 180 },
        },
      ],
      thoughts: [],
      canvasTexts: [],
      images: [],
      shapes: [
        {
          id: 'shape-seed-1',
          type: 'circle',
          x: 200,
          y: 200,
          width: 140,
          height: 140,
          strokeColor: '#E08A1E',
          strokeWidth: 2,
          fillColor: 'transparent',
          text: 'Core insight',
          textColor: '#141414',
          fontSize: 14,
          createdAt: now,
          updatedAt: now,
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    {
      id: 'proj-seed-7d-1',
      title: 'Idea Stream 9',
      createdAt: now - 2 * ONE_DAY,
      updatedAt: now - 2 * ONE_DAY,
      isPinned: false,
      strokes: [],
      thoughts: [],
      canvasTexts: [],
      images: [],
      shapes: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    {
      id: 'proj-seed-7d-2',
      title: 'Mind Stream & Brainstorm',
      createdAt: now - 3 * ONE_DAY,
      updatedAt: now - 3 * ONE_DAY,
      isPinned: false,
      strokes: [],
      thoughts: [],
      canvasTexts: [
        {
          id: 'text-seed-1',
          text: 'Focus feels elusive because your brain is branching out.',
          x: 100,
          y: 120,
          color: '#141414',
          fontSize: 16,
          createdAt: now,
          updatedAt: now,
        },
      ],
      images: [],
      shapes: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    {
      id: 'proj-seed-30d-1',
      title: 'Weekly Goal',
      createdAt: now - 14 * ONE_DAY,
      updatedAt: now - 14 * ONE_DAY,
      isPinned: false,
      strokes: [
        {
          id: 'stroke-seed-4',
          points: [{ x: 100, y: 100 }, { x: 200, y: 150 }],
          color: '#7FA08A',
          width: 2,
          tool: 'pen',
          timestamp: now,
          bounds: { minX: 100, minY: 100, maxX: 200, maxY: 150 },
        },
      ],
      thoughts: [],
      canvasTexts: [],
      images: [],
      shapes: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  ];
}

export function loadSavedProjects(): ProjectNote[] {
  if (typeof window === 'undefined') return getDefaultProjects();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const defaults = getDefaultProjects();
      saveProjectsToStorage(defaults);
      saveActiveProjectId(defaults[0].id);
      return defaults;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    const defaults = getDefaultProjects();
    saveProjectsToStorage(defaults);
    return defaults;
  } catch (e) {
    console.error('Error loading projects from storage:', e);
    return getDefaultProjects();
  }
}

export function saveProjectsToStorage(projects: ProjectNote[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.warn('Storage quota warning or write failure:', e);
  }
}

export function autoSaveSingleProject(project: ProjectNote) {
  if (typeof window === 'undefined') return;
  try {
    const current = loadSavedProjects();
    const index = current.findIndex((p) => p.id === project.id);
    let updated: ProjectNote[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = { ...project, updatedAt: Date.now() };
    } else {
      updated = [project, ...current];
    }
    saveProjectsToStorage(updated);
  } catch (e) {
    console.error('Error auto-saving project:', e);
  }
}

export function loadActiveProjectId(): string | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem(ACTIVE_PROJECT_KEY);
  if (saved) return saved;
  const list = loadSavedProjects();
  return list.length > 0 ? list[0].id : DEFAULT_INITIAL_PROJECT_ID;
}

export function saveActiveProjectId(id: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_PROJECT_KEY, id);
  } catch (e) {
    console.warn('Failed to save active project ID:', e);
  }
}

// -------------------------------------------------------------------------
// DYNAMIC CURVY FLOWCHART CONNECTOR HELPERS
// -------------------------------------------------------------------------

export function getItemBoundingBox(
  itemId: string,
  images: CanvasImageItem[],
  shapes: CanvasShapeItem[],
  canvasTexts: CanvasTextItem[],
  checklists: CanvasChecklistItem[]
): { x: number; y: number; width: number; height: number } | null {
  const shape = shapes.find((s) => s.id === itemId);
  if (shape) {
    return {
      x: Math.min(shape.x, shape.x + shape.width),
      y: Math.min(shape.y, shape.y + shape.height),
      width: Math.abs(shape.width),
      height: Math.abs(shape.height),
    };
  }
  const img = images.find((i) => i.id === itemId);
  if (img) {
    return { x: img.x, y: img.y, width: img.width, height: img.height };
  }
  const txt = canvasTexts.find((t) => t.id === itemId);
  if (txt) {
    const bounds = calculateCanvasTextBounds(txt.text || '', txt.x, txt.y);
    return { x: txt.x, y: txt.y, width: bounds.width, height: bounds.height };
  }
  const chk = checklists.find((c) => c.id === itemId);
  if (chk) {
    const w = chk.width || 300;
    const count = chk.hideCompleted ? chk.items.filter((i) => !i.completed).length : chk.items.length;
    const h = 46 + Math.max(1, count) * 26 + 12;
    return { x: chk.x, y: chk.y, width: w, height: h };
  }
  return null;
}

export function getAnchorPointForSide(
  bounds: { x: number; y: number; width: number; height: number },
  side: ConnectorAnchorSide
): { x: number; y: number } {
  switch (side) {
    case 'top':
      return { x: bounds.x + bounds.width / 2, y: bounds.y };
    case 'right':
      return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
    case 'bottom':
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
    case 'left':
      return { x: bounds.x, y: bounds.y + bounds.height / 2 };
  }
}

export function resolveConnectorEndpoint(
  endpoint: CanvasConnectorEndpoint,
  images: CanvasImageItem[],
  shapes: CanvasShapeItem[],
  canvasTexts: CanvasTextItem[],
  checklists: CanvasChecklistItem[]
): { x: number; y: number; side?: ConnectorAnchorSide } {
  if (endpoint.itemId && endpoint.side) {
    const bounds = getItemBoundingBox(endpoint.itemId, images, shapes, canvasTexts, checklists);
    if (bounds) {
      const pt = getAnchorPointForSide(bounds, endpoint.side);
      return { x: pt.x, y: pt.y, side: endpoint.side };
    }
  }
  return { x: endpoint.x, y: endpoint.y, side: endpoint.side };
}

export function computeCurvyConnectorControlPoints(
  p1: { x: number; y: number; side?: ConnectorAnchorSide },
  p2: { x: number; y: number; side?: ConnectorAnchorSide }
): { cp1: { x: number; y: number }; cp2: { x: number; y: number } } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const curvature = Math.max(32, Math.min(220, dist * 0.45));

  const getDir = (side?: ConnectorAnchorSide, fallback: { x: number; y: number } = { x: 1, y: 0 }) => {
    switch (side) {
      case 'top': return { x: 0, y: -1 };
      case 'right': return { x: 1, y: 0 };
      case 'bottom': return { x: 0, y: 1 };
      case 'left': return { x: -1, y: 0 };
      default: return fallback;
    }
  };

  const defaultDir1 = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
  const defaultDir2 = { x: -defaultDir1.x, y: -defaultDir1.y };

  const dir1 = getDir(p1.side, defaultDir1);
  const dir2 = getDir(p2.side, defaultDir2);

  return {
    cp1: { x: p1.x + dir1.x * curvature, y: p1.y + dir1.y * curvature },
    cp2: { x: p2.x + dir2.x * curvature, y: p2.y + dir2.y * curvature },
  };
}

export function drawCurvyConnector(
  ctx: CanvasRenderingContext2D,
  connector: CanvasConnectorItem,
  images: CanvasImageItem[],
  shapes: CanvasShapeItem[],
  canvasTexts: CanvasTextItem[],
  checklists: CanvasChecklistItem[],
  isSelected: boolean = false
) {
  const start = resolveConnectorEndpoint(connector.from, images, shapes, canvasTexts, checklists);
  const end = resolveConnectorEndpoint(connector.to, images, shapes, canvasTexts, checklists);
  const { cp1, cp2 } = computeCurvyConnectorControlPoints(start, end);

  ctx.save();
  ctx.strokeStyle = isSelected ? '#2563EB' : (connector.color || '#374151');
  ctx.lineWidth = isSelected ? (connector.width || 2.5) + 1.5 : (connector.width || 2.2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
  ctx.stroke();

  // Draw end arrowhead
  if (connector.arrowHead !== 'none') {
    const endTangentX = end.x - cp2.x;
    const endTangentY = end.y - cp2.y;
    const angle = Math.atan2(endTangentY, endTangentX);
    const arrowLen = Math.max(10, (connector.width || 2.5) * 4.5);

    ctx.fillStyle = isSelected ? '#2563EB' : (connector.color || '#374151');
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(
      end.x - arrowLen * Math.cos(angle - Math.PI / 7),
      end.y - arrowLen * Math.sin(angle - Math.PI / 7)
    );
    ctx.lineTo(
      end.x - arrowLen * 0.75 * Math.cos(angle),
      end.y - arrowLen * 0.75 * Math.sin(angle)
    );
    ctx.lineTo(
      end.x - arrowLen * Math.cos(angle + Math.PI / 7),
      end.y - arrowLen * Math.sin(angle + Math.PI / 7)
    );
    ctx.closePath();
    ctx.fill();
  }

  // Draw start arrowhead if both
  if (connector.arrowHead === 'both') {
    const startTangentX = start.x - cp1.x;
    const startTangentY = start.y - cp1.y;
    const angle = Math.atan2(startTangentY, startTangentX);
    const arrowLen = Math.max(10, (connector.width || 2.5) * 4.5);

    ctx.fillStyle = isSelected ? '#2563EB' : (connector.color || '#374151');
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(
      start.x - arrowLen * Math.cos(angle - Math.PI / 7),
      start.y - arrowLen * Math.sin(angle - Math.PI / 7)
    );
    ctx.lineTo(
      start.x - arrowLen * 0.75 * Math.cos(angle),
      start.y - arrowLen * 0.75 * Math.sin(angle)
    );
    ctx.lineTo(
      start.x - arrowLen * Math.cos(angle + Math.PI / 7),
      start.y - arrowLen * Math.sin(angle + Math.PI / 7)
    );
    ctx.closePath();
    ctx.fill();
  }

  // Draw optional label at midpoint (t = 0.5)
  if (connector.label) {
    const t = 0.5;
    const midX =
      Math.pow(1 - t, 3) * start.x +
      3 * Math.pow(1 - t, 2) * t * cp1.x +
      3 * (1 - t) * Math.pow(t, 2) * cp2.x +
      Math.pow(t, 3) * end.x;
    const midY =
      Math.pow(1 - t, 3) * start.y +
      3 * Math.pow(1 - t, 2) * t * cp1.y +
      3 * (1 - t) * Math.pow(t, 2) * cp2.y +
      Math.pow(t, 3) * end.y;

    ctx.font = '12px system-ui, -apple-system, sans-serif';
    const textWidth = ctx.measureText(connector.label).width;
    const padX = 8;
    const padY = 4;
    const boxW = textWidth + padX * 2;
    const boxH = 20;

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#D1D5DB';
    ctx.lineWidth = 1;
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH, 10);
    } else {
      ctx.rect(midX - boxW / 2, midY - boxH / 2, boxW, boxH);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#374151';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(connector.label, midX, midY);
  }

  ctx.restore();
}

/**
 * Strips all markdown asterisks (*, **), bullets, dashes, hashtags, and code formatting,
 * ensuring AI outputs appear as clean, natural handwriting on the canvas.
 */
export function cleanAiOutput(raw: string): string {
  if (!raw) return '';

  return raw
    // Strip bold/italic markdown formatting: ***text***, **text**, *text*, ___text___, __text__, _text_
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
    // Strip any remaining stray asterisks anywhere in the string
    .replace(/\*/g, '')
    // Strip markdown headers (# Header, ## Subheader)
    .replace(/^[\s]*#+\s*/gm, '')
    // Strip bullet dashes, pluses, bullets (- Item, + Item, • Item)
    .replace(/^[\s]*[-+•]\s+/gm, '')
    // Strip numbered list markers at start of lines (1. Item, 1) Item)
    .replace(/^[\s]*\d+[\.\)]\s+/gm, '')
    // Strip blockquotes (> Quote)
    .replace(/^[\s]*>\s+/gm, '')
    // Strip backticks or tildes (`code`, ```code```)
    .replace(/[`~]/g, '')
    // Strip markdown dividers (---, ___, ===)
    .replace(/^[\s]*[-=_]{3,}\s*$/gm, '')
    // Strip markdown links [label](url) -> label
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Normalize excessive newlines (max 2 consecutive)
    .replace(/(\r\n|\r|\n){3,}/g, '\n\n')
    .trim();
}

