import { Prisma, Role, StationStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";

const stationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  operator: z.string().trim().min(1).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().trim().min(1).max(300),
  connectorTypes: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
  chargingSpeedKw: z.number().positive().max(1000),
  status: z.nativeEnum(StationStatus),
  verified: z.boolean().optional(),
});

const userCreateSchema = z.object({
  email: z.string().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(8).refine(
    (password) => Buffer.byteLength(password, "utf8") <= 72,
    "Password must be no more than 72 bytes",
  ),
  role: z.nativeEnum(Role).default(Role.user),
});

const userUpdateSchema = z.object({
  email: z.string().email().max(254).transform((email) => email.toLowerCase()).optional(),
  password: z.string().min(8).refine(
    (password) => Buffer.byteLength(password, "utf8") <= 72,
    "Password must be no more than 72 bytes",
  ).optional(),
  role: z.nativeEnum(Role).optional(),
}).refine((input) => Object.values(input).some((value) => value !== undefined), {
  message: "At least one field must be provided",
});

export async function listUsers(_req: Request, res: Response) {
  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: "desc" }, { email: "asc" }],
    select: { id: true, email: true, role: true, createdAt: true },
  });
  res.json(users);
}

export async function createUser(req: Request, res: Response) {
  const input = userCreateSchema.parse(req.body);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: input.role,
    },
    select: { id: true, email: true, role: true, createdAt: true },
  });
  res.status(201).json(user);
}

export async function updateUser(req: Request, res: Response) {
  const id = z.string().uuid().parse(req.params.id);
  const input = userUpdateSchema.parse(req.body);

  if (req.user?.id === id && input.role === Role.user) {
    res.status(409).json({ error: "You cannot remove your own administrator access." });
    return;
  }

  const { password, ...userFields } = input;
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;
  const result = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.user.findUnique({ where: { id }, select: { role: true } });
    if (!existing) return { kind: "missing" as const };
    if (existing.role === Role.admin && input.role === Role.user) {
      const adminCount = await transaction.user.count({ where: { role: Role.admin } });
      if (adminCount <= 1) return { kind: "last-admin" as const };
    }
    const user = await transaction.user.update({
      where: { id },
      data: { ...userFields, ...(passwordHash ? { passwordHash } : {}) },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    return { kind: "updated" as const, user };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result.kind === "missing") {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (result.kind === "last-admin") {
    res.status(409).json({ error: "The last administrator cannot be demoted." });
    return;
  }
  res.json(result.user);
}

export async function deleteUser(req: Request, res: Response) {
  const id = z.string().uuid().parse(req.params.id);
  if (req.user?.id === id) {
    res.status(409).json({ error: "You cannot delete your own account." });
    return;
  }

  const result = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.user.findUnique({ where: { id }, select: { role: true } });
    if (!existing) return "missing";
    if (existing.role === Role.admin) {
      const adminCount = await transaction.user.count({ where: { role: Role.admin } });
      if (adminCount <= 1) return "last-admin";
    }
    await transaction.user.delete({ where: { id } });
    return "deleted";
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result === "missing") {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (result === "last-admin") {
    res.status(409).json({ error: "The last administrator cannot be deleted." });
    return;
  }
  res.status(204).end();
}

export async function listStations(_req: Request, res: Response) {
  const stations = await prisma.chargingStation.findMany({
    orderBy: [{ lastVerifiedAt: "asc" }, { name: "asc" }],
    include: { verifiedByAdmin: { select: { id: true, email: true } } },
  });
  res.json(stations);
}

export async function createStation(req: Request, res: Response) {
  const input = stationSchema.parse(req.body);
  const { verified, ...stationData } = input;
  const verifiedAt = verified ? new Date() : null;
  const station = await prisma.chargingStation.create({
    data: {
      ...stationData,
      lastVerifiedAt: verifiedAt,
      verifiedByAdminId: verifiedAt ? req.user?.id : null,
    },
  });
  res.status(201).json(station);
}

export async function updateStation(req: Request, res: Response) {
  const id = z.string().uuid().parse(req.params.id);
  const { verified, ...input } = stationSchema.partial().parse(req.body);
  const data: Prisma.ChargingStationUpdateInput = {
    ...input,
    ...(verified === true
      ? { lastVerifiedAt: new Date(), verifiedByAdmin: { connect: { id: req.user?.id } } }
      : {}),
  };
  try {
    const station = await prisma.chargingStation.update({ where: { id }, data });
    res.json(station);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Charging station not found" });
      return;
    }
    throw error;
  }
}

export async function deleteStation(req: Request, res: Response) {
  const id = z.string().uuid().parse(req.params.id);
  try {
    await prisma.chargingStation.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Charging station not found" });
      return;
    }
    throw error;
  }
}

export async function verifyStation(req: Request, res: Response) {
  const id = z.string().uuid().parse(req.params.id);
  try {
    const station = await prisma.chargingStation.update({
      where: { id },
      data: { lastVerifiedAt: new Date(), verifiedByAdminId: req.user?.id },
    });
    res.json(station);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Charging station not found" });
      return;
    }
    throw error;
  }
}

export async function getAnalytics(_req: Request, res: Response) {
  const [totalUsers, totalStations, activeStations, verificationPending] = await Promise.all([
    prisma.user.count(),
    prisma.chargingStation.count(),
    prisma.chargingStation.count({ where: { status: StationStatus.available } }),
    prisma.chargingStation.count({
      where: { OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: new Date(Date.now() - 90 * 86400000) } }] },
    }),
  ]);
  res.json({ totalUsers, totalStations, activeStations, verificationPending });
}
