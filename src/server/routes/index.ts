import { Router } from "express";
import * as admin from "../controllers/adminController";
import * as auth from "../controllers/authController";
import * as recommendations from "../controllers/recommendationController";
import * as stations from "../controllers/stationController";
import * as vehicles from "../controllers/vehicleController";
import { requireAdmin, requireAuth } from "../middleware/auth";

export const apiRouter = Router();

apiRouter.post("/auth/register", auth.register);
apiRouter.post("/auth/login", auth.login);
apiRouter.get("/auth/me", requireAuth, auth.currentUser);
apiRouter.get("/stations/nearby", stations.listNearby);
apiRouter.get("/stations/:id", stations.getStation);

apiRouter.use(requireAuth);
apiRouter.post("/stations/:id/reports", stations.reportStatus);
apiRouter.get("/vehicles", vehicles.listVehicles);
apiRouter.post("/vehicles", vehicles.saveVehicle);
apiRouter.get("/vehicles/:id/battery", vehicles.getBattery);
apiRouter.post("/routes/recommendations", recommendations.getRecommendations);
apiRouter.post("/routes/navigation", recommendations.getNavigation);

apiRouter.use("/admin", requireAdmin);
apiRouter.get("/admin/users", admin.listUsers);
apiRouter.post("/admin/users", admin.createUser);
apiRouter.put("/admin/users/:id", admin.updateUser);
apiRouter.delete("/admin/users/:id", admin.deleteUser);
apiRouter.get("/admin/stations", admin.listStations);
apiRouter.post("/admin/stations", admin.createStation);
apiRouter.put("/admin/stations/:id", admin.updateStation);
apiRouter.post("/admin/stations/:id/verify", admin.verifyStation);
apiRouter.delete("/admin/stations/:id", admin.deleteStation);
apiRouter.get("/admin/analytics", admin.getAnalytics);
