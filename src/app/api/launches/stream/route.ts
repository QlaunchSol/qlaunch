import { listenerCount, onLaunch, onShutdown } from "@/lib/server/events";

const MAX_CLIENTS = 500;

/**
 * GET /api/launches/stream: server-sent events, one `launch` event per coin
 * the moment it goes live. A comment every 25s keeps proxies from closing it.
 */
export async function GET(request: Request) {
  if (listenerCount() >= MAX_CLIENTS) return new Response("Too many live connections", { status: 503 });
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
