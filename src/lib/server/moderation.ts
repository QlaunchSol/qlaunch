import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { cached } from "./cache";
import { bad } from "./http";

/**
 * Content screening with OpenAI's moderation model (free; images and text).
 * Strict on purpose: anything the model flags, or that scores 0.2 or more in
 * any category, is refused. Clean coin art and text score well under 0.01.
 * When the screening service can't be reached, uploads and launches wait
 * rather than go through unscreened. Off when OPENAI_API_KEY isn't set.
 */
const THRESHOLD = 0.2;
const MODEL = "omni-moderation-latest";

type Verdict = { ok: boolean; category: string | null; score: number };

export const screeningEnabled = () => Boolean(process.env.OPENAI_API_KEY);

async function moderate(input: unknown): Promise<Verdict> {
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, input }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return unavailable();
  }
  if (!res.ok) {
    console.warn(`moderation: HTTP ${res.status}`);
    return unavailable();
  }
  const result = (await res.json().catch(() => null))?.results?.[0] as { flagged: boolean; category_scores: Record<string, number> } | undefined;
  if (!result) return unavailable();
  const [category, score] = Object.entries(result.category_scores).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return { ok: !result.flagged && score < THRESHOLD, category, score };
}

function unavailable(): never {
  return bad("Content screening is unavailable right now, so nothing can be published. Try again in a minute.", 503, "screening_unavailable");
}

/** Category names as people say them. */
const PLAIN: Record<string, string> = {
  sexual: "sexual content",
  "sexual/minors": "sexual content involving minors",
  violence: "violence",
  "violence/graphic": "graphic violence",
  "self-harm": "self-harm",
  "self-harm/intent": "self-harm",
  "self-harm/instructions": "self-harm",
  harassment: "harassment",
  "harassment/threatening": "threats",
  hate: "hate",
  "hate/threatening": "hateful threats",
  illicit: "illicit content",
  "illicit/violent": "illicit content",
};

function refuse(what: string, v: Verdict): never {
  console.warn(`moderation: refused ${what} (${v.category} ${v.score.toFixed(3)})`);
  return bad(`This ${what} was refused by content screening (${PLAIN[v.category ?? ""] ?? "unsafe content"}).`, 422, "content_blocked");
}

/**
 * Screens a sanitized upload. Animated images: first, middle and last frame.
 * Cached by content, so re-uploads and retries don't ask again.
 */
export async function screenImage(bytes: Buffer): Promise<void> {
  if (!screeningEnabled()) return;
  const sha = createHash("sha256").update(bytes).digest("hex");
  const verdict = await cached(`screen:img:${sha}`, 30 * 86_400_000, async () => {
    const frames = (await sharp(bytes, { animated: true }).metadata()).pages ?? 1;
    const pages = [...new Set([0, Math.floor((frames - 1) / 2), frames - 1])];
    const verdicts = await Promise.all(
      pages.map(async (page) => {
        const still = await sharp(bytes, { page }).resize(512, 512, { fit: "inside" }).webp({ quality: 80 }).toBuffer();
        return moderate([{ type: "image_url", image_url: { url: `data:image/webp;base64,${still.toString("base64")}` } }]);
      }),
    );
    return verdicts.find((v) => !v.ok) ?? verdicts[0];
  });
  if (!verdict.ok) refuse("image", verdict);
}

/** Screens a launch's name, ticker and description together. Cached by content. */
export async function screenText(fields: { name: string; symbol: string; description: string }): Promise<void> {
  if (!screeningEnabled()) return;
  const text = `${fields.name} ($${fields.symbol})\n${fields.description}`;
  const sha = createHash("sha256").update(text).digest("hex");
  const verdict = await cached(`screen:txt:${sha}`, 30 * 86_400_000, () => moderate(text));
  if (!verdict.ok) refuse("coin's name or description", verdict);
}
