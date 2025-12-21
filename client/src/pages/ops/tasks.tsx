import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
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
import type { Task, TaskType } from "@shared/schema";

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
  { value: "Б1", label: "Баня 1" },
  { value: "Б2", label: "Баня 2" },
  { value: "СПА1", label: "СПА 1" },
  { value: "СПА2", label: "СПА 2" },
];

const taskFormSchema = z.object({
  title: z.string().min(3, "Минимум 3 символа"),
  type: z.enum(["climate_off", "climate_on", "trash_prep", "meters", "cleaning", "call_guest", "other"]),
  date: z.date(),
  unitCode: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskFormSchema>;

export default function TasksPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      type: "other",
      date: new Date(),
      unitCode: "",
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      const response = await apiRequest("POST", "/api/tasks", {
        ...data,
        date: format(data.date, "yyyy-MM-dd"),
        unitCode: data.unitCode || undefined,
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
    mutationFn: async (taskId: string) => {
      const response = await apiRequest("POST", `/api/tasks/${taskId}/complete`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/today"] });
      toast({ title: "Задача выполнена" });
    },
    onError: () => {
      toast({ title: "Ошибка выполнения задачи", variant: "destructive" });
    },
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const todayTasks = tasks?.filter(t => t.date === today) || [];
  const openTasks = todayTasks.filter(t => t.status === "open");
  const completedTasks = todayTasks.filter(t => t.status === "done");

  const TaskCard = ({ task }: { task: Task }) => {
    const Icon = taskIcons[task.type] || HelpCircle;
    const isCompleted = task.status === "done";

    return (
      <Card className={cn("hover-elevate", isCompleted && "opacity-60")}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={isCompleted}
              onCheckedChange={() => !isCompleted && completeTaskMutation.mutate(task.id)}
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

      <BottomNav />
    </div>
  );
}
