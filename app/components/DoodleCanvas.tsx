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
type StrokeMode = "draw" | "erase";
type Stroke = { points: Point[]; width: number; color: string; mode: StrokeMode };

export type DoodleCanvasHandle = {
  clear: () => void;
  undo: () => void;
  exportPngDataUrl: (maxSize: number) => string;
  exportPngDataUrlWithWatermark: (
    maxSize: number,
    spec: { creator: string; date: string },
  ) => string;
  hasInk: () => boolean;
  hasBackground: () => boolean;
  setBackgroundImage: (dataUrl: string | null) => void;
  setBackgroundColor: (hex: string) => void;
};

type Props = {
  className?: string;
  onInkChange?: (hasInk: boolean) => void;
  onStartStroke?: () => void;
  color: string;
  brushSize: number; // css px
  tool: "pen" | "eraser";
  backgroundColor: string;
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

function getPointFromTouch(touch: Touch, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (touch.clientX - rect.left) / rect.width,
    y: (touch.clientY - rect.top) / rect.height,
  };
}

function getPointFromMouse(event: MouseEvent, canvas: HTMLCanvasElement): Point {
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
  ctx.globalCompositeOperation =
    stroke.mode === "erase" ? "destination-out" : "source-over";
  ctx.strokeStyle = stroke.mode === "erase" ? "rgba(0,0,0,1)" : stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(points[0].x * size.w, points[0].y * size.h);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x * size.w, points[i].y * size.h);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts?: { drawFrame?: boolean },
) {
  if (!opts?.drawFrame) return;
  ctx.save();
  ctx.strokeStyle = "rgba(36, 26, 34, 0.08)";
  ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) * 0.006));
  roundRectPath(
    ctx,
    ctx.lineWidth,
    ctx.lineWidth,
    w - ctx.lineWidth * 2,
    h - ctx.lineWidth * 2,
    Math.round(Math.min(w, h) * 0.05),
  );
  ctx.stroke();
  ctx.restore();
}

function drawBackground(
  canvas: HTMLCanvasElement,
  bg: HTMLImageElement | null,
  bgColor: string,
  opts?: { drawFrame?: boolean },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = bgColor || "#ffffff";
  ctx.fillRect(0, 0, w, h);

  if (bg && bg.naturalWidth > 0 && bg.naturalHeight > 0) {
    const iw = bg.naturalWidth;
    const ih = bg.naturalHeight;
    const scale = Math.min(w / iw, h / ih);
    const dw = Math.round(iw * scale);
    const dh = Math.round(ih * scale);
    const dx = Math.round((w - dw) / 2);
    const dy = Math.round((h - dh) / 2);
    ctx.drawImage(bg, dx, dy, dw, dh);
  }

  drawFrame(ctx, w, h, opts);
}

function drawStrokesLayer(
  canvas: HTMLCanvasElement,
  strokes: Stroke[],
  opts?: { drawFrame?: boolean },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  for (const s of strokes) drawStroke(ctx, s, { w, h });
  drawFrame(ctx, w, h, opts);
}

