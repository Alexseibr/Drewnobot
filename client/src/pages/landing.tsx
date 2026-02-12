import { useLocation } from "wouter";
import { Bath, Bike, Briefcase, ChevronRight, Droplets, Users, Shield, BarChart3, Bell, UserCog } from "lucide-react";
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
          <div className="text-center py-12 relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-transparent to-primary/5 border border-primary/10">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
            <div className="inline-flex items-center justify-center rounded-2xl overflow-hidden mb-6 shadow-xl ring-4 ring-background p-1 bg-background">
              <img 
                src={drewnoLogo} 
                alt="Village Drewno" 
                className="h-28 w-28 object-cover rounded-xl"
                data-testid="img-hero-logo"
              />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight mb-3 text-foreground" data-testid="text-hero-title">
              Village Drewno
            </h1>
            <p className="text-lg text-muted-foreground max-w-sm mx-auto leading-relaxed px-4" data-testid="text-hero-description">
              Загородный комплекс, где природа встречается с комфортом. Отдыхайте красиво.
            </p>
            
            {user && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <Badge variant={user.role === "SUPER_ADMIN" ? "destructive" : "secondary"} className="px-3 py-1 text-xs font-medium uppercase tracking-wider">
                  {ROLE_LABELS[user.role] || user.role}: {user.name}
                </Badge>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card 
              className="hover-elevate cursor-pointer border-none bg-gradient-to-br from-card to-muted/30 shadow-sm"
              onClick={() => handleGuestAction("spa")}
              data-testid="card-book-spa"
            >
              <CardContent className="p-6">
                <div className="flex flex-col gap-4">
                  <div className="rounded-2xl bg-primary text-primary-foreground p-4 w-fit shadow-lg shadow-primary/20">
                    <Droplets className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold">СПА-комплекс</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Баня, терраса и горячая купель. Идеальное восстановление сил.
                    </p>
                  </div>
                  <div className="flex items-center text-primary font-medium text-sm pt-2">
                    Забронировать <ChevronRight className="h-4 w-4 ml-1" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card 
              className="hover-elevate cursor-pointer border-none bg-gradient-to-br from-card to-muted/30 shadow-sm"
              onClick={() => handleGuestAction("quads")}
              data-testid="card-book-quads"
            >
              <CardContent className="p-6">
                <div className="flex flex-col gap-4">
                  <div className="rounded-2xl bg-status-confirmed text-primary-foreground p-4 w-fit shadow-lg shadow-status-confirmed/20">
                    <Bike className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold">Квадроциклы</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Лесные маршруты и драйв под присмотром инструктора.
                    </p>
                  </div>
                  <div className="flex items-center text-status-confirmed font-medium text-sm pt-2">
                    Выбрать маршрут <ChevronRight className="h-4 w-4 ml-1" />
                  </div>
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

              {hasRole("OWNER", "SUPER_ADMIN") && (
                <Card 
                  className="hover-elevate cursor-pointer"
                  onClick={() => setLocation("/owner/staff-settings")}
                  data-testid="card-staff-settings"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <div className="rounded-full bg-status-confirmed/10 p-3">
                        <UserCog className="h-6 w-6 text-status-confirmed" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">Настройки персонала</h3>
                        <p className="text-sm text-muted-foreground">
                          Управление уборщиками и ставками
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
