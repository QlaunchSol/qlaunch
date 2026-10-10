import { clientIp } from "@/lib/server/http";
import { listenerCount, onLaunch, onShutdown } from "@/lib/server/events";

const PER_CLIENT = 4;
const g = globalThis as typeof globalThis & { __streamsPerIp?: Map<string, number> };
const perIp = (g.__streamsPerIp ??= new Map());

const MAX_CLIENTS = 500;

/**
 * GET /api/launches/stream: server-sent events, one `launch` event per coin
 * the moment it goes live. A comment every 25s keeps proxies from closing it.
 */
export async function GET(request: Request) {
  if (listenerCount() >= MAX_CLIENTS) return new Response("Too many live connections", { status: 503 });
  const ip = clientIp(request);
  if ((perIp.get(ip) ?? 0) >= PER_CLIENT) return new Response("Too many live connections from this address", { status: 429 });
  perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const n = (perIp.get(ip) ?? 1) - 1;
    if (n <= 0) perIp.delete(ip);
    else perIp.set(ip, n);
  };
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send("retry: 5000\n\n");
      const off = onLaunch((mint) => send(`event: launch\ndata: ${mint}\n\n`));
      const ping = setInterval(() => send(": ping\n\n"), 25_000);
      // Server stopping: end the stream; the browser reconnects (retry: 5000) to the new process.
      const offShutdown = onShutdown(() => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
      cleanup = () => {
        off();
        offShutdown();
        clearInterval(ping);
        release();
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    // Connection: close, so the proxy drops this upstream connection when the stream ends
    // instead of pooling it: a pooled one would hold up a graceful shutdown.
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "close", "X-Accel-Buffering": "no" },
  });
}
