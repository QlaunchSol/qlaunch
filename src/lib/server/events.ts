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

export const emitLaunch = (mint: string) => bus.emit("launch", mint);

export function onLaunch(listener: (mint: string) => void): () => void {
  bus.on("launch", listener);
  return () => bus.off("launch", listener);
}

export const listenerCount = () => bus.listenerCount("launch");
