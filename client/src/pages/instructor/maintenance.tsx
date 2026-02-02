import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { 
  Bike, 
  Settings,
  Gauge,
  Wrench,
  Plus,
  AlertTriangle,
  CheckCircle,
  Clock,
  History,
  ChevronDown,
  ChevronUp,
  Trash2
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BookingCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { 
  QuadMachine, 
  QuadMileageLog, 
  QuadMaintenanceRule, 
  QuadMaintenanceEvent,
  QuadMaintenanceStatus 
} from "@shared/schema";

const mileageSchema = z.object({
  quadId: z.string().min(1, "Выберите квадроцикл"),
  mileageKm: z.number().min(0, "Пробег не может быть отрицательным"),
  notes: z.string().optional(),
});

const ruleSchema = z.object({
  quadId: z.string().nullable(),
  title: z.string().min(1, "Укажите название"),
  description: z.string().optional(),
  triggerType: z.enum(["mileage", "time", "both"]),
  intervalKm: z.number().nullable(),
  intervalDays: z.number().nullable(),
  warningKm: z.number().nullable(),
  warningDays: z.number().nullable(),
});

const eventSchema = z.object({
  quadId: z.string().min(1, "Выберите квадроцикл"),
  ruleId: z.string().nullable(),
  title: z.string().min(1, "Укажите название"),
  description: z.string().optional(),
  mileageKm: z.number().min(0),
  partsUsed: z.string().optional(),
  totalCost: z.number().nullable(),
});

const machineSchema = z.object({
  code: z.string().min(1, "Укажите код"),
  name: z.string().min(1, "Укажите название"),
  ownerType: z.enum(["rental", "instructor"]),
  notes: z.string().optional(),
});

type MileageFormData = z.infer<typeof mileageSchema>;
type RuleFormData = z.infer<typeof ruleSchema>;
type EventFormData = z.infer<typeof eventSchema>;
type MachineFormData = z.infer<typeof machineSchema>;

export default function InstructorMaintenancePage() {
  const [showMileageDialog, setShowMileageDialog] = useState(false);
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showMachineDialog, setShowMachineDialog] = useState(false);
  const [editingMachine, setEditingMachine] = useState<QuadMachine | null>(null);
  const [selectedQuad, setSelectedQuad] = useState<string | null>(null);
  const [expandedQuad, setExpandedQuad] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: machines = [], isLoading: machinesLoading } = useQuery<QuadMachine[]>({
    queryKey: ["/api/quads/machines"],
  });

  const { data: statuses = [] } = useQuery<QuadMaintenanceStatus[]>({
    queryKey: ["/api/quads/maintenance/statuses"],
  });

  const { data: rules = [] } = useQuery<QuadMaintenanceRule[]>({
    queryKey: ["/api/quads/maintenance/rules"],
  });

  const { data: events = [] } = useQuery<QuadMaintenanceEvent[]>({
    queryKey: ["/api/quads/maintenance/events"],
  });

  const { data: mileageLogs = [] } = useQuery<QuadMileageLog[]>({
    queryKey: ["/api/quads/mileage"],
  });

  const mileageForm = useForm<MileageFormData>({
    resolver: zodResolver(mileageSchema),
    defaultValues: {
      quadId: "",
      mileageKm: 0,
      notes: "",
    },
  });

  const ruleForm = useForm<RuleFormData>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      quadId: null,
      title: "",
      description: "",
      triggerType: "mileage",
      intervalKm: null,
      intervalDays: null,
      warningKm: null,
      warningDays: null,
    },
  });

  const eventForm = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      quadId: "",
      ruleId: null,
      title: "",
      description: "",
      mileageKm: 0,
      partsUsed: "",
      totalCost: null,
    },
  });

  const machineForm = useForm<MachineFormData>({
    resolver: zodResolver(machineSchema),
    defaultValues: {
      code: "",
      name: "",
      ownerType: "rental",
      notes: "",
    },
  });

  const logMileageMutation = useMutation({
    mutationFn: async (data: MileageFormData) => {
      const response = await apiRequest("POST", "/api/quads/mileage", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quads/machines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quads/mileage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quads/maintenance/statuses"] });
      setShowMileageDialog(false);
      mileageForm.reset();
      toast({ title: "Пробег записан" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: async (data: RuleFormData) => {
      const response = await apiRequest("POST", "/api/quads/maintenance/rules", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quads/maintenance/rules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quads/maintenance/statuses"] });
      setShowRuleDialog(false);
      ruleForm.reset();
      toast({ title: "Правило создано" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const response = await apiRequest("DELETE", `/api/quads/maintenance/rules/${ruleId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quads/maintenance/rules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quads/maintenance/statuses"] });
      toast({ title: "Правило удалено" });
    },
    onError: () => {
      toast({ title: "Ошибка удаления", variant: "destructive" });
    },
  });

  const recordEventMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      const partsArray = data.partsUsed 
        ? data.partsUsed.split(",").map(p => ({ name: p.trim() })).filter(p => p.name)
        : [];
      const response = await apiRequest("POST", "/api/quads/maintenance/events", {
        ...data,
        partsUsed: partsArray,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quads/maintenance/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quads/maintenance/statuses"] });
      setShowEventDialog(false);
      eventForm.reset();
      toast({ title: "ТО записано" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const createMachineMutation = useMutation({
    mutationFn: async (data: MachineFormData) => {
      const response = await apiRequest("POST", "/api/quads/machines", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quads/machines"] });
      setShowMachineDialog(false);
      setEditingMachine(null);
      machineForm.reset();
      toast({ title: "Квадроцикл добавлен" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const updateMachineMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<MachineFormData> }) => {
      const response = await apiRequest("PATCH", `/api/quads/machines/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quads/machines"] });
      setShowMachineDialog(false);
      setEditingMachine(null);
      machineForm.reset();
      toast({ title: "Квадроцикл обновлен" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenMachineDialog = (machine?: QuadMachine) => {
    if (machine) {
      setEditingMachine(machine);
      machineForm.setValue("code", machine.code);
      machineForm.setValue("name", machine.name);
      machineForm.setValue("ownerType", machine.ownerType);
      machineForm.setValue("notes", machine.notes || "");
    } else {
      setEditingMachine(null);
      machineForm.reset();
    }
    setShowMachineDialog(true);
  };

  const handleMachineSubmit = (data: MachineFormData) => {
    if (editingMachine) {
      updateMachineMutation.mutate({ id: editingMachine.id, data });
    } else {
      createMachineMutation.mutate(data);
    }
  };

  const getQuadStatuses = (quadId: string) => {
    return statuses.filter(s => s.quadId === quadId);
  };

  const getQuadAlertLevel = (quadId: string): "due" | "warning" | "ok" => {
    const quadStatuses = getQuadStatuses(quadId);
    if (quadStatuses.some(s => s.status === "overdue" || s.status === "due")) return "due";
    if (quadStatuses.some(s => s.status === "warning")) return "warning";
    return "ok";
  };

  const getQuadEvents = (quadId: string) => {
    return events.filter(e => e.quadId === quadId);
  };

  const getQuadMileageLogs = (quadId: string) => {
    return mileageLogs.filter(l => l.quadId === quadId);
  };

  const getRuleById = (ruleId: string | null | undefined) => {
    if (!ruleId) return null;
    return rules.find(r => r.id === ruleId);
  };

  const triggerType = ruleForm.watch("triggerType");

  const handleOpenMileageDialog = (quadId?: string) => {
    if (quadId) {
      const machine = machines.find(m => m.id === quadId);
      mileageForm.setValue("quadId", quadId);
      mileageForm.setValue("mileageKm", machine?.currentMileageKm || 0);
    }
    setShowMileageDialog(true);
  };

  const handleOpenEventDialog = (quadId?: string, ruleId?: string) => {
    if (quadId) {
      const machine = machines.find(m => m.id === quadId);
      eventForm.setValue("quadId", quadId);
      eventForm.setValue("mileageKm", machine?.currentMileageKm || 0);
      if (ruleId) {
        const rule = getRuleById(ruleId);
        eventForm.setValue("ruleId", ruleId);
        eventForm.setValue("title", rule?.title || "");
      }
    }
    setShowEventDialog(true);
  };

  return (
    <>
      <Header title="Сервисная книжка" />
      <PageContainer>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <Bike className="w-4 h-4 mr-2" />
              Обзор
            </TabsTrigger>
            <TabsTrigger value="machines" data-testid="tab-machines">
              <Plus className="w-4 h-4 mr-2" />
              Машины
            </TabsTrigger>
            <TabsTrigger value="rules" data-testid="tab-rules">
              <Settings className="w-4 h-4 mr-2" />
              Правила
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              <History className="w-4 h-4 mr-2" />
              История
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button onClick={() => handleOpenMileageDialog()} data-testid="button-log-mileage">
                <Gauge className="w-4 h-4 mr-2" />
                Записать пробег
              </Button>
            </div>

            {machinesLoading ? (
              <BookingCardSkeleton />
            ) : machines.length === 0 ? (
              <EmptyState icon={Bike} title="Нет квадроциклов" />
            ) : (
              <div className="space-y-3">
                {machines.map(machine => {
                  const alertLevel = getQuadAlertLevel(machine.id);
                  const quadStatuses = getQuadStatuses(machine.id);
                  const isExpanded = expandedQuad === machine.id;
                  const dueStatuses = quadStatuses.filter(s => s.status === "overdue" || s.status === "due");
                  const warningStatuses = quadStatuses.filter(s => s.status === "warning");

                  return (
                    <Card key={machine.id} data-testid={`card-quad-${machine.code}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-md ${
                              alertLevel === "due" ? "bg-destructive/10" :
                              alertLevel === "warning" ? "bg-yellow-500/10" :
                              "bg-green-500/10"
                            }`}>
                              <Bike className={`w-5 h-5 ${
                                alertLevel === "due" ? "text-destructive" :
                                alertLevel === "warning" ? "text-yellow-600 dark:text-yellow-400" :
                                "text-green-600 dark:text-green-400"
                              }`} />
                            </div>
                            <div>
                              <CardTitle className="text-base">{machine.name}</CardTitle>
                              <CardDescription className="flex items-center gap-2">
                                <Gauge className="w-3 h-3" />
                                {machine.currentMileageKm} км
                                {machine.ownerType === "instructor" && (
                                  <Badge variant="outline" className="text-xs">Инструктор</Badge>
                                )}
                              </CardDescription>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {alertLevel === "due" && (
                              <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Требуется ТО
                              </Badge>
                            )}
                            {alertLevel === "warning" && (
                              <Badge className="gap-1 bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30">
                                <Clock className="w-3 h-3" />
                                Скоро ТО
                              </Badge>
                            )}
                            {alertLevel === "ok" && (
                              <Badge variant="outline" className="gap-1 text-green-600 dark:text-green-400 border-green-500/30">
                                <CheckCircle className="w-3 h-3" />
                                ОК
                              </Badge>
                            )}
                            <Button 
                              size="icon" 
                              variant="ghost"
                              onClick={() => setExpandedQuad(isExpanded ? null : machine.id)}
                              data-testid={`button-expand-${machine.code}`}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      
                      {isExpanded && (
                        <CardContent className="pt-0 space-y-4">
                          <div className="flex flex-wrap gap-2 pt-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleOpenMileageDialog(machine.id)}
                              data-testid={`button-mileage-${machine.code}`}
                            >
                              <Gauge className="w-4 h-4 mr-2" />
                              Записать пробег
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleOpenEventDialog(machine.id)}
                              data-testid={`button-service-${machine.code}`}
                            >
                              <Wrench className="w-4 h-4 mr-2" />
                              Записать ТО
                            </Button>
                          </div>

                          {(dueStatuses.length > 0 || warningStatuses.length > 0) && (
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium text-muted-foreground">Требуется внимание:</h4>
                              {dueStatuses.map(status => {
                                const rule = getRuleById(status.ruleId);
                                return (
                                  <div 
                                    key={status.id} 
                                    className="flex items-center justify-between p-2 rounded-md bg-destructive/5 border border-destructive/20"
                                  >
                                    <div>
                                      <p className="text-sm font-medium">{rule?.title || "ТО"}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {status.nextDueMileage && `${status.nextDueMileage} км`}
                                        {status.nextDueMileage && status.nextDueDate && " / "}
                                        {status.nextDueDate && format(new Date(status.nextDueDate), "dd.MM.yyyy")}
                                      </p>
                                    </div>
                                    <Button 
                                      size="sm"
                                      onClick={() => handleOpenEventDialog(machine.id, status.ruleId)}
                                    >
                                      Выполнить
                                    </Button>
                                  </div>
                                );
                              })}
                              {warningStatuses.map(status => {
                                const rule = getRuleById(status.ruleId);
                                return (
                                  <div 
                                    key={status.id} 
                                    className="flex items-center justify-between p-2 rounded-md bg-yellow-500/5 border border-yellow-500/20"
                                  >
                                    <div>
                                      <p className="text-sm font-medium">{rule?.title || "ТО"}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {status.nextDueMileage && `до ${status.nextDueMileage} км`}
                                        {status.nextDueMileage && status.nextDueDate && " / "}
                                        {status.nextDueDate && `до ${format(new Date(status.nextDueDate), "dd.MM.yyyy")}`}
                                      </p>
                                    </div>
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => handleOpenEventDialog(machine.id, status.ruleId)}
                                    >
                                      Выполнить
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {getQuadEvents(machine.id).length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium text-muted-foreground">Последние ТО:</h4>
                              {getQuadEvents(machine.id).slice(0, 3).map(event => (
                                <div key={event.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                                  <div>
                                    <p className="text-sm font-medium">{event.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {format(new Date(event.performedAt), "dd.MM.yyyy")} - {event.mileageKm} км
                                    </p>
                                  </div>
                                  {event.totalCost && (
                                    <Badge variant="outline">{event.totalCost} BYN</Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="machines" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => handleOpenMachineDialog()} data-testid="button-add-machine">
                <Plus className="w-4 h-4 mr-2" />
                Добавить квадроцикл
              </Button>
            </div>

            {machines.length === 0 ? (
              <EmptyState icon={Bike} title="Нет квадроциклов" description="Добавьте квадроциклы для сервисной книжки" />
            ) : (
              <div className="space-y-3">
                {machines.map(machine => (
                  <Card key={machine.id} data-testid={`card-machine-${machine.code}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-md bg-muted">
                            <Bike className="w-5 h-5" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{machine.code}</CardTitle>
                            <CardDescription>{machine.name}</CardDescription>
                          </div>
                        </div>
                        <Button 
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenMachineDialog(machine)}
                          data-testid={`button-edit-machine-${machine.code}`}
                        >
                          <Settings className="w-4 h-4 mr-2" />
                          Изменить
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Gauge className="w-3 h-3" />
                          {machine.currentMileageKm} км
                        </span>
                        <Badge variant={machine.ownerType === "rental" ? "default" : "secondary"}>
                          {machine.ownerType === "rental" ? "Прокат" : "Инструктор"}
                        </Badge>
                        {!machine.isActive && (
                          <Badge variant="destructive">Неактивен</Badge>
                        )}
                      </div>
                      {machine.notes && (
                        <p className="text-sm mt-2">{machine.notes}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="rules" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowRuleDialog(true)} data-testid="button-add-rule">
                <Plus className="w-4 h-4 mr-2" />
                Добавить правило
              </Button>
            </div>

            {rules.length === 0 ? (
              <EmptyState icon={Settings} title="Нет правил ТО" description="Добавьте правила для отслеживания обслуживания" />
            ) : (
              <div className="space-y-3">
                {rules.map(rule => {
                  const targetQuad = rule.quadId ? machines.find(m => m.id === rule.quadId) : null;
                  return (
                    <Card key={rule.id} data-testid={`card-rule-${rule.id}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <CardTitle className="text-base">{rule.title}</CardTitle>
                            <CardDescription>
                              {targetQuad ? targetQuad.name : "Все квадроциклы"}
                            </CardDescription>
                          </div>
                          <Button 
                            size="icon" 
                            variant="ghost"
                            onClick={() => deleteRuleMutation.mutate(rule.id)}
                            data-testid={`button-delete-rule-${rule.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex flex-wrap gap-2">
                          {rule.intervalKm && (
                            <Badge variant="outline">
                              <Gauge className="w-3 h-3 mr-1" />
                              каждые {rule.intervalKm} км
                            </Badge>
                          )}
                          {rule.intervalDays && (
                            <Badge variant="outline">
                              <Clock className="w-3 h-3 mr-1" />
                              каждые {rule.intervalDays} дней
                            </Badge>
                          )}
                          {rule.warningKm && (
                            <Badge variant="secondary">
                              Предупреждение за {rule.warningKm} км
                            </Badge>
                          )}
                          {rule.warningDays && (
                            <Badge variant="secondary">
                              Предупреждение за {rule.warningDays} дней
                            </Badge>
                          )}
                        </div>
                        {rule.description && (
                          <p className="text-sm text-muted-foreground mt-2">{rule.description}</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            {events.length === 0 ? (
              <EmptyState icon={History} title="Нет записей ТО" description="История обслуживания появится здесь" />
            ) : (
              <div className="space-y-3">
                {events.map(event => {
                  const machine = machines.find(m => m.id === event.quadId);
                  const rule = getRuleById(event.ruleId);
                  return (
                    <Card key={event.id} data-testid={`card-event-${event.id}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <CardTitle className="text-base">{event.title}</CardTitle>
                            <CardDescription>
                              {machine?.name || "Квадроцикл"} - {format(new Date(event.performedAt), "dd.MM.yyyy HH:mm", { locale: ru })}
                            </CardDescription>
                          </div>
                          {event.totalCost && (
                            <Badge>{event.totalCost} BYN</Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Gauge className="w-3 h-3" />
                            {event.mileageKm} км
                          </span>
                          {rule && (
                            <span className="flex items-center gap-1">
                              <Settings className="w-3 h-3" />
                              {rule.title}
                            </span>
                          )}
                        </div>
                        {event.description && (
                          <p className="text-sm mt-2">{event.description}</p>
                        )}
                        {event.partsUsed && event.partsUsed.length > 0 && (
                          <p className="text-sm text-muted-foreground mt-1">
                            Запчасти: {event.partsUsed.map(p => p.name).join(", ")}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={showMileageDialog} onOpenChange={setShowMileageDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Записать пробег</DialogTitle>
              <DialogDescription>Укажите текущий показатель одометра</DialogDescription>
            </DialogHeader>
            <Form {...mileageForm}>
              <form onSubmit={mileageForm.handleSubmit((data) => logMileageMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={mileageForm.control}
                  name="quadId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Квадроцикл</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-mileage-quad">
                            <SelectValue placeholder="Выберите квадроцикл" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {machines.map(m => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name} ({m.currentMileageKm} км)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={mileageForm.control}
                  name="mileageKm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Показания одометра (км)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          onChange={e => field.onChange(Number(e.target.value))}
                          data-testid="input-mileage"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={mileageForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Заметки (опционально)</FormLabel>
                      <FormControl>
                        <Textarea {...field} data-testid="input-mileage-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={logMileageMutation.isPending} data-testid="button-submit-mileage">
                    {logMileageMutation.isPending ? "Сохранение..." : "Сохранить"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Добавить правило ТО</DialogTitle>
              <DialogDescription>Настройте интервалы обслуживания</DialogDescription>
            </DialogHeader>
            <Form {...ruleForm}>
              <form onSubmit={ruleForm.handleSubmit((data) => createRuleMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={ruleForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Название</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Замена масла" data-testid="input-rule-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={ruleForm.control}
                  name="quadId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Квадроцикл</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val === "all" ? null : val)} value={field.value || "all"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-rule-quad">
                            <SelectValue placeholder="Выберите квадроцикл" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all">Все квадроциклы</SelectItem>
                          {machines.map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={ruleForm.control}
                  name="triggerType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Тип триггера</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-rule-trigger">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="mileage">По пробегу</SelectItem>
                          <SelectItem value="time">По времени</SelectItem>
                          <SelectItem value="both">По пробегу и времени</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {(triggerType === "mileage" || triggerType === "both") && (
                  <>
                    <FormField
                      control={ruleForm.control}
                      name="intervalKm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Интервал (км)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              value={field.value || ""} 
                              onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                              placeholder="500"
                              data-testid="input-rule-interval-km"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={ruleForm.control}
                      name="warningKm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Предупреждение за (км)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              value={field.value || ""} 
                              onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                              placeholder="50"
                              data-testid="input-rule-warning-km"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
                {(triggerType === "time" || triggerType === "both") && (
                  <>
                    <FormField
                      control={ruleForm.control}
                      name="intervalDays"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Интервал (дней)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              value={field.value || ""} 
                              onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                              placeholder="30"
                              data-testid="input-rule-interval-days"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={ruleForm.control}
                      name="warningDays"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Предупреждение за (дней)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              value={field.value || ""} 
                              onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                              placeholder="7"
                              data-testid="input-rule-warning-days"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
                <FormField
                  control={ruleForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Описание (опционально)</FormLabel>
                      <FormControl>
                        <Textarea {...field} data-testid="input-rule-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createRuleMutation.isPending} data-testid="button-submit-rule">
                    {createRuleMutation.isPending ? "Создание..." : "Создать"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Записать ТО</DialogTitle>
              <DialogDescription>Зафиксируйте выполненное обслуживание</DialogDescription>
            </DialogHeader>
            <Form {...eventForm}>
              <form onSubmit={eventForm.handleSubmit((data) => recordEventMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={eventForm.control}
                  name="quadId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Квадроцикл</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-event-quad">
                            <SelectValue placeholder="Выберите квадроцикл" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {machines.map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={eventForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Название работ</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Замена масла" data-testid="input-event-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={eventForm.control}
                  name="ruleId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Связанное правило (опционально)</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val === "none" ? null : val)} value={field.value || "none"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-event-rule">
                            <SelectValue placeholder="Выберите правило" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Без правила</SelectItem>
                          {rules.map(r => (
                            <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={eventForm.control}
                  name="mileageKm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Пробег при выполнении (км)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          onChange={e => field.onChange(Number(e.target.value))}
                          data-testid="input-event-mileage"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={eventForm.control}
                  name="partsUsed"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Запчасти (опционально)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Масло 5W-40 2л, фильтр" data-testid="input-event-parts" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={eventForm.control}
                  name="totalCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Стоимость (BYN, опционально)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          value={field.value || ""} 
                          onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                          data-testid="input-event-cost"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={eventForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Описание работ (опционально)</FormLabel>
                      <FormControl>
                        <Textarea {...field} data-testid="input-event-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={recordEventMutation.isPending} data-testid="button-submit-event">
                    {recordEventMutation.isPending ? "Сохранение..." : "Сохранить"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={showMachineDialog} onOpenChange={setShowMachineDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingMachine ? "Редактировать квадроцикл" : "Добавить квадроцикл"}</DialogTitle>
              <DialogDescription>Укажите код и название квадроцикла</DialogDescription>
            </DialogHeader>
            <Form {...machineForm}>
              <form onSubmit={machineForm.handleSubmit(handleMachineSubmit)} className="space-y-4">
                <FormField
                  control={machineForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Код (номер)</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Q1, Q2, ..." 
                          disabled={!!editingMachine}
                          data-testid="input-machine-code" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={machineForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Название</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Красный CF Moto" data-testid="input-machine-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={machineForm.control}
                  name="ownerType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Тип</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-machine-owner">
                            <SelectValue placeholder="Выберите тип" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="rental">Прокат</SelectItem>
                          <SelectItem value="instructor">Инструктор</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={machineForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Заметки (опционально)</FormLabel>
                      <FormControl>
                        <Textarea {...field} data-testid="input-machine-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button 
                    type="submit" 
                    disabled={createMachineMutation.isPending || updateMachineMutation.isPending} 
                    data-testid="button-submit-machine"
                  >
                    {(createMachineMutation.isPending || updateMachineMutation.isPending) ? "Сохранение..." : "Сохранить"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </>
  );
}
