import "server-only";
import { EventEmitter } from "node:events";

/**
 * In-process notifications: one Node process serves the whole site, so the
 * moment a launch goes live is known here, and /api/launches/stream fans it
 * out to every open browser over server-sent events.
 */
// On globalThis: Next.js compiles instrumentation (where the background jobs
// run) and each route separately, so a module-level emitter would exist once
// per bundle and the jobs' events would never reach the stream.
const g = globalThis as typeof globalThis & { __launchBus?: EventEmitter };
const bus = (g.__launchBus ??= new EventEmitter());
bus.setMaxListeners(0);

// Next.js waits for open requests before exiting on SIGTERM, and a live stream
// never ends by itself: close them all so restarts take seconds, not a timeout.
const p = globalThis as typeof globalThis & { __shutdownHooked?: boolean };
if (!p.__shutdownHooked) {
  p.__shutdownHooked = true;
  process.once("SIGTERM", () => {
    console.log(`SIGTERM: ending ${bus.listenerCount("shutdown")} live stream(s)`);
    bus.emit("shutdown");
    // Backstop: Next.js waits for every connection, and pooled proxy connections
    // can outlive their last response. Normal requests finish well within this.
    setTimeout(() => process.exit(0), 8_000).unref();
  });
}

export const emitLaunch = (mint: string) => bus.emit("launch", mint);

export function onShutdown(listener: () => void): () => void {
  bus.once("shutdown", listener);
  return () => bus.off("shutdown", listener);
}

export function onLaunch(listener: (mint: string) => void): () => void {
  bus.on("launch", listener);
  return () => bus.off("launch", listener);
}

export const listenerCount = () => bus.listenerCount("launch");
