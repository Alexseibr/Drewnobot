import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { ru } from "date-fns/locale";
import { Plus, Clock, Home } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CleaningWorker, CleaningLog, HourlyLog, CleaningRate } from "@shared/schema";

const CLEANING_UNITS = [
  { code: "D1", label: "Домик 1" },
  { code: "D2", label: "Домик 2" },
  { code: "D3", label: "Домик 3" },
  { code: "D4", label: "Домик 4" },
  { code: "SPA1", label: "Баня левая" },
  { code: "SPA2", label: "Баня правая" },
];

const WORK_TYPES = [
  { code: "bath_heating", label: "Топка бани" },
  { code: "tub_heating", label: "Топка купели" },
  { code: "other", label: "Другое" },
];

export default function StaffPage() {
  const { toast } = useToast();
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const yesterday = format(subDays(now, 1), "yyyy-MM-dd");
  const todayDisplay = format(now, "d MMMM", { locale: ru });
  const yesterdayDisplay = format(subDays(now, 1), "d MMMM", { locale: ru });

  const [isCleaningDialogOpen, setIsCleaningDialogOpen] = useState(false);
  const [isHourlyDialogOpen, setIsHourlyDialogOpen] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [selectedWorker, setSelectedWorker] = useState<string>("");
  const [selectedUnit, setSelectedUnit] = useState<string>("");
  const [selectedWorkType, setSelectedWorkType] = useState<string>("bath_heating");
  const [startTime, setStartTime] = useState<string>("14:00");
  const [endTime, setEndTime] = useState<string>("17:00");

  const { data: workers = [] } = useQuery<CleaningWorker[]>({
    queryKey: ["/api/admin/cleaning-workers"],
  });

  const { data: rates = [] } = useQuery<CleaningRate[]>({
    queryKey: ["/api/admin/cleaning-rates"],
  });

  const { data: cleaningLogs = [] } = useQuery<CleaningLog[]>({
    queryKey: ["/api/admin/cleaning-logs"],
  });

  const { data: hourlyLogs = [] } = useQuery<HourlyLog[]>({
    queryKey: ["/api/admin/hourly-logs"],
  });

  const getRateForUnit = (unitCode: string) => {
    const rate = rates.find(r => r.unitCode === unitCode);
    return rate?.rate || 0;
  };

  const getWorkerHourlyRate = (workerId: string) => {
    const worker = workers.find(w => w.id === workerId);
    return worker?.hourlyRate || 10;
  };

  const createCleaningMutation = useMutation({
    mutationFn: async () => {
      const worker = workers.find(w => w.id === selectedWorker);
      if (!worker) throw new Error("Выберите сотрудника");
      
      return apiRequest("POST", "/api/admin/cleaning-logs", {
        date: selectedDate,
        unitCode: selectedUnit,
        workerId: selectedWorker,
        workerName: worker.name,
        rate: getRateForUnit(selectedUnit),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cleaning-logs"] });
      setIsCleaningDialogOpen(false);
      setSelectedWorker("");
      setSelectedUnit("");
      setSelectedDate(today);
      toast({ title: "Уборка добавлена" });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const createHourlyMutation = useMutation({
    mutationFn: async () => {
      const worker = workers.find(w => w.id === selectedWorker);
      if (!worker) throw new Error("Выберите сотрудника");
      
      return apiRequest("POST", "/api/admin/hourly-logs", {
        date: selectedDate,
        workerId: selectedWorker,
        workerName: worker.name,
        workType: selectedWorkType,
        startTime,
        endTime,
        hourlyRate: getWorkerHourlyRate(selectedWorker),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hourly-logs"] });
      setIsHourlyDialogOpen(false);
      setSelectedWorker("");
      setStartTime("14:00");
      setEndTime("17:00");
      setSelectedDate(today);
      toast({ title: "Часы добавлены" });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const todayCleaningLogs = cleaningLogs.filter(l => l.date === today);
  const yesterdayCleaningLogs = cleaningLogs.filter(l => l.date === yesterday);
  const olderCleaningLogs = cleaningLogs.filter(l => l.date !== today && l.date !== yesterday);
  const todayHourlyLogs = hourlyLogs.filter(l => l.date === today);
  const yesterdayHourlyLogs = hourlyLogs.filter(l => l.date === yesterday);
  const olderHourlyLogs = hourlyLogs.filter(l => l.date !== today && l.date !== yesterday);

  const totalCleaningAmount = cleaningLogs.reduce((sum, log) => sum + log.rate, 0);
  const totalHourlyAmount = hourlyLogs.reduce((sum, log) => sum + log.totalAmount, 0);
  const totalHourlyMinutes = hourlyLogs.reduce((sum, log) => sum + log.durationMinutes, 0);

  const renderCleaningLog = (log: CleaningLog) => (
    <div key={log.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
      <div>
        <div className="font-medium">{log.workerName}</div>
        <div className="text-sm text-muted-foreground">
          {CLEANING_UNITS.find(u => u.code === log.unitCode)?.label || log.unitCode}
        </div>
      </div>
      <span className="font-medium">{log.rate} BYN</span>
    </div>
  );

  const renderHourlyLog = (log: HourlyLog) => (
    <div key={log.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
      <div>
        <div className="font-medium">{log.workerName}</div>
        <div className="text-sm text-muted-foreground">
          {WORK_TYPES.find(t => t.code === log.workType)?.label || log.workType}
        </div>
        <div className="text-xs text-muted-foreground">
          {log.startTime} - {log.endTime} ({Math.floor(log.durationMinutes / 60)}ч {log.durationMinutes % 60}м)
        </div>
      </div>
      <span className="font-medium">{log.totalAmount.toFixed(2)} BYN</span>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Сотрудники" showBack />

      <main className="flex-1 p-4 space-y-4">
        <Tabs defaultValue="cleaning" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="cleaning" data-testid="tab-cleaning">
              <Home className="h-4 w-4 mr-2" />
              Уборки
            </TabsTrigger>
            <TabsTrigger value="hourly" data-testid="tab-hourly">
              <Clock className="h-4 w-4 mr-2" />
              Почасовая
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cleaning" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base">Журнал уборок</CardTitle>
                <Dialog open={isCleaningDialogOpen} onOpenChange={setIsCleaningDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-add-cleaning">
                      <Plus className="h-4 w-4 mr-1" />
                      Добавить
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Добавить уборку</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Дата</Label>
                        <Select value={selectedDate} onValueChange={setSelectedDate}>
                          <SelectTrigger data-testid="select-date-cleaning">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={today}>Сегодня ({todayDisplay})</SelectItem>
                            <SelectItem value={yesterday}>Вчера ({yesterdayDisplay})</SelectItem>
                            {/* Allow selecting older dates by adding subDays(now, n) if needed, 
                                or just let them edit since the API allows it now */}
                            {Array.from({ length: 5 }).map((_, i) => {
                              const date = subDays(now, i + 2);
                              const dateStr = format(date, "yyyy-MM-dd");
                              return (
                                <SelectItem key={dateStr} value={dateStr}>
                                  {format(date, "d MMMM", { locale: ru })}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Сотрудник</Label>
                        <Select value={selectedWorker} onValueChange={setSelectedWorker}>
                          <SelectTrigger data-testid="select-worker-cleaning">
                            <SelectValue placeholder="Выберите сотрудника" />
                          </SelectTrigger>
                          <SelectContent>
                            {workers.map(w => (
                              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Объект</Label>
                        <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                          <SelectTrigger data-testid="select-unit">
                            <SelectValue placeholder="Выберите объект" />
                          </SelectTrigger>
                          <SelectContent>
                            {CLEANING_UNITS.map(u => (
                              <SelectItem key={u.code} value={u.code}>
                                {u.label} ({getRateForUnit(u.code)} BYN)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => createCleaningMutation.mutate()}
                        disabled={!selectedWorker || !selectedUnit || createCleaningMutation.isPending}
                        data-testid="button-submit-cleaning"
                      >
                        {createCleaningMutation.isPending ? "Сохранение..." : "Сохранить"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-4">
                {todayCleaningLogs.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Сегодня ({todayDisplay})</div>
                    {todayCleaningLogs.map(renderCleaningLog)}
                  </div>
                )}
                {yesterdayCleaningLogs.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Вчера ({yesterdayDisplay})</div>
                    {yesterdayCleaningLogs.map(renderCleaningLog)}
                  </div>
                )}
                {olderCleaningLogs.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Ранее</div>
                    {olderCleaningLogs.map(renderCleaningLog)}
                  </div>
                )}
                {cleaningLogs.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">Нет записей</p>
                )}
                {cleaningLogs.length > 0 && (
                  <div className="pt-4 border-t flex justify-between text-sm font-medium">
                    <span>Итого:</span>
                    <span>{totalCleaningAmount} BYN</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hourly" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base">Почасовая работа</CardTitle>
                <Dialog open={isHourlyDialogOpen} onOpenChange={setIsHourlyDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-add-hourly">
                      <Plus className="h-4 w-4 mr-1" />
                      Добавить
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Добавить часы</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Дата</Label>
                        <Select value={selectedDate} onValueChange={setSelectedDate}>
                          <SelectTrigger data-testid="select-date-hourly">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={today}>Сегодня ({todayDisplay})</SelectItem>
                            <SelectItem value={yesterday}>Вчера ({yesterdayDisplay})</SelectItem>
                            {/* Allow selecting older dates by adding subDays(now, n) if needed, 
                                or just let them edit since the API allows it now */}
                            {Array.from({ length: 5 }).map((_, i) => {
                              const date = subDays(now, i + 2);
                              const dateStr = format(date, "yyyy-MM-dd");
                              return (
                                <SelectItem key={dateStr} value={dateStr}>
                                  {format(date, "d MMMM", { locale: ru })}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Сотрудник</Label>
                        <Select value={selectedWorker} onValueChange={setSelectedWorker}>
                          <SelectTrigger data-testid="select-worker-hourly">
                            <SelectValue placeholder="Выберите сотрудника" />
                          </SelectTrigger>
                          <SelectContent>
                            {workers.map(w => (
                              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Тип работы</Label>
                        <Select value={selectedWorkType} onValueChange={setSelectedWorkType}>
                          <SelectTrigger data-testid="select-work-type">
                            <SelectValue placeholder="Выберите тип" />
                          </SelectTrigger>
                          <SelectContent>
                            {WORK_TYPES.map(t => (
                              <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Пришёл</Label>
                          <Input
                            type="time"
                            value={startTime}
                            onChange={e => setStartTime(e.target.value)}
                            data-testid="input-start-time"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Ушёл</Label>
                          <Input
                            type="time"
                            value={endTime}
                            onChange={e => setEndTime(e.target.value)}
                            data-testid="input-end-time"
                          />
                        </div>
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => createHourlyMutation.mutate()}
                        disabled={!selectedWorker || createHourlyMutation.isPending}
                        data-testid="button-submit-hourly"
                      >
                        {createHourlyMutation.isPending ? "Сохранение..." : "Сохранить"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-4">
                {todayHourlyLogs.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Сегодня ({todayDisplay})</div>
                    {todayHourlyLogs.map(renderHourlyLog)}
                  </div>
                )}
                {yesterdayHourlyLogs.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Вчера ({yesterdayDisplay})</div>
                    {yesterdayHourlyLogs.map(renderHourlyLog)}
                  </div>
                )}
                {olderHourlyLogs.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Ранее</div>
                    {olderHourlyLogs.map(renderHourlyLog)}
                  </div>
                )}
                {hourlyLogs.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">Нет записей</p>
                )}
                {hourlyLogs.length > 0 && (
                  <div className="pt-4 border-t space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Всего часов:</span>
                      <span>{Math.floor(totalHourlyMinutes / 60)}ч {totalHourlyMinutes % 60}м</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                      <span>Итого:</span>
                      <span>{totalHourlyAmount.toFixed(2)} BYN</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
