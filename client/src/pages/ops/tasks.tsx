import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  ClipboardList, 
  CheckCircle2, 
  Clock, 
  ThermometerSnowflake,
  Thermometer,
  Trash2,
  Gauge,
  Sparkles,
  Phone,
  HelpCircle,
  Plus,
  Calendar as CalendarIcon
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TaskCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { Task, TaskType, MeterReading, TaskPriority } from "@shared/schema";
import { AlertCircle } from "lucide-react";

const taskIcons: Record<TaskType, React.ElementType> = {
  climate_off: ThermometerSnowflake,
  climate_on: Thermometer,
  trash_prep: Trash2,
  meters: Gauge,
  cleaning: Sparkles,
  call_guest: Phone,
  other: HelpCircle,
};

const taskTypeLabels: Record<TaskType, string> = {
  climate_off: "Выкл. климат",
  climate_on: "Вкл. климат",
  trash_prep: "Мусор",
  meters: "Счетчики",
  cleaning: "Уборка",
  call_guest: "Звонок гостю",
  other: "Другое",
};

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: "cleaning", label: "Уборка" },
  { value: "climate_on", label: "Вкл. климат" },
  { value: "climate_off", label: "Выкл. климат" },
  { value: "trash_prep", label: "Мусор" },
  { value: "meters", label: "Счетчики" },
  { value: "call_guest", label: "Звонок гостю" },
  { value: "other", label: "Другое" },
];

const UNITS = [
  { value: "", label: "Без привязки" },
  { value: "Д1", label: "Домик 1" },
  { value: "Д2", label: "Домик 2" },
  { value: "Д3", label: "Домик 3" },
  { value: "Д4", label: "Домик 4" },
  { value: "СПА1", label: "СПА 1" },
  { value: "СПА2", label: "СПА 2" },
];

const METER_UNITS = [
  { value: "Д1", label: "Домик 1" },
  { value: "Д2", label: "Домик 2" },
  { value: "Д3", label: "Домик 3" },
  { value: "Д4", label: "Домик 4" },
];

const METER_TYPES: { value: MeterReading["meterType"]; label: string }[] = [
  { value: "electricity", label: "Электричество" },
  { value: "water", label: "Вода" },
  { value: "gas", label: "Газ" },
];

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "normal", label: "По мере освобождения" },
  { value: "urgent", label: "Срочно" },
];

