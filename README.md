# EV Charge Ghana

A full-stack electric-vehicle charging companion for Ghana. The React client includes a driver dashboard, Leaflet station map, battery profile, traffic-aware trip planner, and an admin station console. The Express API uses Prisma with PostgreSQL/PostGIS for radius searches.

## Requirements

- Node.js 20.19+ or 22.12+
- PostgreSQL with the PostGIS extension available
- A Google Maps Routes API key for traffic-aware trip recommendations

## Local setup

1. Install packages: `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and a private `JWT_SECRET` of at least 32 characters.
3. Create the database, then apply the PostGIS migration and generate Prisma Client:

   ```sh
   npm run db:generate
   npm run db:deploy
   ```

4. Set `GOOGLE_MAPS_API_KEY` to enable traffic-aware recommendations. The key must have the Routes API enabled.
5. Start both the API and Vite client: `npm run dev`

The client runs at `http://localhost:5173`; the API listens on port 3000. Vite proxies `/api` requests to the API. Set `CLIENT_ORIGIN` if the client is hosted at another origin.

New accounts receive the `user` role. To grant administrator access to an account after registration, run this query against the configured database:

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
```

The admin dashboard can then create, view, update, and delete stations and user accounts. User management includes role changes and password resets; deleting an account also deletes its vehicle profiles and station reports. The last administrator cannot be demoted or deleted. Station verification and user/station reports are timestamped in the database.

To create the initial administrator, register the desired account through the app and promote it with the SQL above. Once signed in with an administrator account, use **Admin dashboard → Users** to create or update other accounts, including administrator roles. Passwords are hashed by the server and must be entered through the private form; do not put passwords in source code or commit them.

## Useful commands

- `npm run dev` — API and web client in development
- `npm run build` — TypeScript check and production client build
- `npm run typecheck` — TypeScript check
- `npm run db:generate` — generate Prisma Client
- `npm run db:migrate` — create/apply a development migration
- `npm run db:deploy` — apply committed migrations

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/stations/nearby?lat=5.60&lng=-0.19&radius=25000`, `GET /api/stations/:id`
- `POST /api/stations/:id/reports` — authenticated station-status report; reports do not silently overwrite verified station status
- `GET /api/vehicles`, `POST /api/vehicles`, `GET /api/vehicles/:id/battery?soc=78`
- `POST /api/routes/recommendations` — authenticated; accepts current coordinates, destination coordinates, `vehicleId`, and `stateOfChargePercent`
- `POST /api/routes/navigation` — authenticated; accepts a station ID and current GPS coordinates, and returns road geometry and turn instructions for an available station
- `GET|POST|PUT|DELETE /api/admin/stations`, `POST /api/admin/stations/:id/verify` — administrator only
- `GET|POST|PUT|DELETE /api/admin/users` — administrator only; user create/update accepts password changes
- `GET /api/admin/analytics` — administrator only

Nearby searches use `ST_DWithin` against a PostGIS geography column with a GiST index. A migration trigger keeps that point synchronized with the station latitude/longitude.

The trip planner uses the configured routing provider for the direct trip, route to each nearby charger, and onward leg. It estimates energy use as route distance in km multiplied by vehicle consumption in kWh/km, then projects arrival SoC against usable battery capacity. After accepting an available recommendation, the driver can start GPS navigation with a live map marker, road route, and turn instructions; the app requests location access only when navigation starts and recalculates if the driver leaves the route. Browser geolocation requires HTTPS or localhost. Provider errors are returned to the caller rather than being replaced with non-traffic estimates.
