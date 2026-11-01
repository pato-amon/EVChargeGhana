import { PrismaClient, StationStatus } from "@prisma/client";
import "dotenv/config"

const prisma = new PrismaClient();

const stations = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "EV Charge Ghana Test Station 1",
    operator: "Development Test",
    latitude: 5.6037,
    longitude: -0.1870,
    address: "Test location 1, Accra",
    connectorTypes: ["CCS2", "Type 2"],
    chargingSpeedKw: 50,
    status: StationStatus.available,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "EV Charge Ghana Test Station 2",
    operator: "Development Test",
    latitude: 5.5600,
    longitude: -0.2059,
    address: "Test location 2, Accra",
    connectorTypes: ["CCS2"],
    chargingSpeedKw: 100,
    status: StationStatus.unknown,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "EV Charge Ghana Test Station 3",
    operator: "Development Test",
    latitude: 5.6500,
    longitude: -0.1700,
    address: "Test location 3, Accra",
    connectorTypes: ["Type 2"],
    chargingSpeedKw: 22,
    status: StationStatus.occupied,
  },
];

async function main() {
  for (const station of stations) {
    await prisma.chargingStation.upsert({
      where: { id: station.id },
      update: station,
      create: station,
    });
  }

  console.log(`Seeded ${stations.length} test charging stations.`);
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
