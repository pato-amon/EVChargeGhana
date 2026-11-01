import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "fbea25078a18b99c8f1b99980ee7603abefee38b928e776ac97ce8837c6be08a"),
  PORT: z.coerce.number().int().positive().default(3000),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  GOOGLE_MAPS_API_KEY: z.string().optional().default(""),

  // Routing provider settings
  ROUTING_PROVIDER: z.enum(["osrm", "google"]).default("osrm"),
  OSRM_BASE_URL: z.string().url().default("http://localhost:5000"),
});

export const config = configSchema.parse(process.env);