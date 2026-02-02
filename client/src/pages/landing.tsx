import { useLocation } from "wouter";
import { Bath, Bike, Briefcase, ChevronRight, Droplets, Users, Shield, BarChart3, Bell } from "lucide-react";
import { Header } from "@/components/layout/header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import drewnoLogo from "@assets/drewno-logo.webp";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Супер-админ",
  OWNER: "Владелец",
  ADMIN: "Администратор",
  INSTRUCTOR: "Инструктор",
  GUEST: "Гость",
};

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const { user, isStaff, isSuperAdmin, isLoading, hasRole } = useAuth();

  const handleGuestAction = (type: "bath" | "quads" | "spa") => {
    setLocation(`/guest/${type}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Village Drewno" />
      
      <PageContainer>
        <div className="space-y-8">
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center rounded-lg overflow-hidden mb-4">
              <img 
                src={drewnoLogo} 
                alt="Village Drewno" 
                className="h-24 w-24 object-cover"
                data-testid="img-hero-logo"
              />
            </div>
            <h1 className="text-3xl font-bold mb-2" data-testid="text-hero-title">
              Village Drewno
            </h1>
            <p className="text-muted-foreground max-w-sm mx-auto" data-testid="text-hero-description">
              Загородный комплекс. Аренда домиков. СПА. Горячая купель. Лучшее место, чтобы отдохнуть в гармонии с природой.
            </p>
            
            {user && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <span className="text-sm text-muted-foreground">Вы вошли как</span>
                <Badge variant={user.role === "SUPER_ADMIN" ? "destructive" : "secondary"}>
                  {user.name} ({ROLE_LABELS[user.role] || user.role})
                </Badge>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Забронировать</h2>
            
            <Card 
              className="hover-elevate cursor-pointer"
              onClick={() => handleGuestAction("spa")}
              data-testid="card-book-spa"
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="rounded-full bg-primary/10 p-3">
                    <Droplets className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">СПА-комплекс</h3>
                    <p className="text-sm text-muted-foreground">
                      СПА, терраса, купель - отдых на любой вкус
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card 
              className="hover-elevate cursor-pointer"
              onClick={() => handleGuestAction("quads")}
              data-testid="card-book-quads"
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="rounded-full bg-status-confirmed/10 p-3">
                    <Bike className="h-6 w-6 text-status-confirmed" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Квадроциклы</h3>
                    <p className="text-sm text-muted-foreground">
                      Захватывающее приключение с нашим инструктором
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

          </div>

          {isStaff && (
            <div className="pt-8 border-t space-y-4">
              <h2 className="text-lg font-semibold">Панель управления</h2>
              
              {hasRole("ADMIN", "OWNER", "SUPER_ADMIN") && (
                <Card 
                  className="hover-elevate cursor-pointer"
                  onClick={() => setLocation("/ops")}
                  data-testid="card-ops"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <div className="rounded-full bg-primary/10 p-3">
                        <Briefcase className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">Операционная панель</h3>
                        <p className="text-sm text-muted-foreground">
                          Управление бронями, кассой и задачами
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              )}

              {hasRole("INSTRUCTOR") && (
                <Card 
                  className="hover-elevate cursor-pointer"
                  onClick={() => setLocation("/instructor")}
                  data-testid="card-instructor"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <div className="rounded-full bg-status-confirmed/10 p-3">
                        <Bike className="h-6 w-6 text-status-confirmed" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">Расписание инструктора</h3>
                        <p className="text-sm text-muted-foreground">
                          Управление сеансами квадроциклов
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              )}

              {hasRole("OWNER", "SUPER_ADMIN") && (
                <Card 
                  className="hover-elevate cursor-pointer"
                  onClick={() => setLocation("/owner/analytics")}
                  data-testid="card-analytics"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <div className="rounded-full bg-status-awaiting/10 p-3">
                        <BarChart3 className="h-6 w-6 text-status-awaiting" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">Аналитика</h3>
                        <p className="text-sm text-muted-foreground">
                          Статистика и отчёты
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              )}

              {isSuperAdmin && (
                <Card 
                  className="hover-elevate cursor-pointer"
                  onClick={() => setLocation("/admin/staff")}
                  data-testid="card-staff-management"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <div className="rounded-full bg-destructive/10 p-3">
                        <Shield className="h-6 w-6 text-destructive" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">Управление сотрудниками</h3>
                        <p className="text-sm text-muted-foreground">
                          Назначение ролей и прав доступа
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              )}

              {isSuperAdmin && (
                <Card 
                  className="hover-elevate cursor-pointer"
                  onClick={() => setLocation("/owner/notifications")}
                  data-testid="card-notifications"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <div className="rounded-full bg-primary/10 p-3">
                        <Bell className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">Управление уведомлениями</h3>
                        <p className="text-sm text-muted-foreground">
                          Настройка расписания и типов уведомлений
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </PageContainer>
    </div>
  );
}
