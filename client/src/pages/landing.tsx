import { useState } from "react";
import { useLocation } from "wouter";
import { TreePine, Bath, Bike, Briefcase, Users, ChevronRight } from "lucide-react";
import { Header } from "@/components/layout/header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import type { UserRole } from "@shared/schema";

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const { setUser } = useAuth();
  const [showStaffLogin, setShowStaffLogin] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState<UserRole>("ADMIN");

  const handleGuestAction = (type: "bath" | "quads") => {
    setLocation(`/guest/${type}`);
  };

  const handleStaffLogin = () => {
    if (staffName.trim()) {
      setUser({
        id: `demo-${Date.now()}`,
        telegramId: `demo-${Date.now()}`,
        name: staffName,
        role: staffRole,
        isActive: true,
      });
      setShowStaffLogin(false);
      
      if (staffRole === "INSTRUCTOR") {
        setLocation("/instructor");
      } else {
        setLocation("/ops");
      }
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Дрэўна" />
      
      <PageContainer>
        <div className="space-y-8">
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center rounded-full bg-primary/10 p-4 mb-4">
              <TreePine className="h-12 w-12 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-2" data-testid="text-hero-title">
              Усадьба Дрэўна
            </h1>
            <p className="text-muted-foreground max-w-sm mx-auto" data-testid="text-hero-description">
              Добро пожаловать в наш уютный лесной курорт. Забронируйте расслабляющую баню или захватывающую поездку на квадроциклах.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Забронировать</h2>
            
            <Card 
              className="hover-elevate cursor-pointer"
              onClick={() => handleGuestAction("bath")}
              data-testid="card-book-bath"
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="rounded-full bg-status-awaiting/10 p-3">
                    <Bath className="h-6 w-6 text-status-awaiting" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Русская баня</h3>
                    <p className="text-sm text-muted-foreground">
                      Традиционная парная с возможностью заказа купели
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

          <div className="pt-8 border-t">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowStaffLogin(true)}
              data-testid="button-staff-login"
            >
              <Briefcase className="mr-2 h-4 w-4" />
              Вход для сотрудников
            </Button>
          </div>
        </div>
      </PageContainer>

      <Dialog open={showStaffLogin} onOpenChange={setShowStaffLogin}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Вход для сотрудников</DialogTitle>
            <DialogDescription>
              Введите ваше имя и роль для доступа к панели управления.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Имя</Label>
              <Input
                id="name"
                placeholder="Ваше имя"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                data-testid="input-staff-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Роль</Label>
              <Select value={staffRole} onValueChange={(v) => setStaffRole(v as UserRole)}>
                <SelectTrigger data-testid="select-staff-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWNER">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Владелец
                    </div>
                  </SelectItem>
                  <SelectItem value="ADMIN">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      Администратор
                    </div>
                  </SelectItem>
                  <SelectItem value="INSTRUCTOR">
                    <div className="flex items-center gap-2">
                      <Bike className="h-4 w-4" />
                      Инструктор
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowStaffLogin(false)}
            >
              Отмена
            </Button>
            <Button
              onClick={handleStaffLogin}
              disabled={!staffName.trim()}
              data-testid="button-login-submit"
            >
              Войти
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
