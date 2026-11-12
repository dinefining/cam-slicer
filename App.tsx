import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Point, Segment, InteractionState, HoveredHandle, Tool, Stroke, MaskOp } from './types';

// --- Look & feel: edit these to restyle the tool ---
const ACCENT_GREEN = '#059E00';      // Selected button, cursors and cut lines

// Buttons
const BUTTON_COLOR = '#282828';      // Unselected tool and action buttons
const BUTTON_TEXT_COLOR = '#8a8a8a'; // Unselected button text (the selected button picks black or white for contrast)
const BUTTON_DISABLED_TEXT_COLOR = '#4a4a4a'; // UNDO / REDO text when there's nothing to undo or redo
const ACTION_TRAY_COLOR = '#3d3d3d'; // The pill joining UNDO / REDO / RESET
const INFO_BUTTON_COLOR = '#C08525';
const INFO_BUTTON_TEXT_COLOR = '#000000';
const OUT_BUTTON_COLOR = '#A865C9';
const OUT_BUTTON_TEXT_COLOR = '#000000';
const INFO_DIM_OPACITY = 0.75;       // How dark everything behind the info box gets
const INFO_TEXT_COLOR = '#e6e6e6';
const INFO_BORDER_WIDTH = 3;         // px, info box border (in INFO_BUTTON_COLOR)

// Info box text: [label, description]. A label line break ('\n') stacks words. {KEY} shows as a chip,
// colored by kind so it reads consistently: tool letters orange; key combinations and touch gestures green;
// single keys and on-screen buttons purple.
const INFO_DESKTOP: [string, string][] = [
  ['MOVE / {V}', 'Drag a piece to move it. {OPT+DRAG} duplicates. Hold {CMD} in any tool to move pieces.'],
  ['SCALE\nROTATE', 'In MOVE, click a piece, then drag its corners to scale or just outside them to rotate. {SHIFT+ROTATE} snaps to 15°. Click it again to hide the controls.'],
  ['CUT / {X}', 'Click to place points, drag to draw freehand. Close the shape on its first point to cut it out of everything underneath. {SHIFT} keeps edges straight, {BACKSPACE} takes back a point, {ESC} cancels.'],
  ['CLONE / {C}', 'Click to pick a sample from the feed, then paint. {OPT+CLICK} picks a new one. Change the brush size with {[} or {]}.'],
  ['ERASE / {E}', 'Paint over the feed to erase parts. Change the brush size with {[} or {]}.'],
  ['OUT / {O}', 'Shows just the collage without the UI. Useful as a source in OBS to feed into a video call. Click or press {ESC} to come back.'],
  ['MORE TOOLS', '{CMD+C} {CMD+V} for copy & paste, {CMD+Z} for undo, {DEL} for delete.'],
];
const INFO_COMPACT: [string, string][] = [
  ['CUT', '{TAP} to place points, {DRAG} to draw freehand. Close the shape on its first point to cut it out of everything underneath.'],
  ['MOVE', 'Use two fingers: {DRAG} to move a piece, {PINCH} to scale, {TWIST} to rotate.'],
  ['CLONE', '{TAP} to pick a sample from the feed, then paint. Tap {CLONE} again to pick a new one.'],
  ['ERASE', 'Paint over the feed to erase parts.'],
  ['− +', 'Brush size for clone and erase.'],
  ['COPY\nPASTE', '{COPY} takes the last piece you cut or moved. {PASTE} drops a copy.'],
  ['OUT', 'Shows just the collage without the UI. {TAP} to come back.'],
];
const INFO_GESTURES = ['TAP', 'DRAG', 'PINCH', 'TWIST'];
const INFO_CREDIT_LINKS = { project: 'https://ravipopat.info/maybe-machines', author: 'https://ravipopat.info' };
const BUTTON_SIZE = 58;              // px
const BUTTON_FONT = "'VT323', monospace";
const BUTTON_FONT_SIZE = 18;         // px
const BUTTON_LINE_HEIGHT = 0.7;     // Spacing between the two lines of CLO/NE, ERA/SE

// Cursors: all drawn in ACCENT_GREEN with the same line weight, so they read as a set.
const CURSOR_STROKE = 2;             // px, line width of cursors and cut lines
const CROSSHAIR_SIZE = 12;           // px, half-length of each cut crosshair arm
const CLONE_PICKER_PLUS = 8;         // px, half-length of the plus inside the clone picker circle
const BRUSH_DEFAULT = BUTTON_SIZE / 2; // px, starting radius of the clone and erase circles (same size as a button)

const HANDLE_RADIUS = 8;             // px, transform handle grab area for a mouse
const TOUCH_HANDLE_RADIUS = 22;      // px, transform handle grab area for a finger or pencil
const HANDLE_DOT = 8;                // px, drawn size of the selection's corner dots
const ROTATE_ZONE = 22;              // px just outside each corner dot where dragging rotates
const TRANSFORM_COLOR = '#ffffff';   // Selection box and corner dots
const PEN_CLOSE_RADIUS = 10;         // px: clicking this close to a cut shape's first point closes it (mouse)
const TOUCH_PEN_CLOSE_RADIUS = 24;   // px, the same for a finger or pencil
const PEN_ANCHOR = 6;                // px, drawn size of a cut shape's corner points
const SEAM_OVERLAP = 0;              // px adjoining pieces overlap. 0 keeps a faint hairline along cuts; ~1.5 hides it

