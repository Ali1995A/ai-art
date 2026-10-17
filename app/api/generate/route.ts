import { withWebGuard, GuardError, bufferedFetch } from "../../../server/ai-guard.cjs";
import { policy } from "../../../server/policy.cjs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ReqBody = {
  mode: "img2img" | "txt2img";
  prompt: string;
  stylePrompt?: string;
  imageDataUrl?: string;
  size?: string;
  quality?: "fast" | "low" | "medium" | "high";
};

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function toPrompt(base: string, style?: string) {
  const parts = [base?.trim(), style?.trim()].filter(Boolean);
  return parts.join("\n");
}



function normalizeDoubaoSize(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!s) return undefined;
  if (/^\d+x\d+$/.test(s)) return s;
  if (s === "1k" || s === "2k" || s === "4k") return s;
  return undefined;
}

function isDoubaoModel(model: string) {
  return model.startsWith("doubao-") || model.includes("seedream");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function firstArrayItem(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : undefined;
}

function extractString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function extractImage(json: unknown): { kind: "b64" | "url"; value: string } | null {
  if (!isRecord(json)) return null;

  const data0 = firstArrayItem(json.data);
  const output0 = firstArrayItem(json.output);

  const b64 =
    (isRecord(data0) && extractString(data0.b64_json)) ||
    (isRecord(data0) && extractString(data0.base64_json)) ||
    (isRecord(output0) && extractString(output0.b64_json)) ||
    (isRecord(output0) && extractString(output0.base64_json)) ||
    extractString(output0);

  if (b64) return { kind: "b64", value: b64 };

  const url =
    (isRecord(data0) && extractString(data0.url)) ||
    (isRecord(output0) && extractString(output0.url)) ||
    (typeof output0 === "string" && output0.startsWith("http") ? output0 : undefined);

  if (url) return { kind: "url", value: url };

  return null;
}

function toBase64(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString("base64");
}

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as ReqBody;
    const baseUrl = (process.env.AIHUBMIX_BASE_URL ?? "https://aihubmix.com/v1").replace(/\/+$/, "");
    const apiKey = requiredEnv("AIHUBMIX_API_KEY");
    const model = process.env.AIHUBMIX_IMAGE_MODEL ?? "doubao-seedream-4-5";

    const prompt = toPrompt(body.prompt, body.stylePrompt);
    // Cost-driving options belong to the server, not arbitrary API callers.
    const quality = process.env.AI_IMAGE_QUALITY || "low";
    const imageSize = process.env.AI_IMAGE_SIZE || "512x512";
    if (!["low", "medium", "high"].includes(quality) || !["512x512", "1024x1024", "1024x1536", "1536x1024"].includes(imageSize)) {
      throw new GuardError(503, "INVALID_IMAGE_CONFIG", "绘画服务配置需要家长检查。");
    }
    const doubaoSize =
      normalizeDoubaoSize(process.env.AIHUBMIX_DOUBAO_SIZE) ?? "2k";

    const usePredictionsApi =
      (process.env.AIHUBMIX_IMAGE_API ?? "").toLowerCase() === "predictions" ||
      isDoubaoModel(model);

    const upstream = usePredictionsApi
      ? await bufferedFetch(
          `${baseUrl}/models/doubao/${encodeURIComponent(model)}/predictions`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              input: {
                prompt,
                image:
                  body.mode === "img2img" && body.imageDataUrl
                    ? body.imageDataUrl
                    : undefined,
                size: doubaoSize,
                n: 1,
                quality,
                watermark: false,
                sequential_image_generation: "disabled",
                stream: false,
              },
            }),
          },
        )
      : await bufferedFetch(`${baseUrl}/images/generations`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            prompt,
            size: imageSize,
            n: 1,
            quality,
            response_format: "b64_json",
          }),
        });

    const text = await upstream.text();
    if (!upstream.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `Upstream error (${upstream.status}): ${text.slice(0, 400)}`,
        },
        { status: 502 },
      );
    }

    const json: unknown = JSON.parse(text);
    const extracted = extractImage(json);

    if (extracted?.kind === "b64") {
      return NextResponse.json({
        ok: true,
        imageDataUrl: `data:image/png;base64,${extracted.value}`,
      });
    }

    if (extracted?.kind === "url") {
      // Make client-side saving/watermarking reliable by returning a data URL
      // (avoids CORS-tainted canvas in Safari/WeChat browsers).
      const imgRes = await bufferedFetch(extracted.value);
      if (!imgRes.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: `Upstream image fetch failed (${imgRes.status})`,
          },
          { status: 502 },
        );
      }
      const contentType =
        imgRes.headers.get("content-type")?.split(";")[0]?.trim() ||
        "image/png";
      const buf = await imgRes.arrayBuffer();
      const b64 = toBase64(buf);
      return NextResponse.json({
        ok: true,
        imageDataUrl: `data:${contentType};base64,${b64}`,
      });
    }

    return NextResponse.json(
      { ok: false, error: "No image returned by upstream" },
      { status: 502 },
    );
  } catch (e) {
    if (e instanceof GuardError) throw e;
    const msg = e instanceof Error ? e.message : "Bad request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: Request) {
  return withWebGuard(req, policy, handlePOST);
}
