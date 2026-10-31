import type { Request, Response } from "express";
import { StationStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";

const nearbySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().positive().max(100_000).default(25_000),
});

type NearbyRow = {
  id: string;
  name: string;
  operator: string;
  latitude: number;
  longitude: number;
  address: string;
  connector_types: string[];
  charging_speed_kw: number;
  status: string;
  last_verified_at: Date | null;
  distance_meters: number;
};

export async function listNearby(req: Request, res: Response) {
  const { lat, lng, radius } = nearbySchema.parse(req.query);
  // Geography distance is measured in meters; the GiST index keeps this radius query efficient.
  const rows = await prisma.$queryRaw<NearbyRow[]>`
    SELECT
      s.id, s.name, s.operator, s.latitude, s.longitude, s.address,
      s.connector_types, s.charging_speed_kw, s.status, s.last_verified_at,
      ST_Distance(
        s.location,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      ) AS distance_meters
    FROM charging_stations s
    WHERE s.location IS NOT NULL
      AND ST_DWithin(
        s.location,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radius}
      )
    ORDER BY distance_meters
    LIMIT 100
  `;
  res.json(rows.map((station) => ({
    id: station.id,
    name: station.name,
    operator: station.operator,
    latitude: station.latitude,
    longitude: station.longitude,
    address: station.address,
    connectorTypes: station.connector_types,
    chargingSpeedKw: station.charging_speed_kw,
    status: station.status,
    lastVerifiedAt: station.last_verified_at,
    distanceKm: station.distance_meters / 1000,
  })));
}

export async function getStation(req: Request, res: Response) {
  const id = z.string().uuid().parse(req.params.id);
  const station = await prisma.chargingStation.findUnique({ where: { id } });
  if (!station) {
    res.status(404).json({ error: "Charging station not found" });
    return;
  }
  res.json(station);
}

export async function reportStatus(req: Request, res: Response) {
  const stationId = z.string().uuid().parse(req.params.id);
  const { reportedStatus } = z.object({
    reportedStatus: z.nativeEnum(StationStatus),
  }).parse(req.body);
  if (!req.user) throw new Error("Authenticated user context is missing");
  const station = await prisma.chargingStation.findUnique({ where: { id: stationId }, select: { id: true } });
  if (!station) {
    res.status(404).json({ error: "Charging station not found" });
    return;
  }
  const report = await prisma.stationReport.create({
    data: { stationId, reportedStatus, userId: req.user.id },
  });
  res.status(201).json(report);
}
