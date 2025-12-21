import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Users, Shield, UserCog, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { UserRole } from "@shared/schema";

interface StaffMember {
  id: string;
  telegramId: string;
  name: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Супер-админ",
  OWNER: "Владелец",
  ADMIN: "Администратор",
  INSTRUCTOR: "Инструктор",
  GUEST: "Гость",
};

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  SUPER_ADMIN: "destructive",
  OWNER: "default",
  ADMIN: "secondary",
  INSTRUCTOR: "outline",
  GUEST: "outline",
};

const ASSIGNABLE_ROLES = ["OWNER", "ADMIN", "INSTRUCTOR", "GUEST"] as const;

export default function StaffManagementPage() {
  const { user, isSuperAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: staffList, isLoading, error } = useQuery<StaffMember[]>({
    queryKey: ["/api/admin/staff"],
    enabled: isSuperAdmin,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/staff/${userId}/role`, { role });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff"] });
      toast({
        title: "Роль обновлена",
        description: "Права сотрудника изменены",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось обновить роль",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/admin/staff/${userId}/status`, { isActive });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff"] });
      toast({
        title: data.isActive ? "Сотрудник активирован" : "Сотрудник деактивирован",
        description: data.isActive 
          ? "Доступ восстановлен" 
          : "Доступ заблокирован",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось изменить статус",
        variant: "destructive",
      });
    },
  });

  if (!isSuperAdmin) {
    return (
      <>
        <Header title="Доступ запрещён" showBack />
        <PageContainer>
          <Card>
            <CardContent className="py-8 text-center">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Эта страница доступна только для супер-администратора
              </p>
              <Button
                className="mt-4"
                onClick={() => setLocation("/")}
                data-testid="button-go-home"
              >
                На главную
              </Button>
            </CardContent>
          </Card>
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <Header title="Управление сотрудниками" showBack />
      <PageContainer>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Сотрудники
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-muted-foreground">
                Ошибка загрузки списка сотрудников
              </div>
            ) : !staffList || staffList.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Сотрудники не найдены
              </div>
            ) : (
              <div className="space-y-4">
                {staffList.map((staff) => (
                  <div
                    key={staff.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      !staff.isActive ? "opacity-60 bg-muted/30" : ""
                    }`}
                    data-testid={`staff-item-${staff.id}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        {staff.role === "SUPER_ADMIN" ? (
                          <Shield className="h-8 w-8 text-destructive" />
                        ) : staff.role === "OWNER" ? (
                          <UserCog className="h-8 w-8 text-primary" />
                        ) : (
                          <User className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate" data-testid={`text-staff-name-${staff.id}`}>
                          {staff.name}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {staff.phone || `TG: ${staff.telegramId}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {staff.role === "SUPER_ADMIN" ? (
                        <Badge variant={ROLE_VARIANTS[staff.role]}>
                          {ROLE_LABELS[staff.role]}
                        </Badge>
                      ) : (
                        <Select
                          value={staff.role}
                          onValueChange={(role) => {
                            updateRoleMutation.mutate({ userId: staff.id, role });
                          }}
                          disabled={updateRoleMutation.isPending || staff.id === user?.id}
                        >
                          <SelectTrigger 
                            className="w-[140px]"
                            data-testid={`select-role-${staff.id}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ASSIGNABLE_ROLES.map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {staff.role !== "SUPER_ADMIN" && staff.id !== user?.id && (
                        <Switch
                          checked={staff.isActive}
                          onCheckedChange={(isActive) => {
                            updateStatusMutation.mutate({ userId: staff.id, isActive });
                          }}
                          disabled={updateStatusMutation.isPending}
                          data-testid={`switch-status-${staff.id}`}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Описание ролей</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p><strong>Владелец:</strong> Полный доступ ко всем функциям, аналитике и истории</p>
            <p><strong>Администратор:</strong> Управление текущей сменой, бронированиями дня, без истории</p>
            <p><strong>Инструктор:</strong> Только управление сеансами квадроциклов</p>
            <p><strong>Гость:</strong> Только бронирование через клиентский интерфейс</p>
          </CardContent>
        </Card>
      </PageContainer>
    </>
  );
}
