import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";

const vehicleSchema = z.object({
  id: z.string().uuid().optional(),
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  usableBatteryCapacityKwh: z.number().positive().max(300),
  avgConsumptionKwhPerKm: z.number().positive().max(2),
});

export async function saveVehicle(req: Request, res: Response) {
  const input = vehicleSchema.parse(req.body);
  if (!req.user) throw new Error("Authenticated user context is missing");
  if (input.id) {
    const updated = await prisma.vehicleProfile.updateMany({
      where: { id: input.id, userId: req.user.id },
      data: {
        make: input.make,
        model: input.model,
        usableBatteryCapacityKwh: input.usableBatteryCapacityKwh,
        avgConsumptionKwhPerKm: input.avgConsumptionKwhPerKm,
      },
    });
    if (!updated.count) {
      res.status(404).json({ error: "Vehicle not found" });
      return;
    }
    res.json(await prisma.vehicleProfile.findUniqueOrThrow({ where: { id: input.id } }));
    return;
  }
  const vehicle = await prisma.vehicleProfile.create({
    data: { ...input, userId: req.user.id },
  });
  res.status(201).json(vehicle);
}

export async function getBattery(req: Request, res: Response) {
  const id = z.string().uuid().parse(req.params.id);
  const soc = z.coerce.number().min(0).max(100).default(100).parse(req.query.soc);
  const vehicle = await prisma.vehicleProfile.findFirst({
    where: { id, userId: req.user?.id },
    select: { id: true, make: true, model: true, usableBatteryCapacityKwh: true },
  });
  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  res.json({
    vehicle,
    stateOfChargePercent: soc,
    remainingEnergyKwh: vehicle.usableBatteryCapacityKwh * soc / 100,
  });
}

export async function listVehicles(req: Request, res: Response) {
  const vehicles = await prisma.vehicleProfile.findMany({
    where: { userId: req.user?.id },
    orderBy: { createdAt: "asc" },
  });
  res.json(vehicles);
}
