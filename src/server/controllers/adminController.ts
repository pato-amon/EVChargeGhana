import { Prisma, StationStatus } from "@prisma/client";
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
