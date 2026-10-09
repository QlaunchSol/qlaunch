import { readFile } from "node:fs/promises";
import path from "node:path";
import { localStorageDir } from "@/lib/server/pinata";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp", json: "application/json" };

/** Serves files from the local storage fallback (development and devnet only). */
export async function GET(_request: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const dir = localStorageDir();
  const m = name.match(/^[0-9a-f]{64}\.(png|jpg|gif|webp|json)$/);
  if (!dir || !m) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(path.join(/*turbopackIgnore: true*/ dir, name));
    return new Response(body, {
      headers: { "Content-Type": TYPES[m[1]], "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
