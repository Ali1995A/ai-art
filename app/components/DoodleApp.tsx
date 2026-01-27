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

type StyleId =
  | "auto"
  | "cute3d"
  | "fantasy"
  | "cyberpunk"
  | "blocks"
  | "feltclay"
  | "blueprint"
  | "storybook"
  | "sticker"
  | "watercolor"
  | "embroidery";

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

function rgbToHsl(r: number, g: number, b: number) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rr:
        h = ((gg - bb) / d) % 6;
        break;
      case gg:
        h = (bb - rr) / d + 2;
        break;
      default:
        h = (rr - gg) / d + 4;
        break;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  return { h, s, l };
}

async function analyzeDoodle(dataUrl: string) {
  const img = await loadImageFromDataUrl(dataUrl);
  const w = 128;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      inkRatio: 0.2,
      satAvg: 0.4,
      lumAvg: 0.6,
      hueVar: 0.4,
      edge: 0.2,
    };
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "low";
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  let ink = 0;
  let satSum = 0;
  let lumSum = 0;
  const hues: number[] = [];

  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    const isInk = a > 10 && (r < 250 || g < 250 || b < 250);
    if (isInk) ink++;

    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    lum[p] = y;
    lumSum += y;

    const hsl = rgbToHsl(r, g, b);
    satSum += hsl.s;
    if (isInk) hues.push(hsl.h);
  }

  let edge = 0;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const p = y * w + x;
      const d1 = Math.abs(lum[p] - lum[p + 1]);
      const d2 = Math.abs(lum[p] - lum[p + w]);
      if (d1 + d2 > 0.25) edge++;
    }
  }

  const hueAvg =
    hues.length > 0 ? hues.reduce((a, b) => a + b, 0) / hues.length : 0;
  const hueVar =
    hues.length > 0
      ? hues.reduce((a, v) => a + Math.abs(v - hueAvg), 0) / (hues.length * 180)
      : 0;

  const total = w * h;
  return {
    inkRatio: ink / total,
    satAvg: satSum / total,
    lumAvg: lumSum / total,
    hueVar,
    edge: edge / ((w - 1) * (h - 1)),
  };
}

function pickStyleFromMetrics(m: {
  inkRatio: number;
  satAvg: number;
  lumAvg: number;
  hueVar: number;
  edge: number;
}): Exclude<StyleId, "auto"> {
  if (m.inkRatio < 0.03) return "sticker";
  if (m.satAvg < 0.18 && m.edge > 0.14) return "blueprint";
  if (m.satAvg > 0.45 && m.lumAvg < 0.5) return "cyberpunk";
  if (m.inkRatio < 0.09 && m.edge < 0.1) return "blocks";
  if (m.edge < 0.11 && m.satAvg < 0.35) return "feltclay";
  if (m.hueVar > 0.22 && m.satAvg > 0.35) return "fantasy";
  if (m.satAvg < 0.28 && m.edge < 0.12) return "watercolor";
  if (m.inkRatio > 0.22) return "embroidery";
  return "storybook";
}

