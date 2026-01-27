"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DoodleCanvas, { type DoodleCanvasHandle } from "./DoodleCanvas";
import {
  DownloadIcon,
  HeartIcon,
  PhotoIcon,
  SparkleIcon,
  UndoIcon,
  WandIcon,
} from "./icons";

type StyleId = "cute" | "sticker" | "watercolor" | "storybook";

type StyleOption = {
  id: StyleId;
  color: string;
  icon: ReactNode;
  ariaLabel: string;
  promptHint: string;
  labelZh: string;
  labelPy: string;
  labelEn: string;
};

type GenerateResponse =
  | { ok: true; imageDataUrl: string }
  | { ok: false; error: string };

const PROMPT_CORE =
  "You are enhancing a child's doodle. STRICTLY follow the doodle as the blueprint.\n" +
  "- Keep the SAME subject, composition, and main shapes.\n" +
  "- Keep relative positions and proportions of all drawn parts.\n" +
  "- Preserve the doodle's colors as much as possible.\n" +
  "- Only add child-friendly details that MATCH what is already drawn (eyes, simple textures, gentle shading).\n" +
  "- Do NOT replace the subject with something else. Do NOT invent extra characters/objects.\n" +
  "- Do NOT add text, letters, logos, or watermarks.\n" +
  "- Use a clean, simple background.\n";

const PROMPT_IMG2IMG =
  PROMPT_CORE +
  "Image input rules:\n" +
  "- Treat the provided doodle image as the exact structure guide.\n" +
  "- Improve clarity and completeness WITHOUT changing the doodle meaning.\n";

const PROMPT_TXT2IMG =
  "Create a child-friendly picture based on the idea below. Use big simple shapes, clean background, no text, no watermark.\n";

function hslToHex(h: number, s: number, l: number) {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(100, s)) / 100;
  const ll = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function grayHex(v: number) {
  const vv = Math.max(0, Math.min(255, Math.round(v)));
  const h = vv.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateStampLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

async function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image load failed"));
  });
  return img;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const reader = new FileReader();
  return await new Promise((resolve, reject) => {
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Read image failed"));
    reader.readAsDataURL(blob);
  });
}

type WatermarkSpec = {
  creator: string;
  date: string;
};

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
  return { x, y, boxW, boxH, fontSize, padX, padY, margin };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

async function addWatermarkToDataUrl(
  dataUrl: string,
  spec: WatermarkSpec,
): Promise<string> {
  const img = await loadImageFromDataUrl(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(img, 0, 0, w, h);

  const { x, y, boxW, boxH, fontSize, padX, padY } = watermarkBoxForSize(w, h);
  const r = Math.round(fontSize * 0.7);

  ctx.save();
  roundRect(ctx, x, y, boxW, boxH, r);
  ctx.fillStyle = "rgba(255, 255, 255, 0.70)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 79, 160, 0.25)";
  ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.1));
  ctx.stroke();

  ctx.fillStyle = "rgba(36, 26, 34, 0.78)";
  ctx.textBaseline = "top";
  ctx.font = `700 ${fontSize}px ${"system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"}`;
  ctx.fillText(spec.date, x + padX, y + padY);
  ctx.fillStyle = "rgba(155, 92, 255, 0.85)";
  ctx.font = `800 ${Math.round(fontSize * 1.05)}px ${"system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"}`;
  ctx.fillText(spec.creator, x + padX, y + padY + Math.round(fontSize * 1.1));
  ctx.restore();

  return canvas.toDataURL("image/png");
}

async function stripOurWatermarkFromDataUrl(dataUrl: string): Promise<string> {
  const img = await loadImageFromDataUrl(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0, w, h);
  const { x, y, boxW, boxH } = watermarkBoxForSize(w, h);

  const box = ctx.getImageData(x, y, boxW, boxH);
  const aboveY = Math.max(0, y - boxH - 6);
  const above = ctx.getImageData(x, aboveY, boxW, Math.min(boxH, h - aboveY));

  const avgLum = (imgData: ImageData) => {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < imgData.data.length; i += 16) {
      const r = imgData.data[i];
      const g = imgData.data[i + 1];
      const b = imgData.data[i + 2];
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      n++;
    }
    return n ? sum / n : 0;
  };

  const lumBox = avgLum(box);
  const lumAbove = avgLum(above);
  const looksLikeOurWatermark = lumBox - lumAbove > 18;
  if (!looksLikeOurWatermark) return dataUrl;

  const sampleH = Math.max(6, Math.round(boxH * 0.18));
  const sy = Math.max(0, y - sampleH - 4);
  const sample = ctx.getImageData(x, sy, boxW, Math.min(sampleH, h - sy));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < sample.data.length; i += 4) {
    r += sample.data[i];
    g += sample.data[i + 1];
    b += sample.data[i + 2];
    n++;
  }
  const avg = n ? `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})` : "#ffffff";

  ctx.save();
  ctx.fillStyle = avg;
  ctx.fillRect(x, y, boxW, boxH);
  ctx.restore();

  return canvas.toDataURL("image/png");
}

