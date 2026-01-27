"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DoodleCanvas, { type DoodleCanvasHandle } from "./DoodleCanvas";
import {
  HeartIcon,
  SparkleIcon,
  TrashIcon,
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
};

type GenerateResponse =
  | { ok: true; imageDataUrl: string }
  | { ok: false; error: string };

const DEFAULT_BASE_PROMPT =
  "Turn the child's doodle into a friendly, cute picture. Keep the main shapes and colors. Clean background. Big simple shapes. No text. No watermark.";

export default function DoodleApp() {
  const canvasRef = useRef<DoodleCanvasHandle | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [styleId, setStyleId] = useState<StyleId>("cute");
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string>("");
  const [error, setError] = useState<string>("");

  const styles = useMemo<StyleOption[]>(
    () => [
      {
        id: "cute",
        color: "linear-gradient(135deg, #ffd1e6 0%, #b3e5ff 100%)",
        icon: <HeartIcon className="h-7 w-7" />,
        ariaLabel: "Cute style",
        promptHint:
          "cute pastel kid illustration, soft shading, friendly face, gentle colors",
      },
      {
        id: "sticker",
        color: "linear-gradient(135deg, #ffe7a8 0%, #ffd1e6 100%)",
        icon: <SparkleIcon className="h-7 w-7" />,
        ariaLabel: "Sticker style",
        promptHint:
          "sticker style, bold outline, flat colors, simple shapes, high contrast, clean",
      },
      {
        id: "watercolor",
        color: "linear-gradient(135deg, #c8ffe1 0%, #d6c8ff 100%)",
        icon: <SparkleIcon className="h-7 w-7" />,
        ariaLabel: "Watercolor style",
        promptHint:
          "watercolor, paper texture, soft edges, light washes, dreamy, child-friendly",
      },
      {
        id: "storybook",
        color: "linear-gradient(135deg, #b3e5ff 0%, #ffd1e6 100%)",
        icon: <WandIcon className="h-7 w-7" />,
        ariaLabel: "Storybook style",
        promptHint:
          "storybook illustration, warm lighting, gentle outlines, cute, cozy, simple background",
      },
    ],
    [],
  );

  const selectedStyle = useMemo(
    () => styles.find((s) => s.id === styleId) ?? styles[0],
    [styleId, styles],
  );

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

  const clear = useCallback(() => {
    setError("");
    canvasRef.current?.clear();
  }, []);

  const undo = useCallback(() => {
    setError("");
    canvasRef.current?.undo();
  }, []);

  const generate = useCallback(async () => {
    setError("");
    setIsGenerating(true);
    try {
      const doodle = canvasRef.current?.exportPngDataUrl(512) ?? "";
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: doodle ? "img2img" : "txt2img",
            prompt: DEFAULT_BASE_PROMPT,
            stylePrompt: selectedStyle.promptHint,
            imageDataUrl: doodle || undefined,
            size: "512x512",
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="kid-button h-11 w-11 inline-flex items-center justify-center"
              onClick={undo}
              aria-label="Undo"
              disabled={!hasInk || isGenerating}
              style={{
                opacity: !hasInk || isGenerating ? 0.5 : 1,
              }}
            >
              <UndoIcon className="h-6 w-6" />
            </button>
            <button
              type="button"
              className="kid-button h-11 w-11 inline-flex items-center justify-center"
              onClick={clear}
              aria-label="Clear"
              disabled={!hasInk || isGenerating}
              style={{
                opacity: !hasInk || isGenerating ? 0.5 : 1,
              }}
            >
              <TrashIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div
          className="split-layout"
        >
          <div className="glass-card flex-1 p-3">
            <div className="flex items-center justify-between px-1 pb-2">
              <div className="text-xs font-semibold opacity-70"> </div>
              <div className="flex items-center gap-2">
                {styles.map((s) => {
                  const selected = s.id === styleId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className="kid-button inline-flex items-center justify-center"
                      onClick={() => setStyleId(s.id)}
                      aria-label={s.ariaLabel}
                      style={{
                        width: 54,
                        height: 54,
                        background: s.color,
                        color: "rgba(36, 26, 34, 0.9)",
                        border: selected
                          ? "2px solid rgba(255, 79, 160, 0.9)"
                          : "1px solid rgba(36, 26, 34, 0.10)",
                        transform: selected ? "scale(1.02)" : "scale(1)",
                      }}
                      disabled={isGenerating}
                    >
                      {s.icon}
                    </button>
                  );
                })}
              </div>
            </div>

            <DoodleCanvas
              ref={canvasRef}
              className="doodle-canvas-shell"
              onInkChange={setHasInk}
            />
          </div>

          <div className="glass-card flex-1 p-3 flex flex-col">
            <div className="flex items-center justify-between px-1 pb-2">
              <div className="text-xs font-semibold opacity-70"> </div>
              <button
                type="button"
                className="kid-button inline-flex items-center justify-center gap-2 px-4"
                onClick={generate}
                aria-label="Make a picture"
                disabled={isGenerating}
                style={{
                  height: 54,
                  background:
                    "linear-gradient(135deg, var(--pink-300) 0%, var(--purple-600) 100%)",
                  color: "rgba(36, 26, 34, 0.92)",
                  border: "1px solid rgba(36, 26, 34, 0.10)",
                }}
              >
                <WandIcon className="h-6 w-6" />
                <span className="sr-only">Generate</span>
              </button>
            </div>

            <div className="relative flex-1 overflow-hidden rounded-2xl border border-[color:var(--card-border)] bg-white/70 dark:bg-black/20">
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
                <div className="absolute inset-0 flex items-center justify-center bg-white/40 dark:bg-black/40 backdrop-blur-sm">
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
              <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
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
