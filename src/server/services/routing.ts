import { config } from "../config";

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type RouteResult = {
  distanceKm: number;
  durationMinutes: number;
  trafficDelayMinutes: number;
};

type RoutingProvider = "osrm" | "google";

function getRoutingProvider(): RoutingProvider {
  const provider = config.ROUTING_PROVIDER;

  if (provider !== "osrm" && provider !== "google") {
    throw new Error(
      `Unsupported routing provider: ${provider}. Use "osrm" or "google".`
    );
  }

  return provider;
}

function validateCoordinates(
  origin: Coordinates,
  destination: Coordinates
): void {
  const points = [origin, destination];

  for (const point of points) {
    if (
      !Number.isFinite(point.latitude) ||
      !Number.isFinite(point.longitude) ||
      point.latitude < -90 ||
      point.latitude > 90 ||
      point.longitude < -180 ||
      point.longitude > 180
    ) {
      throw new Error("Invalid origin or destination coordinates.");
    }
  }
}

/**
 * Local OSRM routing.
 * Uses road-network estimates without live traffic information.
 */
async function getOSRMRoute(
  origin: Coordinates,
  destination: Coordinates
): Promise<RouteResult> {
  const baseUrl = config.OSRM_BASE_URL.replace(/\/+$/, "");

  // OSRM expects longitude,latitude.
  const coordinates = [
    `${origin.longitude},${origin.latitude}`,
    `${destination.longitude},${destination.latitude}`,
  ].join(";");

  const url = new URL(
    `${baseUrl}/route/v1/driving/${coordinates}`
  );

  url.searchParams.set("overview", "false");

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `OSRM returned HTTP ${response.status}.`
    );
  }

  const payload = (await response.json()) as {
    code: string;
    message?: string;
    routes?: Array<{
      distance: number;
      duration: number;
    }>;
  };

  if (payload.code !== "Ok" || !payload.routes?.length) {
    throw new Error(
      payload.message ?? "OSRM could not find a suitable route."
    );
  }

  const route = payload.routes[0];

  return {
    distanceKm: route.distance / 1000,
    durationMinutes: route.duration / 60,
    trafficDelayMinutes: 0,
  };
}

/**
 * Google traffic-aware routing.
 */
async function getGoogleRoute(
  origin: Coordinates,
  destination: Coordinates
): Promise<RouteResult> {
  if (!config.GOOGLE_MAPS_API_KEY) {
    throw new Error(
      "Google routing requires GOOGLE_MAPS_API_KEY."
    );
  }

  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.duration,routes.staticDuration",
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: origin.latitude,
              longitude: origin.longitude,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: destination.latitude,
              longitude: destination.longitude,
            },
          },
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE_OPTIMAL",
      }),
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Google routing returned HTTP ${response.status}.`
    );
  }

  const payload = (await response.json()) as {
    routes?: Array<{
      distanceMeters: number;
      duration: string;
      staticDuration?: string;
    }>;
  };

  const route = payload.routes?.[0];

  if (!route) {
    throw new Error(
      "Google routing provider returned no route."
    );
  }

  const durationSeconds = Number.parseFloat(route.duration);
  const staticDurationSeconds = route.staticDuration
    ? Number.parseFloat(route.staticDuration)
    : null;

  if (
    !Number.isFinite(route.distanceMeters) ||
    !Number.isFinite(durationSeconds) ||
    (staticDurationSeconds !== null &&
      !Number.isFinite(staticDurationSeconds))
  ) {
    throw new Error(
      "Google routing provider returned invalid route data."
    );
  }

  return {
    distanceKm: route.distanceMeters / 1000,
    durationMinutes: durationSeconds / 60,
    trafficDelayMinutes:
      staticDurationSeconds === null
        ? 0
        : Math.max(
          0,
          (durationSeconds - staticDurationSeconds) / 60
        ),
  };
}

/**
 * Provider-neutral routing function for controllers.
 */
export async function getRoute(
  origin: Coordinates,
  destination: Coordinates
): Promise<RouteResult> {
  validateCoordinates(origin, destination);

  if (getRoutingProvider() === "google") {
    return getGoogleRoute(origin, destination);
  }

  return getOSRMRoute(origin, destination);
}

/**
 * Explicit Google-only function for callers that require
 * traffic-aware routing.
 */
export async function getTrafficAwareRoute(
  origin: Coordinates,
  destination: Coordinates
): Promise<RouteResult> {
  validateCoordinates(origin, destination);

  return getGoogleRoute(origin, destination);
}