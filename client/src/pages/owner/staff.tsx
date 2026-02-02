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
  UserCog,
  Crown,
  Wrench,
  User,
  Edit,
  UserX,
  UserCheck,
} from "lucide-react";
import { Header } from "@/components/layout/header";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import type { StaffAuthorization, UserRole } from "@shared/schema";

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Супер-админ",
  OWNER: "Владелец",
  ADMIN: "Администратор",
  INSTRUCTOR: "Инструктор",
  GUEST: "Гость",
};

const roleColors: Record<string, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  OWNER: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  ADMIN: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  INSTRUCTOR: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  GUEST: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
};

const roleIcons: Record<string, typeof Crown> = {
  SUPER_ADMIN: Shield,
  OWNER: Crown,
  ADMIN: UserCog,
  INSTRUCTOR: Wrench,
  GUEST: User,
};

interface StaffMember {
  id: string;
  telegramId: string | null;
  name: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

interface GuestMember {
  id: string;
  telegramId: string | null;
  name: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

interface UsersData {
  totalUsers: number;
  guestCount: number;
  staffCount: number;
  staff: StaffMember[];
  guests: GuestMember[];
}

export default function OwnerStaffPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newTelegramId, setNewTelegramId] = useState("");
  const [newRole, setNewRole] = useState<string>("");
  const [newNote, setNewNote] = useState("");
  const [editingUser, setEditingUser] = useState<StaffMember | null>(null);
  const [editRole, setEditRole] = useState<string>("");
  const [activeTab, setActiveTab] = useState("staff");

  const hasAccess = user?.role === "OWNER" || user?.role === "SUPER_ADMIN";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const { data: authorizations = [], isLoading: authLoading } = useQuery<StaffAuthorization[]>({
    queryKey: ["/api/admin/authorizations"],
    enabled: hasAccess,
  });