// Curved double-arrow cursor shown just outside a selection corner, where dragging rotates. It's
// drawn bulging toward the top-right and turned to face whichever corner it's at.
const rotateCursorCache = new Map<number, string>();
const getRotateCursor = (cornerAngle: number): string => {
  const degrees = Math.round(((cornerAngle * 180) / Math.PI + 45) / 15) * 15; // Top-right corner sits at -45°
  const cached = rotateCursorCache.get(degrees);
  if (cached) return cached;
  const shape = "M6 6A12 12 0 0 1 18 18M9 3L6 6L9 9M15 15L18 18L21 15";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'>` +
    `<g transform='rotate(${degrees} 12 12)'><path d='${shape}' stroke='black' stroke-width='4'/><path d='${shape}' stroke='white' stroke-width='2'/></g></svg>`;
  const cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, grab`;
  rotateCursorCache.set(degrees, cursor);
  return cursor;
};
const ROTATE_SNAP = Math.PI / 12;    // Shift-rotate snaps to 15° steps
const CLICK_TOLERANCE = 4;           // px a press on a piece can move and still count as a click
const SNAPPING_ENABLED = false;      // Dragged pieces snap to other pieces' edges and the feed center (with guides)
const SNAP_DISTANCE = 6;             // px, how close an edge or center must get before it snaps
const SNAP_PULSE_MS = 200;           // How long the guide and outline flash when a snap engages
const VIDEO_SCALE = 0.75;    // The starting feed is at most 75% of the window's width
const CONTROLS_MARGIN = 24;  // px from the window edge to the button bar
const CONTROLS_GAP = 24;     // px between the button bar and the starting feed
const GROUP_GAP = 32;        // px between the tool buttons and the action pill
const BAR_SPACING = 16;      // px between buttons in the tool group, and the least space beside the corner buttons
// Width the desktop bar needs; anything narrower (phones) switches to the compact two-row layout
const BAR_MIN_WIDTH = 2 * (CONTROLS_MARGIN + BUTTON_SIZE + BAR_SPACING) + 7 * BUTTON_SIZE + 3 * BAR_SPACING + GROUP_GAP;

// Compact (phone) layout: INFO, brush and copy/paste squares, OUT on top; tools and actions below
// One spacing value drives the whole compact layout: screen-edge margins, gaps between buttons,
// and gaps between the rows and the feed. Buttons are then sized so the bottom row exactly fills
// the width (six buttons, five gaps), and every button in both rows uses that size.
const COMPACT_GAP_RATIO = 0.027; // Spacing as a fraction of screen width (about 10px on a phone)
const COMPACT_GAP_MIN = 8;       // px
const SQUARE_GAP = 2;            // px between the square buttons

interface Layout {
  compact: boolean;
  buttonSize: number;     // px; compact buttons are sized to the screen width
  margin: number;         // px from the screen edge to the button rows (and, compact, the spacing everywhere)
  feedTop: number;        // The area the starting feed fits into (compact: fills, cropping if needed)
  feedBottom: number;
  maxFeedWidth: number;
  insetTop: number;       // px the phone itself covers at the top / bottom (notch, gesture bar)
  insetBottom: number;
}

// The visible area in CSS pixels, plus the device's safe-area insets
interface View {
  width: number;
  height: number;
  insetTop?: number;
  insetBottom?: number;
}

const getLayout = (view: View): Layout => {
  const insetTop = view.insetTop ?? 0;
  const insetBottom = view.insetBottom ?? 0;
  if (view.width >= BAR_MIN_WIDTH) {
    const feedTop = insetTop + CONTROLS_MARGIN + CONTROLS_GAP;
    const feedBottom = Math.max(feedTop + 100, view.height - insetBottom - (CONTROLS_MARGIN + BUTTON_SIZE + CONTROLS_GAP));
    return { compact: false, buttonSize: BUTTON_SIZE, margin: CONTROLS_MARGIN, feedTop, feedBottom, maxFeedWidth: view.width * VIDEO_SCALE, insetTop, insetBottom };
  }
  const gap = Math.max(COMPACT_GAP_MIN, Math.round(view.width * COMPACT_GAP_RATIO));
  const buttonSize = Math.floor((view.width - 5 * gap) / 6); // margin, CUT, gap, CLONE, gap, ERASE, gap, pill of 3, margin
  const rowBand = 2 * gap + buttonSize;
  const feedTop = insetTop + rowBand;
  const feedBottom = Math.max(feedTop + 100, view.height - insetBottom - rowBand);
  return { compact: true, buttonSize, margin: gap, feedTop, feedBottom, maxFeedWidth: view.width - 2 * gap, insetTop, insetBottom };
};

// Reads the device's safe-area insets (notch, home indicator) that CSS exposes as env() values
const readSafeAreaInsets = (): { insetTop: number; insetBottom: number } => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = { insetTop: parseFloat(style.paddingTop) || 0, insetBottom: parseFloat(style.paddingBottom) || 0 };
  probe.remove();
  return insets;
};

const getFeedCenterY = (view: View) => {
  const layout = getLayout(view);
  return (layout.feedTop + layout.feedBottom) / 2;
};

// Largest size for the starting feed that fits the feed area
const fitVideo = (view: View, aspectRatio: number) => {
  const layout = getLayout(view);
  const width = Math.min(layout.maxFeedWidth, (layout.feedBottom - layout.feedTop) * aspectRatio);
  return { width, height: width / aspectRatio };
};
const BRUSH_MIN = 5;
const BRUSH_MAX = 200;

const tools: { id: Tool; label: string[]; key: string }[] = [
  { id: 'move', label: ['MOVE'], key: 'v' },
  { id: 'cut', label: ['CUT'], key: 'x' },
  { id: 'clone', label: ['CLO', 'NE'], key: 'c' },
  { id: 'erase', label: ['ERA', 'SE'], key: 'e' },
];

// --- Helper Functions ---

const relativeLuminance = (hexColor: string): number => {
  const rgb = parseInt(hexColor.substring(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((rgb >> 16) & 0xff) + 0.7152 * channel((rgb >> 8) & 0xff) + 0.0722 * channel(rgb & 0xff);
};

// Black or white, whichever has the higher WCAG contrast ratio against the background
const getReadableTextColor = (bgHex: string): '#000000' | '#ffffff' => {
  const l = relativeLuminance(bgHex);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#000000' : '#ffffff';
};

const isColorDark = (hexColor: string): boolean => {
  if (!hexColor || hexColor.length < 7) return true;
  const color = hexColor.substring(1);
  const rgb = parseInt(color, 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  // Adjusted threshold for better handling of bright, saturated colors
  return luma < 90;
};

// Returns the intersection point and the interpolation factor 't' along the line segment p1-p2.
// With `infinite`, p3-p4 is treated as an endless line rather than a segment.
const getLineIntersection = (p1: Point, p2: Point, p3: Point, p4: Point, infinite = false): { point: Point; t: number } | null => {
  const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (den === 0) return null;
  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
  const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / den;
  if (t >= 0 && t <= 1 && (infinite || (u >= 0 && u <= 1))) {
    return {
      point: { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) },
      t: t
    };
  }
  return null;
};

const isPointInPolygon = (point: Point, polygon: Point[]): boolean => {
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
  }
  return isInside;
};

// Affine transform in canvas order: x' = a*u + c*v + e, y' = b*u + d*v + f
interface Affine { a: number; b: number; c: number; d: number; e: number; f: number; }

const applyAffine = (m: Affine, p: Point): Point => ({
  x: m.a * p.x + m.c * p.y + m.e,
  y: m.b * p.x + m.d * p.y + m.f,
});

const invertAffine = (m: Affine): Affine | null => {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return null;
  return {
    a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det, f: (m.b * m.e - m.a * m.f) / det,
  };
};

const affineScale = (m: Affine): number => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));

// Maps texture pixel space to screen space for a segment. Every edit (cut, move, rotate, scale)
// is affine, so one transform covers the whole polygon. Uses the widest vertex triangle for stability.
const getSegmentAffine = (segment: Segment, videoWidth: number, videoHeight: number): Affine | null => {
  const { vertices: p, texCoords: tc } = segment;
  let best = { j: -1, k: -1, area: 0 };
  for (let j = 1; j < p.length; j++) {
    for (let k = j + 1; k < p.length; k++) {
      const area = Math.abs((p[j].x - p[0].x) * (p[k].y - p[0].y) - (p[k].x - p[0].x) * (p[j].y - p[0].y));
      if (area > best.area) best = { j, k, area };
    }
  }
  if (best.j < 0) return null;
  const [p0, p1, p2] = [p[0], p[best.j], p[best.k]];
  const u0 = tc[0].x * videoWidth, v0 = tc[0].y * videoHeight;
  const u1 = tc[best.j].x * videoWidth, v1 = tc[best.j].y * videoHeight;
  const u2 = tc[best.k].x * videoWidth, v2 = tc[best.k].y * videoHeight;

  const den = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
  if (Math.abs(den) < 1e-6) return null;
  return {
    a: (p0.x * (v1 - v2) + p1.x * (v2 - v0) + p2.x * (v0 - v1)) / den,
    b: (p0.y * (v1 - v2) + p1.y * (v2 - v0) + p2.y * (v0 - v1)) / den,
    c: (p0.x * (u2 - u1) + p1.x * (u0 - u2) + p2.x * (u1 - u0)) / den,
    d: (p0.y * (u2 - u1) + p1.y * (u0 - u2) + p2.y * (u1 - u0)) / den,
    e: (p0.x * (u1 * v2 - u2 * v1) + p1.x * (u2 * v0 - u0 * v2) + p2.x * (u0 * v1 - u1 * v0)) / den,
    f: (p0.y * (u1 * v2 - u2 * v1) + p1.y * (u2 * v0 - u0 * v2) + p2.y * (u0 * v1 - u1 * v0)) / den,
  };
};

const getBounds = (points: Point[], pad = 0) => ({
  minX: Math.min(...points.map(p => p.x)) - pad,
  minY: Math.min(...points.map(p => p.y)) - pad,
  maxX: Math.max(...points.map(p => p.x)) + pad,
  maxY: Math.max(...points.map(p => p.y)) + pad,
});

// Converts a screen-space brush stroke into a mask in the segment's texture space
const toSegmentMask = (stroke: Stroke, kind: 'erase' | 'reveal', toLocal: Affine, scale: number): MaskOp => ({
  kind,
  radius: stroke.radius / scale,
  points: stroke.points.map(p => applyAffine(toLocal, p)),
});

// Whether a screen point lands on a visible part of the segment (inside its outline and not masked away)
const isPointOnSegment = (pos: Point, segment: Segment, videoWidth: number, videoHeight: number): boolean => {
  if (!isPointInPolygon(pos, segment.vertices)) return false;
  if (segment.masks.length === 0) return true;
  const affine = getSegmentAffine(segment, videoWidth, videoHeight);
  const toLocal = affine && invertAffine(affine);
  if (!toLocal) return true;
  // Look the point up in the piece's prebuilt mask rather than testing every mask shape
  const mask = getPieceMask(segment, videoWidth, videoHeight);
  if (!mask) return false;
  const t = applyAffine(toLocal, pos);
  const mx = Math.floor((t.x - mask.x) * mask.scale);
  const my = Math.floor((t.y - mask.y) * mask.scale);
  if (mx < 0 || my < 0 || mx >= mask.canvas.width || my >= mask.canvas.height) return false;
  return mask.alpha[(my * mask.canvas.width + mx) * 4 + 3] > 8;
};

// A clone stroke becomes its own segment: the sampled segment shifted by the clone offset,
// limited to the brushed area. The sample is the topmost segment under the stroke's sample points.
const buildClonePiece = (stroke: Stroke, segments: Segment[], videoWidth: number, videoHeight: number, id: string): Segment | null => {
  let source: Segment | undefined;
  for (const p of stroke.points) {
    const samplePoint = { x: p.x + stroke.offset.x, y: p.y + stroke.offset.y };
    source = [...segments].reverse().find(seg => isPointOnSegment(samplePoint, seg, videoWidth, videoHeight));
    if (source) break;
  }
  if (!source) return null;

  const sourceAffine = getSegmentAffine(source, videoWidth, videoHeight);
  if (!sourceAffine) return null;
  const pieceAffine = { ...sourceAffine, e: sourceAffine.e - stroke.offset.x, f: sourceAffine.f - stroke.offset.y };
  const toLocal = invertAffine(pieceAffine);
  if (!toLocal) return null;

  const { minX, minY, maxX, maxY } = getBounds(stroke.points, stroke.radius);
  const vertices = [
    { x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY },
  ];
  const texCoords = vertices.map(v => {
    const t = applyAffine(toLocal, v);
    return { x: t.x / videoWidth, y: t.y / videoHeight };
  });
  const sourceOutline: MaskOp = {
    kind: 'clip',
    points: source.texCoords.map(t => ({ x: t.x * videoWidth, y: t.y * videoHeight })),
  };

  return {
    id,
    vertices,
    texCoords,
    masks: [sourceOutline, ...source.masks, toSegmentMask(stroke, 'reveal', toLocal, affineScale(pieceAffine))],
  };
};

// Finds the nudge that lines the moving piece's edges or center up with another piece or the
// center of the feed area. Returns the offset to add and the guide lines to draw.
const findSnap = (moving: Point[], others: Point[][], view: { width: number; height: number }) => {
  const b = getBounds(moving);
  const targetsX = [view.width / 2];
  const targetsY = [getFeedCenterY(view)];
  others.forEach(o => {
    const ob = getBounds(o);
    targetsX.push(ob.minX, (ob.minX + ob.maxX) / 2, ob.maxX);
    targetsY.push(ob.minY, (ob.minY + ob.maxY) / 2, ob.maxY);
  });
  const closest = (values: number[], targets: number[]) => {
    let best: { offset: number; line: number } | null = null;
    values.forEach(v => targets.forEach(t => {
      const offset = t - v;
      if (Math.abs(offset) <= SNAP_DISTANCE && (!best || Math.abs(offset) < Math.abs(best.offset))) best = { offset, line: t };
    }));
    return best as { offset: number; line: number } | null;
  };
  const snapX = closest([b.minX, (b.minX + b.maxX) / 2, b.maxX], targetsX);
  const snapY = closest([b.minY, (b.minY + b.maxY) / 2, b.maxY], targetsY);
  return {
    dx: snapX?.offset ?? 0,
    dy: snapY?.offset ?? 0,
    guides: { x: snapX?.line ?? null, y: snapY?.line ?? null },
  };
};

const isFullscreenActive = () => !!(document.fullscreenElement || (document as any).webkitFullscreenElement);

const toggleFullscreen = () => {
  const doc = document as any;
  const el = document.documentElement as any;
  const result = isFullscreenActive()
    ? (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())
    : (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
  Promise.resolve(result).catch(() => {});
};

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

// Visible area of a piece in texture pixel space: its outline minus everything its masks hide.
// Moving, scaling and rotating a piece never changes this, so it's measured once and cached by the
// piece's mask list and texture outline (new cuts, erases and clones get new ones).
const visibleBoundsCache = new WeakMap<MaskOp[], WeakMap<Point[], Bounds | null>>();
const VISIBLE_MEASURE_SIZE = 400; // px, longest side of the offscreen measuring canvas

const getVisibleTexBounds = (segment: Segment, videoWidth: number, videoHeight: number): Bounds | null => {
  let byOutline = visibleBoundsCache.get(segment.masks);
  if (!byOutline) {
    byOutline = new WeakMap();
    visibleBoundsCache.set(segment.masks, byOutline);
  }
  if (byOutline.has(segment.texCoords)) return byOutline.get(segment.texCoords)!;

  const outline = segment.texCoords.map(t => ({ x: t.x * videoWidth, y: t.y * videoHeight }));
  const ob = getBounds(outline);
  const scale = Math.min(1, VISIBLE_MEASURE_SIZE / Math.max(1, ob.maxX - ob.minX, ob.maxY - ob.minY));
  const width = Math.max(1, Math.ceil((ob.maxX - ob.minX) * scale));
  const height = Math.max(1, Math.ceil((ob.maxY - ob.minY) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let result: Bounds | null = null;
  if (ctx) {
    ctx.setTransform(scale, 0, 0, scale, -ob.minX * scale, -ob.minY * scale);
    ctx.beginPath();
    outline.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    segment.masks.forEach(mask => {
      if (mask.points.length === 0) return;
      ctx.globalCompositeOperation = mask.kind === 'erase' || mask.kind === 'cutout' ? 'destination-out' : 'destination-in';
      traceMask(ctx, mask);
    });
    const { data } = ctx.getImageData(0, 0, width, height);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= 0) {
      result = {
        minX: ob.minX + minX / scale, minY: ob.minY + minY / scale,
        maxX: ob.minX + (maxX + 1) / scale, maxY: ob.minY + (maxY + 1) / scale,
      };
    }
  }
  byOutline.set(segment.texCoords, result);
  return result;
};

// A piece's masks combined into one alpha image, covering just its visible area in texture space.
// Built once per piece (cached like the visible bounds), then each frame is two cheap drawImage calls.
interface PieceMask {
  canvas: HTMLCanvasElement;
  alpha: Uint8ClampedArray; // For hit testing
  x: number;                // Texture-space rectangle the mask covers
  y: number;
  width: number;
  height: number;
  scale: number;            // Mask pixels per texture pixel
}
const PIECE_MASK_MAX = 1280;  // px, longest side of a cached mask
const PREVIEW_MASK_MAX = 480; // px, for the clone stroke preview, which is rebuilt while painting
const pieceMaskCache = new WeakMap<MaskOp[], WeakMap<Point[], PieceMask | null>>();

const buildPieceMask = (segment: Segment, videoWidth: number, videoHeight: number, maxSize: number): PieceMask | null => {
  const vb = getVisibleTexBounds(segment, videoWidth, videoHeight);
  if (!vb) return null;
  const x = Math.max(0, Math.floor(vb.minX - 2));
  const y = Math.max(0, Math.floor(vb.minY - 2));
  const width = Math.min(videoWidth, Math.ceil(vb.maxX + 2)) - x;
  const height = Math.min(videoHeight, Math.ceil(vb.maxY + 2)) - y;
  if (width <= 0 || height <= 0) return null;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
  ctx.fillRect(x, y, width, height);
  const seamPad = SEAM_OVERLAP * (videoWidth / 1000); // Roughly SEAM_OVERLAP screen pixels in texture pixels
  segment.masks.forEach(mask => {
    if (mask.points.length === 0) return;
    if (mask.kind === 'clip' && seamPad > 0) {
      // Fill plus padded edge must apply as one shape, so build it on its own canvas first
      const pad = document.createElement('canvas');
      pad.width = canvas.width;
      pad.height = canvas.height;
      const pctx = pad.getContext('2d');
      if (!pctx) return;
      pctx.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
      traceMask(pctx, mask, seamPad);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(pad, 0, 0);
      ctx.restore();
      return;
    }
    ctx.globalCompositeOperation = mask.kind === 'erase' || mask.kind === 'cutout' ? 'destination-out' : 'destination-in';
    traceMask(ctx, mask);
  });
  ctx.globalCompositeOperation = 'source-over';
  const alpha = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return { canvas, alpha, x, y, width, height, scale };
};

const getPieceMask = (segment: Segment, videoWidth: number, videoHeight: number): PieceMask | null => {
  let byOutline = pieceMaskCache.get(segment.masks);
  if (!byOutline) {
    byOutline = new WeakMap();
    pieceMaskCache.set(segment.masks, byOutline);
  }
  if (!byOutline.has(segment.texCoords)) {
    byOutline.set(segment.texCoords, buildPieceMask(segment, videoWidth, videoHeight, PIECE_MASK_MAX));
  }
  return byOutline.get(segment.texCoords)!;
};

// The selection box around a piece's visible area. It's the visible area's box in texture space
// mapped to the screen, so it turns and scales with the piece.
const getSelectionFrame = (segment: Segment, videoWidth: number, videoHeight: number) => {
  const affine = getSegmentAffine(segment, videoWidth, videoHeight);
  const tb = affine && getVisibleTexBounds(segment, videoWidth, videoHeight);
  if (!affine || !tb) {
    const b = getBounds(segment.vertices);
    const corners = [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }];
    return { corners, center: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } };
  }
  const map = (x: number, y: number) => applyAffine(affine, { x, y });
  const corners = [map(tb.minX, tb.minY), map(tb.maxX, tb.minY), map(tb.maxX, tb.maxY), map(tb.minX, tb.maxY)];
  const center = map((tb.minX + tb.maxX) / 2, (tb.minY + tb.maxY) / 2);
  return { corners, center };
};

// Moves vertices by a rotation and uniform scale about `pivot`, then re-centers them on `target`
const transformVertices = (vertices: Point[], pivot: Point, target: Point, scale: number, angle: number): Point[] => {
  const cos = Math.cos(angle) * scale, sin = Math.sin(angle) * scale;
  return vertices.map(v => {
    const ox = v.x - pivot.x, oy = v.y - pivot.y;
    return { x: target.x + ox * cos - oy * sin, y: target.y + ox * sin + oy * cos };
  });
};

// `seamPad` grows clip regions slightly so two halves of a cut overlap instead of leaving a hairline
const traceMask = (ctx: CanvasRenderingContext2D, mask: MaskOp, seamPad = 0) => {
  ctx.beginPath();
  ctx.moveTo(mask.points[0].x, mask.points[0].y);
  mask.points.forEach(p => ctx.lineTo(p.x, p.y));
  if (mask.kind === 'clip' || mask.kind === 'cutout') {
    ctx.closePath();
    ctx.fill('evenodd');
    if (mask.kind === 'clip' && seamPad > 0) {
      ctx.lineWidth = seamPad;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    return;
  }
  if (mask.points.length === 1) ctx.lineTo(mask.points[0].x + 0.01, mask.points[0].y);
  ctx.lineWidth = mask.radius * 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
};

// Whether the drawn cut from p1 to p2 touches the polygon
const doesCutTouchPolygon = (polygon: Point[], p1: Point, p2: Point): boolean => {
  if (isPointInPolygon(p1, polygon) || isPointInPolygon(p2, polygon)) return true;
  return polygon.some((v, i) => getLineIntersection(v, polygon[(i + 1) % polygon.length], p1, p2) !== null);
};

// The two sides of a cut, as the mask each half gets: keep a region, or remove one
type CutSide = { kind: 'clip' | 'cutout'; points: Point[] };

// A closed loop: one half keeps the inside, the other has the inside removed
const splitPlaneByLoop = (loop: Point[]): [CutSide, CutSide] => [
  { kind: 'clip', points: loop },
  { kind: 'cutout', points: loop },
];

// Whether a drawn path crosses or enters a polygon (regardless of what's on top of it)
const doesPathTouchPolygon = (path: Point[], polygon: Point[]): boolean => {
  if (path.some(p => isPointInPolygon(p, polygon))) return true;
  for (let i = 1; i < path.length; i++) {
    if (doesCutTouchPolygon(polygon, path[i - 1], path[i])) return true;
  }
  return false;
};

// Keeps a cut shape's straight edge at 0°, 45° or 90° from the previous point (Shift)
const constrainTo45 = (from: Point, to: Point): Point => {
  const angle = Math.round(Math.atan2(to.y - from.y, to.x - from.x) / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  return { x: from.x + Math.cos(angle) * len, y: from.y + Math.sin(angle) * len };
};

const getPolygonCentroid = (vertices: Point[]): Point => {
    if (vertices.length === 0) return { x: 0, y: 0 };
    let sx = 0;
    let sy = 0;
    for (const v of vertices) {
        sx += v.x;
        sy += v.y;
    }
    return { x: sx / vertices.length, y: sy / vertices.length };
};


const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameId = useRef<number>();
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointers = useRef(new Map<number, Point>()); // Fingers currently down, for pinch
  // Canvas size in CSS pixels; the backing store is scaled by devicePixelRatio for sharp Retina output
  const viewRef = useRef({ width: window.innerWidth, height: window.innerHeight, dpr: 1, insetTop: 0, insetBottom: 0 });
  // The visible size, which the whole app is sized to (not 100vh, which on phones includes the
  // area behind the browser's toolbars and pushes the bottom row off-screen)
  const [viewSize, setViewSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const hasInitialized = useRef(false);
  const pointerTypeRef = useRef<string>('mouse');
  const snapPulseAt = useRef(0);
  const lastSnapKey = useRef('');
  
  const history = useRef<Segment[][]>([[]]);
  const historyIndex = useRef<number>(0);

  const [segments, setSegments] = useState<Segment[]>([]);
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null);
  // Desktop starts in MOVE; phones have no MOVE tool (two fingers move pieces), so they start in CUT
  const [tool, setTool] = useState<Tool>(() => (getLayout({ width: window.innerWidth, height: window.innerHeight }).compact ? 'cut' : 'move'));
  const [brushRadius, setBrushRadius] = useState(BRUSH_DEFAULT);
  const [cloneSource, setCloneSource] = useState<Point | null>(null);
  const [cloneOffset, setCloneOffset] = useState<Point | null>(null);
  const [isMouseInside, setIsMouseInside] = useState(false);
  // The cut shape being drawn: each click starts a new part (one point, or a freehand run while dragging).
  // Closing it on its first point cuts the shape out.
  const [pen, setPen] = useState<Point[][] | null>(null);
  const [isCmdHeld, setIsCmdHeld] = useState(false); // Cmd/Ctrl temporarily switches any tool to MOVE
  const shiftHeld = useRef(false);
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  // OUT mode: interface hidden and the collage's visible area scaled to fit the window (view-only)
  const [outBounds, setOutBounds] = useState<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);
  const isOutMode = outBounds !== null;
  const [layout, setLayout] = useState<Layout>(() => getLayout({ width: window.innerWidth, height: window.innerHeight }));
  // The piece showing transform controls: set by clicking a piece (not by dragging it)
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  // The last piece touched in cut mode, clicked or dragged: what COPY (and Cmd/Ctrl + C) copies
  const [touchedPieceId, setTouchedPieceId] = useState<string | null>(null);
  const dragMoved = useRef(false); // Whether the current piece press has turned into a drag
  const wasSelected = useRef(false); // Whether the pressed piece already showed its controls
  const [clipboard, setClipboard] = useState<Segment | null>(null);
  const pasteCount = useRef(0);
  const [interaction, setInteraction] = useState<InteractionState>({ type: 'idle' });
  const [hoveredHandle, setHoveredHandle] = useState<HoveredHandle | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  const mousePosRef = useRef<Point>({ x: 0, y: 0 }); // Read by the draw loop; a ref so moves don't re-render
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  
  const [showHelp, setShowHelp] = useState(false);
  const bgColor = '#000000';
  const [contrastColor, setContrastColor] = useState<'#FFFFFF' | '#000000'>('#FFFFFF');

  useEffect(() => {
    setContrastColor(isColorDark(bgColor) ? '#FFFFFF' : '#000000');
  }, [bgColor]);


  // History lives in refs; this counter re-renders the UNDO / REDO buttons when it changes
  const [, setHistoryTick] = useState(0);
  const canUndo = historyIndex.current > 0;
  const canRedo = historyIndex.current < history.current.length - 1;

  const saveState = useCallback((newSegments: Segment[]) => {
    // Skip steps that change nothing (e.g. tapping a piece without moving it)
    const current = history.current[historyIndex.current];
    if (current && current.length === newSegments.length && current.every((sg, i) => sg === newSegments[i])) return;
    const newHistory = history.current.slice(0, historyIndex.current + 1);
    newHistory.push(newSegments);
    history.current = newHistory;
    historyIndex.current = newHistory.length - 1;
    setHistoryTick(t => t + 1);
  }, []);

  const undo = useCallback(() => {
    if (historyIndex.current === 0) return;
    historyIndex.current--;
    setSegments(history.current[historyIndex.current]);
    setHistoryTick(t => t + 1);
  }, []);

  const redo = useCallback(() => {
    if (historyIndex.current >= history.current.length - 1) return;
    historyIndex.current++;
    setSegments(history.current[historyIndex.current]);
    setHistoryTick(t => t + 1);
  }, []);

  const selectTool = (newTool: Tool) => {
    setTool(newTool);
    if (newTool === 'clone') {
      // Picking the clone tool always starts with choosing a fresh sample
      setCloneSource(null);
      setCloneOffset(null);
    }
    setPen(null);
    setHoveredHandle(null);
    setHoveredSegmentId(null);
  };

  // CUT, CLONE and ERASE draw their own cursors on the canvas (none at all in OUT mode). MOVE (or any
  // tool with Cmd held) uses system cursors: an arrow, a hand over pieces, arrows on the transform corners.
  const isMoveMode = tool === 'move' || isCmdHeld;
  const getCursor = () => {
    if (isOutMode) return 'none';
    const isTransforming = interaction.type === 'transforming' && interaction.mode !== 'pinch';
    if (!isMoveMode && interaction.type !== 'dragging_segment' && !isTransforming) return 'none';
    const handle = interaction.type === 'transforming' ? interaction.mode : hoveredHandle?.kind;
    if (handle === 'scale' || handle === 'rotate') {
      // Point the arrows from where the corner actually sits relative to the piece's center
      const seg = segments.find(sg => sg.id === hoveredHandle?.segmentId);
      const video = videoRef.current;
      if (!seg || !video || !hoveredHandle) return handle === 'scale' ? 'nwse-resize' : getRotateCursor(-Math.PI / 4);
      const { corners, center } = getSelectionFrame(seg, video.videoWidth, video.videoHeight);
      const i = hoveredHandle.corner;
      const c = corners[i];
      if (handle === 'rotate') {
        // Face out along the corner's bisector (between its two edges), so it suits any box shape or angle
        const unit = (p: Point) => { const len = Math.hypot(c.x - p.x, c.y - p.y) || 1; return { x: (c.x - p.x) / len, y: (c.y - p.y) / len }; };
        const a = unit(corners[(i + 3) % 4]), b = unit(corners[(i + 1) % 4]);
        return getRotateCursor(Math.atan2(a.y + b.y, a.x + b.x));
      }
      return (c.x - center.x) * (c.y - center.y) > 0 ? 'nwse-resize' : 'nesw-resize';
    }
    if (interaction.type === 'dragging_segment') return 'grabbing';
    return hoveredSegmentId || hoveredHandle ? 'grab' : 'default';
  };
  
  const brushSmaller = () => setBrushRadius(r => Math.max(BRUSH_MIN, Math.round(r / 1.2)));
  const brushLarger = () => setBrushRadius(r => Math.min(BRUSH_MAX, Math.round(r * 1.2)));

  const canCopy = touchedPieceId !== null && segments.some(sg => sg.id === touchedPieceId);

  const copyPiece = useCallback(() => {
    const piece = segments.find(sg => sg.id === touchedPieceId);
    if (!piece) return;
    setClipboard(piece);
    pasteCount.current = 0;
  }, [segments, touchedPieceId]);

  // Each paste lands a little further down-right so repeated pastes don't stack exactly
  const pastePiece = useCallback(() => {
    if (!clipboard) return;
    pasteCount.current++;
    const offset = 20 * pasteCount.current;
    const piece = {
      ...clipboard,
      id: `paste-${Date.now()}`,
      vertices: clipboard.vertices.map(v => ({ x: v.x + offset, y: v.y + offset })),
    };
    const newSegments = [...segments, piece];
    setSegments(newSegments);
    saveState(newSegments);
    setTouchedPieceId(piece.id);
  }, [clipboard, segments, saveState]);

  // The starting composition: one feed centered between the button rows
  const buildStartingLayout = useCallback((): Segment[] | null => {
    const video = videoRef.current;
    if (!videoDimensions.width || !video?.videoWidth) return null;
    const view = viewRef.current;
    const layout = getLayout(view);

    // Desktop: the whole feed, fitted. Compact: the feed fills the space between the rows,
    // center-cropped to that shape (never stretched).
    const fitted = fitVideo(view, video.videoWidth / video.videoHeight);
    let w = fitted.width;
    let h = fitted.height;
    let cropX = 1;
    let cropY = 1;
    if (layout.compact) {
      w = view.width - 2 * layout.margin;
      h = layout.feedBottom - layout.feedTop;
      const videoAspect = video.videoWidth / video.videoHeight;
      if (videoAspect > w / h) cropX = (w / h) / videoAspect; else cropY = videoAspect / (w / h);
    }
    const u0 = 0.5 - cropX / 2, u1 = 0.5 + cropX / 2;
    const v0 = 0.5 - cropY / 2, v1 = 0.5 + cropY / 2;
    const fullTexCoords = [
        { x: u1, y: v0 }, // Mirrored
        { x: u0, y: v0 },
        { x: u0, y: v1 },
        { x: u1, y: v1 },
    ];

    const createSegment = (id: string, x: number, y: number): Segment => ({
        id,
        vertices: [
            { x: x, y: y },
            { x: x + w, y: y },
            { x: x + w, y: y + h },
            { x: x, y: y + h },
        ],
        texCoords: fullTexCoords,
        masks: [],
    });

    return [createSegment(`initial-${Date.now()}`, (view.width - w) / 2, getFeedCenterY(view) - h / 2)];
  }, [videoDimensions]);
  const buildStartingLayoutRef = useRef(buildStartingLayout);
  buildStartingLayoutRef.current = buildStartingLayout;

  // Reset is a normal, undoable step back to the starting composition
  const resetCanvas = useCallback(() => {
    const startingLayout = buildStartingLayout();
    if (!startingLayout) return;
    setSegments(startingLayout);
    saveState(startingLayout);
    setActiveStroke(null);
    setCloneSource(null);
    setCloneOffset(null);
    setPen(null);
  }, [buildStartingLayout, saveState]);

  const setupWebcam = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Webcam not supported by your browser.");
        return;
    }

    try {
        // Ask for widescreen, or a tall feed on a phone/tablet held upright; the browser falls back
        // to the closest mode the camera supports
        const isPortraitTouch = navigator.maxTouchPoints > 0 && window.innerHeight > window.innerWidth;
        const stream = await navigator.mediaDevices.getUserMedia({
            video: isPortraitTouch
              ? { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 }, aspectRatio: { ideal: 9 / 16 } }
              : { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, aspectRatio: { ideal: 16 / 9 } },
        });
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => {
                if (!videoRef.current) return;
                videoRef.current.play();
                const { videoWidth, videoHeight } = videoRef.current;
                const aspectRatio = videoWidth / videoHeight;

                setVideoDimensions(fitVideo(viewRef.current, aspectRatio));
            };
        }
    } catch (err) {
        console.error("Error accessing webcam:", err);
        alert("Could not access webcam. Please allow camera permissions and refresh.");
    }
  }, []);
  
  // Lay out the starting feed once; later window resizes keep the composition (see handleResize)
  useEffect(() => {
    if (videoDimensions.width > 0 && !hasInitialized.current) {
      const startingLayout = buildStartingLayout();
      if (!startingLayout) return;
      hasInitialized.current = true;
      setSegments(startingLayout);
      history.current = [startingLayout];
      historyIndex.current = 0;
      setHistoryTick(t => t + 1);
    }
  }, [videoDimensions, buildStartingLayout]);

  // Draws the video once into the segment outline. Masked pieces copy only their own area of the
  // frame to a scratch canvas and apply their prebuilt mask there. `preview` builds a quick
  // low-resolution mask instead of caching one (for the clone stroke, which changes as you paint).
  const drawSegment = useCallback((
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    segment: Segment,
    preview = false,
  ) => {
    const { videoWidth, videoHeight } = video;
    const affine = getSegmentAffine(segment, videoWidth, videoHeight);
    if (!affine) return;
    const mask = segment.masks.length === 0
      ? null
      : preview
        ? buildPieceMask(segment, videoWidth, videoHeight, PREVIEW_MASK_MAX)
        : getPieceMask(segment, videoWidth, videoHeight);
    if (segment.masks.length > 0 && !mask) return; // Nothing visible

    // Clip to the outline (optionally grown a hair so pieces cut apart meet without a seam)
    const centroid = getPolygonCentroid(segment.vertices);
    ctx.save();
    ctx.beginPath();
    segment.vertices.forEach((v, i) => {
      const len = Math.hypot(v.x - centroid.x, v.y - centroid.y) || 1;
      const x = v.x + ((v.x - centroid.x) / len) * (SEAM_OVERLAP / 2);
      const y = v.y + ((v.y - centroid.y) / len) * (SEAM_OVERLAP / 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.clip();
    ctx.transform(affine.a, affine.b, affine.c, affine.d, affine.e, affine.f);

    if (!mask) {
      ctx.drawImage(video, 0, 0);
    } else {
      if (!scratchCanvasRef.current) scratchCanvasRef.current = document.createElement('canvas');
      const scratch = scratchCanvasRef.current;
      const sw = mask.canvas.width, sh = mask.canvas.height;
      if (scratch.width < sw || scratch.height < sh) {
        scratch.width = Math.max(scratch.width, sw);
        scratch.height = Math.max(scratch.height, sh);
      }
      const sctx = scratch.getContext('2d');
      if (sctx) {
        sctx.globalCompositeOperation = 'copy';
        sctx.drawImage(video, mask.x, mask.y, mask.width, mask.height, 0, 0, sw, sh);
        sctx.globalCompositeOperation = 'destination-in';
        sctx.drawImage(mask.canvas, 0, 0);
        sctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(scratch, 0, 0, sw, sh, mask.x, mask.y, mask.width, mask.height);
      }
    }
    ctx.restore();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || video.readyState < video.HAVE_METADATA) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const view = viewRef.current;
    const mousePos = mousePosRef.current;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, view.width, view.height);

    const { videoWidth, videoHeight } = video;

    // OUT mode: only the collage, its visible area scaled up to fit the window and centered
    if (outBounds) {
      const w = outBounds.maxX - outBounds.minX;
      const h = outBounds.maxY - outBounds.minY;
      const scale = Math.min(view.width / w, view.height / h);
      const tx = (view.width - w * scale) / 2 - outBounds.minX * scale;
      const ty = (view.height - h * scale) / 2 - outBounds.minY * scale;
      ctx.setTransform(view.dpr * scale, 0, 0, view.dpr * scale, view.dpr * tx, view.dpr * ty);
      segments.forEach(segment => drawSegment(ctx, video, segment));
      return;
    }

    // Live preview of the stroke being drawn
    let clonePreview: Segment | null = null;
    if (activeStroke?.kind === 'clone') {
      clonePreview = buildClonePiece(activeStroke, segments, videoWidth, videoHeight, 'preview');
    }

    segments.forEach(segment => drawSegment(ctx, video, segment));
    if (clonePreview) drawSegment(ctx, video, clonePreview, true);

    // Erase preview: erasing reveals the background, so painting the stroke in the background color
    // looks the same while it's drawn (it's baked into the pieces when the stroke ends)
    if (activeStroke?.kind === 'erase' && activeStroke.points.length > 0) {
      ctx.save();
      ctx.strokeStyle = bgColor;
      ctx.lineWidth = activeStroke.radius * 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      activeStroke.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      if (activeStroke.points.length === 1) ctx.lineTo(activeStroke.points[0].x + 0.01, activeStroke.points[0].y);
      ctx.stroke();
      ctx.restore();
    }

    // Snap guides, with a short flash (and a buzz on devices that support it) when a snap engages
    if (snapGuides.x !== null || snapGuides.y !== null) {
      const pulse = Math.max(0, 1 - (performance.now() - snapPulseAt.current) / SNAP_PULSE_MS);
      ctx.save();
      ctx.strokeStyle = ACCENT_GREEN;
      ctx.lineWidth = 1 + pulse * 2;
      ctx.beginPath();
      if (snapGuides.x !== null) {
        ctx.moveTo(snapGuides.x, 0);
        ctx.lineTo(snapGuides.x, view.height);
      }
      if (snapGuides.y !== null) {
        ctx.moveTo(0, snapGuides.y);
        ctx.lineTo(view.width, snapGuides.y);
      }
      ctx.stroke();
      const dragged = interaction.type === 'dragging_segment' && segments.find(sg => sg.id === interaction.segmentId);
      if (dragged && pulse > 0) {
        ctx.globalAlpha = pulse;
        ctx.lineWidth = CURSOR_STROKE * 2;
        ctx.beginPath();
        getSelectionFrame(dragged, videoWidth, videoHeight).corners.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)));
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Selection box with corner dots, in MOVE: drag a dot to scale, just outside it to rotate
    const selected = (tool === 'move' || isCmdHeld) && interaction.type !== 'dragging_segment' &&
      segments.find(sg => sg.id === selectedPieceId);
    if (selected) {
      const frame = getSelectionFrame(selected, videoWidth, videoHeight);
      ctx.save();
      ctx.strokeStyle = TRANSFORM_COLOR;
      ctx.fillStyle = TRANSFORM_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      frame.corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
      ctx.closePath();
      ctx.stroke();
      // White dots with a thin dark edge so they read on bright video too
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.lineWidth = 1;
      frame.corners.forEach(c => {
        ctx.fillRect(c.x - HANDLE_DOT / 2, c.y - HANDLE_DOT / 2, HANDLE_DOT, HANDLE_DOT);
        ctx.strokeRect(c.x - HANDLE_DOT / 2, c.y - HANDLE_DOT / 2, HANDLE_DOT, HANDLE_DOT);
      });
      ctx.restore();
    }

    // The cut shape in progress: its edges so far, a rubber band to the pointer, its corner points,
    // and the first point, which fills in when the pointer is close enough to close the shape
    if (pen && tool === 'cut') {
      const points = pen.flat();
      const last = points[points.length - 1];
      const closeRadius = pointerTypeRef.current === 'mouse' ? PEN_CLOSE_RADIUS : TOUCH_PEN_CLOSE_RADIUS;
      const canClose = points.length >= 3 && Math.hypot(mousePos.x - points[0].x, mousePos.y - points[0].y) < closeRadius;
      const isDrawingFreehand = interaction.type === 'pen_drawing' && interaction.moved;
      ctx.save();
      ctx.strokeStyle = ACCENT_GREEN;
      ctx.fillStyle = ACCENT_GREEN;
      ctx.lineWidth = CURSOR_STROKE;
      ctx.beginPath();
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      if (isMouseInside && !isDrawingFreehand && !isCmdHeld) {
        const target = canClose ? points[0] : shiftHeld.current ? constrainTo45(last, mousePos) : mousePos;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      pen.forEach(part => ctx.fillRect(part[0].x - PEN_ANCHOR / 2, part[0].y - PEN_ANCHOR / 2, PEN_ANCHOR, PEN_ANCHOR));
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, canClose ? 7 : 5, 0, 2 * Math.PI);
      ctx.fillStyle = canClose ? ACCENT_GREEN : '#000';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Draw the cursor: in cut mode a crosshair (over pieces the system hand shows instead, see getCursor);
    // a brush circle for clone and erase. Before a clone sample is picked, the circle gets a small plus
    // to mark it as the picker.
    if (isMouseInside && !showHelp) {
      const { x, y } = mousePos;
      const isDragging = interaction.type === 'dragging_segment' || interaction.type === 'transforming';
      ctx.strokeStyle = ACCENT_GREEN;
      ctx.fillStyle = ACCENT_GREEN;
      ctx.lineWidth = CURSOR_STROKE;
      ctx.beginPath();
      if (tool === 'move' || isCmdHeld || isDragging) {
        // A system cursor is showing (see getCursor)
      } else if (tool === 'cut') {
        ctx.moveTo(x - CROSSHAIR_SIZE, y);
        ctx.lineTo(x + CROSSHAIR_SIZE, y);
        ctx.moveTo(x, y - CROSSHAIR_SIZE);
        ctx.lineTo(x, y + CROSSHAIR_SIZE);
        ctx.stroke();
      } else {
        ctx.arc(x, y, brushRadius, 0, 2 * Math.PI);
        if (tool === 'clone' && !cloneSource) {
          ctx.moveTo(x - CLONE_PICKER_PLUS, y);
          ctx.lineTo(x + CLONE_PICKER_PLUS, y);
          ctx.moveTo(x, y - CLONE_PICKER_PLUS);
          ctx.lineTo(x, y + CLONE_PICKER_PLUS);
        }
        ctx.stroke();
      }
    }
  }, [segments, activeStroke, hoveredHandle, pen, isCmdHeld, drawSegment, bgColor,
      tool, isMouseInside, showHelp, brushRadius, cloneSource, hoveredSegmentId, interaction,
      outBounds, snapGuides, selectedPieceId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size the backing store in device pixels and the element in CSS pixels
    const sizeCanvas = () => {
      const previous = viewRef.current;
      const dpr = window.devicePixelRatio || 1;
      // The visual viewport is what's actually on screen between the browser's toolbars
      const width = Math.round(window.visualViewport?.width ?? window.innerWidth);
      const height = Math.round(window.visualViewport?.height ?? window.innerHeight);
      const insets = readSafeAreaInsets();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      viewRef.current = { width, height, dpr, ...insets };
      setViewSize({ width, height });
      setLayout(getLayout(viewRef.current));
      return previous;
    };

    sizeCanvas();
    setupWebcam();

    // Resizing (including going fullscreen) keeps the collage and re-centers it in the new window.
    // Before any edits, the starting feed is simply laid out again for the new size.
    const handleResize = () => {
      const previous = sizeCanvas();
      const isUntouched = history.current.length === 1 && historyIndex.current === 0;
      const freshLayout = isUntouched ? buildStartingLayoutRef.current() : null;
      if (freshLayout) {
        setSegments(freshLayout);
        history.current = [freshLayout];
        return;
      }
      const dx = (viewRef.current.width - previous.width) / 2;
      const dy = (viewRef.current.height - previous.height) / 2;
      if (dx || dy) {
        const shift = (segs: Segment[]) => segs.map(sg => ({ ...sg, vertices: sg.vertices.map(v => ({ x: v.x + dx, y: v.y + dy })) }));
        setSegments(shift);
        history.current = history.current.map(shift);
      }
      const video = videoRef.current;
      if (video?.videoWidth && video.videoHeight) {
        setVideoDimensions(fitVideo(viewRef.current, video.videoWidth / video.videoHeight));
      }
    };

    // Phones also resize the visible area when their toolbars slide in or out
    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, [setupWebcam]);

  // One render loop for the app's lifetime; it always calls the latest draw
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const renderLoop = () => {
      drawRef.current();
      animationFrameId.current = requestAnimationFrame(renderLoop);
    };
    renderLoop();
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        const toolForKey = tools.find(t => t.key === key);
        if (toolForKey && !e.ctrlKey && !e.metaKey) {
            selectTool(toolForKey.id);
        } else if (e.key === '[') {
            brushSmaller();
        } else if (e.key === ']') {
            brushLarger();
        } else if (e.key === 'Escape') {
            setPen(null);
            setOutBounds(null);
            setShowHelp(false);
        } else if (pen && (e.key === 'Backspace' || e.key === 'Delete')) {
            // While drawing a cut shape, Backspace takes back the last point (or freehand run)
            e.preventDefault();
            setPen(pen.length > 1 ? pen.slice(0, -1) : null);
        } else if (pen && e.key === 'Enter') {
            if (pen.flat().length >= 3) closePen(pen.flat());
        } else if (key === 'o' && !e.ctrlKey && !e.metaKey) {
            if (isOutMode) setOutBounds(null); else enterOutMode();
        } else if (key === 'f' && !e.ctrlKey && !e.metaKey) {
            toggleFullscreen();
        } else if (key === 'r' && !e.ctrlKey && !e.metaKey) {
            resetCanvas();
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
            const target = hoveredSegmentId ?? selectedPieceId;
            if (target) {
                const newSegments = segments.filter(s => s.id !== target);
                setSegments(newSegments);
                saveState(newSegments);
                setHoveredSegmentId(null);
                setSelectedPieceId(null);
            }
        } else if (e.key.toLowerCase() === 'h') {
            setShowHelp(prev => !prev);
        } else if (e.ctrlKey || e.metaKey) {
            if (e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
            } else if (e.key.toLowerCase() === 'y') {
                e.preventDefault();
                redo();
            } else if (key === 'c') {
                e.preventDefault();
                copyPiece();
            } else if (key === 'v') {
                e.preventDefault();
                pastePiece();
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [resetCanvas, hoveredSegmentId, selectedPieceId, segments, saveState, outBounds, undo, redo, copyPiece, pastePiece, pen]);

  // Track Cmd/Ctrl (temporary MOVE) and Shift (straight cut edges) for cursors and previews
  useEffect(() => {
    const update = (e: KeyboardEvent) => {
      setIsCmdHeld(e.metaKey || e.ctrlKey);
      shiftHeld.current = e.shiftKey;
    };
    const clear = () => {
      setIsCmdHeld(false);
      shiftHeld.current = false;
    };
    window.addEventListener('keydown', update);
    window.addEventListener('keyup', update);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', update);
      window.removeEventListener('keyup', update);
      window.removeEventListener('blur', clear);
    };
  }, []);

  // Phones have no MOVE tool; if the window shrinks to the phone layout while in MOVE, switch to CUT
  useEffect(() => {
    if (layout.compact && tool === 'move') setTool('cut');
  }, [layout.compact, tool]);

  const getMouseCoords = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const getHandleRadius = () => (pointerTypeRef.current === 'mouse' ? HANDLE_RADIUS : TOUCH_HANDLE_RADIUS);

  // The selected piece's transform handle under a point, if any
  const findHandleAt = (pos: Point): HoveredHandle | null => {
    const seg = segments.find(sg => sg.id === selectedPieceId);
    const video = videoRef.current;
    if (!seg || !video) return null;
    const frame = getSelectionFrame(seg, video.videoWidth, video.videoHeight);
    const r = getHandleRadius();
    const distances = frame.corners.map(c => Math.hypot(pos.x - c.x, pos.y - c.y));
    const scaleCorner = distances.findIndex(d => d < r);
    if (scaleCorner >= 0) return { segmentId: seg.id, kind: 'scale', corner: scaleCorner };
    // Just outside a corner (beyond the dot, outside the box) rotates, like most design tools
    const rotateCorner = distances.findIndex(d => d < r + ROTATE_ZONE);
    if (rotateCorner >= 0 && !isPointInPolygon(pos, frame.corners)) {
      return { segmentId: seg.id, kind: 'rotate', corner: rotateCorner };
    }
    return null;
  };

  // Second finger down: pinch-scale/rotate the piece being dragged, the selected piece, or the
  // piece between the fingers. Cancels whatever the first finger had started.
  const startPinch = () => {
    const [p1, p2] = [...activePointers.current.values()];
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const { videoWidth, videoHeight } = videoRef.current!;
    const targetId =
      (interaction.type === 'dragging_segment' && interaction.segmentId) ||
      (segments.some(sg => sg.id === selectedPieceId) && selectedPieceId) ||
      [...segments].reverse().find(sg => isPointOnSegment(mid, sg, videoWidth, videoHeight))?.id;
    const target = segments.find(sg => sg.id === targetId);
    if (!target) return;
    setActiveStroke(null);
    if (interaction.type === 'pen_drawing') setPen(interaction.before);
    updateSnapGuides({ x: null, y: null });
    setTouchedPieceId(target.id);
    setInteraction({
      type: 'transforming',
      mode: 'pinch',
      segmentId: target.id,
      center: mid,
      startVertices: target.vertices,
      startDist: Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y)),
      startAngle: Math.atan2(p2.y - p1.y, p2.x - p1.x),
    });
  };

  // Updates snap guides and fires the flash/buzz only when a new snap engages
  const updateSnapGuides = (guides: { x: number | null; y: number | null }) => {
    const key = `${guides.x}|${guides.y}`;
    if (key !== lastSnapKey.current) {
      if (guides.x !== null || guides.y !== null) {
        snapPulseAt.current = performance.now();
        navigator.vibrate?.(10);
      }
      lastSnapKey.current = key;
      setSnapGuides(guides);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointers.current.set(e.pointerId, getMouseCoords(e));
    if (!e.isPrimary) {
      if (e.pointerType !== 'mouse' && activePointers.current.size === 2 && !isOutMode && !showHelp) startPinch();
      return;
    }
    pointerTypeRef.current = e.pointerType;
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // Keep receiving moves while dragging off the canvas
    } catch {
      // Pointer already gone; nothing to capture
    }
    const pos = getMouseCoords(e);
    mousePosRef.current = pos;
    setIsMouseInside(true);

    // OUT mode is view-only: any click or tap leaves it
    if (isOutMode) {
      setOutBounds(null);
      setIsMouseInside(false);
      return;
    }

    if (showHelp) {
      setShowHelp(false);
      // Prevent other actions when closing help
      return; 
    }

    // Cmd/Ctrl temporarily turns any tool into MOVE
    const effectiveTool: Tool = tool !== 'move' && (e.metaKey || e.ctrlKey) ? 'move' : tool;

    if (effectiveTool === 'erase') {
      setActiveStroke({ kind: 'erase', radius: brushRadius, points: [pos], offset: { x: 0, y: 0 } });
      return;
    }

    if (effectiveTool === 'clone') {
      if (!cloneSource || e.altKey) {
        setCloneSource(pos);
        setCloneOffset(null);
        return;
      }
      // Offset is fixed by the first stroke after sampling, then stays aligned for later strokes
      const offset = cloneOffset ?? { x: cloneSource.x - pos.x, y: cloneSource.y - pos.y };
      setCloneOffset(offset);
      setActiveStroke({ kind: 'clone', radius: brushRadius, points: [pos], offset });
      return;
    }

    if (effectiveTool === 'cut') {
      // Clicking the first point closes the shape and cuts it out; otherwise this press adds a point
      // (Shift keeps the edge at 45° steps), and dragging from here draws freehand
      const points = pen?.flat() ?? [];
      const closeRadius = e.pointerType === 'mouse' ? PEN_CLOSE_RADIUS : TOUCH_PEN_CLOSE_RADIUS;
      if (points.length >= 3 && Math.hypot(pos.x - points[0].x, pos.y - points[0].y) < closeRadius) {
        closePen(points);
        return;
      }
      const last = points[points.length - 1];
      const point = e.shiftKey && last ? constrainTo45(last, pos) : pos;
      setPen([...(pen ?? []), [point]]);
      setInteraction({ type: 'pen_drawing', startPos: point, moved: false, before: pen });
      return;
    }

    // Selection handles: corners scale, the top dot rotates, both about the box center
    const handle = findHandleAt(pos);
    if (handle) {
      const segment = segments.find(s => s.id === handle.segmentId);
      if (segment) {
          const { center } = getSelectionFrame(segment, videoRef.current!.videoWidth, videoRef.current!.videoHeight);
          setHoveredHandle(handle);
          setInteraction({
              type: 'transforming',
              mode: handle.kind,
              segmentId: segment.id,
              center,
              startVertices: segment.vertices,
              startDist: Math.max(1, Math.hypot(pos.x - center.x, pos.y - center.y)),
              startAngle: Math.atan2(pos.y - center.y, pos.x - center.x),
          });
      }
      return;
    }

    // Search from top to bottom (reverse of the array) to find the clicked segment
    let clickedSegmentIndex = -1;
    for (let i = segments.length - 1; i >= 0; i--) {
        if (isPointOnSegment(pos, segments[i], videoRef.current!.videoWidth, videoRef.current!.videoHeight)) {
            clickedSegmentIndex = i;
            break;
        }
    }
    
    if (clickedSegmentIndex !== -1) {
      const clickedSegment = segments[clickedSegmentIndex];
      
      // Option/Alt + drag drags out a copy, leaving the original in place
      if (e.altKey) {
          const newSegment = {
              ...clickedSegment,
              id: `segment-${Date.now()}`
          };
          const newSegments = [...segments, newSegment];
          setSegments(newSegments);
          saveState(newSegments);
          setSelectedPieceId(null);
          setTouchedPieceId(newSegment.id);
          dragMoved.current = true; // A duplicate drag never selects
          setInteraction({ type: 'dragging_segment', segmentId: newSegment.id, startMouse: pos, startVertices: newSegment.vertices });
          return;
      }

      const reorderedSegments = [
          ...segments.slice(0, clickedSegmentIndex),
          ...segments.slice(clickedSegmentIndex + 1),
          clickedSegment
      ];
      setSegments(reorderedSegments);
      setTouchedPieceId(clickedSegment.id);
      // Clicking brings a piece to the front (above). On release, a click toggles its controls;
      // another piece's controls hide now
      wasSelected.current = selectedPieceId === clickedSegment.id;
      if (!wasSelected.current) setSelectedPieceId(null);
      dragMoved.current = false;
      setInteraction({ type: 'dragging_segment', segmentId: clickedSegment.id, startMouse: pos, startVertices: clickedSegment.vertices });
      return;
    }

    // Pressing on the background deselects
    setSelectedPieceId(null);
  };

  // A cut only counts for a piece when both halves still show something; halves that would be
  // entirely erased or masked away are dropped instead of left as invisible clutter
  const hasVisiblePart = (seg: Segment) => {
    const { videoWidth, videoHeight } = videoRef.current!;
    return getVisibleTexBounds(seg, videoWidth, videoHeight) !== null;
  };

  // Cuts a closed shape out of every piece it overlaps, on every layer. Each piece splits into the part
  // inside the shape and the rest; the inside parts end up selected (and are what COPY takes).
  const cutShape = (shape: Point[]) => {
    const video = videoRef.current;
    if (!video) return;
    const { videoWidth, videoHeight } = video;
    let splitCount = 0;
    const insideIds: string[] = [];
    let hasCut = false;
    const newSegments = segments.flatMap(seg => {
      const overlaps = doesPathTouchPolygon([...shape, shape[0]], seg.vertices) || seg.vertices.some(v => isPointInPolygon(v, shape));
      const affine = overlaps && getSegmentAffine(seg, videoWidth, videoHeight);
      const toLocal = affine && invertAffine(affine);
      if (!toLocal) return [seg];
      const [inside, outside] = splitPlaneByLoop(shape).map((side): Segment => ({
        ...seg,
        id: `${seg.id}-${++splitCount}-${Date.now()}`,
        masks: [...seg.masks, { ...side, points: side.points.map(p => applyAffine(toLocal, p)) } as MaskOp],
      }));
      if (!hasVisiblePart(inside) || !hasVisiblePart(outside)) return [seg]; // Shape misses it, or covers it whole
      hasCut = true;
      insideIds.push(inside.id);
      return [outside, inside];
    });
    if (!hasCut) return;
    setSegments(newSegments);
    saveState(newSegments);
    const topInside = insideIds[insideIds.length - 1];
    setSelectedPieceId(topInside);
    setTouchedPieceId(topInside);
  };

  const closePen = (points: Point[]) => {
    setPen(null);
    setInteraction({ type: 'idle' });
    cutShape(points);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointers.current.has(e.pointerId)) activePointers.current.set(e.pointerId, getMouseCoords(e));

    // Two-finger pinch: scale with the finger spread, rotate with their angle, move with their midpoint
    if (interaction.type === 'transforming' && interaction.mode === 'pinch') {
      if (activePointers.current.size < 2) return;
      const [p1, p2] = [...activePointers.current.values()];
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const scale = Math.max(0.05, Math.hypot(p2.x - p1.x, p2.y - p1.y) / interaction.startDist);
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) - interaction.startAngle;
      const vertices = transformVertices(interaction.startVertices, interaction.center, mid, scale, angle);
      setSegments(prev => prev.map(sg => (sg.id === interaction.segmentId ? { ...sg, vertices } : sg)));
      return;
    }

    if (!e.isPrimary) return;
    const pos = getMouseCoords(e);
    mousePosRef.current = pos;
    // Touch only "hovers" while a finger is down
    if (e.pointerType === 'mouse' || e.buttons) setIsMouseInside(true);
    if (isOutMode) return;

    if (activeStroke) {
      const minSpacing = Math.max(2, activeStroke.radius * 0.1);
      setActiveStroke(prev => {
        if (!prev) return prev;
        const last = prev.points[prev.points.length - 1];
        if (Math.hypot(pos.x - last.x, pos.y - last.y) < minSpacing) return prev;
        return { ...prev, points: [...prev.points, pos] };
      });
      return;
    }

    shiftHeld.current = e.shiftKey;

    // Dragging while drawing a cut shape draws freehand into the current part
    if (interaction.type === 'pen_drawing') {
      if (!interaction.moved) {
        if (Math.hypot(pos.x - interaction.startPos.x, pos.y - interaction.startPos.y) < CLICK_TOLERANCE) return;
        setInteraction({ ...interaction, moved: true });
      }
      setPen(prev => {
        if (!prev) return prev;
        const part = prev[prev.length - 1];
        const last = part[part.length - 1];
        if (Math.hypot(pos.x - last.x, pos.y - last.y) < 3) return prev;
        return [...prev.slice(0, -1), [...part, pos]];
      });
      return;
    }

    if (interaction.type === 'transforming') {
      // Corner handles scale and the top handle rotates, both about the selection's center
      const { segmentId, center, startVertices, startDist, startAngle, mode } = interaction;
      let scale = 1;
      let angle = 0;
      if (mode === 'scale') {
        scale = Math.max(0.05, Math.hypot(pos.x - center.x, pos.y - center.y) / startDist);
      } else {
        angle = Math.atan2(pos.y - center.y, pos.x - center.x) - startAngle;
        if (e.shiftKey) angle = Math.round(angle / ROTATE_SNAP) * ROTATE_SNAP;
      }
      const vertices = transformVertices(startVertices, center, center, scale, angle);
      setSegments(prev => prev.map(sg => (sg.id === segmentId ? { ...sg, vertices } : sg)));
    } else if (interaction.type === 'dragging_segment') {
      let dx = pos.x - interaction.startMouse.x;
      let dy = pos.y - interaction.startMouse.y;
      // A few pixels of wobble still counts as a click
      if (!dragMoved.current && Math.hypot(dx, dy) < CLICK_TOLERANCE) return;
      dragMoved.current = true;
      // Snap edges and centers to other pieces and the feed center; hold Cmd/Ctrl to move freely
      if (SNAPPING_ENABLED && !(e.metaKey || e.ctrlKey)) {
        // Snap the visible edges, not the piece's full underlying outline
        const { videoWidth, videoHeight } = videoRef.current!;
        const dragged = segments.find(sg => sg.id === interaction.segmentId);
        const startFrame = dragged && getSelectionFrame({ ...dragged, vertices: interaction.startVertices }, videoWidth, videoHeight);
        const moving = (startFrame?.corners ?? interaction.startVertices).map(v => ({ x: v.x + dx, y: v.y + dy }));
        const others = segments
          .filter(sg => sg.id !== interaction.segmentId)
          .map(sg => getSelectionFrame(sg, videoWidth, videoHeight).corners);
        const snap = findSnap(moving, others, viewRef.current);
        dx += snap.dx;
        dy += snap.dy;
        updateSnapGuides(snap.guides);
      } else {
        updateSnapGuides({ x: null, y: null });
      }
      setSegments(prev => prev.map(s => {
        if (s.id === interaction.segmentId) {
          const newVertices = interaction.startVertices.map(v => ({ x: v.x + dx, y: v.y + dy }));
          return { ...s, vertices: newVertices };
        }
        return s;
      }));
    } else if (tool === 'move' || e.metaKey || e.ctrlKey) {
      const foundHandle = findHandleAt(pos);
      setHoveredHandle(prev =>
        prev?.segmentId === foundHandle?.segmentId && prev?.kind === foundHandle?.kind && prev?.corner === foundHandle?.corner
          ? prev
          : foundHandle);

      if (!foundHandle) {
        // Search from front to back for hovering
        const { videoWidth, videoHeight } = videoRef.current!;
        const segUnderMouse = [...segments].reverse().find(seg => isPointOnSegment(pos, seg, videoWidth, videoHeight));
        setHoveredSegmentId(segUnderMouse ? segUnderMouse.id : null);
      } else {
        setHoveredSegmentId(null);
      }
    } else {
      // Hover states only matter in MOVE
      setHoveredHandle(prev => (prev ? null : prev));
      setHoveredSegmentId(prev => (prev ? null : prev));
    }
  };

  // Bakes the finished stroke into the segments: erasing masks every segment it touches,
  // cloning adds a new segment on top
  const commitActiveStroke = () => {
    if (!activeStroke) return;
    setActiveStroke(null);
    const video = videoRef.current;
    if (!video) return;
    const { videoWidth, videoHeight } = video;

    let newSegments: Segment[];
    if (activeStroke.kind === 'clone') {
      const piece = buildClonePiece(activeStroke, segments, videoWidth, videoHeight, `clone-${Date.now()}`);
      if (!piece) return;
      newSegments = [...segments, piece];
    } else {
      const strokeBounds = getBounds(activeStroke.points, activeStroke.radius);
      newSegments = segments.map(seg => {
        const b = getBounds(seg.vertices);
        if (b.maxX < strokeBounds.minX || b.minX > strokeBounds.maxX || b.maxY < strokeBounds.minY || b.minY > strokeBounds.maxY) {
          return seg;
        }
        const affine = getSegmentAffine(seg, videoWidth, videoHeight);
        const toLocal = affine && invertAffine(affine);
        if (!affine || !toLocal) return seg;
        return { ...seg, masks: [...seg.masks, toSegmentMask(activeStroke, 'erase', toLocal, affineScale(affine))] };
      });
    }
    setSegments(newSegments);
    saveState(newSegments);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointers.current.delete(e.pointerId);
    if (interaction.type === 'transforming' && interaction.mode === 'pinch') {
      // The pinch ends when fewer than two fingers remain; the last finger does nothing until lifted
      if (activePointers.current.size < 2) {
        saveState(segments);
        setInteraction({ type: 'idle' });
      }
      if (e.pointerType !== 'mouse') setIsMouseInside(false);
      return;
    }
    if (!e.isPrimary) return;
    commitActiveStroke();
    updateSnapGuides({ x: null, y: null });
    if (e.pointerType !== 'mouse') {
      // A lifted finger leaves nothing hovering
      setIsMouseInside(false);
      setHoveredHandle(null);
      setHoveredSegmentId(null);
    }
    if (interaction.type === 'pen_drawing') {
      // A freehand run that ends back at the first point closes the shape too
      const points = pen?.flat() ?? [];
      const last = points[points.length - 1];
      const closeRadius = e.pointerType === 'mouse' ? PEN_CLOSE_RADIUS : TOUCH_PEN_CLOSE_RADIUS;
      if (interaction.moved && points.length >= 3 && Math.hypot(last.x - points[0].x, last.y - points[0].y) < closeRadius) {
        closePen(points);
        return;
      }
    } else if (interaction.type === 'dragging_segment' && !dragMoved.current) {
      // A click shows the piece's transform controls; clicking it again hides them
      setSelectedPieceId(wasSelected.current ? null : interaction.segmentId);
      saveState(segments);
    } else if (interaction.type === 'dragging_segment' || interaction.type === 'transforming') {
      saveState(segments);
    }
    setInteraction({ type: 'idle' });
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Touch fires leave right after lifting; keep any half-placed cut so a second tap can finish it
    if (e.pointerType !== 'mouse') return;
    commitActiveStroke();
    updateSnapGuides({ x: null, y: null });
    setIsMouseInside(false);
    if (interaction.type !== 'idle') {
      if (interaction.type === 'dragging_segment' || interaction.type === 'transforming') {
        saveState(segments);
      }
      setInteraction({ type: 'idle' });
    }
    setHoveredHandle(null);
    setHoveredSegmentId(null);
  };

  // Green marks the selected tool only; action buttons just brighten while pressed
  const renderButton = (label: string[], onClick: () => void, title: string,
                        { active = false, disabled = false, colors = { bg: BUTTON_COLOR, text: BUTTON_TEXT_COLOR },
                          size = BUTTON_SIZE, content = null as React.ReactNode } = {}) => (
    <button
      key={label.join('')}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full flex flex-col items-center justify-center focus:outline-none transition duration-200 ${
        disabled ? 'cursor-default' : 'active:brightness-150'
      }`}
      style={{
        width: size,
        height: size,
        backgroundColor: active ? ACCENT_GREEN : colors.bg,
        color: active ? getReadableTextColor(ACCENT_GREEN) : disabled ? BUTTON_DISABLED_TEXT_COLOR : colors.text,
        fontFamily: BUTTON_FONT,
        fontSize: (BUTTON_FONT_SIZE * size) / BUTTON_SIZE,
        lineHeight: BUTTON_LINE_HEIGHT,
        touchAction: 'manipulation',
      }}
    >
      {content ?? label.map(line => <span key={line} className="block">{line}</span>)}
    </button>
  );

  const renderSquareButton = (content: React.ReactNode, onClick: () => void, title: string, disabled = false,
                              size = BUTTON_SIZE) => (
    <button
      key={title}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center focus:outline-none transition duration-200 ${
        disabled ? 'cursor-default' : 'active:brightness-150'
      }`}
      style={{
        width: size,
        height: size,
        backgroundColor: BUTTON_COLOR,
        color: disabled ? BUTTON_DISABLED_TEXT_COLOR : BUTTON_TEXT_COLOR,
        fontFamily: BUTTON_FONT,
        fontSize: (BUTTON_FONT_SIZE * size) / BUTTON_SIZE,
        lineHeight: BUTTON_LINE_HEIGHT,
        touchAction: 'manipulation',
      }}
    >
      {content}
    </button>
  );

  // INFO opens the info box; while it's open the same button becomes a close X
  const renderInfoButton = (size: number) => renderButton(['INFO'], () => setShowHelp(prev => !prev),
    showHelp ? 'Close info (H)' : 'Info (H)', {
      colors: { bg: INFO_BUTTON_COLOR, text: INFO_BUTTON_TEXT_COLOR },
      size,
      content: showHelp ? (
        <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 10 10" stroke="currentColor" strokeWidth={0.7}>
          <line x1="0" y1="0" x2="10" y2="10" />
          <line x1="10" y1="0" x2="0" y2="10" />
        </svg>
      ) : null,
    });

  // Thin minus / plus glyphs for the brush size squares
  const signIcon = (plus: boolean, size = BUTTON_SIZE) => (
    <svg width={size * 0.4} height={size * 0.4} viewBox="0 0 10 10" stroke="currentColor" strokeWidth={0.6}>
      <line x1="0" y1="5" x2="10" y2="5" />
      {plus && <line x1="5" y1="0" x2="5" y2="10" />}
    </svg>
  );

  // Measures the collage's visible area by rendering its alpha offscreen, so erased parts and the
  // empty space around cloned blobs don't count, then switches to OUT mode framing that area.
  function enterOutMode() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || segments.length === 0) return;
    const outline = getBounds(segments.flatMap(sg => sg.vertices));
    const measureScale = Math.min(1, 1600 / Math.max(outline.maxX - outline.minX, outline.maxY - outline.minY));
    const width = Math.max(1, Math.ceil((outline.maxX - outline.minX) * measureScale));
    const height = Math.max(1, Math.ceil((outline.maxY - outline.minY) * measureScale));
    const measure = document.createElement('canvas');
    measure.width = width;
    measure.height = height;
    const mctx = measure.getContext('2d', { willReadFrequently: true });
    if (!mctx) return;
    mctx.setTransform(measureScale, 0, 0, measureScale, -outline.minX * measureScale, -outline.minY * measureScale);
    segments.forEach(sg => drawSegment(mctx, video, sg));

    const { data } = mctx.getImageData(0, 0, width, height);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return; // Nothing visible to show

    setPen(null);
    setInteraction({ type: 'idle' });
    setHoveredHandle(null);
    setHoveredSegmentId(null);
    setShowHelp(false);
    setOutBounds({
      minX: outline.minX + minX / measureScale,
      minY: outline.minY + minY / measureScale,
      maxX: outline.minX + (maxX + 1) / measureScale,
      maxY: outline.minY + (maxY + 1) / measureScale,
    });
  }

  return (
    <div 
      className="overflow-hidden relative font-sans"
      style={{ width: viewSize.width, height: viewSize.height, backgroundColor: bgColor, transition: 'background-color 0.3s ease' }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        style={{ cursor: getCursor(), touchAction: 'none' }}
      />
      <video ref={videoRef} className="hidden" playsInline muted />
      
      {(!videoDimensions.width || segments.length === 0 ) && (
        <div 
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ backgroundColor: bgColor }}
        >
          <div className={`text-lg ${contrastColor === '#FFFFFF' ? 'text-gray-400' : 'text-gray-600'}`}>Initializing Webcam...</div>
        </div>
      )}
      
      {!isOutMode && tool === 'clone' && !cloneSource && (
        <p
          className="absolute left-1/2 -translate-x-1/2 text-gray-300 text-lg leading-none whitespace-nowrap pointer-events-none"
          style={{ fontFamily: BUTTON_FONT, bottom: layout.insetBottom + (layout.compact ? 2 * layout.margin + layout.buttonSize + 6 : layout.margin + layout.buttonSize + 3), textShadow: '0 0 4px #000, 0 0 2px #000' }}
        >
          {layout.compact ? 'TAP TO PICK A SAMPLE · TAP CLONE TO RESAMPLE' : 'CLICK TO PICK A SAMPLE · ALT-CLICK TO RESAMPLE'}
        </p>
      )}

      {!isOutMode && !layout.compact && (
        <>
          <div className="absolute" style={{ left: CONTROLS_MARGIN, bottom: CONTROLS_MARGIN + layout.insetBottom, zIndex: 30 }}>
            {renderInfoButton(BUTTON_SIZE)}
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 flex items-center" style={{ bottom: CONTROLS_MARGIN + layout.insetBottom }}>
            <div className="flex items-center" style={{ gap: BAR_SPACING }}>
              {tools.map(t => renderButton(t.label, () => selectTool(t.id), `${t.id} (${t.key.toUpperCase()})`, { active: tool === t.id }))}
            </div>
            {/* Actions sit together in one pill: pressed once, never selected */}
            <div className="flex items-center rounded-full" style={{ marginLeft: GROUP_GAP, backgroundColor: ACTION_TRAY_COLOR }}>
              {renderButton(['UNDO'], undo, 'Undo (Cmd/Ctrl + Z)', { disabled: !canUndo })}
              {renderButton(['REDO'], redo, 'Redo (Cmd/Ctrl + Shift + Z)', { disabled: !canRedo })}
              {renderButton(['RESET'], resetCanvas, 'Reset to a single feed (R). Undoable.')}
            </div>
          </div>

          <div className="absolute" style={{ right: CONTROLS_MARGIN, bottom: CONTROLS_MARGIN + layout.insetBottom }}>
            {renderButton(['OUT'], enterOutMode, 'Out: show just the collage, filling the window (O)',
              { colors: { bg: OUT_BUTTON_COLOR, text: OUT_BUTTON_TEXT_COLOR } })}
          </div>
        </>
      )}

      {!isOutMode && layout.compact && (() => {
        const size = layout.buttonSize;
        const gap = layout.margin;
        return (
          <>
            {/* Top row: INFO and OUT in the corners, brush size and copy/paste squares centered */}
            <div className="absolute" style={{ left: gap, top: gap + layout.insetTop, zIndex: 30 }}>
              {renderInfoButton(size)}
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 flex" style={{ top: gap + layout.insetTop, gap: SQUARE_GAP }}>
              {renderSquareButton(signIcon(false, size), brushSmaller, 'Smaller brush', (tool !== 'clone' && tool !== 'erase') || brushRadius <= BRUSH_MIN, size)}
              {renderSquareButton(signIcon(true, size), brushLarger, 'Bigger brush', (tool !== 'clone' && tool !== 'erase') || brushRadius >= BRUSH_MAX, size)}
              {renderSquareButton(<span>COPY</span>, copyPiece, 'Copy the last piece you touched', !canCopy, size)}
              {renderSquareButton(<><span className="block">PAS</span><span className="block">TE</span></>, pastePiece, 'Paste a copy', !clipboard, size)}
            </div>
            <div className="absolute" style={{ right: gap, top: gap + layout.insetTop }}>
              {renderButton(['OUT'], enterOutMode, 'Out: show just the collage, filling the screen',
                { colors: { bg: OUT_BUTTON_COLOR, text: OUT_BUTTON_TEXT_COLOR }, size })}
            </div>

            {/* Bottom row: edge to edge with equal gaps; the action pill's buttons touch */}
            <div className="absolute flex items-center justify-between" style={{ left: gap, right: gap, bottom: gap + layout.insetBottom }}>
              {tools.filter(t => t.id !== 'move').map(t => renderButton(t.label, () => selectTool(t.id), t.id, { active: tool === t.id, size }))}
              <div className="flex items-center rounded-full" style={{ backgroundColor: ACTION_TRAY_COLOR }}>
                {renderButton(['UNDO'], undo, 'Undo', { disabled: !canUndo, size })}
                {renderButton(['REDO'], redo, 'Redo', { disabled: !canRedo, size })}
                {renderButton(['RES', 'ET'], resetCanvas, 'Reset to a single feed. Undoable.', { size })}
              </div>
            </div>
          </>
        );
      })()}

      {showHelp && (() => {
        // Phone: the box fills exactly the feed area. Desktop: centered over the feed.
        const view = viewRef.current;
        const boxStyle: React.CSSProperties = layout.compact
          ? { left: layout.margin, right: layout.margin, top: layout.feedTop, height: layout.feedBottom - layout.feedTop }
          : {
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: Math.min(820, view.width * 0.75),
              maxHeight: view.height - 2 * CONTROLS_MARGIN,
            };
        const fontSize = layout.compact ? Math.max(15, Math.round(layout.buttonSize * 0.3)) : 20;
        const entries = layout.compact ? INFO_COMPACT : INFO_DESKTOP;
        // {KEY} becomes a chip: tool letters orange; combinations and gestures green; single keys and buttons purple
        const withChips = (text: string) => text.split(/\{([^}]+)\}/).map((part, i) => {
          if (i % 2 === 0) return part;
          const isAction = /\w\+\w/.test(part) || INFO_GESTURES.includes(part);
          const bg = /^[A-Z]$/.test(part) ? INFO_BUTTON_COLOR : isAction ? ACCENT_GREEN : OUT_BUTTON_COLOR;
          return (
            <span key={i} style={{ backgroundColor: bg, color: '#000', padding: '0 0.2em' }}>{part}</span>
          );
        });
        // Credit links: highlighted like the chips, in white
        const creditLink = (label: string, href: string) => (
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ backgroundColor: '#fff', color: '#000', padding: '0 0.2em' }}>
            {label}
          </a>
        );
        return (
          <>
            <div
              className="absolute inset-0"
              style={{ backgroundColor: `rgba(0, 0, 0, ${INFO_DIM_OPACITY})`, zIndex: 20 }}
              onClick={() => setShowHelp(false)}
            />
            <div
              className="absolute overflow-y-auto"
              style={{
                ...boxStyle,
                zIndex: 30,
                backgroundColor: '#000',
                border: `${INFO_BORDER_WIDTH}px solid ${INFO_BUTTON_COLOR}`,
                padding: layout.compact ? layout.margin * 1.5 : Math.round(Math.min(48, view.height * 0.06)),
                fontFamily: BUTTON_FONT,
                fontSize,
                lineHeight: 1.3,
                color: INFO_TEXT_COLOR,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'max-content 1fr',
                  columnGap: layout.compact ? '1em' : '2em',
                  rowGap: layout.compact ? '0.9em' : '1.2em',
                }}
              >
                {entries.map(([label, text]) => (
                  <React.Fragment key={label}>
                    <div style={{ color: '#fff', whiteSpace: 'nowrap' }}>
                      {label.split('\n').map(line => <div key={line}>{withChips(line)}</div>)}
                    </div>
                    <div>{withChips(text)}</div>
                  </React.Fragment>
                ))}
              </div>
              <p style={{ marginTop: layout.compact ? '1.6em' : '2em' }}>
                A {creditLink('Maybe Machine', INFO_CREDIT_LINKS.project)} by {creditLink('Ravi Popat', INFO_CREDIT_LINKS.author)}.
              </p>
            </div>
          </>
        );
      })()}
    </div>
  );
};

export default App;