export default function DoodleApp() {
  const canvasRef = useRef<DoodleCanvasHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [hasBackground, setHasBackground] = useState(false);
  const [styleId, setStyleId] = useState<StyleId>("cute");
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [brushSize, setBrushSize] = useState(12);
  const [color, setColor] = useState("#9b5cff");
  const [backgroundColor, setBackgroundColor] = useState("#fff0f7");
  const [isColorWallOpen, setIsColorWallOpen] = useState(false);
  const [colorWallTarget, setColorWallTarget] = useState<"pen" | "bg">("pen");
  const [recentColors, setRecentColors] = useState<string[]>([]);

  const styles = useMemo<StyleOption[]>(
    () => [
      {
        id: "cute",
        color: "linear-gradient(135deg, #ffd1e6 0%, #b3e5ff 100%)",
        icon: <HeartIcon className="h-7 w-7" />,
        ariaLabel: "Cute style",
        labelZh: "可爱",
        labelPy: "kě ài",
        labelEn: "Cute",
        promptHint:
          "cute pastel kid illustration, soft shading, gentle colors, keep doodle silhouette",
      },
      {
        id: "sticker",
        color: "linear-gradient(135deg, #ffe7a8 0%, #ffd1e6 100%)",
        icon: <SparkleIcon className="h-7 w-7" />,
        ariaLabel: "Sticker style",
        labelZh: "贴纸",
        labelPy: "tiē zhǐ",
        labelEn: "Sticker",
        promptHint:
          "sticker style, bold outline, flat colors, simple shapes, high contrast, keep doodle silhouette",
      },
      {
        id: "watercolor",
        color: "linear-gradient(135deg, #c8ffe1 0%, #d6c8ff 100%)",
        icon: <SparkleIcon className="h-7 w-7" />,
        ariaLabel: "Watercolor style",
        labelZh: "水彩",
        labelPy: "shuǐ cǎi",
        labelEn: "Watercolor",
        promptHint:
          "watercolor, paper texture, soft edges, light washes, child-friendly, keep doodle silhouette",
      },
      {
        id: "storybook",
        color: "linear-gradient(135deg, #b3e5ff 0%, #ffd1e6 100%)",
        icon: <WandIcon className="h-7 w-7" />,
        ariaLabel: "Storybook style",
        labelZh: "绘本",
        labelPy: "huì běn",
        labelEn: "Storybook",
        promptHint:
          "storybook illustration, warm lighting, gentle outlines, cute, cozy, simple background, keep doodle silhouette",
      },
    ],
    [],
  );

  const selectedStyle = useMemo(
    () => styles.find((s) => s.id === styleId) ?? styles[0],
    [styleId, styles],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ai-art:recentColors");
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(parsed)) {
        const cleaned = parsed
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => /^#[0-9a-fA-F]{6}$/.test(v));
        if (cleaned.length) setRecentColors(cleaned.slice(0, 12));
      }
    } catch {}
  }, []);

  const rememberColor = useCallback((hex: string) => {
    const c = hex.toLowerCase();
    setRecentColors((prev) => {
      const next = [c, ...prev.filter((p) => p.toLowerCase() !== c)].slice(
        0,
        12,
      );
      try {
        localStorage.setItem("ai-art:recentColors", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const selectColor = useCallback(
    (hex: string, target: "pen" | "bg") => {
      if (target === "pen") {
        setTool("pen");
        setColor(hex);
      } else {
        setBackgroundColor(hex);
        canvasRef.current?.setBackgroundColor(hex);
      }
      rememberColor(hex);
      setIsColorWallOpen(false);
    },
    [rememberColor],
  );

  const palette256 = useMemo(() => {
    const hues = 16;
    // 16x16 wall: rows = (sat, lightness), cols = hue
    // Make the wall feel like a smooth gradient left->right (hue), top->bottom (lightness).
    const lightness = [22, 28, 34, 40, 48, 58, 68, 78];
    const sats = [92, 62];
    const out: string[] = [];

    // Build row definitions first to ensure a consistent gradient order.
    const rows: Array<{ sat: number; light: number }> = [];
    for (let li = 0; li < lightness.length; li++) {
      for (let si = 0; si < sats.length; si++) {
        rows.push({ sat: sats[si], light: lightness[li] });
      }
    }

    for (const row of rows) {
      for (let h = 0; h < hues; h++) {
        const hue = Math.round((360 / hues) * h);
        out.push(hslToHex(hue, row.sat, row.light));
      }
    }

    return out.slice(0, 256);
  }, []);

  const grays16 = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < 16; i++) out.push(grayHex((255 / 15) * i));
    return out;
  }, []);

  useEffect(() => {
    const applyAppHeight = () => {
      const height =
        window.visualViewport?.height ??
        Math.min(window.innerHeight, document.documentElement.clientHeight);
      document.documentElement.style.setProperty("--app-height", `${height}px`);
    };
    applyAppHeight();
    window.addEventListener("resize", applyAppHeight, { passive: true });
    window.visualViewport?.addEventListener("resize", applyAppHeight, {
      passive: true,
    });
    return () => {
      window.removeEventListener("resize", applyAppHeight);
      window.visualViewport?.removeEventListener("resize", applyAppHeight);
    };
  }, []);

  const undo = useCallback(() => {
    setError("");
    canvasRef.current?.undo();
  }, []);

  const openAlbum = useCallback(() => {
    setError("");
    fileInputRef.current?.click();
  }, []);

  const onPickImage = useCallback(async () => {
    const input = fileInputRef.current;
    const file = input?.files?.[0];
    if (!file) return;
    input.value = "";

    const dataUrl = await blobToDataUrl(file);
    const cleaned = await stripOurWatermarkFromDataUrl(dataUrl);

    canvasRef.current?.setBackgroundImage(cleaned);
    setHasBackground(true);
  }, []);

  useEffect(() => {
    canvasRef.current?.setBackgroundColor(backgroundColor);
  }, [backgroundColor]);

  const downloadDataUrl = useCallback((dataUrl: string, filename: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const saveToAlbum = useCallback(async () => {
    setError("");
    const spec: WatermarkSpec = { creator: "CC", date: dateStampLocal() };

    const doodle = canvasRef.current?.exportPngDataUrl(2048) ?? "";
    if (doodle) {
      const watermarked = await addWatermarkToDataUrl(doodle, spec);
      downloadDataUrl(watermarked, `doodle_${spec.date}_CC.png`);
    }

    if (!imageDataUrl) return;
    if (imageDataUrl.startsWith("data:")) {
      const watermarked = await addWatermarkToDataUrl(imageDataUrl, spec);
      setTimeout(
        () => downloadDataUrl(watermarked, `ai_${spec.date}_CC.png`),
        250,
      );
      return;
    }

    try {
      const res = await fetch(imageDataUrl, { mode: "cors" });
      const blob = await res.blob();
      const dataUrl = await blobToDataUrl(blob);
      const watermarked = await addWatermarkToDataUrl(dataUrl, spec);
      setTimeout(
        () => downloadDataUrl(watermarked, `ai_${spec.date}_CC.png`),
        250,
      );
    } catch {
      window.open(imageDataUrl, "_blank", "noopener,noreferrer");
    }
  }, [downloadDataUrl, imageDataUrl]);

  const generate = useCallback(async () => {
    setError("");
    setIsGenerating(true);
    try {
      const doodle = canvasRef.current?.exportPngDataUrl(2048) ?? "";
      const prompt = doodle ? PROMPT_IMG2IMG : PROMPT_TXT2IMG;
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: doodle ? "img2img" : "txt2img",
          prompt,
          stylePrompt: selectedStyle.promptHint,
          imageDataUrl: doodle || undefined,
          quality: "fast",
        }),
      });

      const json = (await res.json()) as GenerateResponse;
      if (!json.ok) throw new Error(json.error || "Generate failed");
      setImageDataUrl(json.imageDataUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generate failed";
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedStyle.promptHint]);

  return (
    <div className="app-viewport">
      <div
        className="glass-card"
        style={{
          padding: 14,
          background:
            "radial-gradient(1200px 800px at 0% 0%, rgba(255, 79, 160, 0.18), transparent 55%), radial-gradient(900px 600px at 100% 0%, rgba(155, 92, 255, 0.16), transparent 55%), var(--card)",
        }}
      >
        <div className="flex items-center justify-between px-2 pb-3">
          <div className="flex items-center gap-2">
            <div
              className="kid-button flex items-center justify-center"
              style={{
                width: 42,
                height: 42,
                background: selectedStyle.color,
                color: "rgba(36, 26, 34, 0.85)",
                border: "1px solid rgba(36, 26, 34, 0.10)",
              }}
              aria-hidden
            >
              <WandIcon className="h-6 w-6" />
            </div>
            <div className="text-sm font-semibold tracking-tight text-[color:var(--foreground)]">
              Pink Doodle AI
            </div>
          </div>
        </div>

        <div
          className="split-layout"
        >
          <div className="glass-card flex-1 p-3">
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="kid-button kid-btn-sm"
                  onClick={openAlbum}
                  aria-label="Open album"
                  disabled={isGenerating}
                  style={{ opacity: isGenerating ? 0.6 : 1 }}
                >
                  <PhotoIcon className="kid-icon shrink-0" />
                  <span className="kid-label">
                    <span className="label-line">相册</span>
                    <span className="label-line pinyin-text opacity-75">
                      xiàng cè
                    </span>
                    <span className="label-line en-text opacity-75">Album</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="kid-button kid-btn-icon"
                  onClick={undo}
                  aria-label="Undo"
                  disabled={!hasInk || isGenerating}
                  style={{ opacity: !hasInk || isGenerating ? 0.5 : 1 }}
                >
                  <UndoIcon className="kid-icon" />
                </button>
                <button
                  type="button"
                  className={[
                    "kid-button",
                    "kid-btn-sm",
                    tool === "eraser" ? "kid-btn-selected" : "",
                  ].join(" ")}
                  onClick={() => {
                    setTool((t) => (t === "eraser" ? "pen" : "eraser"));
                  }}
                  aria-label="Eraser"
                  disabled={isGenerating}
                  style={{
                    opacity: isGenerating ? 0.6 : 1,
                  }}
                >
                  <span className="kid-label">
                    <span className="label-line">橡皮</span>
                    <span className="label-line pinyin-text opacity-75">
                      xiàng pí
                    </span>
                    <span className="label-line en-text opacity-75">Eraser</span>
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={[
                      "kid-button",
                      "kid-btn-sm",
                      isColorWallOpen ? "kid-btn-selected" : "",
                    ].join(" ")}
                    onClick={() => {
                      setColorWallTarget("pen");
                      setIsColorWallOpen((v) => !v);
                    }}
                    aria-label="Color palette"
                    disabled={isGenerating}
                    style={{
                      opacity: isGenerating ? 0.7 : 1,
                    }}
                  >
                    <span
                      className="inline-block"
                      aria-hidden
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        background: tool === "eraser" ? "#ffffff" : color,
                        border: "1px solid rgba(36, 26, 34, 0.12)",
                        boxShadow:
                          tool === "eraser"
                            ? "inset 0 0 0 2px rgba(36, 26, 34, 0.10)"
                            : undefined,
                      }}
                    />
                    <span className="kid-label">
                      <span className="label-line">颜色</span>
                      <span className="label-line pinyin-text opacity-75">
                        yán sè
                      </span>
                      <span className="label-line en-text opacity-75">
                        Color
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={[
                      "kid-button",
                      "kid-btn-sm",
                      isColorWallOpen && colorWallTarget === "bg"
                        ? "kid-btn-selected"
                        : "",
                    ].join(" ")}
                    onClick={() => {
                      setColorWallTarget("bg");
                      setIsColorWallOpen(true);
                    }}
                    aria-label="Background color"
                    disabled={isGenerating}
                    style={{ opacity: isGenerating ? 0.7 : 1 }}
                  >
                    <span
                      className="inline-block"
                      aria-hidden
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        background: backgroundColor,
                        border: "1px solid rgba(36, 26, 34, 0.12)",
                      }}
                    />
                    <span className="kid-label">
                      <span className="label-line">底色</span>
                      <span className="label-line pinyin-text opacity-75">
                        dǐ sè
                      </span>
                      <span className="label-line en-text opacity-75">
                        Background
                      </span>
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={4}
                    max={36}
                    step={1}
                    value={brushSize}
                    disabled={isGenerating}
                    className="kid-slider"
                    aria-label="Brush size slider"
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                  />
                  <div
                    className="kid-button inline-flex items-center justify-center"
                    style={{
                      width: 46,
                      height: 46,
                      border: "1px solid rgba(36, 26, 34, 0.10)",
                      opacity: isGenerating ? 0.7 : 1,
                      background:
                        "linear-gradient(135deg, rgba(255,255,255,0.85), rgba(255,255,255,0.55))",
                    }}
                    aria-hidden
                  >
                    <span
                      style={{
                        width: brushSize,
                        height: brushSize,
                        borderRadius: 999,
                        background:
                          tool === "eraser"
                            ? "rgba(255, 79, 160, 0.88)"
                            : "rgba(36, 26, 34, 0.92)",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {isColorWallOpen ? (
              <div className="mt-3 glass-card p-3">
                <div className="mb-3">
                  <div className="color-wall">
                    {grays16.map((c) => {
                      const selected =
                        colorWallTarget === "pen"
                          ? tool === "pen" && color === c
                          : backgroundColor === c;
                      const isWhite = c.toLowerCase() === "#ffffff";
                      return (
                        <button
                          key={c}
                          type="button"
                          className={[
                            "color-chip",
                            selected ? "color-chip-selected" : "",
                          ].join(" ")}
                          style={{
                            background: c,
                            boxShadow: isWhite
                              ? "inset 0 0 0 2px rgba(36, 26, 34, 0.10), 0 6px 14px rgba(0,0,0,0.06)"
                              : undefined,
                          }}
                          aria-label="Pick gray"
                          onClick={() => {
                            selectColor(c, colorWallTarget);
                          }}
                          disabled={isGenerating}
                        />
                      );
                    })}
                  </div>
                </div>
                {recentColors.length ? (
                  <div className="mb-3">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <div className="text-xs font-extrabold opacity-75">
                        最近 <span className="pinyin-text">zuì jìn</span>{" "}
                        <span className="en-text">Recent</span>
                      </div>
                    </div>
                    <div className="color-wall-12">
                      {recentColors.slice(0, 12).map((c) => {
                        const selected =
                          colorWallTarget === "pen"
                            ? tool === "pen" && color === c
                            : backgroundColor === c;
                        const isWhite = c.toLowerCase() === "#ffffff";
                        return (
                          <button
                            key={c}
                            type="button"
                            className={[
                              "color-chip",
                              selected ? "color-chip-selected" : "",
                            ].join(" ")}
                            style={{
                              background: c,
                              boxShadow: isWhite
                                ? "inset 0 0 0 2px rgba(36, 26, 34, 0.10), 0 6px 14px rgba(0,0,0,0.06)"
                                : undefined,
                            }}
                            aria-label="Pick recent"
                            onClick={() => selectColor(c, colorWallTarget)}
                            disabled={isGenerating}
                          />
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <div className="color-wall">
                  {palette256.map((c) => {
                    const selected =
                      colorWallTarget === "pen"
                        ? tool === "pen" && color === c
                        : backgroundColor === c;
                    const isWhite = c.toLowerCase() === "#ffffff";
                    return (
                      <button
                        key={c}
                        type="button"
                        className={[
                          "color-chip",
                          selected ? "color-chip-selected" : "",
                        ].join(" ")}
                        style={{
                          background: c,
                          boxShadow: isWhite
                            ? "inset 0 0 0 2px rgba(36, 26, 34, 0.10), 0 6px 14px rgba(0,0,0,0.06)"
                            : undefined,
                        }}
                        aria-label="Pick color"
                        onClick={() => {
                          selectColor(c, colorWallTarget);
                        }}
                        disabled={isGenerating}
                      />
                    );
                  })}
                </div>
              </div>
            ) : null}

            <DoodleCanvas
              ref={canvasRef}
              className="doodle-canvas-shell"
              onInkChange={setHasInk}
              color={color}
              brushSize={brushSize}
              tool={tool}
              backgroundColor={backgroundColor}
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={() => void onPickImage()}
            />
          </div>

          <div className="glass-card flex-1 p-3 flex flex-col">
            <div className="flex items-center justify-between px-1 pb-2">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pr-2">
                {styles.map((s) => {
                  const selected = s.id === styleId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={[
                        "kid-button",
                        "kid-btn-md",
                        "shrink-0",
                        selected ? "kid-btn-selected" : "",
                      ].join(" ")}
                      onClick={() => setStyleId(s.id)}
                      aria-label={s.ariaLabel}
                      disabled={isGenerating}
                      style={{
                        background: s.color,
                        color: "rgba(36, 26, 34, 0.92)",
                        opacity: isGenerating ? 0.7 : 1,
                      }}
                    >
                      <span className="inline-flex items-center justify-center">
                        {s.icon}
                      </span>
                      <span className="flex flex-col leading-tight text-left min-w-0">
                        <span className="label-line text-[13px] font-extrabold">
                          {s.labelZh}
                        </span>
                        <span className="label-line pinyin-text text-[11px] font-semibold opacity-75">
                          {s.labelPy}
                        </span>
                        <span className="label-line en-text text-[11px] font-semibold opacity-75">
                          {s.labelEn}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="kid-button kid-btn-md"
                  onClick={generate}
                  aria-label="Generate"
                  disabled={isGenerating || (!hasInk && !hasBackground)}
                  style={{
                    background:
                      "linear-gradient(135deg, var(--pink-300) 0%, var(--purple-600) 100%)",
                    color: "rgba(36, 26, 34, 0.92)",
                    border: "1px solid rgba(36, 26, 34, 0.10)",
                    opacity:
                      isGenerating || (!hasInk && !hasBackground) ? 0.55 : 1,
                  }}
                >
                  <WandIcon className="kid-icon shrink-0" />
                  <span className="kid-label">
                    <span className="label-line">生成</span>
                    <span className="label-line pinyin-text opacity-75">
                      shēng chéng
                    </span>
                    <span className="label-line en-text opacity-75">
                      Generate
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  className="kid-button kid-btn-md"
                  onClick={saveToAlbum}
                  aria-label="Save"
                  disabled={isGenerating || (!hasInk && !hasBackground && !imageDataUrl)}
                  style={{
                    background:
                      "linear-gradient(135deg, #c8ffe1 0%, #ffd1e6 100%)",
                    color: "rgba(36, 26, 34, 0.92)",
                    border: "1px solid rgba(36, 26, 34, 0.10)",
                    opacity:
                      isGenerating || (!hasInk && !hasBackground && !imageDataUrl)
                        ? 0.55
                        : 1,
                  }}
                >
                  <DownloadIcon className="kid-icon shrink-0" />
                  <span className="kid-label">
                    <span className="label-line">保存</span>
                    <span className="label-line pinyin-text opacity-75">
                      bǎo cún
                    </span>
                    <span className="label-line en-text opacity-75">Save</span>
                  </span>
                </button>
              </div>
            </div>

            <div className="relative flex-1 overflow-hidden rounded-2xl border border-[color:var(--card-border)] bg-white/70">
              {imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageDataUrl}
                  alt=""
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-sm opacity-70">
                  <div className="flex flex-col items-center gap-3">
                    <div
                      className="kid-button flex items-center justify-center"
                      style={{
                        width: 72,
                        height: 72,
                        background: selectedStyle.color,
                        color: "rgba(36, 26, 34, 0.9)",
                        border: "1px solid rgba(36, 26, 34, 0.10)",
                      }}
                      aria-hidden
                    >
                      <HeartIcon className="h-8 w-8" />
                    </div>
                    <div className="sr-only">Generated image will appear here</div>
                  </div>
                </div>
              )}

              {isGenerating ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-sm">
                  <div className="kid-button px-5 py-3 text-sm font-semibold">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{
                          background:
                            "linear-gradient(135deg, var(--pink-600) 0%, var(--purple-600) 100%)",
                          animation: "pulse 1s infinite ease-in-out",
                        }}
                      />
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{
                          background:
                            "linear-gradient(135deg, var(--pink-600) 0%, var(--purple-600) 100%)",
                          animation: "pulse 1s infinite ease-in-out",
                          animationDelay: "0.15s",
                        }}
                      />
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{
                          background:
                            "linear-gradient(135deg, var(--pink-600) 0%, var(--purple-600) 100%)",
                          animation: "pulse 1s infinite ease-in-out",
                          animationDelay: "0.3s",
                        }}
                      />
                      <span className="sr-only">Loading</span>
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0% {
            transform: translateY(0);
            opacity: 0.55;
          }
          50% {
            transform: translateY(-3px);
            opacity: 1;
          }
          100% {
            transform: translateY(0);
            opacity: 0.55;
          }
        }
      `}</style>
    </div>
  );
}
