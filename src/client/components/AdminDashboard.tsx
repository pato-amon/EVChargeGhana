import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { api } from "../api";
import type { AdminUser, Station } from "../types";

type Analytics = {
  totalUsers: number;
  totalStations: number;
  activeStations: number;
  verificationPending: number;
};

type StationDraft = Omit<Station, "id" | "lastVerifiedAt" | "distanceKm">;
type UserDraft = { email: string; password: string; role: AdminUser["role"] };
const emptyDraft: StationDraft = {
  name: "", operator: "", latitude: 5.6037, longitude: -0.187,
  address: "", connectorTypes: ["CCS"], chargingSpeedKw: 50, status: "unknown",
};
const emptyUserDraft: UserDraft = { email: "", password: "", role: "user" };

export default function AdminDashboard() {
  const [stations, setStations] = useState<Station[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [section, setSection] = useState<"stations" | "users">("stations");
  const [search, setSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<Station | "new" | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | "new" | null>(null);
  const [draft, setDraft] = useState<StationDraft>(emptyDraft);
  const [userDraft, setUserDraft] = useState<UserDraft>(emptyUserDraft);
  const [connectors, setConnectors] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [rows, userRows, stats] = await Promise.all([
      api<Station[]>("/admin/stations"),
      api<AdminUser[]>("/admin/users"),
      api<Analytics>("/admin/analytics"),
    ]);
    setStations(rows);
    setUsers(userRows);
    setAnalytics(stats);
  }
  useEffect(() => {
    void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Unable to load admin data"));
  }, []);

  const visible = useMemo(() => stations.filter((station) =>
    (filter === "all" || station.status === filter) &&
    `${station.name} ${station.operator} ${station.address}`.toLowerCase().includes(search.toLowerCase())
  ), [stations, filter, search]);
  const visibleUsers = useMemo(() => users.filter((user) =>
    `${user.email} ${user.role}`.toLowerCase().includes(userSearch.toLowerCase())
  ), [users, userSearch]);

  function openEditor(station?: Station) {
    setEditing(station ?? "new");
    setDraft(station ? {
      name: station.name, operator: station.operator, latitude: station.latitude,
      longitude: station.longitude, address: station.address,
      connectorTypes: station.connectorTypes, chargingSpeedKw: station.chargingSpeedKw,
      status: station.status,
    } : emptyDraft);
    setConnectors(station?.connectorTypes.join(", ") ?? "CCS");
    setError("");
  }

  function openUserEditor(user?: AdminUser) {
    setEditingUser(user ?? "new");
    setUserDraft(user
      ? { email: user.email, password: "", role: user.role }
      : emptyUserDraft);
    setError("");
  }

  async function saveStation(event: React.FormEvent) {
    event.preventDefault();
    try {
      const payload = {
        ...draft,
        connectorTypes: connectors.split(",").map((value) => value.trim()).filter(Boolean),
      };
      if (editing === "new") await api("/admin/stations", { method: "POST", body: JSON.stringify(payload) });
      else if (editing) await api(`/admin/stations/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
      setEditing(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save station");
    }
  }

  async function verify(id: string) {
    try {
      await api(`/admin/stations/${id}/verify`, { method: "POST" });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to verify station");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this station and its reports?")) return;
    try {
      await api(`/admin/stations/${id}`, { method: "DELETE" });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove station");
    }
  }

  async function saveUser(event: React.FormEvent) {
    event.preventDefault();
    try {
      const payload = {
        email: userDraft.email,
        role: userDraft.role,
        ...(userDraft.password ? { password: userDraft.password } : {}),
      };
      if (editingUser === "new") {
        await api("/admin/users", { method: "POST", body: JSON.stringify(payload) });
      } else if (editingUser) {
        await api(`/admin/users/${editingUser.id}`, { method: "PUT", body: JSON.stringify(payload) });
      }
      setEditingUser(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save user");
    }
  }

  async function removeUser(user: AdminUser) {
    if (!window.confirm(`Permanently delete ${user.email}? Their vehicle profiles and station reports will also be deleted.`)) return;
    try {
      await api(`/admin/users/${user.id}`, { method: "DELETE" });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete user");
    }
  }

  return (
    <section className="page-section">
      <div className="page-heading">
        <div><p className="eyebrow">OPERATIONS</p><h1>{section === "stations" ? "Station management" : "User management"}</h1><p>{section === "stations" ? "Keep Ghana's charging network accurate and trusted." : "Manage registered accounts, administrator roles, and password resets."}</p></div>
        <button className="button primary" onClick={() => section === "stations" ? openEditor() : openUserEditor()}><Plus size={17} /> Add {section === "stations" ? "station" : "user"}</button>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="admin-tabs" role="group" aria-label="Admin section">
        <button className={`button ${section === "stations" ? "primary" : "secondary"}`} aria-pressed={section === "stations"} onClick={() => setSection("stations")}>Stations</button>
        <button className={`button ${section === "users" ? "primary" : "secondary"}`} aria-pressed={section === "users"} onClick={() => setSection("users")}>Users</button>
      </div>
      <div className="metric-grid admin-metrics">
        <Metric label="Total drivers" value={analytics?.totalUsers ?? "—"} caption="Registered accounts" />
        <Metric label="Network stations" value={analytics?.totalStations ?? "—"} caption="Across Ghana" />
        <Metric label="Available now" value={analytics?.activeStations ?? "—"} caption="Operational chargers" />
        <Metric label="Verification due" value={analytics?.verificationPending ?? "—"} caption="Older than 90 days" />
      </div>
      {section === "stations" ? <>
      <div className="table-card">
        <div className="table-tools">
          <div className="search-field"><Search size={17} /><input placeholder="Search stations" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="available">Available</option><option value="occupied">Occupied</option>
            <option value="offline">Offline</option><option value="unknown">Unknown</option>
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Station</th><th>Status</th><th>Connectors</th><th>Power</th><th>Last verified</th><th>Actions</th></tr></thead>
            <tbody>{visible.map((station) => (
              <tr key={station.id}>
                <td><strong>{station.name}</strong><small>{station.operator} · {station.address}</small></td>
                <td><span className={`badge ${station.status}`}>{station.status}</span></td>
                <td>{station.connectorTypes.join(", ")}</td><td>{station.chargingSpeedKw} kW</td>
                <td>{station.lastVerifiedAt ? new Date(station.lastVerifiedAt).toLocaleDateString() : <span className="muted">Pending</span>}</td>
                <td><div className="actions">
                  <button className="icon-button" title="Mark verified" onClick={() => void verify(station.id)}><Check size={16} /></button>
                  <button className="icon-button" title="Edit station" onClick={() => openEditor(station)}><Pencil size={16} /></button>
                  <button className="icon-button danger-icon" title="Delete station" onClick={() => void remove(station.id)}><Trash2 size={16} /></button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
          {!visible.length && <div className="empty-row">No stations match your search.</div>}
        </div>
      </div>
      </> : <div className="table-card">
        <div className="table-tools">
          <div className="search-field"><Search size={17} /><input placeholder="Search users" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} /></div>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Email</th><th>Role</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>{visibleUsers.map((user) => (
              <tr key={user.id}>
                <td><strong>{user.email}</strong></td>
                <td><span className={`badge ${user.role === "admin" ? "available" : "unknown"}`}>{user.role === "admin" ? "Administrator" : "User"}</span></td>
                <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                <td><div className="actions">
                  <button className="icon-button" title="Edit user" aria-label={`Edit ${user.email}`} onClick={() => openUserEditor(user)}><Pencil size={16} /></button>
                  <button className="icon-button danger-icon" title="Delete user" aria-label={`Delete ${user.email}`} onClick={() => void removeUser(user)}><Trash2 size={16} /></button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
          {!visibleUsers.length && <div className="empty-row">No users match your search.</div>}
        </div>
      </div>}
      {editing && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
        <form className="modal" onSubmit={(event) => void saveStation(event)}>
          <div className="modal-heading"><div><p className="eyebrow">NETWORK RECORD</p><h2>{editing === "new" ? "Add a station" : "Edit station"}</h2></div><button className="icon-button" type="button" onClick={() => setEditing(null)}><X size={18} /></button></div>
          <div className="form-grid">
            <Field label="Station name"><input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Operator"><input required value={draft.operator} onChange={(e) => setDraft({ ...draft, operator: e.target.value })} /></Field>
            <Field label="Latitude"><input required type="number" step="any" value={draft.latitude} onChange={(e) => setDraft({ ...draft, latitude: Number(e.target.value) })} /></Field>
            <Field label="Longitude"><input required type="number" step="any" value={draft.longitude} onChange={(e) => setDraft({ ...draft, longitude: Number(e.target.value) })} /></Field>
            <Field label="Address"><input required value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field>
            <Field label="Connector types"><input required value={connectors} onChange={(e) => setConnectors(e.target.value)} placeholder="CCS, Type 2" /></Field>
            <Field label="Charging speed (kW)"><input required type="number" min="1" value={draft.chargingSpeedKw} onChange={(e) => setDraft({ ...draft, chargingSpeedKw: Number(e.target.value) })} /></Field>
            <Field label="Status"><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Station["status"] })}><option>available</option><option>occupied</option><option>offline</option><option>unknown</option></select></Field>
          </div>
          {error && <div className="alert">{error}</div>}
          <div className="modal-footer"><button className="button secondary" type="button" onClick={() => setEditing(null)}>Cancel</button><button className="button primary" type="submit">Save station</button></div>
        </form>
      </div>}
      {editingUser && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingUser(null); }}>
        <form className="modal" onSubmit={(event) => void saveUser(event)}>
          <div className="modal-heading"><div><p className="eyebrow">ACCOUNT RECORD</p><h2>{editingUser === "new" ? "Add a user" : "Edit user"}</h2></div><button className="icon-button" type="button" onClick={() => setEditingUser(null)}><X size={18} /></button></div>
          <div className="form-grid">
            <Field label="Email address"><input type="email" autoComplete="email" required maxLength={254} value={userDraft.email} onChange={(event) => setUserDraft({ ...userDraft, email: event.target.value })} /></Field>
            <Field label={editingUser === "new" ? "Password" : "New password (optional)"}><input type="password" autoComplete="new-password" required={editingUser === "new"} minLength={8} maxLength={72} value={userDraft.password} onChange={(event) => setUserDraft({ ...userDraft, password: event.target.value })} placeholder={editingUser === "new" ? "At least 8 characters" : "Leave blank to keep current password"} /></Field>
            <Field label="Role"><select value={userDraft.role} onChange={(event) => setUserDraft({ ...userDraft, role: event.target.value as AdminUser["role"] })}><option value="user">User</option><option value="admin">Administrator</option></select></Field>
          </div>
          {error && <div className="alert">{error}</div>}
          <div className="modal-footer"><button className="button secondary" type="button" onClick={() => setEditingUser(null)}>Cancel</button><button className="button primary" type="submit">Save user</button></div>
        </form>
      </div>}
    </section>
  );
}

function Metric({ label, value, caption }: { label: string; value: string | number; caption: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{caption}</small></article>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
