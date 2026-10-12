export interface Point {
  x: number;
  y: number;
}

// Masks live in a segment's texture pixel space, so they move, rotate and cut with the segment.
// They are applied in order: 'clip' and 'reveal' keep only their area, 'erase' and 'cutout' remove theirs.
export type MaskOp =
  | { kind: 'erase' | 'reveal'; radius: number; points: Point[] }
  | { kind: 'clip'; points: Point[] }
  | { kind: 'cutout'; points: Point[] };

export interface Segment {
  id: string;
  vertices: Point[];
  texCoords: Point[]; // Texture coordinates [0, 1] for mapping video
  masks: MaskOp[];
}

export type Tool = 'move' | 'cut' | 'clone' | 'erase';

// A brush stroke in screen space while it is being drawn
export interface Stroke {
  kind: 'clone' | 'erase';
  radius: number;
  points: Point[];
  offset: Point; // Clone only: screen offset from paint position to sample position
}

export type InteractionState =
  | { type: 'idle' }
  // A press while drawing a cut shape: a click adds a corner point, dragging draws freehand.
  // `before` is the shape as it was before this press (restored if a pinch takes over).
  | { type: 'pen_drawing'; startPos: Point; moved: boolean; before: Point[][] | null }
  | { type: 'dragging_segment'; segmentId: string; startMouse: Point; startVertices: Point[] }
  // Scaling/rotating with the selection handles, or a two-finger pinch. `center` is the pivot
  // (the pinch midpoint for pinches); distances and angles are measured from it.
  | { type: 'transforming'; mode: 'scale' | 'rotate' | 'pinch'; segmentId: string; center: Point; startVertices: Point[]; startDist: number; startAngle: number };

// A transform handle on the selected piece: a corner (scale) or the rotate handle
export interface HoveredHandle {
  segmentId: string;
  kind: 'scale' | 'rotate';
  corner: number;
}
