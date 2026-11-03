import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { Station } from "../types";

const icons = {
  available: "#20865b",
  occupied: "#e5a436",
  offline: "#d85d54",
  unknown: "#8a9189",
};

function stationIcon(status: Station["status"], selected = false) {
  return L.divIcon({
    className: `station-marker${selected ? " station-marker-selected" : ""}`,
    html: `<span style="--marker-color:${icons[status]}"></span>`,
    iconSize: [26, 34],
    iconAnchor: [13, 30],
  });
}

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    const zoom = map.getZoom();
    const reduceMotion = map.getContainer().ownerDocument.defaultView
      ?.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      map.setView(center, zoom);
    } else {
      map.flyTo(center, zoom, { duration: 0.45 });
    }
  }, [center[0], center[1], map]);
  return null;
}

function FocusStation({ station }: { station: Station | null }) {
  const map = useMap();
  useEffect(() => {
    if (station) {
      const position: [number, number] = [station.latitude, station.longitude];
      const zoom = Math.max(map.getZoom(), 15);
      const reduceMotion = map.getContainer().ownerDocument.defaultView
        ?.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        map.setView(position, zoom);
      } else {
        map.flyTo(position, zoom, { duration: 0.45 });
      }
    }
  }, [map, station?.id, station?.latitude, station?.longitude]);
  return null;
}

function FollowVehicle({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    const reduceMotion = map.getContainer().ownerDocument.defaultView
      ?.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      map.setView(position, Math.max(map.getZoom(), 16));
    } else {
      map.panTo(position, { animate: true, duration: 0.45 });
    }
  }, [map, position[0], position[1]]);
  return null;
}

const vehicleIcon = L.divIcon({
  className: "navigation-vehicle-marker",
  html: '<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11.5 6.7 6.8A2 2 0 0 1 8.6 5.5h6.8a2 2 0 0 1 1.9 1.3l1.7 4.7a2 2 0 0 1 1.5 1.9v4.1a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6.5v1a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-4.1A2 2 0 0 1 5 11.5Zm2.1-.1h9.8l-1.1-3.1a.5.5 0 0 0-.5-.3H8.7a.5.5 0 0 0-.5.3l-1.1 3.1ZM7 14.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm10 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/></svg></span>',
  iconSize: [42, 42],
  iconAnchor: [21, 21],
});

export default function StationMap({
  stations,
  center,
  selectedStationId,
  selectedStation,
  onSelectStation,
  navigation,
}: {
  stations: Station[];
  center: [number, number];
  selectedStationId: string | null;
  selectedStation: Station | null;
  onSelectStation: (id: string | null) => void;
  navigation?: {
    position: { latitude: number; longitude: number };
    geometry: Array<{ latitude: number; longitude: number }>;
  } | null;
}) {
  const markerIcons = useMemo(() => ({
    available: stationIcon("available", false),
    occupied: stationIcon("occupied", false),
    offline: stationIcon("offline", false),
    unknown: stationIcon("unknown", false),
  }), []);
  const selectedIcons = useMemo(() => ({
    available: stationIcon("available", true),
    occupied: stationIcon("occupied", true),
    offline: stationIcon("offline", true),
    unknown: stationIcon("unknown", true),
  }), []);

  return (
    <MapContainer center={navigation ? [navigation.position.latitude, navigation.position.longitude] : center} zoom={navigation ? 16 : 12} scrollWheelZoom className="station-map">
      {!navigation && <Recenter center={center} />}
      {!navigation && <FocusStation station={selectedStation} />}
      {navigation && <>
        <FollowVehicle position={[navigation.position.latitude, navigation.position.longitude]} />
        <Polyline
          positions={navigation.geometry.map(({ latitude, longitude }) => [latitude, longitude] as [number, number])}
          pathOptions={{ color: "#23885d", weight: 7, opacity: 0.82 }}
        />
        <Marker position={[navigation.position.latitude, navigation.position.longitude]} icon={vehicleIcon} zIndexOffset={1000} />
      </>}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {stations.map((station) => (
        <Marker
          key={station.id}
          position={[station.latitude, station.longitude]}
          icon={station.id === selectedStationId ? selectedIcons[station.status] : markerIcons[station.status]}
          eventHandlers={{ click: () => onSelectStation(station.id) }}
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
