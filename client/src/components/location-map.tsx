import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { Icon, LatLngExpression } from "leaflet";
import { Home, Flame, Bike, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import "leaflet/dist/leaflet.css";

const VILLAGE_CENTER: LatLngExpression = [53.9045, 27.5615];

interface LocationMarker {
  id: string;
  name: string;
  description: string;
  position: LatLngExpression;
  type: "cottage" | "spa" | "quads" | "reception";
}

const locations: LocationMarker[] = [
  {
    id: "cottage-1",
    name: "Дом 1",
    description: "Уютный домик на 6 гостей с террасой",
    position: [53.9048, 27.5608],
    type: "cottage",
  },
  {
    id: "cottage-2",
    name: "Дом 2",
    description: "Семейный домик на 8 гостей",
    position: [53.9052, 27.5612],
    type: "cottage",
  },
  {
    id: "cottage-3",
    name: "Дом 3",
    description: "Романтичный домик для двоих",
    position: [53.9046, 27.5620],
    type: "cottage",
  },
  {
    id: "cottage-4",
    name: "Дом 4",
    description: "Большой дом для компании до 10 гостей",
    position: [53.9043, 27.5605],
    type: "cottage",
  },
  {
    id: "spa-1",
    name: "СПА-комплекс 1",
    description: "Баня с купелью и террасой",
    position: [53.9040, 27.5618],
    type: "spa",
  },
  {
    id: "spa-2",
    name: "СПА-комплекс 2",
    description: "Баня с горячей купелью",
    position: [53.9038, 27.5625],
    type: "spa",
  },
  {
    id: "quads",
    name: "Прокат квадроциклов",
    description: "Старт маршрутов и инструктаж",
    position: [53.9055, 27.5622],
    type: "quads",
  },
  {
    id: "reception",
    name: "Ресепшн",
    description: "Регистрация и информация",
    position: [53.9045, 27.5615],
    type: "reception",
  },
];

const getMarkerColor = (type: LocationMarker["type"]): string => {
  switch (type) {
    case "cottage":
      return "#22c55e";
    case "spa":
      return "#f97316";
    case "quads":
      return "#3b82f6";
    case "reception":
      return "#8b5cf6";
    default:
      return "#6b7280";
  }
};

const createCustomIcon = (type: LocationMarker["type"]) => {
  const color = getMarkerColor(type);
  const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
      <path fill="${color}" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      <circle fill="white" cx="12" cy="9" r="3"/>
    </svg>
  `;
  return new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svgIcon)}`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

const getTypeLabel = (type: LocationMarker["type"]): string => {
  switch (type) {
    case "cottage":
      return "Домик";
    case "spa":
      return "СПА";
    case "quads":
      return "Квадроциклы";
    case "reception":
      return "Ресепшн";
    default:
      return "";
  }
};

const getTypeIcon = (type: LocationMarker["type"]) => {
  switch (type) {
    case "cottage":
      return Home;
    case "spa":
      return Flame;
    case "quads":
      return Bike;
    case "reception":
      return MapPin;
    default:
      return MapPin;
  }
};

function FitBounds() {
  const map = useMap();
  
  useEffect(() => {
    const bounds = locations.map(loc => loc.position as [number, number]);
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [map]);
  
  return null;
}

interface LocationMapProps extends React.HTMLAttributes<HTMLDivElement> {
  onLocationClick?: (location: LocationMarker) => void;
}

export function LocationMap({ onLocationClick, className, ...rest }: LocationMapProps) {
  const [selectedType, setSelectedType] = useState<LocationMarker["type"] | "all">("all");
  
  const filteredLocations = selectedType === "all" 
    ? locations 
    : locations.filter(loc => loc.type === selectedType);

  const filterButtons: { type: LocationMarker["type"] | "all"; label: string; icon: typeof MapPin }[] = [
    { type: "all", label: "Все", icon: MapPin },
    { type: "cottage", label: "Домики", icon: Home },
    { type: "spa", label: "СПА", icon: Flame },
    { type: "quads", label: "Квадро", icon: Bike },
    { type: "reception", label: "Ресепшн", icon: MapPin },
  ];

  return (
    <Card className={className} {...rest}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="h-5 w-5 text-primary" />
          Карта комплекса
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {filterButtons.map(({ type, label, icon: IconComponent }) => (
            <Button
              key={type}
              variant={selectedType === type ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedType(type)}
              data-testid={`button-filter-${type}`}
            >
              <IconComponent className="h-4 w-4 mr-1" />
              {label}
            </Button>
          ))}
        </div>
        
        <div className="rounded-md overflow-hidden border" style={{ height: "300px" }}>
          <MapContainer
            center={VILLAGE_CENTER}
            zoom={17}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds />
            {filteredLocations.map((location) => {
              const IconComponent = getTypeIcon(location.type);
              return (
                <Marker
                  key={location.id}
                  position={location.position}
                  icon={createCustomIcon(location.type)}
                  eventHandlers={{
                    click: () => onLocationClick?.(location),
                  }}
                >
                  <Popup>
                    <div className="p-1 min-w-[150px]">
                      <div className="flex items-center gap-2 mb-1">
                        <IconComponent 
                          className="h-4 w-4" 
                          style={{ color: getMarkerColor(location.type) }}
                        />
                        <span className="font-semibold text-sm">{location.name}</span>
                      </div>
                      <p className="text-xs text-gray-600 mb-2">{location.description}</p>
                      <Badge 
                        variant="secondary" 
                        className="text-xs"
                        style={{ 
                          backgroundColor: `${getMarkerColor(location.type)}20`,
                          color: getMarkerColor(location.type),
                          borderColor: getMarkerColor(location.type)
                        }}
                      >
                        {getTypeLabel(location.type)}
                      </Badge>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getMarkerColor("cottage") }} />
            <span className="text-muted-foreground">Домики (4)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getMarkerColor("spa") }} />
            <span className="text-muted-foreground">СПА (2)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getMarkerColor("quads") }} />
            <span className="text-muted-foreground">Квадроциклы</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getMarkerColor("reception") }} />
            <span className="text-muted-foreground">Ресепшн</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
