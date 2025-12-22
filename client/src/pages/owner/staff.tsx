import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  UserPlus,
  Trash2,
  Users,
  Shield,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import type { StaffAuthorization, UserRole } from "@shared/schema";

const roleLabels: Record<string, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  INSTRUCTOR: "Инструктор",
};

const roleColors: Record<string, string> = {
  OWNER: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  ADMIN: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  INSTRUCTOR: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

export default function OwnerStaffPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newTelegramId, setNewTelegramId] = useState("");
  const [newRole, setNewRole] = useState<string>("");
  const [newNote, setNewNote] = useState("");

  // Role-based access check - only OWNER and SUPER_ADMIN can access
  const hasAccess = user?.role === "OWNER" || user?.role === "SUPER_ADMIN";

  const { data: authorizations = [], isLoading, isError, error } = useQuery<StaffAuthorization[]>({
    queryKey: ["/api/admin/authorizations"],
    enabled: hasAccess, // Only fetch if user has access
  });

  // Redirect if user doesn't have access
  if (!hasAccess && user) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header title="Доступ запрещен" />
        <PageContainer>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">У вас нет доступа к этой странице</p>
                <p className="text-sm mt-2">Только владельцы могут управлять персоналом</p>
                <Button 
                  variant="outline" 
                  className="mt-4" 
                  onClick={() => navigate("/")}
                  data-testid="button-go-home"
                >
                  Вернуться на главную
                </Button>
              </div>
            </CardContent>
          </Card>
        </PageContainer>
        <BottomNav />
      </div>
    );
  }

  // Handle API errors (including 403)
  if (isError) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header title="Ошибка" />
        <PageContainer>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8 text-muted-foreground">
                <XCircle className="h-12 w-12 mx-auto mb-3 opacity-50 text-destructive" />
                <p className="font-medium">Не удалось загрузить данные</p>
                <p className="text-sm mt-2">{(error as any)?.message || "Попробуйте обновить страницу"}</p>
                <Button 
                  variant="outline" 
                  className="mt-4" 
                  onClick={() => window.location.reload()}
                  data-testid="button-retry"
                >
                  Обновить страницу
                </Button>
              </div>
            </CardContent>
          </Card>
        </PageContainer>
        <BottomNav />
      </div>
    );
  }

  const createMutation = useMutation({
    mutationFn: async (data: { telegramId: string; role: string; note?: string }) => {
      return apiRequest("POST", "/api/admin/authorizations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/authorizations"] });
      setIsAddDialogOpen(false);
      setNewTelegramId("");
      setNewRole("");
      setNewNote("");
      toast({
        title: "Авторизация создана",
        description: "Сотрудник сможет получить указанную роль при входе.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось создать авторизацию",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/authorizations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/authorizations"] });
      toast({
        title: "Авторизация удалена",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить авторизацию",
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    if (!newTelegramId.trim() || !newRole) {
      toast({
        title: "Заполните все поля",
        description: "Telegram ID и роль обязательны",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({
      telegramId: newTelegramId.trim(),
      role: newRole,
      note: newNote.trim() || undefined,
    });
  };

  const activeAuthorizations = authorizations.filter(a => a.isActive);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Управление персоналом" />
      
      <PageContainer>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-5 w-5" />
                    Авторизации сотрудников
                  </CardTitle>
                  <CardDescription>
                    Добавьте Telegram ID сотрудников для автоматического назначения ролей
                  </CardDescription>
                </div>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-add-authorization">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Добавить
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Новая авторизация</DialogTitle>
                      <DialogDescription>
                        Укажите Telegram ID сотрудника. При входе через бота роль будет назначена автоматически.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="telegramId">Telegram ID</Label>
                        <Input
                          id="telegramId"
                          placeholder="123456789"
                          value={newTelegramId}
                          onChange={(e) => setNewTelegramId(e.target.value)}
                          data-testid="input-telegram-id"
                        />
                        <p className="text-xs text-muted-foreground">
                          Сотрудник может узнать свой ID через @userinfobot
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="role">Роль</Label>
                        <Select value={newRole} onValueChange={setNewRole}>
                          <SelectTrigger data-testid="select-role">
                            <SelectValue placeholder="Выберите роль" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="OWNER">Владелец</SelectItem>
                            <SelectItem value="ADMIN">Администратор</SelectItem>
                            <SelectItem value="INSTRUCTOR">Инструктор</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="note">Заметка (опционально)</Label>
                        <Input
                          id="note"
                          placeholder="Имя сотрудника или комментарий"
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          data-testid="input-note"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsAddDialogOpen(false)}
                        data-testid="button-cancel"
                      >
                        Отмена
                      </Button>
                      <Button
                        onClick={handleCreate}
                        disabled={createMutation.isPending}
                        data-testid="button-confirm-create"
                      >
                        {createMutation.isPending && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Создать
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : activeAuthorizations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Нет активных авторизаций</p>
                  <p className="text-sm">Добавьте Telegram ID сотрудников</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeAuthorizations.map((auth) => (
                    <div
                      key={auth.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-md border"
                      data-testid={`card-authorization-${auth.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                            {auth.telegramId}
                          </code>
                          <Badge 
                            variant="secondary" 
                            className={roleColors[auth.role] || ""}
                          >
                            {roleLabels[auth.role] || auth.role}
                          </Badge>
                        </div>
                        {auth.note && (
                          <p className="text-sm text-muted-foreground mt-1 truncate">
                            {auth.note}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Добавлено: {new Date(auth.createdAt).toLocaleDateString("ru")}
                        </p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            data-testid={`button-delete-${auth.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Удалить авторизацию?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Сотрудник с Telegram ID {auth.telegramId} больше не сможет автоматически получить роль {roleLabels[auth.role]}.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(auth.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Удалить
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Как это работает</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p>Добавьте Telegram ID сотрудника и выберите роль</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p>Когда сотрудник откроет бота, роль будет назначена автоматически</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p>Сотрудник может узнать свой Telegram ID через @userinfobot</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageContainer>

      <BottomNav />
    </div>
  );
}
