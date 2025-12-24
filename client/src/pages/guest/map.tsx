import { useState } from "react";
import { useLocation } from "wouter";
import { Header } from "@/components/layout/header";
import { PageContainer } from "@/components/layout/page-container";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Home, 
  Droplets, 
  Bike, 
  TreePine, 
  Flame,
  MapPin,
  X,
  ChevronRight
} from "lucide-react";

interface MapLocation {
  id: string;
  name: string;
  type: "cottage" | "spa" | "quad" | "nature";
  description: string;
  x: number;
  y: number;
  icon: React.ElementType;
  color: string;
  action?: { label: string; path: string };
}

const locations: MapLocation[] = [
  {
    id: "d1",
    name: "Домик 1",
    type: "cottage",
    description: "Уютный домик для 2 гостей. Отопление, санузел, мини-кухня.",
    x: 25,
    y: 35,
    icon: Home,
    color: "hsl(var(--primary))",
  },
  {
    id: "d2",
    name: "Домик 2",
    type: "cottage",
    description: "Комфортабельный домик для 2 гостей с видом на лес.",
    x: 35,
    y: 25,
    icon: Home,
    color: "hsl(var(--primary))",
  },
  {
    id: "d3",
    name: "Домик 3",
    type: "cottage",
    description: "Семейный домик для 2 гостей. Просторная терраса.",
    x: 45,
    y: 40,
    icon: Home,
    color: "hsl(var(--primary))",
  },
  {
    id: "d4",
    name: "Домик 4",
    type: "cottage",
    description: "Большой домик для 3 гостей. Идеален для компании.",
    x: 55,
    y: 30,
    icon: Home,
    color: "hsl(var(--primary))",
  },
  {
    id: "spa",
    name: "СПА-комплекс",
    type: "spa",
    description: "Баня, горячая купель, терраса с мангалом. Расслабление и отдых.",
    x: 70,
    y: 55,
    icon: Droplets,
    color: "hsl(var(--status-confirmed))",
    action: { label: "Забронировать СПА", path: "/guest/spa" },
  },
  {
    id: "quad",
    name: "Квадроциклы",
    type: "quad",
    description: "4 квадроцикла, маршруты 30 и 60 минут. Инструктор в подарок!",
    x: 20,
    y: 65,
    icon: Bike,
    color: "hsl(var(--status-awaiting))",
    action: { label: "Забронировать поездку", path: "/guest/quads" },
  },
  {
    id: "forest",
    name: "Сосновый лес",
    type: "nature",
    description: "Живописные тропы для прогулок. Свежий воздух и тишина.",
    x: 80,
    y: 25,
    icon: TreePine,
    color: "hsl(142 76% 36%)",
  },
  {
    id: "fire",
    name: "Костровая зона",
    type: "nature",
    description: "Место для вечерних посиделок у костра. Дрова предоставляются.",
    x: 50,
    y: 70,
    icon: Flame,
    color: "hsl(25 95% 53%)",
  },
];

