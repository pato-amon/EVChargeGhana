import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, BatteryCharging, Bolt, CarFront, ChevronDown,
  CircleHelp, Compass, LocateFixed, LogOut, MapPinned, Navigation,
  Plus, Route, ShieldCheck, Zap,
} from "lucide-react";
import { ApiError, api, clearToken, getToken, saveToken } from "./api";
import AdminDashboard from "./components/AdminDashboard";
import StationMap from "./components/StationMap";
import type { Recommendation, Station, User, Vehicle } from "./types";

type View = "overview" | "map" | "routes" | "admin";
type Coordinates = { latitude: number; longitude: number };
const ACCRA: Coordinates = { latitude: 5.6037, longitude: -0.187 };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState(getToken());
  const [view, setView] = useState<View>("overview");
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [location, setLocation] = useState<Coordinates>(ACCRA);
  const [soc, setSoc] = useState(78);
  const [loadingStations, setLoadingStations] = useState(false);
  const [appError, setAppError] = useState("");

  const loadStations = useCallback(async (coordinates: Coordinates) => {
    setLoadingStations(true);
    try {
      const rows = await api<Station[]>(
        `/stations/nearby?lat=${coordinates.latitude}&lng=${coordinates.longitude}&radius=40000`,
      );
      setStations(rows);
      setAppError("");
    } catch (cause) {
      setAppError(cause instanceof Error ? cause.message : "Could not load charging stations");
    } finally {
      setLoadingStations(false);
    }
  }, []);

  const loadUserData = useCallback(async () => {
    try {
      const [profile, vehicles] = await Promise.all([
        api<User>("/auth/me"),
        api<Vehicle[]>("/vehicles"),
      ]);
      setUser(profile);
      setVehicle(vehicles[0] ?? null);
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 404)) {
        clearToken();
        setToken(null);
        setUser(null);
      } else {
        setAppError(cause instanceof Error ? cause.message : "Unable to load your account");
      }
    }
  }, []);

  useEffect(() => {
    void loadStations(location);
  }, [location, loadStations]);

  useEffect(() => {
    if (token) void loadUserData();
  }, [token, loadUserData]);

  function detectLocation() {
    if (!navigator.geolocation) {
      setAppError("Location services are not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setLocation({ latitude: coords.latitude, longitude: coords.longitude }),
      () => setAppError("Couldn't access your location. Check your browser permissions."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleAuth(email: string, password: string, mode: "login" | "register") {
    const result = await api<{ user: User; token: string }>(`/auth/${mode}`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    saveToken(result.token);
    setToken(result.token);
    setUser(result.user);
    const vehicles = await api<Vehicle[]>("/vehicles");
    setVehicle(vehicles[0] ?? null);
  }

  async function saveVehicle(next: Omit<Vehicle, "id">) {
    const result = await api<Vehicle>("/vehicles", { method: "POST", body: JSON.stringify(next) });
    setVehicle(result);
  }

  function signOut() {
    clearToken();
    setToken(null);
    setUser(null);
    setVehicle(null);
    setView("overview");
  }

  const availableCount = useMemo(() => stations.filter((station) => station.status === "available").length, [stations]);

  if (!token || !user) {
    return <AuthScreen onAuth={handleAuth} notice={appError} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setView("overview"); }}>
          <span className="brand-mark"><Zap size={21} fill="currentColor" /></span>
          <span>Charge<span className="brand-light">Ghana</span><small>DRIVE THE CHANGE</small></span>
        </a>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="side-nav">
          <NavButton active={view === "overview"} onClick={() => setView("overview")} icon={<Compass size={18} />} label="Overview" />
          <NavButton active={view === "map"} onClick={() => setView("map")} icon={<MapPinned size={18} />} label="Station map" count={stations.length} />
          <NavButton active={view === "routes"} onClick={() => setView("routes")} icon={<Route size={18} />} label="Trip planner" />
          {user.role === "admin" && <NavButton active={view === "admin"} onClick={() => setView("admin")} icon={<ShieldCheck size={18} />} label="Admin dashboard" />}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-card"><span className="support-icon"><CircleHelp size={17} /></span><strong>Need a hand?</strong><small>We're here to help you get moving.</small><a href="mailto:support@evchargeghana.com">Contact support <span>↗</span></a></div>
          <div className="user-card"><div className="avatar">{user.email.slice(0, 1).toUpperCase()}</div><div className="user-meta"><strong>{user.email.split("@")[0]}</strong><small>{user.role === "admin" ? "Administrator" : "EV driver"}</small></div><button className="icon-button" title="Sign out" onClick={signOut}><LogOut size={17} /></button></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><Zap size={18} fill="currentColor" /></span>Charge Ghana</div>
          <div className="breadcrumb">Ghana <span>/</span> <strong>{view === "overview" ? "Overview" : view === "map" ? "Station map" : view === "routes" ? "Trip planner" : "Admin dashboard"}</strong></div>
          <div className="topbar-right"><span className="network-live"><i /> Network live</span><button className="profile-button"><span className="avatar small-avatar">{user.email.slice(0, 1).toUpperCase()}</span><ChevronDown size={15} /></button></div>
        </header>
        {appError && <div className="global-alert">{appError}<button onClick={() => setAppError("")}>Dismiss</button></div>}

        {view === "overview" && <Overview
          user={user} vehicle={vehicle} stations={stations} availableCount={availableCount}
          soc={soc} setSoc={setSoc} location={location} loading={loadingStations}
          onDetect={detectLocation} onMap={() => setView("map")} onSaveVehicle={saveVehicle}
          onRoutes={() => setView("routes")}
        />}
        {view === "map" && <MapView
          stations={stations} location={location} loading={loadingStations}
          onDetect={detectLocation} onRefresh={() => void loadStations(location)}
        />}
        {view === "routes" && <RoutePlanner vehicle={vehicle} location={location} soc={soc} setSoc={setSoc} onDetect={detectLocation} />}
        {view === "admin" && user.role === "admin" && <AdminDashboard />}
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span>{count !== undefined && <small>{count}</small>}</button>;
}

function Overview({
  user, vehicle, stations, availableCount, soc, setSoc, location, loading, onDetect, onMap, onSaveVehicle, onRoutes,
}: {
  user: User; vehicle: Vehicle | null; stations: Station[]; availableCount: number; soc: number;
  setSoc: (value: number) => void; location: Coordinates; loading: boolean; onDetect: () => void;
  onMap: () => void; onRoutes: () => void; onSaveVehicle: (vehicle: Omit<Vehicle, "id">) => Promise<void>;
}) {
  const [showVehicleForm, setShowVehicleForm] = useState(!vehicle);
  const [make, setMake] = useState(vehicle?.make ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [capacity, setCapacity] = useState(vehicle?.usableBatteryCapacityKwh ?? 60);
  const [consumption, setConsumption] = useState(vehicle?.avgConsumptionKwhPerKm ?? 0.18);
  const [formError, setFormError] = useState("");
  const energyRemaining = vehicle ? (vehicle.usableBatteryCapacityKwh * soc / 100).toFixed(1) : "—";
  const remainingRange = vehicle ? Math.round(vehicle.usableBatteryCapacityKwh * soc / 100 / vehicle.avgConsumptionKwhPerKm) : 0;
  const nearby = stations.slice(0, 3);

  async function submitVehicle(event: React.FormEvent) {
    event.preventDefault();
    try {
      await onSaveVehicle({ make, model, usableBatteryCapacityKwh: Number(capacity), avgConsumptionKwhPerKm: Number(consumption) });
      setShowVehicleForm(false);
      setFormError("");
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Unable to save vehicle");
    }
  }

  return <section className="page-section">
    <div className="welcome-row">
      <div><p className="eyebrow">{new Intl.DateTimeFormat("en-GH", { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase()}</p><h1>Good to see you, {user.email.split("@")[0]} <span className="wave">✦</span></h1><p>Your next charge is closer than you think.</p></div>
      <button className="button secondary location-button" onClick={onDetect}><LocateFixed size={17} /> Use my location</button>
    </div>

    <div className="hero-grid">
      <article className="battery-card">
        <div className="battery-top"><span className="eyebrow">YOUR VEHICLE</span><button className="text-button" onClick={() => setShowVehicleForm(true)}>{vehicle ? "Edit vehicle" : "Add vehicle"} <span>↗</span></button></div>
        {vehicle ? <>
          <div className="vehicle-name"><span className="vehicle-icon"><CarFront size={22} /></span><div><h2>{vehicle.make} {vehicle.model}</h2><span>{vehicle.usableBatteryCapacityKwh} kWh usable capacity</span></div></div>
          <div className="battery-readout"><div><strong>{soc}<small>%</small></strong><span>Current charge</span></div><div className="battery-divider" /><div><strong>{energyRemaining}<small> kWh</small></strong><span>Energy remaining</span></div></div>
          <div className="battery-meter"><div className="battery-fill" style={{ width: `${soc}%` }} /></div>
          <div className="battery-range"><span>Approx. range</span><strong>{remainingRange} km</strong></div>
          <label className="soc-control"><span>Update state of charge</span><input type="range" min="0" max="100" value={soc} onChange={(event) => setSoc(Number(event.target.value))} /><b>{soc}%</b></label>
        </> : <div className="vehicle-empty"><span className="vehicle-icon"><CarFront size={22} /></span><div><h2>Set up your vehicle</h2><p>Add your EV to get personalized range estimates and energy-smart routes.</p><button className="button primary compact" onClick={() => setShowVehicleForm(true)}><Plus size={16} /> Add vehicle</button></div></div>}
      </article>
      <article className="network-card">
        <div className="network-card-head"><div><span className="eyebrow">CHARGING NETWORK</span><h2>Nearby stations</h2></div><span className="map-pin"><MapPinned size={19} /></span></div>
        <div className="nearby-number"><strong>{loading ? "…" : availableCount}</strong><span>available chargers<br />within 40 km</span></div>
        <div className="network-divider" />
        <div className="network-mini-stats"><div><span>Total found</span><strong>{stations.length} stations</strong></div><div><span>Current area</span><strong>{location.latitude.toFixed(2)}°, {location.longitude.toFixed(2)}°</strong></div></div>
        <button className="button dark full-button" onClick={onMap}>Explore station map <ArrowUpRight size={17} /></button>
      </article>
    </div>

    <div className="section-title-row"><div><span className="eyebrow">AROUND YOU</span><h2>Charging spots nearby</h2></div><button className="inline-link" onClick={onMap}>View all stations <ArrowUpRight size={15} /></button></div>
    <div className="station-list">
      {nearby.length ? nearby.map((station) => <StationRow key={station.id} station={station} />) : <div className="empty-card">{loading ? "Finding chargers near you…" : "No stations nearby yet. Try refreshing your location or exploring the map."}</div>}
    </div>
    <button className="route-promo" onClick={onRoutes}><span className="promo-icon"><Route size={19} /></span><span><strong>Planning a longer drive?</strong><small>Find a charger that fits your range and traffic conditions.</small></span><span className="promo-action">Plan a route <ArrowUpRight size={16} /></span></button>

    {showVehicleForm && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && vehicle) setShowVehicleForm(false); }}>
      <form className="modal vehicle-modal" onSubmit={(event) => void submitVehicle(event)}>
        <div className="modal-heading"><div><p className="eyebrow">YOUR GARAGE</p><h2>{vehicle ? "Update your vehicle" : "Add your vehicle"}</h2></div>{vehicle && <button className="icon-button" type="button" onClick={() => setShowVehicleForm(false)}>×</button>}</div>
        <p className="modal-intro">We'll use these details to estimate your range and recommend safer charging stops.</p>
        <div className="form-grid"><Field label="Make"><input required value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. Hyundai" /></Field><Field label="Model"><input required value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. Kona Electric" /></Field><Field label="Usable battery (kWh)"><input required type="number" min="1" step="any" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} /></Field><Field label="Average consumption (kWh/km)"><input required type="number" min="0.01" step="any" value={consumption} onChange={(e) => setConsumption(Number(e.target.value))} /></Field></div>
        {formError && <div className="alert">{formError}</div>}<div className="modal-footer"><button className="button primary" type="submit">Save vehicle profile</button></div>
      </form>
    </div>}
  </section>;
}

function MapView({ stations, location, loading, onDetect, onRefresh }: { stations: Station[]; location: Coordinates; loading: boolean; onDetect: () => void; onRefresh: () => void }) {
  const [filter, setFilter] = useState("all");
  const filtered = stations.filter((station) => filter === "all" || station.status === filter);
  return <section className="page-section">
    <div className="page-heading map-heading"><div><p className="eyebrow">FIND A CHARGER</p><h1>Station map</h1><p>Explore real-time charging options around your location.</p></div><div className="heading-actions"><button className="button secondary" onClick={onDetect}><LocateFixed size={16} /> My location</button><button className="button primary" onClick={onRefresh}><Navigation size={16} /> Refresh</button></div></div>
    <div className="map-layout">
      <div className="map-container">{loading && <div className="map-loading">Updating stations…</div>}<StationMap stations={filtered} center={[location.latitude, location.longitude]} /></div>
      <aside className="map-sidebar"><div className="map-side-head"><div><strong>{filtered.length} stations</strong><small>Within 40 km of your location</small></div><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All</option><option value="available">Available</option><option value="occupied">Occupied</option><option value="offline">Offline</option></select></div>
        <div className="map-station-scroll">{filtered.map((station) => <StationRow key={station.id} station={station} />)}{!filtered.length && <div className="empty-card">{loading ? "Loading stations…" : "No stations match this filter."}</div>}</div>
        <div className="map-legend"><span><i className="legend-dot available" /> Available</span><span><i className="legend-dot occupied" /> Occupied</span><span><i className="legend-dot offline" /> Offline</span></div>
      </aside>
    </div>
  </section>;
}

function RoutePlanner({ vehicle, location, soc, setSoc, onDetect }: { vehicle: Vehicle | null; location: Coordinates; soc: number; setSoc: (value: number) => void; onDetect: () => void }) {
  const [destination, setDestination] = useState<Coordinates>({ latitude: 5.6037, longitude: -0.187 });
  const [vehicleId, setVehicleId] = useState(vehicle?.id ?? "");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (vehicle) setVehicleId(vehicle.id); }, [vehicle]);

  async function plan(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api<Recommendation[]>("/routes/recommendations", {
        method: "POST",
        body: JSON.stringify({
          latitude: location.latitude, longitude: location.longitude, destination,
          vehicleId, stateOfChargePercent: soc,
        }),
      });
      setRecommendations(result);
      if (!result.length) setError("No charging stations were found within 150 km of your location.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to calculate recommendations");
    } finally {
      setLoading(false);
    }
  }

  return <section className="page-section">
    <div className="page-heading"><div><p className="eyebrow">ENERGY-SMART JOURNEYS</p><h1>Plan your next trip</h1><p>Choose your destination and we'll find charging stops that match your range.</p></div><button className="button secondary" onClick={onDetect}><LocateFixed size={16} /> Update start location</button></div>
    <div className="planner-layout">
      <form className="planner-card" onSubmit={(event) => void plan(event)}>
        <span className="eyebrow">TRIP DETAILS</span><h2>Where are you headed?</h2>
        <div className="route-points"><span className="route-line"><i /><i /></span>
          <div className="field"><span>Starting point</span><div className="input-with-icon"><LocateFixed size={16} /><input value={`${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`} readOnly /></div></div>
          <div className="field"><span>Destination coordinates</span><div className="coordinate-fields"><input aria-label="Destination latitude" required type="number" step="any" min="-90" max="90" value={destination.latitude} onChange={(event) => setDestination({ ...destination, latitude: Number(event.target.value) })} /><input aria-label="Destination longitude" required type="number" step="any" min="-180" max="180" value={destination.longitude} onChange={(event) => setDestination({ ...destination, longitude: Number(event.target.value) })} /></div><small>Enter coordinates for your destination</small></div>
        </div>
        <div className="field"><span>Your vehicle</span><select required value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>{vehicle && <option value={vehicle.id}>{vehicle.make} {vehicle.model}</option>}{!vehicle && <option value="">Add a vehicle first</option>}</select></div>
        <label className="soc-control planner-soc"><span>Current battery</span><input type="range" min="0" max="100" value={soc} onChange={(event) => setSoc(Number(event.target.value))} /><b>{soc}%</b></label>
        {error && <div className="alert">{error}</div>}
        <button className="button primary full-button" type="submit" disabled={loading || !vehicleId}>{loading ? "Checking routes…" : <><Zap size={16} /> Find my charging stops</>}</button>
        <p className="provider-note">Travel times use live traffic-aware routing. Recommendations are estimates; always check your vehicle's actual range.</p>
      </form>
      <div className="recommendations-panel">
        <div className="recommendations-heading"><div><span className="eyebrow">YOUR BEST OPTIONS</span><h2>Charging recommendations</h2></div>{recommendations.length > 0 && <span className="result-count">{recommendations.length} options</span>}</div>
        {recommendations.length ? <div className="recommendation-list">{recommendations.map((item, index) => <RecommendationCard key={item.station.id} item={item} index={index} />)}</div> : <div className="recommendations-empty"><span className="empty-route-icon"><Route size={24} /></span><strong>Your route, made easier</strong><p>Add your destination to see nearby charging stops, traffic-aware travel times, and your estimated arrival battery.</p><div className="empty-benefits"><span><Bolt size={15} /> Energy estimates</span><span><Navigation size={15} /> Traffic-aware ETAs</span></div></div>}
      </div>
    </div>
  </section>;
}

