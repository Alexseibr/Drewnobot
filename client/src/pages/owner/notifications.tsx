import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Bell, Play, Pause, Plus, Pencil, Trash2, Loader2, Clock, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import type { NotificationConfig } from "@shared/schema";

const cadenceLabels: Record<string, string> = {
  daily: "Ежедневно",
  weekly: "Еженедельно",
  monthly: "Ежемесячно",
  once: "Однократно",
  custom: "По расписанию",
};

const actionTypeLabels: Record<string, string> = {
  shift_reminder: "Напоминание о смене",
  bath_summary: "Сводка по баням",
  climate_on: "Климат-контроль ВКЛ",
  climate_off: "Климат-контроль ВЫКЛ",
  laundry_reminder: "Прачечная",
  weather_check: "Проверка погоды",
  daily_tasks: "Ежедневные задачи",
  weekly_tasks: "Еженедельные задачи",
  monthly_tasks: "Ежемесячные задачи",
  thermostat_prompt: "Термостат: план",
  thermostat_base_temp: "Термостат: база",
  thermostat_heat: "Термостат: прогрев",
  custom: "Пользовательское",
};

const actionTypes = Object.keys(actionTypeLabels);
const cadenceTypes = ["daily", "weekly", "monthly", "once", "custom"];

interface EditFormState {
  title: string;
  description: string;
  cadence: string;
  cronExpression: string;
  actionType: string;
  targetChatId: string;
}

