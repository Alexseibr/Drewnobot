import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Zap, Plus, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ElectricityMeter, ElectricityReading } from "@shared/schema";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface MeterWithStats extends ElectricityMeter {
  latestReading?: ElectricityReading;
  statistics?: {
    totalConsumption: number;
    avgDailyConsumption: number;
    readings: ElectricityReading[];
  };
}

export default function UtilitiesPage() {
  const { toast } = useToast();
  const [selectedMeter, setSelectedMeter] = useState<string | null>(null);
  const [newReading, setNewReading] = useState("");
  const [note, setNote] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: meters = [], isLoading: metersLoading } = useQuery<ElectricityMeter[]>({
    queryKey: ["/api/owner/electricity-meters"],
  });

  const { data: meterReadings = {}, isLoading: readingsLoading } = useQuery<Record<string, ElectricityReading[]>>({
    queryKey: ["/api/owner/electricity-meters", "readings"],
    queryFn: async () => {
      const token = localStorage.getItem("drewno_session");
      const results: Record<string, ElectricityReading[]> = {};
      for (const meter of meters) {
        const res = await fetch(`/api/owner/electricity-meters/${meter.id}/readings?limit=10`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include",
        });
        if (res.ok) {
          results[meter.id] = await res.json();
        }
      }
      return results;
    },
    enabled: meters.length > 0,
  });

  const { data: meterStats = {} } = useQuery<Record<string, MeterWithStats["statistics"]>>({
    queryKey: ["/api/owner/electricity-meters", "stats"],
    queryFn: async () => {
      const token = localStorage.getItem("drewno_session");
      const results: Record<string, MeterWithStats["statistics"]> = {};
      for (const meter of meters) {
        const res = await fetch(`/api/owner/electricity-meters/${meter.id}/statistics?days=30`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include",
        });
        if (res.ok) {
          results[meter.id] = await res.json();
        }
      }
      return results;
    },
    enabled: meters.length > 0,
  });

  const addReadingMutation = useMutation({
    mutationFn: async ({ meterId, reading, note }: { meterId: string; reading: number; note?: string }) => {
      return apiRequest("POST", `/api/owner/electricity-meters/${meterId}/readings`, { reading, note });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/electricity-meters"] });
      toast({ title: "Показание сохранено" });
      setShowAddDialog(false);
      setNewReading("");
      setNote("");
      setSelectedMeter(null);
    },
    onError: () => {
      toast({ title: "Ошибка сохранения", variant: "destructive" });
    },
  });

  const handleAddReading = () => {
    if (!selectedMeter || !newReading) return;
    const reading = parseFloat(newReading);
    if (isNaN(reading)) {
      toast({ title: "Введите корректное число", variant: "destructive" });
      return;
    }
    addReadingMutation.mutate({ meterId: selectedMeter, reading, note: note || undefined });
  };

  const isLoading = metersLoading || readingsLoading;

  return (
    <div className="min-h-screen bg-background pb-64">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-4 px-4 py-3">
          <Link href="/owner/settings">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Коммунальные услуги</h1>
            <p className="text-sm text-muted-foreground">Учёт электроэнергии</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {meters.map((meter) => {
                const readings = meterReadings[meter.id] || [];
                const stats = meterStats[meter.id];
                const latestReading = readings[0];
                const prevReading = readings[1];
                
                return (
                  <Card key={meter.id} className="overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <div className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-yellow-500" />
                        <CardTitle className="text-base">{meter.name}</CardTitle>
                      </div>
                      <Badge variant="outline" className="font-mono text-xs">
                        {meter.code}
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Текущее показание</p>
                          <p className="text-2xl font-bold" data-testid={`text-reading-${meter.id}`}>
                            {latestReading ? latestReading.reading.toLocaleString("ru-RU") : "—"}
                          </p>
                          {latestReading && (
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(latestReading.recordedAt), "d MMM yyyy, HH:mm", { locale: ru })}
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Потребление</p>
                          <div className="flex items-center gap-1">
                            <p className="text-2xl font-bold" data-testid={`text-consumption-${meter.id}`}>
                              {latestReading?.consumption != null ? latestReading.consumption.toLocaleString("ru-RU") : "—"}
                            </p>
                            {latestReading?.consumption != null && prevReading?.consumption != null && (
                              latestReading.consumption > prevReading.consumption ? (
                                <TrendingUp className="h-4 w-4 text-red-500" />
                              ) : latestReading.consumption < prevReading.consumption ? (
                                <TrendingDown className="h-4 w-4 text-green-500" />
                              ) : null
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">кВт·ч с посл. замера</p>
                        </div>
                      </div>
                      
                      {stats && (
                        <div className="pt-2 border-t">
                          <p className="text-xs text-muted-foreground mb-1">За 30 дней</p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Всего: </span>
                              <span className="font-medium">{stats.totalConsumption.toLocaleString("ru-RU")} кВт·ч</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Средн./день: </span>
                              <span className="font-medium">{stats.avgDailyConsumption.toFixed(1)} кВт·ч</span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setSelectedMeter(meter.id);
                          setShowAddDialog(true);
                        }}
                        data-testid={`button-add-reading-${meter.id}`}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Добавить показание
                      </Button>
                      
                      {readings.length > 0 && (
                        <div className="max-h-40 overflow-y-auto">
                          <p className="text-xs text-muted-foreground mb-2">История показаний</p>
                          <div className="space-y-1">
                            {readings.slice(0, 5).map((reading) => (
                              <div
                                key={reading.id}
                                className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0"
                              >
                                <span className="text-muted-foreground">
                                  {format(new Date(reading.recordedAt), "d MMM, HH:mm", { locale: ru })}
                                </span>
                                <div className="text-right">
                                  <span className="font-medium">{reading.reading.toLocaleString("ru-RU")}</span>
                                  {reading.consumption != null && (
                                    <span className="text-muted-foreground ml-2">
                                      (+{reading.consumption.toLocaleString("ru-RU")})
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            
            {meters.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Счётчики не найдены
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить показание</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reading">Показание счётчика (кВт·ч)</Label>
              <Input
                id="reading"
                type="number"
                placeholder="Введите показание"
                value={newReading}
                onChange={(e) => setNewReading(e.target.value)}
                data-testid="input-reading"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Примечание (необязательно)</Label>
              <Textarea
                id="note"
                placeholder="Примечание к показанию"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                data-testid="input-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false);
                setNewReading("");
                setNote("");
              }}
              data-testid="button-cancel-reading"
            >
              Отмена
            </Button>
            <Button
              onClick={handleAddReading}
              disabled={addReadingMutation.isPending || !newReading}
              data-testid="button-save-reading"
            >
              {addReadingMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
