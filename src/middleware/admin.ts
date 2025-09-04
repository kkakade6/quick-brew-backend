import { Request, Response, NextFunction } from "express";
import { ENV } from "../lib/env";

export function adminOnly(req: Request, res: Response, next: NextFunction) {
  const token =
    req.header("x-admin-token") || (req.query.admin_token as string) || "";
  if (!ENV || !ENV.NODE_ENV) {
    /* no-op */
  }
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: "unauthorized (admin)" });
  }
  next();
}