export default function NotificationsPage() {
  const { toast } = useToast();
  const [editingConfig, setEditingConfig] = useState<NotificationConfig | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formState, setFormState] = useState<EditFormState>({
    title: "",
    description: "",
    cadence: "daily",
    cronExpression: "0 9 * * *",
    actionType: "custom",
    targetChatId: "",
  });

  const { data: configs = [], isLoading, refetch } = useQuery<NotificationConfig[]>({
    queryKey: ["/api/admin/notifications"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      return apiRequest("POST", `/api/admin/notifications/${id}/toggle`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
    },
    onError: () => {
      toast({ title: "Ошибка переключения", variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: EditFormState) => {
      return apiRequest("POST", "/api/admin/notifications", {
        ...data,
        enabled: true,
        targetChatId: data.targetChatId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      setShowCreateDialog(false);
      toast({ title: "Уведомление создано" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Ошибка создания", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: EditFormState }) => {
      return apiRequest("PATCH", `/api/admin/notifications/${id}`, {
        ...data,
        targetChatId: data.targetChatId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      setShowEditDialog(false);
      setEditingConfig(null);
      toast({ title: "Уведомление обновлено" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Ошибка обновления", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/notifications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      setDeleteId(null);
      toast({ title: "Уведомление удалено" });
    },
    onError: () => {
      toast({ title: "Ошибка удаления", variant: "destructive" });
    },
  });

  const initializeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/notifications/initialize", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      toast({ title: "Уведомления по умолчанию созданы" });
    },
    onError: () => {
      toast({ title: "Ошибка инициализации", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormState({
      title: "",
      description: "",
      cadence: "daily",
      cronExpression: "0 9 * * *",
      actionType: "custom",
      targetChatId: "",
    });
  };

  const openEditDialog = (config: NotificationConfig) => {
    setEditingConfig(config);
    setFormState({
      title: config.title,
      description: config.description || "",
      cadence: config.cadence,
      cronExpression: config.cronExpression,
      actionType: config.actionType,
      targetChatId: config.targetChatId || "",
    });
    setShowEditDialog(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setShowCreateDialog(true);
  };

  const handleSave = () => {
    if (editingConfig) {
      updateMutation.mutate({ id: editingConfig.id, data: formState });
    } else {
      createMutation.mutate(formState);
    }
  };

  const formatLastRun = (lastRunAt?: string) => {
    if (!lastRunAt) return "Никогда";
    const date = new Date(lastRunAt);
    return date.toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="loading-state">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background ">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-4 p-4">
          <Link href="/ops">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Управление уведомлениями</h1>
            <p className="text-sm text-muted-foreground">Настройка расписания и действий</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1">
            <Bell className="h-3 w-3" />
            {configs.length} уведомлений
          </Badge>
          <div className="flex gap-2 flex-wrap">
            {configs.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => initializeMutation.mutate()}
                disabled={initializeMutation.isPending}
                data-testid="button-initialize"
              >
                {initializeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Создать по умолчанию"}
              </Button>
            )}
            <Button size="sm" onClick={openCreateDialog} data-testid="button-create">
              <Plus className="h-4 w-4 mr-1" />
              Добавить
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {configs.map((config) => (
            <Card key={config.id} className={!config.enabled ? "opacity-60" : ""} data-testid={`card-notification-${config.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium truncate">{config.title}</span>
                      <Badge variant="outline" className="text-xs">
                        {cadenceLabels[config.cadence] || config.cadence}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {actionTypeLabels[config.actionType] || config.actionType}
                      </Badge>
                    </div>
                    {config.description && (
                      <p className="text-sm text-muted-foreground mb-2">{config.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {config.cronExpression}
                      </span>
                      <span>Последний запуск: {formatLastRun(config.lastRunAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: config.id, enabled: checked })}
                      data-testid={`switch-toggle-${config.id}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(config)}
                      data-testid={`button-edit-${config.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(config.id)}
                      data-testid={`button-delete-${config.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {configs.length === 0 && (
          <Card data-testid="card-empty-state">
            <CardContent className="p-8 text-center">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4" data-testid="text-empty-message">Нет настроенных уведомлений</p>
              <Button onClick={() => initializeMutation.mutate()} disabled={initializeMutation.isPending} data-testid="button-initialize-defaults">
                Создать стандартные уведомления
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      <Dialog open={showEditDialog || showCreateDialog} onOpenChange={(open) => {
        if (!open) {
          setShowEditDialog(false);
          setShowCreateDialog(false);
          setEditingConfig(null);
          resetForm();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingConfig ? "Редактировать уведомление" : "Новое уведомление"}</DialogTitle>
            <DialogDescription>
              {editingConfig ? "Измените параметры уведомления" : "Настройте новое уведомление"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Название</Label>
              <Input
                id="title"
                value={formState.title}
                onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                placeholder="Напоминание о..."
                data-testid="input-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                value={formState.description}
                onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                placeholder="Подробное описание..."
                className="resize-none"
                data-testid="input-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Периодичность</Label>
                <Select value={formState.cadence} onValueChange={(v) => setFormState({ ...formState, cadence: v })}>
                  <SelectTrigger data-testid="select-cadence">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cadenceTypes.map((c) => (
                      <SelectItem key={c} value={c}>{cadenceLabels[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Действие</Label>
                <Select value={formState.actionType} onValueChange={(v) => setFormState({ ...formState, actionType: v })}>
                  <SelectTrigger data-testid="select-action-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {actionTypes.map((a) => (
                      <SelectItem key={a} value={a}>{actionTypeLabels[a]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cron">Cron-выражение</Label>
              <Input
                id="cron"
                value={formState.cronExpression}
                onChange={(e) => setFormState({ ...formState, cronExpression: e.target.value })}
                placeholder="0 9 * * *"
                data-testid="input-cron"
              />
              <p className="text-xs text-muted-foreground">Формат: минута час день месяц день_недели</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="chatId">ID чата (опционально)</Label>
              <Input
                id="chatId"
                value={formState.targetChatId}
                onChange={(e) => setFormState({ ...formState, targetChatId: e.target.value })}
                placeholder="Telegram chat ID"
                data-testid="input-chat-id"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowEditDialog(false);
              setShowCreateDialog(false);
              setEditingConfig(null);
              resetForm();
            }} data-testid="button-cancel">
              Отмена
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formState.title || !formState.cronExpression || updateMutation.isPending || createMutation.isPending}
              data-testid="button-save"
            >
              {(updateMutation.isPending || createMutation.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Сохранить"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить уведомление?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Уведомление будет удалено навсегда.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