function RecommendationCard({ item, index }: { item: Recommendation; index: number }) {
  const labelClass = item.recommendation.toLowerCase().replaceAll(" ", "-");
  return <article className="recommendation-card"><div className="recommendation-top"><span className={`recommendation-label ${labelClass}`}><i />{item.recommendation}</span>{index === 0 && <span className="best-match">BEST MATCH</span>}</div>
    <h3>{item.station.name}</h3><p className="recommendation-address">{item.station.address}</p>
    <div className="recommendation-stats"><div><strong>{item.distanceKm.toFixed(1)} <small>km</small></strong><span>To charger</span></div><div><strong>{Math.round(item.trafficDurationMinutes)} <small>min</small></strong><span>Traffic-aware ETA{item.detourMinutes > 1 ? ` · +${Math.round(item.detourMinutes)} min detour` : ""}</span></div><div><strong>{Math.round(item.arrivalSocPercent)}<small>%</small></strong><span>Battery on arrival</span></div></div>
    <div className="recommendation-footer"><span><BatteryCharging size={15} /> {item.station.chargingSpeedKw} kW · {item.station.connectorTypes.join(", ")}</span><span className={`badge ${item.station.status}`}>{item.station.status}</span></div>
  </article>;
}

function StationRow({ station }: { station: Station }) {
  return <article className="station-row"><span className={`station-symbol ${station.status}`}><Zap size={16} fill="currentColor" /></span><div className="station-row-main"><div className="station-row-title"><strong>{station.name}</strong><span className={`status-dot ${station.status}`} /></div><p>{station.operator} · {station.address}</p><div className="station-row-meta"><span>{station.chargingSpeedKw} kW</span><span>{station.connectorTypes.join(", ")}</span></div></div><div className="station-row-distance">{station.distanceKm !== undefined ? `${station.distanceKm.toFixed(1)} km` : `${station.latitude.toFixed(2)}°`}<ArrowDownRight size={14} /></div></article>;
}

