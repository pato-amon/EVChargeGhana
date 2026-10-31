CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE "Role" AS ENUM ('user', 'admin');
CREATE TYPE "StationStatus" AS ENUM ('available', 'occupied', 'offline', 'unknown');

CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'user',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "vehicle_profiles" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "make" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "usable_battery_capacity_kwh" DOUBLE PRECISION NOT NULL,
  "avg_consumption_kwh_per_km" DOUBLE PRECISION NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vehicle_profiles_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vehicle_profiles_user_id_idx" ON "vehicle_profiles"("user_id");

CREATE TABLE "charging_stations" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "operator" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "location" geography(Point, 4326),
  "address" TEXT NOT NULL,
  "connector_types" TEXT[] NOT NULL,
  "charging_speed_kw" DOUBLE PRECISION NOT NULL,
  "status" "StationStatus" NOT NULL DEFAULT 'unknown',
  "last_verified_at" TIMESTAMP(3),
  "verified_by_admin_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "charging_stations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "charging_stations_status_idx" ON "charging_stations"("status");
CREATE INDEX "charging_stations_location_gist_idx" ON "charging_stations" USING GIST ("location");

CREATE FUNCTION sync_station_geography() RETURNS trigger AS $$
BEGIN
  NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "charging_stations_location_sync"
BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "charging_stations"
FOR EACH ROW EXECUTE FUNCTION sync_station_geography();

CREATE TABLE "station_reports" (
  "id" UUID NOT NULL,
  "station_id" UUID NOT NULL,
  "reported_status" "StationStatus" NOT NULL,
  "user_id" UUID NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "station_reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "station_reports_station_id_timestamp_idx" ON "station_reports"("station_id", "timestamp");

ALTER TABLE "vehicle_profiles" ADD CONSTRAINT "vehicle_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "charging_stations" ADD CONSTRAINT "charging_stations_verified_by_admin_id_fkey" FOREIGN KEY ("verified_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "station_reports" ADD CONSTRAINT "station_reports_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "charging_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "station_reports" ADD CONSTRAINT "station_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
