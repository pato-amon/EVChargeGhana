import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config";
import { prisma } from "../db";

const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(8).refine(
    (password) => Buffer.byteLength(password, "utf8") <= 72,
    "Password must be no more than 72 bytes",
  ),
});

function createToken(id: string, role: Role) {
  return jwt.sign({ role }, config.JWT_SECRET, { subject: id, expiresIn: "7d" });
}

export async function register(req: Request, res: Response) {
  const input = credentialsSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: { email: input.email, passwordHash },
    select: { id: true, email: true, role: true },
  });
  res.status(201).json({ user, token: createToken(user.id, user.role) });
}

export async function login(req: Request, res: Response) {
  const input = credentialsSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    res.status(401).json({ error: "Email or password is incorrect" });
    return;
  }
  res.json({
    user: { id: user.id, email: user.email, role: user.role },
    token: createToken(user.id, user.role),
  });
}

export async function currentUser(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user?.id },
    select: { id: true, email: true, role: true },
  });
  if (!user) {
    res.status(404).json({ error: "User account not found" });
    return;
  }
  res.json(user);
}