  const { data: usersData, isLoading: usersLoading } = useQuery<UsersData>({
    queryKey: ["/api/admin/users"],
    enabled: isSuperAdmin,
  });

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
      toast({ title: "Авторизация удалена" });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить авторизацию",
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      return apiRequest("PATCH", `/api/admin/staff/${id}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingUser(null);
      toast({ title: "Роль обновлена" });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось обновить роль",
        variant: "destructive",
      });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/admin/staff/${id}/status`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Статус обновлен" });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось обновить статус",
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

  const handleEditRole = () => {
    if (!editingUser || !editRole) return;
    updateRoleMutation.mutate({ id: editingUser.id, role: editRole });
  };

  const activeAuthorizations = authorizations.filter(a => a.isActive);
  const isLoading = authLoading || usersLoading;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Управление персоналом" />
      
      <PageContainer>
        <div className="space-y-4">
          {isSuperAdmin && usersData && (
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <Users className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-2xl font-bold">{usersData.totalUsers}</p>
                  <p className="text-xs text-muted-foreground">Всего</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <UserCog className="h-6 w-6 mx-auto mb-1 text-blue-500" />
                  <p className="text-2xl font-bold">{usersData.staffCount}</p>
                  <p className="text-xs text-muted-foreground">Сотрудники</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <User className="h-6 w-6 mx-auto mb-1 text-gray-500" />
                  <p className="text-2xl font-bold">{usersData.guestCount}</p>
                  <p className="text-xs text-muted-foreground">Гости</p>
                </CardContent>
              </Card>
            </div>
          )}

          {isSuperAdmin ? (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="staff" data-testid="tab-staff">
                  Сотрудники
                </TabsTrigger>
                <TabsTrigger value="guests" data-testid="tab-guests">
                  Гости
                </TabsTrigger>
                <TabsTrigger value="authorizations" data-testid="tab-authorizations">
                  Авторизации
                </TabsTrigger>
              </TabsList>

              <TabsContent value="staff" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <UserCog className="h-5 w-5" />
                      Сотрудники ({usersData?.staff.length || 0})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {usersLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : !usersData?.staff.length ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <UserCog className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>Нет сотрудников</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {usersData.staff.map((member) => {
                          const RoleIcon = roleIcons[member.role] || User;
                          return (
                            <div
                              key={member.id}
                              className={`flex items-center justify-between gap-3 p-3 rounded-md border ${!member.isActive ? "opacity-50" : ""}`}
                              data-testid={`card-staff-${member.id}`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <RoleIcon className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium truncate">{member.name}</span>
                                  <Badge 
                                    variant="secondary" 
                                    className={roleColors[member.role] || ""}
                                  >
                                    {roleLabels[member.role] || member.role}
                                  </Badge>
                                  {!member.isActive && (
                                    <Badge variant="outline" className="text-red-500 border-red-500">
                                      Деактивирован
                                    </Badge>
                                  )}
                                </div>
                                {member.telegramId && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Telegram ID: {member.telegramId}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => {
                                        setEditingUser(member);
                                        setEditRole(member.role);
                                      }}
                                      data-testid={`button-edit-${member.id}`}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Изменить роль</DialogTitle>
                                      <DialogDescription>
                                        {member.name}
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4">
                                      <Label>Новая роль</Label>
                                      <Select value={editRole} onValueChange={setEditRole}>
                                        <SelectTrigger className="mt-2">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="OWNER">Владелец</SelectItem>
                                          <SelectItem value="ADMIN">Администратор</SelectItem>
                                          <SelectItem value="INSTRUCTOR">Инструктор</SelectItem>
                                          <SelectItem value="GUEST">Гость</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <DialogFooter>
                                      <Button
                                        onClick={handleEditRole}
                                        disabled={updateRoleMutation.isPending}
                                      >
                                        {updateRoleMutation.isPending && (
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        )}
                                        Сохранить
                                      </Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>
                                
                                {member.id !== user?.id && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className={member.isActive ? "text-red-500" : "text-green-500"}
                                    onClick={() => toggleStatusMutation.mutate({ 
                                      id: member.id, 
                                      isActive: !member.isActive 
                                    })}
                                    disabled={toggleStatusMutation.isPending}
                                    data-testid={`button-toggle-${member.id}`}
                                  >
                                    {member.isActive ? (
                                      <UserX className="h-4 w-4" />
                                    ) : (
                                      <UserCheck className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="guests" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <User className="h-5 w-5" />
                      Гости ({usersData?.guestCount || 0})
                    </CardTitle>
                    <CardDescription>
                      Пользователи с ролью "Гость" - могут только бронировать
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {usersLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : !usersData?.guests.length ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>Нет гостей</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {usersData.guests.map((guest) => (
                          <div
                            key={guest.id}
                            className="flex items-center justify-between gap-3 p-2 rounded-md border text-sm"
                            data-testid={`card-guest-${guest.id}`}
                          >
                            <div className="flex-1 min-w-0">
                              <span className="truncate">{guest.name}</span>
                              {guest.telegramId && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  ID: {guest.telegramId}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="authorizations" className="space-y-4 mt-4">
                <AuthorizationsCard 
                  authorizations={activeAuthorizations}
                  isLoading={authLoading}
                  onAdd={() => setIsAddDialogOpen(true)}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  deletePending={deleteMutation.isPending}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <AuthorizationsCard 
              authorizations={activeAuthorizations}
              isLoading={authLoading}
              onAdd={() => setIsAddDialogOpen(true)}
              onDelete={(id) => deleteMutation.mutate(id)}
              deletePending={deleteMutation.isPending}
            />
          )}

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

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
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
  );
}

function AuthorizationsCard({ 
  authorizations, 
  isLoading, 
  onAdd, 
  onDelete,
  deletePending,
}: { 
  authorizations: StaffAuthorization[];
  isLoading: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}) {
  return (
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
          <Button size="sm" onClick={onAdd} data-testid="button-add-authorization">
            <UserPlus className="h-4 w-4 mr-2" />
            Добавить
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : authorizations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Нет активных авторизаций</p>
            <p className="text-sm">Добавьте Telegram ID сотрудников</p>
          </div>
        ) : (
          <div className="space-y-3">
            {authorizations.map((auth) => (
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
                        onClick={() => onDelete(auth.id)}
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
  );
}
