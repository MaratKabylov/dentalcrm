import { runWorkerBatch } from "../src/main.js";

export const maxDuration = 60;

export default async function handler(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json({ status: "ok", ...(await runWorkerBatch(10)) });
  } catch (error) {
    console.error("Worker cron failed", error instanceof Error ? error.message : String(error));
    return Response.json({ error: "Worker execution failed" }, { status: 500 });
  }
}
