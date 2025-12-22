import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { ru } from "date-fns/locale";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Clock, 
  Plus,
  Calendar as CalendarIcon,
  User,
  Briefcase,
  Timer
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { WorkLog } from "@shared/schema";

const WORK_TYPES = [
  { value: "cleaning", label: "Уборка" },
  { value: "bath_heating", label: "Растопка бани/купели" },
  { value: "territory", label: "Территория уборка" },
  { value: "fields", label: "На полях" },
  { value: "school_tent", label: "В школе/шатре" },
  { value: "other", label: "Другое" },
];

const workTypeLabels: Record<string, string> = {
  cleaning: "Уборка",
  bath_heating: "Растопка бани/купели",
  territory: "Территория уборка",
  fields: "На полях",
  school_tent: "В школе/шатре",
  other: "Другое",
};

const workLogFormSchema = z.object({
  employeeName: z.string().min(2, "Минимум 2 символа"),
  workType: z.string().min(1, "Выберите тип работы"),
  date: z.date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Формат ЧЧ:ММ"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Формат ЧЧ:ММ"),
  hourlyRate: z.string().optional(),
  note: z.string().optional(),
});

type WorkLogFormData = z.infer<typeof workLogFormSchema>;

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} мин`;
  if (mins === 0) return `${hours} ч`;
  return `${hours} ч ${mins} мин`;
}

function calculateMinutes(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  return endMinutes >= startMinutes ? endMinutes - startMinutes : (24 * 60 - startMinutes) + endMinutes;
}

export default function WorkLogsPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState<"today" | "week" | "month">("today");

  const { data: workLogs, isLoading } = useQuery<WorkLog[]>({
    queryKey: ["/api/owner/worklogs"],
  });

  const form = useForm<WorkLogFormData>({
    resolver: zodResolver(workLogFormSchema),
    defaultValues: {
      employeeName: "",
      workType: "other",
      date: new Date(),
      startTime: "09:00",
      endTime: "17:00",
      hourlyRate: "",
      note: "",
    },
  });

  const createWorkLogMutation = useMutation({
    mutationFn: async (data: WorkLogFormData) => {
      const dateStr = format(data.date, "yyyy-MM-dd");
      const startAt = `${dateStr}T${data.startTime}:00`;
      const endAt = `${dateStr}T${data.endTime}:00`;
      const durationMinutes = calculateMinutes(data.startTime, data.endTime);
      
      const hourlyRate = data.hourlyRate && data.hourlyRate.trim() !== "" ? parseFloat(data.hourlyRate) : undefined;
      const response = await apiRequest("POST", "/api/worklogs", {
        employeeName: data.employeeName,
        byAdmin: "current",
        startAt,
        endAt,
        workType: data.workType,
        hourlyRate: hourlyRate && !isNaN(hourlyRate) ? hourlyRate : undefined,
        note: data.note || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/worklogs"] });
      toast({ title: "Запись добавлена" });
      setIsCreateOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось добавить запись", variant: "destructive" });
    },
  });

  const onSubmit = (data: WorkLogFormData) => {
    createWorkLogMutation.mutate(data);
  };

  const filteredLogs = workLogs?.filter((log) => {
    const logDate = parseISO(log.startAt);
    const now = new Date();
    
    switch (filterPeriod) {
      case "today":
        return format(logDate, "yyyy-MM-dd") === format(now, "yyyy-MM-dd");
      case "week":
        return isWithinInterval(logDate, {
          start: startOfWeek(now, { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 }),
        });
      case "month":
        return isWithinInterval(logDate, {
          start: startOfMonth(now),
          end: endOfMonth(now),
        });
      default:
        return true;
    }
  }) || [];

  const totalMinutes = filteredLogs.reduce((sum, log) => sum + log.durationMinutes, 0);
  const uniqueEmployees = new Set(filteredLogs.map(log => log.employeeName)).size;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Рабочее время" showBack />
      
      <PageContainer>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <Tabs value={filterPeriod} onValueChange={(v) => setFilterPeriod(v as typeof filterPeriod)} className="flex-1">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="today" data-testid="tab-today">Сегодня</TabsTrigger>
                <TabsTrigger value="week" data-testid="tab-week">Неделя</TabsTrigger>
                <TabsTrigger value="month" data-testid="tab-month">Месяц</TabsTrigger>
              </TabsList>
            </Tabs>
            
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="icon" data-testid="button-add-worklog">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Добавить запись</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="employeeName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Сотрудник</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Имя сотрудника" 
                              {...field} 
                              data-testid="input-employee-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="workType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Тип работы</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-work-type">
                                <SelectValue placeholder="Выберите тип" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {WORK_TYPES.map((type) => (
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
                      name="date"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Дата</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full pl-3 text-left font-normal justify-start gap-2",
                                    !field.value && "text-muted-foreground"
                                  )}
                                  data-testid="button-date-picker"
                                >
                                  <CalendarIcon className="h-4 w-4" />
                                  {field.value ? (
                                    format(field.value, "d MMMM yyyy", { locale: ru })
                                  ) : (
                                    <span>Выберите дату</span>
                                  )}
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
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="startTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Начало</FormLabel>
                            <FormControl>
                              <Input 
                                type="time" 
                                {...field} 
                                data-testid="input-start-time"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="endTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Окончание</FormLabel>
                            <FormControl>
                              <Input 
                                type="time" 
                                {...field} 
                                data-testid="input-end-time"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="hourlyRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ставка (BYN/час)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="0" 
                              {...field} 
                              data-testid="input-hourly-rate"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="note"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Примечание</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Опционально" 
                              {...field} 
                              data-testid="input-note"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={createWorkLogMutation.isPending}
                      data-testid="button-submit-worklog"
                    >
                      {createWorkLogMutation.isPending ? "Сохранение..." : "Сохранить"}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Timer className="h-4 w-4" />
                  <span className="text-sm">Всего часов</span>
                </div>
                <p className="text-2xl font-semibold" data-testid="text-total-hours">
                  {formatDuration(totalMinutes)}
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <User className="h-4 w-4" />
                  <span className="text-sm">Сотрудников</span>
                </div>
                <p className="text-2xl font-semibold" data-testid="text-employee-count">
                  {uniqueEmployees}
                </p>
              </CardContent>
            </Card>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <TaskCardSkeleton />
              <TaskCardSkeleton />
            </div>
          ) : filteredLogs.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Нет записей"
              description="Добавьте первую запись рабочего времени"
            />
          ) : (
            <div className="space-y-3">
              {filteredLogs.map((log) => (
                <Card key={log.id} data-testid={`card-worklog-${log.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{log.employeeName}</span>
                      </div>
                      <Badge variant="secondary">
                        {workTypeLabels[log.workType] || log.workType}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        <span>{format(parseISO(log.startAt), "d MMM", { locale: ru })}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>
                          {format(parseISO(log.startAt), "HH:mm")} - {format(parseISO(log.endAt), "HH:mm")}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Timer className="h-3 w-3" />
                        <span>{formatDuration(log.durationMinutes)}</span>
                      </div>
                    </div>
                    
                    {log.note && (
                      <p className="text-sm text-muted-foreground mt-2">{log.note}</p>
                    )}
                    
                    {log.hourlyRate && (
                      <p className="text-sm font-medium mt-2">
                        {((log.durationMinutes / 60) * log.hourlyRate).toFixed(2)} BYN
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </PageContainer>
      
      <BottomNav />
    </div>
  );
}
