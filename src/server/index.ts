import cors from "cors";
import express from "express";
import { config } from "./config";
import { prisma } from "./db";
import { errorHandler } from "./middleware/errors";
import { apiRouter } from "./routes";

const app = express();
app.use(cors({ origin: config.CLIENT_ORIGIN }));
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", apiRouter);
app.use(errorHandler);

const server = app.listen(config.PORT, () => {
  console.log(`EV Charge Ghana API listening on port ${config.PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  });
}
