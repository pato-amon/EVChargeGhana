export type User = { id: string; email: string; role: "user" | "admin" };

export type AdminUser = User & { createdAt: string };

export type Vehicle = {
  id: string;
  make: string;
  model: string;
  usableBatteryCapacityKwh: number;
  avgConsumptionKwhPerKm: number;
};

export type Station = {
  id: string;
  name: string;
  operator: string;
  latitude: number;
  longitude: number;
  address: string;
  connectorTypes: string[];
  chargingSpeedKw: number;
  status: "available" | "occupied" | "offline" | "unknown";
  lastVerifiedAt: string | null;
  distanceKm?: number;
};

export type Recommendation = {
  station: Station;
  distanceKm: number;
  trafficDurationMinutes: number;
  trafficDelayMinutes: number;
  tripDurationViaStationMinutes: number;
  detourMinutes: number;
  tripEnergyKwh: number;
  arrivalSocPercent: number;
  recommendation: "Recommended" | "Use Caution" | "Not Recommended";
};

export type NavigationRoute = {
  distanceKm: number;
  durationMinutes: number;
  geometry: Array<{ latitude: number; longitude: number }>;
  steps: Array<{
    instruction: string;
    distanceMeters: number;
    endLocation: { latitude: number; longitude: number };
  }>;
};
