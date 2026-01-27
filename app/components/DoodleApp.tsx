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
  const [color, setColor] = useState("#121212");
  const [isColorWallOpen, setIsColorWallOpen] = useState(false);

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

    const reader = new FileReader();
    const dataUrl: string = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Load image failed"));
      reader.readAsDataURL(file);
    });

    canvasRef.current?.setBackgroundImage(dataUrl);
    setHasBackground(true);
  }, []);

  const downloadDataUrl = useCallback((dataUrl: string, filename: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const downloadUrlAsFile = useCallback(async (url: string, filename: string) => {
    try {
      const res = await fetch(url, { mode: "cors" });
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      downloadDataUrl(objUrl, filename);
      setTimeout(() => URL.revokeObjectURL(objUrl), 30_000);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [downloadDataUrl]);

  const saveToAlbum = useCallback(async () => {
    setError("");
    const doodle = canvasRef.current?.exportPngDataUrl(2048) ?? "";
    if (doodle) downloadDataUrl(doodle, "doodle.png");
    if (!imageDataUrl) return;
    if (imageDataUrl.startsWith("data:")) {
      setTimeout(() => downloadDataUrl(imageDataUrl, "ai.png"), 250);
      return;
    }
    setTimeout(() => {
      void downloadUrlAsFile(imageDataUrl, "ai.png");
    }, 250);
  }, [downloadDataUrl, downloadUrlAsFile, imageDataUrl]);

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
                    onClick={() => setIsColorWallOpen((v) => !v)}
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
                      const selected = tool === "pen" && color === c;
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
                            setTool("pen");
                            setColor(c);
                          }}
                          disabled={isGenerating}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="color-wall">
                  {palette256.map((c) => {
                    const selected = tool === "pen" && color === c;
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
                          setTool("pen");
                          setColor(c);
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
