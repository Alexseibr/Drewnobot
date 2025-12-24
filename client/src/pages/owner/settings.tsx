import { useState } from "react";
import { 
  Users, 
  Bell, 
  Clock, 
  Building2,
  Bath,
  Bike,
  Thermometer,
  Zap,
  CheckCircle2,
  ChevronRight
} from "lucide-react";
import { Link } from "wouter";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";

export default function OwnerSettingsPage() {
  const { user } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoTasksEnabled, setAutoTasksEnabled] = useState(true);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Настройки" />
      
      <PageContainer>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                Профиль
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Имя</span>
                <span className="font-medium" data-testid="text-user-name">{user?.name || "—"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Роль</span>
                <span className="font-medium" data-testid="text-user-role">
                  {user?.role === "OWNER" ? "Владелец" : 
                   user?.role === "SUPER_ADMIN" ? "Супер-админ" : 
                   user?.role}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bell className="h-5 w-5" />
                Уведомления
              </CardTitle>
              <CardDescription>
                Настройки Telegram-уведомлений
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="notifications" className="flex-1">
                  Получать уведомления о бронированиях
                </Label>
                <Switch
                  id="notifications"
                  checked={notificationsEnabled}
                  onCheckedChange={setNotificationsEnabled}
                  data-testid="switch-notifications"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5" />
                Автоматизация
              </CardTitle>
              <CardDescription>
                Автоматическое создание задач
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-tasks" className="flex-1">
                  Автоматические задачи (климат, уборка)
                </Label>
                <Switch
                  id="auto-tasks"
                  checked={autoTasksEnabled}
                  onCheckedChange={setAutoTasksEnabled}
                  data-testid="switch-auto-tasks"
                />
              </div>
              
              <Link href="/owner/thermostats">
                <div className="flex items-center justify-between p-3 -mx-3 rounded-md hover-elevate cursor-pointer mt-2 border" data-testid="link-thermostats">
                  <div className="flex items-center gap-2">
                    <Thermometer className="h-5 w-5 text-orange-500" />
                    <div>
                      <span className="font-medium">Умные термостаты</span>
                      <p className="text-xs text-muted-foreground">Управление температурой в домиках</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
              
              <Link href="/owner/utilities">
                <div className="flex items-center justify-between p-3 -mx-3 rounded-md hover-elevate cursor-pointer mt-2 border" data-testid="link-utilities">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-500" />
                    <div>
                      <span className="font-medium">Коммунальные</span>
                      <p className="text-xs text-muted-foreground">Учёт электроэнергии</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
              
              <Link href="/owner/completed-tasks">
                <div className="flex items-center justify-between p-3 -mx-3 rounded-md hover-elevate cursor-pointer mt-2 border" data-testid="link-completed-tasks">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <div>
                      <span className="font-medium">Выполненные задачи</span>
                      <p className="text-xs text-muted-foreground">История работы персонала</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5" />
                Объекты
              </CardTitle>
              <CardDescription>
                Управление домиками и банями
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Домики</span>
                </div>
                <span className="font-medium">4 шт.</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Bath className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Бани</span>
                </div>
                <span className="font-medium">2 шт.</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Bike className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Квадроциклы</span>
                </div>
                <span className="font-medium">4 шт.</span>
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-xs text-muted-foreground pt-4">
            Village Drewno v1.0
          </div>
        </div>
      </PageContainer>
      
      <BottomNav />
    </div>
  );
}
