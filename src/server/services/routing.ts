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

export type NavigationStep = {
  instruction: string;
  distanceMeters: number;
  endLocation: Coordinates;
};

export type NavigationRoute = RouteResult & {
  geometry: Coordinates[];
  steps: NavigationStep[];
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

async function getOSRMNavigationRoute(
  origin: Coordinates,
  destination: Coordinates
): Promise<NavigationRoute> {
  const baseUrl = config.OSRM_BASE_URL.replace(/\/+$/, "");
  const coordinates = [
    `${origin.longitude},${origin.latitude}`,
    `${destination.longitude},${destination.latitude}`,
  ].join(";");
  const url = new URL(`${baseUrl}/route/v1/driving/${coordinates}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "true");

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`OSRM returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as {
    code: string;
    message?: string;
    routes?: Array<{
      distance: number;
      duration: number;
      geometry: { coordinates: [number, number][] };
      legs: Array<{
        steps: Array<{
          distance: number;
          name: string;
          maneuver: { type: string; modifier?: string; location: [number, number] };
        }>;
      }>;
    }>;
  };
  const route = payload.routes?.[0];
  if (payload.code !== "Ok" || !route) {
    throw new Error(payload.message ?? "OSRM could not find a suitable route.");
  }
  const geometry = route.geometry.coordinates.map(([longitude, latitude]) => ({
    latitude,
    longitude,
  }));
  if (geometry.length < 2) {
    throw new Error("OSRM returned a route without usable geometry.");
  }
  const steps = route.legs.flatMap((leg) => leg.steps.map((step, index) => {
    const nextManeuver = leg.steps[index + 1]?.maneuver.location;
    return {
      instruction: formatOSRMManeuver(step.maneuver.type, step.maneuver.modifier, step.name),
      distanceMeters: step.distance,
      endLocation: nextManeuver
        ? { latitude: nextManeuver[1], longitude: nextManeuver[0] }
        : destination,
    };
  })).filter((step) => step.instruction.length > 0);

  return {
    distanceKm: route.distance / 1000,
    durationMinutes: route.duration / 60,
    trafficDelayMinutes: 0,
    geometry,
    steps,
  };
}

function formatOSRMManeuver(type: string, modifier?: string, street?: string): string {
  const direction = modifier?.replaceAll("_", " ");
  const streetName = street ? ` onto ${street}` : "";
  if (type === "depart") return `Head ${direction ?? "ahead"}${streetName}`;
  if (type === "arrive") return "Arrive at your destination";
  if (type === "turn" || type === "end of road") return `Turn ${direction ?? "ahead"}${streetName}`;
  if (type === "roundabout" || type === "rotary") return `Enter the roundabout${streetName}`;
  if (type === "merge") return `Merge ${direction ?? ""}${streetName}`.trim();
  if (type === "fork" || type === "on ramp" || type === "off ramp") {
    return `${type === "fork" ? "Keep" : type === "on ramp" ? "Take the ramp" : "Take the exit"} ${direction ?? ""}${streetName}`.trim();
  }
  if (type === "continue" || type === "new name") return `Continue${streetName}`;
  return streetName ? `Continue${streetName}` : "";
}

function decodeGooglePolyline(encoded: string): Coordinates[] {
  const points: Coordinates[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    latitude += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    longitude += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return points;
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

async function getGoogleNavigationRoute(
  origin: Coordinates,
  destination: Coordinates
): Promise<NavigationRoute> {
  if (!config.GOOGLE_MAPS_API_KEY) {
    throw new Error("Google routing requires GOOGLE_MAPS_API_KEY.");
  }
  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.endLocation",
      },
      body: JSON.stringify({
        origin: { location: { latLng: origin } },
        destination: { location: { latLng: destination } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE_OPTIMAL",
      }),
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!response.ok) {
    throw new Error(`Google routing returned HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as {
    routes?: Array<{
      distanceMeters: number;
      duration: string;
      staticDuration?: string;
      polyline?: { encodedPolyline: string };
      legs?: Array<{
        steps: Array<{
          distanceMeters: number;
          navigationInstruction?: { instructions?: string };
          endLocation?: { latLng?: { latitude: number; longitude: number } };
        }>;
      }>;
    }>;
  };
  const route = payload.routes?.[0];
  if (!route?.polyline?.encodedPolyline || !route.legs?.length) {
    throw new Error("Google routing provider returned no usable navigation route.");
  }
  const durationSeconds = Number.parseFloat(route.duration);
  const staticDurationSeconds = route.staticDuration
    ? Number.parseFloat(route.staticDuration)
    : null;
  if (!Number.isFinite(route.distanceMeters) || !Number.isFinite(durationSeconds)) {
    throw new Error("Google routing provider returned invalid route data.");
  }
  const geometry = decodeGooglePolyline(route.polyline.encodedPolyline);
  if (geometry.length < 2) {
    throw new Error("Google routing provider returned invalid route geometry.");
  }
  const steps = route.legs.flatMap((leg) => leg.steps.map((step) => ({
    instruction: step.navigationInstruction?.instructions ?? "",
    distanceMeters: step.distanceMeters,
    endLocation: step.endLocation?.latLng ?? destination,
  }))).filter((step) => step.instruction.length > 0);

  return {
    distanceKm: route.distanceMeters / 1000,
    durationMinutes: durationSeconds / 60,
    trafficDelayMinutes: staticDurationSeconds === null
      ? 0
      : Math.max(0, (durationSeconds - staticDurationSeconds) / 60),
    geometry,
    steps,
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

export async function getNavigationRoute(
  origin: Coordinates,
  destination: Coordinates
): Promise<NavigationRoute> {
  validateCoordinates(origin, destination);
  return getRoutingProvider() === "google"
    ? getGoogleNavigationRoute(origin, destination)
    : getOSRMNavigationRoute(origin, destination);
}