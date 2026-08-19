/**
 * Sidecar-owned Deno runner. Copied next to each installed job.ts.
 * Static import of ./job.ts bypasses the permission system (ADR-0023);
 * the job itself only has read/write on its runDir.
 */

export const BOARD_JOB_RUNNER_SOURCE = `import { run } from "./job.ts";

const jobId = Deno.args[0] ?? "";
const runId = Deno.args[1] ?? "";
const jobDir = runnerDir(import.meta.url);
const runDir = jobDir + "runs/" + runId + "/";

function runnerDir(fileUrl: string): string {
  const path = decodeURIComponent(new URL(".", fileUrl).pathname);
  return Deno.build.os === "windows" && /^\\/[A-Za-z]:\\//.test(path)
    ? path.slice(1)
    : path;
}

const spec = JSON.parse(await Deno.readTextFile(runDir + "ctx.json")) as {
  jobId: string;
  runId: string;
  now: string;
  timeZone: string;
  runDir: string;
};

const ctx: {
  runId: string;
  jobId: string;
  now: Date;
  timeZone: string;
  runDir: string;
  query?: (name: string, params: Record<string, unknown>) => Promise<unknown>;
} = {
  runId: spec.runId || runId,
  jobId: spec.jobId || jobId,
  now: new Date(spec.now),
  timeZone: spec.timeZone,
  runDir: spec.runDir || runDir,
};

try {
  const value = await Promise.resolve(run(ctx));
  await Deno.writeTextFile(runDir + "result.json", JSON.stringify(value ?? null));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "Error";
  await Deno.writeTextFile(runDir + "error.json", JSON.stringify({ name, message }));
  Deno.exit(1);
}
`
