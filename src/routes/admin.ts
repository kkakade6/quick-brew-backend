import { Router, Request, Response } from "express";
import { adminOnly } from "../middleware/admin";
import { exec } from "child_process";

export const adminRouter = Router();

// helper to run an npm script (dev convenience)
function runScript(
  script: string
): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = exec(
      `npm run ${script}`,
      { env: process.env },
      (error, stdout, stderr) => {
        resolve({ code: error ? 1 : 0, out: stdout, err: stderr });
      }
    );
  });
}

adminRouter.post(
  "/run/ingest",
  adminOnly,
  async (_req: Request, res: Response) => {
    const r = await runScript("ingest:once");
    res.json({ ok: r.code === 0, out: r.out, err: r.err });
  }
);

adminRouter.post(
  "/run/summarize",
  adminOnly,
  async (_req: Request, res: Response) => {
    const r = await runScript("summarize:once");
    res.json({ ok: r.code === 0, out: r.out, err: r.err });
  }
);

adminRouter.post(
  "/run/keeper",
  adminOnly,
  async (_req: Request, res: Response) => {
    const r = await runScript("keeper:once");
    res.json({ ok: r.code === 0, out: r.out, err: r.err });
  }
);
