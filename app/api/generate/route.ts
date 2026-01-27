import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ReqBody = {
  mode: "img2img" | "txt2img";
  prompt: string;
  stylePrompt?: string;
  imageDataUrl?: string;
  size?: string;
};

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function parseDataUrl(dataUrl: string) {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Invalid image data");
  return { mime: match[1], b64: match[2] };
}

function toPrompt(base: string, style?: string) {
  const parts = [base?.trim(), style?.trim()].filter(Boolean);
  return parts.join("\n");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ReqBody;
    const baseUrl = (process.env.AIHUBMIX_BASE_URL ?? "https://aihubmix.com/v1").replace(/\/+$/, "");
    const apiKey = requiredEnv("AIHUBMIX_API_KEY");
    const model = process.env.AIHUBMIX_IMAGE_MODEL ?? "doubao-seedream-4-5";

    const prompt = toPrompt(body.prompt, body.stylePrompt);
    const size = body.size ?? "512x512";

    let upstream: Response;

    if (body.mode === "img2img" && body.imageDataUrl) {
      const { mime, b64 } = parseDataUrl(body.imageDataUrl);
      const bytes = Buffer.from(b64, "base64");
      const file = new File([bytes], "doodle.png", { type: mime || "image/png" });

      const form = new FormData();
      form.append("model", model);
      form.append("prompt", prompt);
      form.append("image", file);
      form.append("size", size);
      form.append("n", "1");
      form.append("response_format", "b64_json");

      upstream = await fetch(`${baseUrl}/images/edits`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
      });
    } else {
      upstream = await fetch(`${baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          size,
          n: 1,
          response_format: "b64_json",
        }),
      });
    }

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

    const json = JSON.parse(text) as {
      data?: Array<{ b64_json?: string }>;
    };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json(
        { ok: false, error: "No image returned by upstream" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      imageDataUrl: `data:image/png;base64,${b64}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bad request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