function watermarkBoxForSize(w: number, h: number) {
  const base = Math.max(18, Math.round(Math.min(w, h) * 0.03));
  const fontSize = base;
  const padX = Math.round(base * 0.7);
  const padY = Math.round(base * 0.55);
  const margin = Math.round(base * 0.6);
  const boxW = Math.round(base * 6.6);
  const boxH = Math.round(base * 2.2);
  const x = w - margin - boxW;
  const y = h - margin - boxH;
  return { x, y, boxW, boxH, fontSize, padX, padY };
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  spec: { creator: string; date: string },
) {
  const { x, y, boxW, boxH, fontSize, padX, padY } = watermarkBoxForSize(w, h);
  const r = Math.round(fontSize * 0.7);

  ctx.save();
  roundRectPath(ctx, x, y, boxW, boxH, r);
  ctx.fillStyle = "rgba(255, 255, 255, 0.70)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 79, 160, 0.25)";
  ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.1));
  ctx.stroke();

  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(36, 26, 34, 0.78)";
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
  ctx.fillText(spec.date, x + padX, y + padY);
  ctx.fillStyle = "rgba(155, 92, 255, 0.85)";
  ctx.font = `800 ${Math.round(fontSize * 1.05)}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
  ctx.fillText(spec.creator, x + padX, y + padY + Math.round(fontSize * 1.1));
  ctx.restore();
}

const DoodleCanvas = forwardRef<DoodleCanvasHandle, Props>(function DoodleCanvas(
  { className, onInkChange, onStartStroke, color, brushSize, tool, backgroundColor },
  ref,
) {
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const backgroundRef = useRef<HTMLImageElement | null>(null);
  const [hasBackground, setHasBackground] = useState(false);
  const backgroundColorRef = useRef<string>(backgroundColor || "#ffffff");
  const drawingRef = useRef(false);
  const touchDrawingRef = useRef(false);
  const mouseDrawingRef = useRef(false);
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
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const container = containerRef.current;
    if (!bgCanvas || !drawCanvas || !container) return;

    const rect = container.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));

    const nextW = Math.floor(cssW * dpr);
    const nextH = Math.floor(cssH * dpr);
    if (bgCanvas.width === nextW && bgCanvas.height === nextH) return;

    for (const c of [bgCanvas, drawCanvas]) {
      c.width = nextW;
      c.height = nextH;
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
    }

    drawBackground(bgCanvas, backgroundRef.current, backgroundColorRef.current, {
      drawFrame: true,
    });
    drawStrokesLayer(drawCanvas, strokesRef.current, { drawFrame: true });
  }, [dpr]);

  useEffect(() => {
    resizeCanvas();
    const ro = new ResizeObserver(() => resizeCanvas());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [resizeCanvas]);

  useEffect(() => {
    const drawCanvas = drawCanvasRef.current;
    if (!drawCanvas) return;
    drawStrokesLayer(drawCanvas, strokes, { drawFrame: true });
  }, [strokes]);

  useEffect(() => {
    const canvas = drawCanvasRef.current;
    const bgCanvas = bgCanvasRef.current;
    if (!canvas || !bgCanvas) return;

    const prevent = (event: PointerEvent) => event.preventDefault();
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      event.preventDefault();
      onStartStroke?.();
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {}
      drawingRef.current = true;
      touchDrawingRef.current = false;
      mouseDrawingRef.current = false;
      const width = Math.max(2, Math.round(brushSize * dpr));
      currentStrokeRef.current = {
        points: [getPointFromEvent(event, canvas)],
        width,
        color,
        mode: tool === "eraser" ? "erase" : "draw",
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drawingRef.current) return;
      event.preventDefault();
      const stroke = currentStrokeRef.current;
      if (!stroke) return;
      stroke.points.push(getPointFromEvent(event, canvas));
      drawStrokesLayer(canvas, [...strokesRef.current, stroke], { drawFrame: true });
    };

    const endStroke = (event: PointerEvent) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      event.preventDefault();
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
    canvas.addEventListener("contextmenu", prevent, { passive: false });

    const onTouchStart = (event: TouchEvent) => {
      if (drawingRef.current) return;
      const t = event.touches[0];
      if (!t) return;
      if (event.cancelable) event.preventDefault();
      onStartStroke?.();
      touchDrawingRef.current = true;
      const width = Math.max(2, Math.round(brushSize * dpr));
      currentStrokeRef.current = {
        points: [getPointFromTouch(t, canvas)],
        width,
        color,
        mode: tool === "eraser" ? "erase" : "draw",
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!touchDrawingRef.current) return;
      const t = event.touches[0];
      if (!t) return;
      if (event.cancelable) event.preventDefault();
      const stroke = currentStrokeRef.current;
      if (!stroke) return;
      stroke.points.push(getPointFromTouch(t, canvas));
      drawStrokesLayer(canvas, [...strokesRef.current, stroke], {
        drawFrame: true,
      });
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!touchDrawingRef.current) return;
      if (event.cancelable) event.preventDefault();
      touchDrawingRef.current = false;
      const stroke = currentStrokeRef.current;
      currentStrokeRef.current = null;
      if (!stroke || stroke.points.length < 1) return;
      commitStrokes([...strokesRef.current, stroke]);
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

    const onMouseDown = (event: MouseEvent) => {
      // Fallback for environments where Pointer Events are unreliable/disabled.
      if (drawingRef.current || touchDrawingRef.current) return;
      if (event.button !== 0) return;
      event.preventDefault();
      onStartStroke?.();
      mouseDrawingRef.current = true;
      const width = Math.max(2, Math.round(brushSize * dpr));
      currentStrokeRef.current = {
        points: [getPointFromMouse(event, canvas)],
        width,
        color,
        mode: tool === "eraser" ? "erase" : "draw",
      };
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!mouseDrawingRef.current) return;
      event.preventDefault();
      const stroke = currentStrokeRef.current;
      if (!stroke) return;
      stroke.points.push(getPointFromMouse(event, canvas));
      drawStrokesLayer(canvas, [...strokesRef.current, stroke], {
        drawFrame: true,
      });
    };

    const onMouseUp = (event: MouseEvent) => {
      if (!mouseDrawingRef.current) return;
      event.preventDefault();
      mouseDrawingRef.current = false;
      const stroke = currentStrokeRef.current;
      currentStrokeRef.current = null;
      if (!stroke || stroke.points.length < 1) return;
      commitStrokes([...strokesRef.current, stroke]);
    };

    canvas.addEventListener("mousedown", onMouseDown, { passive: false });
    window.addEventListener("mousemove", onMouseMove, { passive: false });
    window.addEventListener("mouseup", onMouseUp, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endStroke);
      canvas.removeEventListener("pointercancel", endStroke);
      canvas.removeEventListener("contextmenu", prevent);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [brushSize, color, commitStrokes, dpr, onStartStroke, tool]);

  useImperativeHandle(
    ref,
    () => ({
      clear: () => commitStrokes([]),
      undo: () => commitStrokes(strokesRef.current.slice(0, -1)),
      hasInk: () => strokesRef.current.length > 0,
      hasBackground: () => hasBackground,
      setBackgroundColor: (hex: string) => {
        backgroundColorRef.current = hex || "#ffffff";
        const bgCanvas = bgCanvasRef.current;
        if (bgCanvas) {
          drawBackground(
            bgCanvas,
            backgroundRef.current,
            backgroundColorRef.current,
            { drawFrame: true },
          );
        }
      },
      setBackgroundImage: (dataUrl: string | null) => {
        if (!dataUrl) {
          backgroundRef.current = null;
          setHasBackground(false);
          const bgCanvas = bgCanvasRef.current;
          if (bgCanvas)
            drawBackground(bgCanvas, null, backgroundColorRef.current, {
              drawFrame: true,
            });
          return;
        }

        const img = new Image();
        img.onload = () => {
          backgroundRef.current = img;
          setHasBackground(true);
          const bgCanvas = bgCanvasRef.current;
          if (bgCanvas)
            drawBackground(bgCanvas, img, backgroundColorRef.current, {
              drawFrame: true,
            });
        };
        img.src = dataUrl;
      },
      exportPngDataUrl: (maxSize: number) => {
        const bgCanvas = bgCanvasRef.current;
        const drawCanvas = drawCanvasRef.current;
        if (!bgCanvas || !drawCanvas) return "";

        const out = document.createElement("canvas");
        const w = bgCanvas.width;
        const h = bgCanvas.height;
        const scale = Math.min(1, maxSize / Math.max(w, h));
        out.width = Math.max(1, Math.round(w * scale));
        out.height = Math.max(1, Math.round(h * scale));

        const ctx = out.getContext("2d");
        if (!ctx) return "";

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bgCanvas, 0, 0, out.width, out.height);
        ctx.drawImage(drawCanvas, 0, 0, out.width, out.height);
        return out.toDataURL("image/png");
      },
      exportPngDataUrlWithWatermark: (
        maxSize: number,
        spec: { creator: string; date: string },
      ) => {
        const bgCanvas = bgCanvasRef.current;
        const drawCanvas = drawCanvasRef.current;
        if (!bgCanvas || !drawCanvas) return "";

        const out = document.createElement("canvas");
        const w = bgCanvas.width;
        const h = bgCanvas.height;
        const scale = Math.min(1, maxSize / Math.max(w, h));
        out.width = Math.max(1, Math.round(w * scale));
        out.height = Math.max(1, Math.round(h * scale));

        const ctx = out.getContext("2d");
        if (!ctx) return "";

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bgCanvas, 0, 0, out.width, out.height);
        ctx.drawImage(drawCanvas, 0, 0, out.width, out.height);
        drawWatermark(ctx, out.width, out.height, spec);
        return out.toDataURL("image/png");
      },
    }),
    [commitStrokes, hasBackground],
  );

  useEffect(() => {
    backgroundColorRef.current = backgroundColor || "#ffffff";
    const bgCanvas = bgCanvasRef.current;
    if (bgCanvas) {
      drawBackground(bgCanvas, backgroundRef.current, backgroundColorRef.current, {
        drawFrame: true,
      });
    }
  }, [backgroundColor]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        position: "relative",
      }}
    >
      <canvas
        ref={bgCanvasRef}
        aria-hidden
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          position: "absolute",
          inset: 0,
          borderRadius: 24,
        }}
      />
      <canvas
        ref={drawCanvasRef}
        role="img"
        aria-label="Doodle canvas"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          position: "absolute",
          inset: 0,
          touchAction: "none",
          pointerEvents: "auto",
          cursor: "crosshair",
          borderRadius: 24,
        }}
      />
    </div>
  );
});

export default DoodleCanvas;
