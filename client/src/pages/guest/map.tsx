import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { Icon, LatLngTuple } from "leaflet";
import { ArrowLeft, Home, Bath, Bike, Sparkles, MapPin } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import "leaflet/dist/leaflet.css";

const VILLAGE_CENTER: LatLngTuple = [51.87728, 24.0249];

const cottageIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/128/25/25694.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const bathIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/128/3137/3137807.png",
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

const quadIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/128/2829/2829964.png",
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

const spaIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/128/1004/1004783.png",
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

interface MapLocation {
  id: string;
  name: string;
  nameRu: string;
  type: "cottage" | "bath" | "quad" | "spa" | "reception";
  position: LatLngTuple;
  description: string;
  icon: Icon;
}

const locations: MapLocation[] = [
  {
    id: "cottage-1",
    name: "Cottage 1",
    nameRu: "Домик 1",
    type: "cottage",
    position: [51.87750, 24.0240],
    description: "Уютный домик на 4 человека",
    icon: cottageIcon,
  },
  {
    id: "cottage-2",
    name: "Cottage 2",
    nameRu: "Домик 2",
    type: "cottage",
    position: [51.87760, 24.0255],
    description: "Домик на 6 человек с террасой",
    icon: cottageIcon,
  },
  {
    id: "cottage-3",
    name: "Cottage 3",
    nameRu: "Домик 3",
    type: "cottage",
    position: [51.87720, 24.0260],
    description: "Премиум домик с камином",
    icon: cottageIcon,
  },
  {
    id: "cottage-4",
    name: "Cottage 4",
    nameRu: "Домик 4",
    type: "cottage",
    position: [51.87700, 24.0245],
    description: "Семейный домик на 8 человек",
    icon: cottageIcon,
  },
  {
    id: "bath-1",
    name: "Bath 1",
    nameRu: "Баня 1",
    type: "bath",
    position: [51.87735, 24.0235],
    description: "Русская баня на дровах",
    icon: bathIcon,
  },
  {
    id: "bath-2",
    name: "Bath 2",
    nameRu: "Баня 2",
    type: "bath",
    position: [51.87715, 24.0230],
    description: "Финская сауна",
    icon: bathIcon,
  },
  {
    id: "quad-station",
    name: "Quad Station",
    nameRu: "Квадроциклы",
    type: "quad",
    position: [51.87680, 24.0265],
    description: "Прокат квадроциклов, 4 машины",
    icon: quadIcon,
  },
  {
    id: "spa",
    name: "Hot Tub",
    nameRu: "Горячая купель",
    type: "spa",
    position: [51.87745, 24.0250],
    description: "Горячая купель под открытым небом",
    icon: spaIcon,
  },
];

const typeColors: Record<string, string> = {
  cottage: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  bath: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  quad: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  spa: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

const typeLabels: Record<string, string> = {
  cottage: "Домик",
  bath: "Баня",
  quad: "Квадроциклы",
  spa: "SPA",
};

export default function MapPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-[1000] bg-background border-b p-4">
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Карта территории
            </h1>
            <p className="text-sm text-muted-foreground">Village Drewno</p>
          </div>
        </div>
      </header>

      <div className="flex-1 relative" style={{ minHeight: "400px" }}>
        <MapContainer
          center={VILLAGE_CENTER}
          zoom={17}
          style={{ height: "100%", width: "100%", minHeight: "400px" }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {locations.map((location) => (
            <Marker
              key={location.id}
              position={location.position}
              icon={location.icon}
            >
              <Popup>
                <div className="p-1">
                  <div className="font-semibold text-sm">{location.nameRu}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {location.description}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <Card className="m-4 mt-0 rounded-t-none border-t-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Легенда</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-green-600" />
              <span className="text-sm">Домики (4)</span>
            </div>
            <div className="flex items-center gap-2">
              <Bath className="h-4 w-4 text-orange-600" />
              <span className="text-sm">Бани (2)</span>
            </div>
            <div className="flex items-center gap-2">
              <Bike className="h-4 w-4 text-blue-600" />
              <span className="text-sm">Квадроциклы</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <span className="text-sm">Горячая купель</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="p-4 pt-0 space-y-2">
        {locations.map((location) => (
          <div
            key={location.id}
            className="flex items-center justify-between p-3 border rounded-md"
            data-testid={`location-${location.id}`}
          >
            <div className="flex items-center gap-3">
              {location.type === "cottage" && <Home className="h-5 w-5 text-green-600" />}
              {location.type === "bath" && <Bath className="h-5 w-5 text-orange-600" />}
              {location.type === "quad" && <Bike className="h-5 w-5 text-blue-600" />}
              {location.type === "spa" && <Sparkles className="h-5 w-5 text-purple-600" />}
              <div>
                <div className="font-medium text-sm">{location.nameRu}</div>
                <div className="text-xs text-muted-foreground">{location.description}</div>
              </div>
            </div>
            <Badge className={typeColors[location.type]}>
              {typeLabels[location.type]}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
