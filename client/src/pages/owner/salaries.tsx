import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { ru } from "date-fns/locale";
import { CheckCircle, Clock, Banknote, Calendar, Lock } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import type { SalaryPeriod, CleaningLog, HourlyLog } from "@shared/schema";

export default function SalariesPage() {
  const { toast } = useToast();
  
  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const prevMonth = format(subMonths(now, 1), "yyyy-MM");
  
  const [selectedMonth, setSelectedMonth] = useState(prevMonth);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);

  const { data: salaryPeriods = [] } = useQuery<SalaryPeriod[]>({
    queryKey: ["/api/owner/salary-periods", selectedMonth],
    queryFn: async () => {
      const res = await fetch(`/api/owner/salary-periods?month=${selectedMonth}`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: cleaningLogs = [] } = useQuery<CleaningLog[]>({
    queryKey: ["/api/owner/cleaning-logs", selectedMonth],
    queryFn: async () => {
      const res = await fetch(`/api/owner/cleaning-logs/${selectedMonth}`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: hourlyLogs = [] } = useQuery<HourlyLog[]>({
    queryKey: ["/api/owner/hourly-logs", selectedMonth],
    queryFn: async () => {
      const res = await fetch(`/api/owner/hourly-logs/${selectedMonth}`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const closeMonthMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/owner/salary-periods/close", { month: selectedMonth });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/salary-periods", selectedMonth] });
      setIsCloseDialogOpen(false);
      toast({ title: "Месяц закрыт" });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/owner/salary-periods/${id}/pay`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/salary-periods", selectedMonth] });
      toast({ title: "Отмечено как выплачено" });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const isClosed = salaryPeriods.length > 0;
  const isCurrentMonth = selectedMonth === currentMonth;

  const totalCleaning = cleaningLogs.reduce((sum, log) => sum + log.rate, 0);
  const totalHourly = hourlyLogs.reduce((sum, log) => sum + log.totalAmount, 0);
  const totalHourlyMinutes = hourlyLogs.reduce((sum, log) => sum + log.durationMinutes, 0);
  const totalUnpaid = salaryPeriods.filter(p => !p.isPaid).reduce((sum, p) => sum + p.totalAmount, 0);

  const workerStats = new Map<string, { 
    name: string; 
    cleaningCount: number; 
    cleaningTotal: number; 
    hourlyMinutes: number; 
    hourlyTotal: number;
  }>();

  cleaningLogs.forEach(log => {
    const stats = workerStats.get(log.workerId) || { 
      name: log.workerName, 
      cleaningCount: 0, 
      cleaningTotal: 0,
      hourlyMinutes: 0,
      hourlyTotal: 0,
    };
    stats.cleaningCount++;
    stats.cleaningTotal += log.rate;
    workerStats.set(log.workerId, stats);
  });

  hourlyLogs.forEach(log => {
    const stats = workerStats.get(log.workerId) || { 
      name: log.workerName, 
      cleaningCount: 0, 
      cleaningTotal: 0,
      hourlyMinutes: 0,
      hourlyTotal: 0,
    };
    stats.hourlyMinutes += log.durationMinutes;
    stats.hourlyTotal += log.totalAmount;
    workerStats.set(log.workerId, stats);
  });

  const months = [];
  for (let i = 0; i < 6; i++) {
    const date = subMonths(now, i);
    months.push({
      value: format(date, "yyyy-MM"),
      label: format(date, "LLLL yyyy", { locale: ru }),
    });
  }

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}ч ${m}м` : `${m}м`;
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Зарплаты" showBack />

      <main className="flex-1 p-4 space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {months.map(m => (
            <Button
              key={m.value}
              variant={selectedMonth === m.value ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedMonth(m.value)}
              className="whitespace-nowrap"
              data-testid={`button-month-${m.value}`}
            >
              {m.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{totalCleaning.toFixed(0)}</div>
              <div className="text-sm text-muted-foreground">BYN за уборки</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{totalHourly.toFixed(2)}</div>
              <div className="text-sm text-muted-foreground">BYN почасовая</div>
            </CardContent>
          </Card>
        </div>

        {isClosed ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Месяц закрыт
              </CardTitle>
              {totalUnpaid > 0 && (
                <Badge variant="destructive">{totalUnpaid.toFixed(2)} BYN не выплачено</Badge>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {salaryPeriods.map(period => (
                  <div key={period.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <div className="font-medium">{period.workerName}</div>
                      <div className="text-sm text-muted-foreground">
                        {period.cleaningCount} уборок, {formatDuration(period.hourlyMinutes)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{period.totalAmount.toFixed(2)} BYN</span>
                      {period.isPaid ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Выплачено
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => markPaidMutation.mutate(period.id)}
                          disabled={markPaidMutation.isPending}
                          data-testid={`button-pay-${period.id}`}
                        >
                          <Banknote className="h-4 w-4 mr-1" />
                          Выплатить
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">По сотрудникам</CardTitle>
                {!isCurrentMonth && (
                  <Dialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" data-testid="button-close-month">
                        <Lock className="h-4 w-4 mr-1" />
                        Закрыть месяц
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Закрыть месяц?</DialogTitle>
                      </DialogHeader>
                      <p className="text-muted-foreground">
                        После закрытия месяца данные будут зафиксированы и готовы к выплате.
                        Изменения больше не будут возможны.
                      </p>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCloseDialogOpen(false)}>
                          Отмена
                        </Button>
                        <Button
                          onClick={() => closeMonthMutation.mutate()}
                          disabled={closeMonthMutation.isPending}
                          data-testid="button-confirm-close"
                        >
                          {closeMonthMutation.isPending ? "Закрытие..." : "Закрыть"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent>
                {workerStats.size === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Нет данных за этот месяц</p>
                ) : (
                  <div className="space-y-2">
                    {Array.from(workerStats.entries()).map(([workerId, stats]) => (
                      <div key={workerId} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <div className="font-medium">{stats.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {stats.cleaningCount} уборок ({stats.cleaningTotal} BYN)
                            {stats.hourlyMinutes > 0 && ` + ${formatDuration(stats.hourlyMinutes)} (${stats.hourlyTotal.toFixed(2)} BYN)`}
                          </div>
                        </div>
                        <span className="font-medium text-lg">
                          {(stats.cleaningTotal + stats.hourlyTotal).toFixed(2)} BYN
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Всего часов: {formatDuration(totalHourlyMinutes)}
                </CardTitle>
              </CardHeader>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