export default function DoodleApp() {
  const canvasRef = useRef<DoodleCanvasHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [hasBackground, setHasBackground] = useState(false);
  const [styleId, setStyleId] = useState<StyleId>("auto");
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
        id: "auto",
        color: "linear-gradient(135deg, #ffd1e6 0%, #9b5cff 55%, #2bb3ff 100%)",
        icon: <WandIcon className="h-7 w-7" />,
        ariaLabel: "Auto style",
        labelZh: "自动",
        labelPy: "zì dòng",
        labelEn: "Auto",
        promptHint: "",
      },
      {
        id: "cute3d",
        color: "linear-gradient(135deg, #ffd1e6 0%, #b3e5ff 100%)",
        icon: <HeartIcon className="h-7 w-7" />,
        ariaLabel: "3D animation style",
        labelZh: "3D动画",
        labelPy: "sān wéi dòng huà",
        labelEn: "3D",
        promptHint:
          "family-friendly 3D animation look, soft global illumination, clean surfaces, big simple shapes, keep doodle silhouette",
      },
      {
        id: "fantasy",
        color: "linear-gradient(135deg, #d6c8ff 0%, #c8ffe1 50%, #ffd1e6 100%)",
        icon: <SparkleIcon className="h-7 w-7" />,
        ariaLabel: "Fantasy illustration style",
        labelZh: "奇幻",
        labelPy: "qí huàn",
        labelEn: "Fantasy",
        promptHint:
          "fantasy illustration, magical glow, whimsical details, child-friendly, keep doodle silhouette",
      },
      {
        id: "cyberpunk",
        color: "linear-gradient(135deg, #2bb3ff 0%, #9b5cff 55%, #ff4fa0 100%)",
        icon: <SparkleIcon className="h-7 w-7" />,
        ariaLabel: "Cyberpunk style",
        labelZh: "赛博",
        labelPy: "sài bó",
        labelEn: "Cyber",
        promptHint:
          "cyberpunk neon, rim lighting, glowing accents, high contrast, keep doodle silhouette, no text",
      },
      {
        id: "blocks",
        color: "linear-gradient(135deg, #ffe7a8 0%, #ffd1e6 55%, #b3e5ff 100%)",
        icon: <HeartIcon className="h-7 w-7" />,
        ariaLabel: "Blocks style",
        labelZh: "积木",
        labelPy: "jī mù",
        labelEn: "Blocks",
        promptHint:
          "toy blocks / brick-built look, chunky shapes, plastic material, simple shading, keep doodle silhouette",
      },
      {
        id: "feltclay",
        color: "linear-gradient(135deg, #c8ffe1 0%, #ffe1ef 55%, #ffd74a 100%)",
        icon: <HeartIcon className="h-7 w-7" />,
        ariaLabel: "Felt and clay style",
        labelZh: "毛毡",
        labelPy: "yáng máo zhān",
        labelEn: "Felt/Clay",
        promptHint:
          "wool felt / clay handmade texture, soft fibers, matte surface, cozy, keep doodle silhouette",
      },
      {
        id: "blueprint",
        color: "linear-gradient(135deg, #b3e5ff 0%, #d6c8ff 100%)",
        icon: <WandIcon className="h-7 w-7" />,
        ariaLabel: "Blueprint style",
        labelZh: "蓝图",
        labelPy: "lán tú",
        labelEn: "Blueprint",
        promptHint:
          "sci-fi blueprint / engineering drawing, clean lines, subtle grid, technical shading, keep doodle silhouette, no text",
      },
      {
        id: "storybook",
        color: "linear-gradient(135deg, #b3e5ff 0%, #ffd1e6 100%)",
        icon: <WandIcon className="h-7 w-7" />,
        ariaLabel: "Picture book illustration style",
        labelZh: "绘本",
        labelPy: "huì běn",
        labelEn: "Book",
        promptHint:
          "beautiful picture book illustration, warm lighting, gentle outlines, cozy, simple background, keep doodle silhouette",
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
          "minimal clean line + sticker style, bold outline, flat colors, simple shapes, high contrast, keep doodle silhouette",
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
        id: "embroidery",
        color: "linear-gradient(135deg, #ffd1e6 0%, #c8ffe1 50%, #d6c8ff 100%)",
        icon: <SparkleIcon className="h-7 w-7" />,
        ariaLabel: "Embroidery style",
        labelZh: "刺绣",
        labelPy: "cì xiù",
        labelEn: "Embroidery",
        promptHint:
          "embroidery / knitted texture, stitched edges, fabric weave, cozy handmade, keep doodle silhouette",
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
    let raf = 0;
    const applyAppHeight = () => {
      const height =
        window.visualViewport?.height ??
        Math.min(window.innerHeight, document.documentElement.clientHeight);
      document.documentElement.style.setProperty("--app-height", `${height}px`);

      const orient =
        window.matchMedia?.("(orientation: landscape)").matches ||
        window.innerWidth > window.innerHeight
          ? "landscape"
          : "portrait";
      if (document.documentElement.dataset.orient !== orient) {
        document.documentElement.dataset.orient = orient;
      }
    };

    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => applyAppHeight());
    };

    applyAppHeight();
    window.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule, {
      passive: true,
    });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
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

  const generateWithStyle = useCallback(async (styleOverride?: StyleId) => {
    setError("");
    setIsGenerating(true);
    try {
      const doodle = canvasRef.current?.exportPngDataUrl(2048) ?? "";
      const prompt = doodle ? PROMPT_IMG2IMG : PROMPT_TXT2IMG;
      const requestedStyle = styleOverride ?? styleId;
      const effectiveStyleId: Exclude<StyleId, "auto"> =
        requestedStyle === "auto"
          ? doodle
            ? pickStyleFromMetrics(await analyzeDoodle(doodle))
            : "storybook"
          : (requestedStyle as Exclude<StyleId, "auto">);
      setStyleId(effectiveStyleId);
      const effectiveStyle =
        styles.find((s) => s.id === effectiveStyleId) ??
        styles.find((s) => s.id === "storybook")!;
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: doodle ? "img2img" : "txt2img",
          prompt,
          stylePrompt: effectiveStyle.promptHint,
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
  }, [styleId, styles]);

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

          <div className="scroll-x no-scrollbar flex items-center gap-2 shrink-0 pl-2">
            <button
              type="button"
              className="kid-button kid-btn-sm"
              onClick={saveToAlbum}
              aria-label="Save"
              disabled={isGenerating || (!hasInk && !hasBackground && !imageDataUrl)}
              style={{
                background: "linear-gradient(135deg, #c8ffe1 0%, #ffd1e6 100%)",
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
                <span className="label-line pinyin-text opacity-75">bǎo cún</span>
                <span className="label-line en-text opacity-75">Save</span>
              </span>
            </button>
          </div>
        </div>

        <div
          className="split-layout"
        >
          <div className="glass-card pane p-3 flex flex-col">
            <div className="scroll-x no-scrollbar flex items-center gap-2 px-1 pb-2">
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
                <button
                  type="button"
                  className={[
                    "kid-button",
                    "kid-btn-sm",
                    isColorWallOpen && colorWallTarget === "pen"
                      ? "kid-btn-selected"
                      : "",
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
                    <span className="label-line en-text opacity-75">Color</span>
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
                    <span className="label-line pinyin-text opacity-75">dǐ sè</span>
                    <span className="label-line en-text opacity-75">
                      Background
                    </span>
                  </span>
                </button>

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
                  className="kid-button kid-btn-icon"
                  style={{
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

            <div className="pane-main">
              <DoodleCanvas
                ref={canvasRef}
                className="doodle-canvas-shell"
                onInkChange={setHasInk}
                color={color}
                brushSize={brushSize}
                tool={tool}
                backgroundColor={backgroundColor}
              />

              {isColorWallOpen ? (
                <div
                  className="glass-card p-3 scroll-y no-scrollbar"
                  style={{
                    position: "absolute",
                    left: 10,
                    right: 10,
                    top: 10,
                    maxHeight: "calc(100% - 20px)",
                    zIndex: 10,
                  }}
                >
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
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={() => void onPickImage()}
            />
          </div>

          <div className="glass-card pane p-3 flex flex-col">
            <div className="flex items-center justify-between px-1 pb-2 gap-2">
              <div className="scroll-x no-scrollbar flex-1 min-w-0 flex items-center gap-2 pr-2">
                {styles.map((s) => {
                  const selected = s.id === styleId;
                  const canGenerate = hasInk || hasBackground;
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
                      onClick={() => {
                        if (isGenerating || !canGenerate) return;
                        void generateWithStyle(s.id);
                      }}
                      aria-label={s.ariaLabel}
                      disabled={isGenerating || !canGenerate}
                      style={{
                        background: s.color,
                        color: "rgba(36, 26, 34, 0.92)",
                        opacity: isGenerating || !canGenerate ? 0.55 : 1,
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
            </div>

            <div className="pane-main">
              <div className="relative h-full w-full overflow-hidden rounded-2xl border border-[color:var(--card-border)] bg-white/70">
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
                      <div className="sr-only">
                        Generated image will appear here
                      </div>
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
