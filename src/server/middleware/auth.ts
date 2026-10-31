import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { config } from "../config";

type TokenPayload = { sub: string; role: Role };

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const payload = jwt.verify(header.slice(7), config.JWT_SECRET) as TokenPayload;
    if (!payload.sub || !Object.values(Role).includes(payload.role)) {
      res.status(401).json({ error: "Invalid authentication token" });
      return;
    }
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired authentication token" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== Role.admin) {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }
  next();
}
