import { config } from "../config";

export type Coordinates = { latitude: number; longitude: number };

export async function getTrafficAwareRoute(origin: Coordinates, destination: Coordinates) {
  if (!config.GOOGLE_MAPS_API_KEY) {
    throw new Error("Traffic-aware routing is not configured. Set GOOGLE_MAPS_API_KEY.");
  }

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": config.GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.staticDuration",
    },
    body: JSON.stringify({
      origin: {
        location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } },
      },
      destination: {
        location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } },
      },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE_OPTIMAL",
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Traffic routing provider returned ${response.status}: ${details}`);
  }

  const payload = (await response.json()) as {
    routes?: Array<{ distanceMeters: number; duration: string; staticDuration?: string }>;
  };
  const route = payload.routes?.[0];
  if (!route) throw new Error("Traffic routing provider returned no route.");

  return {
    distanceKm: route.distanceMeters / 1000,
    durationMinutes: Number.parseInt(route.duration, 10) / 60,
    trafficDelayMinutes: route.staticDuration
      ? Math.max(0, (Number.parseInt(route.duration, 10) - Number.parseInt(route.staticDuration, 10)) / 60)
      : 0,
  };
}
