// Scheduled trigger for the warmup send leg. Scheduled functions have no
// public URL and a short timeout, so this only calls the warmup route with
// the cron secret and does not wait for the full run. Production uses four
// irregular send times a day plus a separate background engagement leg; one
// schedule is enough to show the shape.
import type { Config } from "@netlify/functions";

export default async () => {
  const base = process.env.URL;
  if (!base || !process.env.CRON_SECRET) {
    console.log("warmup-cron: URL or CRON_SECRET not set; skipping");
    return;
  }
  try {
    const res = await fetch(`${base}/api/warmup/run`, {
      method: "POST",
      headers: { "x-pitwall-cron": process.env.CRON_SECRET, "content-type": "application/json" },
      body: JSON.stringify({ dryRun: false }),
      signal: AbortSignal.timeout(25000),
    });
    console.log(`warmup-cron: warmup run responded ${res.status}`);
  } catch (err) {
    console.log(`warmup-cron: trigger sent, response not awaited (${String(err).slice(0, 120)})`);
  }
};

export const config: Config = {
  schedule: "17 13 * * *",
};
