import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Thermometer, Flame, Check, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import type { ThermostatDailyPlan, ThermostatActionLog } from "@shared/schema";

type PlanType = "CHECKIN_TODAY" | "NO_CHECKIN" | "GUESTS_STAYING";

interface ThermostatHouseWithPlan {
  id: string;
  houseId: number;
  name: string;
  currentTemp?: number;
  targetTemp?: number;
  mode?: string;
  online: boolean;
  lastUpdated?: string;
  todayPlan: ThermostatDailyPlan | null;
}

const planLabels: Record<PlanType, string> = {
  CHECKIN_TODAY: "Сегодня будет заселение",
  NO_CHECKIN: "Сегодня заселения не будет",
  GUESTS_STAYING: "Гости живут (не менять)",
};

const planColors: Record<PlanType, string> = {
  CHECKIN_TODAY: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  NO_CHECKIN: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  GUESTS_STAYING: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

export default function ThermostatsPage() {
  const { toast } = useToast();
  const [selectedPlans, setSelectedPlans] = useState<Record<number, PlanType>>({});
  const [heatNowHouseId, setHeatNowHouseId] = useState<number | null>(null);
  const [manualTemp, setManualTemp] = useState<Record<number, string>>({});
  const [selectedLogHouse, setSelectedLogHouse] = useState<number | null>(null);
  
  const today = new Date().toLocaleDateString("ru-RU", { 
    weekday: "long", 
    day: "numeric", 
    month: "long" 
  });

  const { data: houses = [], isLoading, refetch } = useQuery<ThermostatHouseWithPlan[]>({
    queryKey: ["/api/admin/thermostats/houses"],
  });

  const { data: logs = [] } = useQuery<ThermostatActionLog[]>({
    queryKey: ["/api/admin/thermostats/logs", { houseId: selectedLogHouse }],
    queryFn: async () => {
      const token = localStorage.getItem("drewno_session");
      const url = selectedLogHouse !== null 
        ? `/api/admin/thermostats/logs?houseId=${selectedLogHouse}&limit=20`
        : `/api/admin/thermostats/logs?limit=20`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
  });

  const plansSet = houses.filter(h => h.todayPlan).length;
  const allPlansSet = plansSet === 4;

  const savePlanMutation = useMutation({
    mutationFn: async (plans: { houseId: number; planType: PlanType }[]) => {
      const token = localStorage.getItem("drewno_session");
      const res = await fetch("/api/admin/thermostats/plan/today", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify(plans),
      });
      if (!res.ok) throw new Error("Failed to save plans");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/thermostats/houses"] });
      toast({ title: "План сохранён" });
      setSelectedPlans({});
    },
    onError: () => {
      toast({ title: "Ошибка сохранения", variant: "destructive" });
    },
  });

  const heatNowMutation = useMutation({
    mutationFn: async (houseId: number) => {
      const token = localStorage.getItem("drewno_session");
      const res = await fetch(`/api/admin/thermostats/houses/${houseId}/heat-now`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to heat");
      return res.json();
    },
    onSuccess: (_, houseId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/thermostats/houses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/thermostats/logs"] });
      toast({ title: `Домик ${houseId} начал прогрев до 22°C` });
      setHeatNowHouseId(null);
    },
    onError: () => {
      toast({ title: "Ошибка прогрева", variant: "destructive" });
      setHeatNowHouseId(null);
    },
  });

  const setTempMutation = useMutation({
    mutationFn: async ({ houseId, temp }: { houseId: number; temp: number }) => {
      const token = localStorage.getItem("drewno_session");
      const res = await fetch(`/api/admin/thermostats/houses/${houseId}/set-temp`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ temp }),
      });
      if (!res.ok) throw new Error("Failed to set temp");
      return res.json();
    },
    onSuccess: (_, { houseId, temp }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/thermostats/houses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/thermostats/logs"] });
      toast({ title: `Установлено ${temp}°C для домика ${houseId}` });
      setManualTemp({ ...manualTemp, [houseId]: "" });
    },
    onError: () => {
      toast({ title: "Ошибка установки температуры", variant: "destructive" });
    },
  });

  const handleSavePlan = (houseId: number) => {
    const planType = selectedPlans[houseId];
    if (planType) {
      savePlanMutation.mutate([{ houseId, planType }]);
    }
  };

  const handleSaveAllPlans = () => {
    const plans = Object.entries(selectedPlans).map(([houseId, planType]) => ({
      houseId: parseInt(houseId, 10),
      planType,
    }));
    if (plans.length > 0) {
      savePlanMutation.mutate(plans);
    }
  };

  const handleSetTemp = (houseId: number) => {
    const temp = parseFloat(manualTemp[houseId] || "");
    if (!isNaN(temp) && temp >= 5 && temp <= 35) {
      setTempMutation.mutate({ houseId, temp });
    } else {
      toast({ title: "Температура должна быть от 5 до 35°C", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-50 bg-background border-b p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link href="/owner/settings">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <Thermometer className="h-5 w-5" />
                Термостаты
              </h1>
              <p className="text-sm text-muted-foreground">{today}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <Card className={allPlansSet ? "border-green-500" : "border-orange-500"}>
          <CardContent className="p-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {allPlansSet ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-orange-600" />
              )}
              <span className="text-sm font-medium">
                {allPlansSet ? "Опрос на сегодня заполнен" : `Заполнено ${plansSet}/4 домиков`}
              </span>
            </div>
            {Object.keys(selectedPlans).length > 0 && (
              <Button 
                size="sm" 
                onClick={handleSaveAllPlans}
                disabled={savePlanMutation.isPending}
                data-testid="button-save-all"
              >
                {savePlanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить все"}
              </Button>
            )}
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : houses.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-center text-muted-foreground">
              Домики не найдены. Перезагрузите страницу.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {houses.map(house => (
              <Card key={house.houseId} data-testid={`card-house-${house.houseId}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      Домик {house.houseId}
                      <Badge variant={house.online ? "default" : "secondary"} className="text-xs">
                        {house.online ? "Online" : "Offline"}
                      </Badge>
                    </CardTitle>
                    {house.todayPlan && (
                      <Badge className={planColors[house.todayPlan.planType as PlanType]}>
                        {planLabels[house.todayPlan.planType as PlanType]}
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="flex items-center gap-4">
                    {house.currentTemp !== undefined && (
                      <span>Текущая: {house.currentTemp?.toFixed(1)}°C</span>
                    )}
                    {house.targetTemp !== undefined && (
                      <span>Цель: {house.targetTemp}°C</span>
                    )}
                    {house.mode && <span>Режим: {house.mode}</span>}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs">План на сегодня</Label>
                    <div className="flex gap-2">
                      <Select
                        value={selectedPlans[house.houseId] || house.todayPlan?.planType || ""}
                        onValueChange={(v) => setSelectedPlans({ ...selectedPlans, [house.houseId]: v as PlanType })}
                      >
                        <SelectTrigger className="flex-1" data-testid={`select-plan-${house.houseId}`}>
                          <SelectValue placeholder="Выберите план" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CHECKIN_TODAY">Сегодня заселение</SelectItem>
                          <SelectItem value="NO_CHECKIN">Заселения не будет</SelectItem>
                          <SelectItem value="GUESTS_STAYING">Гости живут</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button 
                        size="sm"
                        onClick={() => handleSavePlan(house.houseId)}
                        disabled={!selectedPlans[house.houseId] || savePlanMutation.isPending}
                        data-testid={`button-save-plan-${house.houseId}`}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => setHeatNowHouseId(house.houseId)}
                      disabled={heatNowMutation.isPending}
                      data-testid={`button-heat-now-${house.houseId}`}
                    >
                      <Flame className="h-4 w-4 mr-1" />
                      Греть сейчас (22°C)
                    </Button>
                    <div className="flex gap-1 flex-1">
                      <Input
                        type="number"
                        min={5}
                        max={35}
                        placeholder="°C"
                        value={manualTemp[house.houseId] || ""}
                        onChange={(e) => setManualTemp({ ...manualTemp, [house.houseId]: e.target.value })}
                        className="w-20"
                        data-testid={`input-temp-${house.houseId}`}
                      />
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleSetTemp(house.houseId)}
                        disabled={!manualTemp[house.houseId] || setTempMutation.isPending}
                        data-testid={`button-set-temp-${house.houseId}`}
                      >
                        Установить
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Журнал действий</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2 mb-2">
              <Button 
                variant={selectedLogHouse === null ? "default" : "outline"} 
                size="sm"
                onClick={() => setSelectedLogHouse(null)}
              >
                Все
              </Button>
              {[1, 2, 3, 4].map(i => (
                <Button 
                  key={i}
                  variant={selectedLogHouse === i ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setSelectedLogHouse(i)}
                >
                  Д{i}
                </Button>
              ))}
            </div>
            
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет записей</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {logs.slice(0, 20).map(log => (
                  <div 
                    key={log.id} 
                    className="text-xs flex justify-between items-center py-1 border-b last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">Д{log.houseId}</Badge>
                      <span>{log.actionType}</span>
                      {log.targetTemp && <span className="font-medium">{log.targetTemp}°C</span>}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Badge variant={log.result === "success" ? "default" : "destructive"} className="text-xs">
                        {log.result}
                      </Badge>
                      <span>{new Date(log.ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={heatNowHouseId !== null} onOpenChange={() => setHeatNowHouseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Начать прогрев?</AlertDialogTitle>
            <AlertDialogDescription>
              Домик {heatNowHouseId} будет прогреваться до 22°C. Это действие применится немедленно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => heatNowHouseId && heatNowMutation.mutate(heatNowHouseId)}
              disabled={heatNowMutation.isPending}
            >
              {heatNowMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Начать прогрев"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
