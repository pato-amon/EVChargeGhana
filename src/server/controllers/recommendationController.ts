import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { getTrafficAwareRoute } from "../services/routing";

const recommendationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  destination: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  vehicleId: z.string().uuid(),
  stateOfChargePercent: z.number().min(0).max(100),
});

type Candidate = {
  id: string;
  name: string;
  operator: string;
  latitude: number;
  longitude: number;
  address: string;
  connector_types: string[];
  charging_speed_kw: number;
  status: "available" | "occupied" | "offline" | "unknown";
  last_verified_at: Date | null;
  distance_meters: number;
};

export async function getRecommendations(req: Request, res: Response) {
  const input = recommendationSchema.parse(req.body);
  const vehicle = await prisma.vehicleProfile.findFirst({
    where: { id: input.vehicleId, userId: req.user?.id },
  });
  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  // Use PostGIS geography distance to bound candidate chargers before requesting traffic routes.
  const candidates = await prisma.$queryRaw<Candidate[]>`
    SELECT
      s.id, s.name, s.operator, s.latitude, s.longitude, s.address,
      s.connector_types, s.charging_speed_kw, s.status, s.last_verified_at,
      ST_Distance(
        s.location,
        ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography
      ) AS distance_meters
    FROM charging_stations s
    WHERE s.location IS NOT NULL
      AND ST_DWithin(
        s.location,
        ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography,
        150000
      )
    ORDER BY distance_meters
    LIMIT 12
  `;

  const origin = { latitude: input.latitude, longitude: input.longitude };
  const directRoute = await getTrafficAwareRoute(origin, input.destination);
  const recommendations = await Promise.all(candidates.map(async (station) => {
    const [route, destinationLeg] = await Promise.all([
      getTrafficAwareRoute(origin, { latitude: station.latitude, longitude: station.longitude }),
      getTrafficAwareRoute(
        { latitude: station.latitude, longitude: station.longitude },
        input.destination,
      ),
    ]);
    // Trip energy is route distance times vehicle consumption; subtract it from usable
    // battery energy at the current SoC to estimate charge on arrival.
    const tripEnergyKwh = route.distanceKm * vehicle.avgConsumptionKwhPerKm;
    const arrivalSocPercent = (
      input.stateOfChargePercent * vehicle.usableBatteryCapacityKwh / 100 - tripEnergyKwh
    ) / vehicle.usableBatteryCapacityKwh * 100;
    let recommendation: "Recommended" | "Use Caution" | "Not Recommended";
    if (station.status === "offline" || arrivalSocPercent < 0) {
      recommendation = "Not Recommended";
    } else if (station.status !== "available" || arrivalSocPercent < 20) {
      recommendation = "Use Caution";
    } else {
      recommendation = "Recommended";
    }

    return {
      station: {
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
      },
      distanceKm: route.distanceKm,
      trafficDurationMinutes: route.durationMinutes,
      trafficDelayMinutes: route.trafficDelayMinutes,
      tripDurationViaStationMinutes: route.durationMinutes + destinationLeg.durationMinutes,
      detourMinutes: Math.max(0, route.durationMinutes + destinationLeg.durationMinutes - directRoute.durationMinutes),
      tripEnergyKwh,
      arrivalSocPercent: Math.max(0, arrivalSocPercent),
      recommendation,
    };
  }));

  const rank = { Recommended: 0, "Use Caution": 1, "Not Recommended": 2 };
  recommendations.sort((a, b) =>
    rank[a.recommendation] - rank[b.recommendation] ||
    a.detourMinutes - b.detourMinutes ||
    a.trafficDurationMinutes - b.trafficDurationMinutes
  );
  res.json(recommendations);
}
