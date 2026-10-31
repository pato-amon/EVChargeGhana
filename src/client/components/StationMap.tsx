import { useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { Station } from "../types";

const icons = {
  available: "#20865b",
  occupied: "#e5a436",
  offline: "#d85d54",
  unknown: "#8a9189",
};

function stationIcon(status: Station["status"]) {
  return L.divIcon({
    className: "station-marker",
    html: `<span style="--marker-color:${icons[status]}"></span>`,
    iconSize: [26, 34],
    iconAnchor: [13, 30],
  });
}

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

export default function StationMap({
  stations,
  center,
}: {
  stations: Station[];
  center: [number, number];
}) {
  const markerIcons = useMemo(() => ({
    available: stationIcon("available"),
    occupied: stationIcon("occupied"),
    offline: stationIcon("offline"),
    unknown: stationIcon("unknown"),
  }), []);

  return (
    <MapContainer center={center} zoom={12} scrollWheelZoom className="station-map">
      <Recenter center={center} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {stations.map((station) => (
        <Marker
          key={station.id}
          position={[station.latitude, station.longitude]}
          icon={markerIcons[station.status]}
        >
          <Popup>
            <strong>{station.name}</strong>
            <div>{station.operator}</div>
            <div>{station.chargingSpeedKw} kW · {station.connectorTypes.join(", ")}</div>
            <div className={`status-text ${station.status}`}>{station.status}</div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
