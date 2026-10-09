import { readFile } from "node:fs/promises";
import path from "node:path";

/** The standalone stdlib-only verifier, served so anyone can `curl -O` it. */
export async function GET() {
  const body = await readFile(path.join(process.cwd(), "scripts", "verify.py"), "utf8");
  return new Response(body, { headers: { "Content-Type": "text/x-python; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
