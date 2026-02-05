import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Plus, Trash2, Clock, Home, Droplets, Users } from "lucide-react";
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
  const today = format(new Date(), "yyyy-MM-dd");
  const todayDisplay = format(new Date(), "d MMMM yyyy", { locale: ru });

  const [isCleaningDialogOpen, setIsCleaningDialogOpen] = useState(false);
  const [isHourlyDialogOpen, setIsHourlyDialogOpen] = useState(false);

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
        date: today,
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
        date: today,
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
      toast({ title: "Часы добавлены" });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const deleteCleaningMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/cleaning-logs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cleaning-logs"] });
      toast({ title: "Удалено" });
    },
  });

  const deleteHourlyMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/hourly-logs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hourly-logs"] });
      toast({ title: "Удалено" });
    },
  });

  const totalCleaningAmount = cleaningLogs.reduce((sum, log) => sum + log.rate, 0);
  const totalHourlyAmount = hourlyLogs.reduce((sum, log) => sum + log.totalAmount, 0);
  const totalHourlyMinutes = hourlyLogs.reduce((sum, log) => sum + log.durationMinutes, 0);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Сотрудники" showBack />

      <main className="flex-1 p-4 space-y-4">
        <div className="text-center text-muted-foreground text-sm">
          {todayDisplay}
        </div>

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
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Уборки сегодня</CardTitle>
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
              <CardContent>
                {cleaningLogs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Нет записей</p>
                ) : (
                  <div className="space-y-2">
                    {cleaningLogs.map(log => (
                      <div key={log.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <div className="font-medium">{log.workerName}</div>
                          <div className="text-sm text-muted-foreground">
                            {CLEANING_UNITS.find(u => u.code === log.unitCode)?.label || log.unitCode}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{log.rate} BYN</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteCleaningMutation.mutate(log.id)}
                            data-testid={`button-delete-cleaning-${log.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {cleaningLogs.length > 0 && (
                  <div className="mt-4 pt-4 border-t flex justify-between text-sm font-medium">
                    <span>Итого:</span>
                    <span>{totalCleaningAmount} BYN</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hourly" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
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
              <CardContent>
                {hourlyLogs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Нет записей</p>
                ) : (
                  <div className="space-y-2">
                    {hourlyLogs.map(log => (
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
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{log.totalAmount.toFixed(2)} BYN</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteHourlyMutation.mutate(log.id)}
                            data-testid={`button-delete-hourly-${log.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {hourlyLogs.length > 0 && (
                  <div className="mt-4 pt-4 border-t space-y-1">
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