export default function MapPage() {
  const [, setLocation] = useLocation();
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(null);

  const handleMarkerClick = (location: MapLocation) => {
    setSelectedLocation(location);
  };

  const handleClose = () => {
    setSelectedLocation(null);
  };

  const handleAction = (path: string) => {
    setLocation(path);
  };

  const getTypeLabel = (type: MapLocation["type"]) => {
    switch (type) {
      case "cottage": return "Проживание";
      case "spa": return "СПА";
      case "quad": return "Активный отдых";
      case "nature": return "Природа";
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Карта комплекса" showBack />
      
      <PageContainer>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2" data-testid="text-map-title">
              Карта Village Drewno
            </h1>
            <p className="text-muted-foreground text-sm">
              Нажмите на метку, чтобы узнать подробнее
            </p>
          </div>

          <Card>
            <CardContent className="p-4">
              <div 
                className="relative w-full aspect-[4/3] bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900/30 dark:to-green-800/30 rounded-lg overflow-hidden"
                data-testid="map-container"
              >
                <svg 
                  viewBox="0 0 100 100" 
                  className="w-full h-full"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <pattern id="forestPattern" patternUnits="userSpaceOnUse" width="10" height="10">
                      <circle cx="5" cy="5" r="3" fill="hsl(142 76% 36% / 0.15)" />
                    </pattern>
                  </defs>
                  
                  <rect width="100" height="100" fill="url(#forestPattern)" />
                  
                  <path 
                    d="M 10 50 Q 30 45, 50 50 T 90 55" 
                    stroke="hsl(var(--muted-foreground) / 0.3)" 
                    strokeWidth="2" 
                    fill="none"
                    strokeDasharray="4 2"
                  />
                  <path 
                    d="M 30 20 Q 40 35, 50 40 T 70 60" 
                    stroke="hsl(var(--muted-foreground) / 0.3)" 
                    strokeWidth="2" 
                    fill="none"
                    strokeDasharray="4 2"
                  />
                </svg>

                {locations.map((loc) => {
                  const Icon = loc.icon;
                  const isSelected = selectedLocation?.id === loc.id;
                  
                  return (
                    <button
                      key={loc.id}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-200"
                      style={{ 
                        left: `${loc.x}%`, 
                        top: `${loc.y}%`,
                        zIndex: isSelected ? 10 : 1
                      }}
                      onClick={() => handleMarkerClick(loc)}
                      data-testid={`marker-${loc.id}`}
                    >
                      <div 
                        className={`
                          flex items-center justify-center rounded-full p-2 shadow-lg
                          transition-transform duration-200
                          ${isSelected ? 'scale-125 ring-2 ring-primary ring-offset-2' : 'hover:scale-110'}
                        `}
                        style={{ backgroundColor: loc.color }}
                      >
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div 
                        className="absolute left-1/2 -translate-x-1/2 top-full mt-1 whitespace-nowrap text-xs font-medium bg-background/90 px-1.5 py-0.5 rounded shadow-sm"
                      >
                        {loc.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2 justify-center">
            <Badge variant="outline" className="gap-1.5">
              <Home className="h-3 w-3" style={{ color: "hsl(var(--primary))" }} />
              <span>Домики</span>
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <Droplets className="h-3 w-3" style={{ color: "hsl(var(--status-confirmed))" }} />
              <span>СПА</span>
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <Bike className="h-3 w-3" style={{ color: "hsl(var(--status-awaiting))" }} />
              <span>Квадро</span>
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <TreePine className="h-3 w-3" style={{ color: "hsl(142 76% 36%)" }} />
              <span>Природа</span>
            </Badge>
          </div>

          {selectedLocation && (
            <Card className="animate-in slide-in-from-bottom-4 duration-300">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div 
                      className="rounded-full p-2.5"
                      style={{ backgroundColor: `${selectedLocation.color}20` }}
                    >
                      <selectedLocation.icon 
                        className="h-5 w-5" 
                        style={{ color: selectedLocation.color }}
                      />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{selectedLocation.name}</CardTitle>
                      <Badge variant="secondary" className="mt-1">
                        {getTypeLabel(selectedLocation.type)}
                      </Badge>
                    </div>
                  </div>
                  <Button 
                    size="icon" 
                    variant="ghost"
                    onClick={handleClose}
                    data-testid="button-close-details"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <p className="text-muted-foreground mb-4" data-testid="text-location-description">
                  {selectedLocation.description}
                </p>
                
                {selectedLocation.action && (
                  <Button 
                    className="w-full"
                    onClick={() => handleAction(selectedLocation.action!.path)}
                    data-testid={`button-action-${selectedLocation.id}`}
                  >
                    {selectedLocation.action.label}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Как добраться
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Village Drewno расположен в живописном месте недалеко от Минска. 
                Координаты для навигатора будут отправлены после подтверждения брони.
              </p>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => window.open("https://drewno.by", "_blank")}
                data-testid="button-website"
              >
                Открыть сайт drewno.by
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
      <BottomNav />
    </div>
  );
}