const taskFormSchema = z.object({
  title: z.string().min(3, "Минимум 3 символа"),
  type: z.enum(["climate_off", "climate_on", "trash_prep", "meters", "cleaning", "call_guest", "other"]),
  date: z.date(),
  unitCode: z.string().optional(),
  priority: z.enum(["normal", "urgent"]).default("normal"),
  notifyAt: z.string().optional(),
  assignedTo: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskFormSchema>;

export default function TasksPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const taskRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [meterDialogTask, setMeterDialogTask] = useState<Task | null>(null);
  const [meterReadings, setMeterReadings] = useState<Record<string, number>>({});
  const searchString = useSearch();

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  // Handle deep link - scroll to and highlight specific task
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const taskId = params.get("taskId");
    if (taskId && tasks) {
      setHighlightedTaskId(taskId);
      // Scroll to task after a short delay to ensure render
      setTimeout(() => {
        const taskElement = taskRefs.current[taskId];
        if (taskElement) {
          taskElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
      // Remove highlight after 3 seconds
      setTimeout(() => setHighlightedTaskId(null), 3000);
    }
  }, [searchString, tasks]);

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      type: "other",
      date: new Date(),
      unitCode: "",
      priority: "normal",
      notifyAt: "",
      assignedTo: "",
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      const response = await apiRequest("POST", "/api/tasks", {
        ...data,
        date: format(data.date, "yyyy-MM-dd"),
        unitCode: data.unitCode || undefined,
        priority: data.priority || "normal",
        notifyAt: data.notifyAt || undefined,
        assignedTo: data.assignedTo || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/today"] });
      toast({ title: "Задача создана" });
      setIsCreateOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Ошибка создания задачи", variant: "destructive" });
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: async ({ taskId, meta }: { taskId: string; meta?: any }) => {
      const response = await apiRequest("POST", `/api/tasks/${taskId}/complete`, meta ? { meta } : undefined);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/today"] });
      toast({ title: "Задача выполнена" });
      setMeterDialogTask(null);
      setMeterReadings({});
    },
    onError: () => {
      toast({ title: "Ошибка выполнения задачи", variant: "destructive" });
    },
  });

  const handleCompleteTask = (task: Task) => {
    if (task.type === "meters") {
      setMeterDialogTask(task);
      setMeterReadings({});
    } else {
      completeTaskMutation.mutate({ taskId: task.id });
    }
  };

  const handleSubmitMeterReadings = () => {
    if (!meterDialogTask) return;
    
    const readings: MeterReading[] = [];
    const today = format(new Date(), "yyyy-MM-dd");
    
    for (const unit of METER_UNITS) {
      for (const meterType of METER_TYPES) {
        const key = `${unit.value}_${meterType.value}`;
        const value = meterReadings[key];
        if (value !== undefined && value > 0) {
          readings.push({
            unit: unit.value,
            meterType: meterType.value,
            value,
            date: today,
          });
        }
      }
    }
    
    if (readings.length === 0) {
      toast({ title: "Введите хотя бы одно показание", variant: "destructive" });
      return;
    }
    
    const period = format(new Date(), "yyyy-MM");
    completeTaskMutation.mutate({
      taskId: meterDialogTask.id,
      meta: { readings, period },
    });
  };

  const today = format(new Date(), "yyyy-MM-dd");
  const todayTasks = tasks?.filter(t => t.date === today) || [];
  const openTasks = todayTasks.filter(t => t.status === "open");
  const completedTasks = todayTasks.filter(t => t.status === "done");

  const TaskCard = ({ task }: { task: Task }) => {
    const Icon = taskIcons[task.type] || HelpCircle;
    const isCompleted = task.status === "done";
    const isHighlighted = highlightedTaskId === task.id;

    return (
      <div ref={(el) => { taskRefs.current[task.id] = el; }}>
        <Card className={cn(
          "hover-elevate transition-all duration-300",
          isCompleted && "opacity-60",
          isHighlighted && "ring-2 ring-primary ring-offset-2"
        )}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={isCompleted}
              onCheckedChange={() => !isCompleted && handleCompleteTask(task)}
              disabled={isCompleted || completeTaskMutation.isPending}
              className="mt-0.5"
              data-testid={`checkbox-task-${task.id}`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className={cn(
                  "font-medium",
                  isCompleted && "line-through text-muted-foreground"
                )}>
                  {task.title}
                </p>
                <div className={cn(
                  "rounded-full p-1.5 shrink-0",
                  isCompleted ? "bg-status-completed/10" : "bg-primary/10"
                )}>
                  <Icon className={cn(
                    "h-4 w-4",
                    isCompleted ? "text-status-completed" : "text-primary"
                  )} />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {task.priority === "urgent" && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Срочно
                  </Badge>
                )}
                {task.unitCode && (
                  <Badge variant="outline" className="text-xs">
                    {task.unitCode}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {taskTypeLabels[task.type] || task.type}
                </span>
                {task.createdBySystem && (
                  <Badge variant="secondary" className="text-xs">
                    Авто
                  </Badge>
                )}
                {task.notifyAt && !task.notified && (
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {task.notifyAt}
                  </Badge>
                )}
              </div>
              {task.checklist && task.checklist.length > 0 && (
                <div className="mt-3 space-y-1">
                  {task.checklist.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Задачи" />
      
      <PageContainer>
        <div className="flex items-center justify-between mb-4 gap-2">
          <h2 className="text-lg font-semibold">
            Сегодня, {format(new Date(), "d MMMM", { locale: ru })}
          </h2>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-task">
                <Plus className="h-4 w-4 mr-1" />
                Добавить
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Новая задача</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => createTaskMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Название</FormLabel>
                        <FormControl>
                          <Input placeholder="Что нужно сделать..." {...field} data-testid="input-task-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Тип</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-task-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TASK_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="unitCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Объект</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-task-unit">
                              <SelectValue placeholder="Выберите объект" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {UNITS.map((unit) => (
                              <SelectItem key={unit.value || "none"} value={unit.value || "none"}>
                                {unit.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Дата</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-task-date"
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, "d MMMM yyyy", { locale: ru }) : "Выберите дату"}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              locale={ru}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Срочность</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-task-priority">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PRIORITIES.map((p) => (
                              <SelectItem key={p.value} value={p.value}>
                                {p.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notifyAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Напомнить в</FormLabel>
                        <FormControl>
                          <Input 
                            type="time" 
                            placeholder="Сразу"
                            {...field}
                            data-testid="input-task-notify-at"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Оставьте пустым для немедленного уведомления</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={createTaskMutation.isPending}
                    data-testid="button-submit-task"
                  >
                    {createTaskMutation.isPending ? "Создание..." : "Создать задачу"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="open" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="open" className="gap-2" data-testid="tab-open">
              <Clock className="h-4 w-4" />
              Активные
              {openTasks.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {openTasks.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-2" data-testid="tab-completed">
              <CheckCircle2 className="h-4 w-4" />
              Готово
            </TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="space-y-3">
            {isLoading ? (
              <>
                <TaskCardSkeleton />
                <TaskCardSkeleton />
                <TaskCardSkeleton />
              </>
            ) : openTasks.length > 0 ? (
              openTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))
            ) : (
              <Card>
                <CardContent className="p-6">
                  <EmptyState
                    icon={CheckCircle2}
                    title="Все задачи выполнены!"
                    description="Отличная работа! Все задачи на сегодня завершены."
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-3">
            {isLoading ? (
              <>
                <TaskCardSkeleton />
                <TaskCardSkeleton />
              </>
            ) : completedTasks.length > 0 ? (
              completedTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))
            ) : (
              <Card>
                <CardContent className="p-6">
                  <EmptyState
                    icon={ClipboardList}
                    title="Нет выполненных задач"
                    description="Выполненные задачи появятся здесь."
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </PageContainer>

      {/* Meter Readings Dialog */}
      <Dialog open={!!meterDialogTask} onOpenChange={(open) => !open && setMeterDialogTask(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              Показания счётчиков
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {METER_UNITS.map((unit) => (
              <div key={unit.value} className="space-y-3">
                <h4 className="font-medium text-sm border-b pb-1">{unit.label}</h4>
                <div className="grid grid-cols-3 gap-2">
                  {METER_TYPES.map((meterType) => {
                    const key = `${unit.value}_${meterType.value}`;
                    return (
                      <div key={key}>
                        <label className="text-xs text-muted-foreground block mb-1">
                          {meterType.label}
                        </label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={meterReadings[key] || ""}
                          onChange={(e) => setMeterReadings(prev => ({
                            ...prev,
                            [key]: e.target.value ? Number(e.target.value) : 0,
                          }))}
                          data-testid={`input-meter-${key}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          
          <Button 
            onClick={handleSubmitMeterReadings}
            className="w-full mt-4"
            disabled={completeTaskMutation.isPending}
            data-testid="button-submit-meters"
          >
            {completeTaskMutation.isPending ? "Сохранение..." : "Сохранить показания"}
          </Button>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
