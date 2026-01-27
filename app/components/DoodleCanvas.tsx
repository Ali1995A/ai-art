"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

type Point = { x: number; y: number };
type Stroke = { points: Point[]; width: number; color: string };

export type DoodleCanvasHandle = {
  clear: () => void;
  undo: () => void;
  exportPngDataUrl: (maxSize: number) => string;
  hasInk: () => boolean;
};

type Props = {
  className?: string;
  onInkChange?: (hasInk: boolean) => void;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = clamp(r, 0, Math.min(w, h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function getPointFromEvent(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  };
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  size: { w: number; h: number },
) {
  const points = stroke.points;
  if (points.length === 0) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(points[0].x * size.w, points[0].y * size.h);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x * size.w, points[i].y * size.h);
  }
  ctx.stroke();
}

function drawAll(
  canvas: HTMLCanvasElement,
  strokes: Stroke[],
  opts?: { drawFrame?: boolean },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  if (opts?.drawFrame) {
    ctx.save();
    ctx.strokeStyle = "rgba(36, 26, 34, 0.08)";
    ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) * 0.006));
    roundRectPath(ctx, ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2, Math.round(Math.min(w, h) * 0.05));
    ctx.stroke();
    ctx.restore();
  }

  for (const s of strokes) drawStroke(ctx, s, { w, h });
}

const DoodleCanvas = forwardRef<DoodleCanvasHandle, Props>(function DoodleCanvas(
  { className, onInkChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const dpr = useMemo(() => (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1), []);

  const commitStrokes = useCallback(
    (next: Stroke[]) => {
      strokesRef.current = next;
      setStrokes(next);
      onInkChange?.(next.length > 0);
    },
    [onInkChange],
  );

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));

    const nextW = Math.floor(cssW * dpr);
    const nextH = Math.floor(cssH * dpr);
    if (canvas.width === nextW && canvas.height === nextH) return;

    canvas.width = nextW;
    canvas.height = nextH;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    drawAll(canvas, strokesRef.current, { drawFrame: true });
  }, [dpr]);

  useEffect(() => {
    resizeCanvas();
    const ro = new ResizeObserver(() => resizeCanvas());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [resizeCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawAll(canvas, strokes, { drawFrame: true });
  }, [strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      drawingRef.current = true;
      currentStrokeRef.current = {
        points: [getPointFromEvent(event, canvas)],
        width: Math.max(8, Math.round(Math.min(canvas.width, canvas.height) * 0.02)),
        color: "#121212",
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drawingRef.current) return;
      const stroke = currentStrokeRef.current;
      if (!stroke) return;
      stroke.points.push(getPointFromEvent(event, canvas));
      drawAll(canvas, [...strokesRef.current, stroke], { drawFrame: true });
    };

    const endStroke = (event: PointerEvent) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {}
      const stroke = currentStrokeRef.current;
      currentStrokeRef.current = null;
      if (!stroke || stroke.points.length < 1) return;
      commitStrokes([...strokesRef.current, stroke]);
    };

    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", endStroke, { passive: false });
    canvas.addEventListener("pointercancel", endStroke, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endStroke);
      canvas.removeEventListener("pointercancel", endStroke);
    };
  }, [commitStrokes]);

  useImperativeHandle(
    ref,
    () => ({
      clear: () => commitStrokes([]),
      undo: () => commitStrokes(strokesRef.current.slice(0, -1)),
      hasInk: () => strokesRef.current.length > 0,
      exportPngDataUrl: (maxSize: number) => {
        const source = canvasRef.current;
        if (!source) return "";

        const out = document.createElement("canvas");
        const w = source.width;
        const h = source.height;
        const scale = Math.min(1, maxSize / Math.max(w, h));
        out.width = Math.max(1, Math.round(w * scale));
        out.height = Math.max(1, Math.round(h * scale));

        const ctx = out.getContext("2d");
        if (!ctx) return "";

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(source, 0, 0, out.width, out.height);
        return out.toDataURL("image/png");
      },
    }),
    [commitStrokes],
  );

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Doodle canvas"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
          borderRadius: 24,
        }}
      />
    </div>
  );
});

export default DoodleCanvas;

