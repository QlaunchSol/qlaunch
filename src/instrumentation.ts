/** Runs once when the server starts: background refresh jobs live in the Node process. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { startJobs } = await import("@/lib/server/jobs");
  startJobs();
}