function AuthScreen({ onAuth, notice }: { onAuth: (email: string, password: string, mode: "login" | "register") => Promise<void>; notice: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await onAuth(email, password, mode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }
  return <main className="auth-page">
    <section className="auth-art"><div className="auth-brand"><span className="brand-mark"><Zap size={21} fill="currentColor" /></span>Charge<span>Ghana</span></div><div className="auth-art-copy"><span className="eyebrow">A BETTER WAY TO MOVE</span><h1>Every journey<br />starts with <em>energy.</em></h1><p>Find a charger, plan your route, and travel Ghana with confidence.</p></div><div className="auth-art-bottom"><div className="auth-stats"><span><strong>01</strong> Find your charge</span><span><strong>02</strong> Plan with confidence</span><span><strong>03</strong> Go further</span></div><small>BUILT FOR GHANA'S ELECTRIC FUTURE</small></div><div className="auth-art-sun" /></section>
    <section className="auth-form-side"><div className="auth-form-wrap"><p className="eyebrow">WELCOME TO CHARGE GHANA</p><h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2><p className="auth-subtitle">{mode === "login" ? "Your next journey is waiting." : "Join the community driving Ghana forward."}</p>
      <form onSubmit={(event) => void submit(event)}><label className="field"><span>Email address</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><label className="field"><span>Password</span><input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>{notice && <div className="alert">{notice}</div>}{error && <div className="alert">{error}</div>}<button className="button primary full-button auth-submit" disabled={loading}>{loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"} <span>→</span></button></form>
      <p className="auth-switch">{mode === "login" ? "New to Charge Ghana?" : "Already have an account?"} <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create an account" : "Sign in"}</button></p><div className="auth-safe"><ShieldCheck size={15} /> Your account and vehicle data stay secure.</div>
    </div></section>
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
