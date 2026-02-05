import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Edit, Users, Banknote } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CleaningWorker, CleaningRate } from "@shared/schema";

const CLEANING_UNITS = [
  { code: "D1", label: "Домик 1" },
  { code: "D2", label: "Домик 2" },
  { code: "D3", label: "Домик 3" },
  { code: "D4", label: "Домик 4" },
  { code: "SPA1", label: "Баня левая" },
  { code: "SPA2", label: "Баня правая" },
];

export default function StaffSettingsPage() {
  const { toast } = useToast();
  
  const [isWorkerDialogOpen, setIsWorkerDialogOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<CleaningWorker | null>(null);
  const [workerName, setWorkerName] = useState("");
  const [workerHourlyRate, setWorkerHourlyRate] = useState("10");

  const { data: workers = [] } = useQuery<CleaningWorker[]>({
    queryKey: ["/api/admin/cleaning-workers"],
  });

  const { data: rates = [] } = useQuery<CleaningRate[]>({
    queryKey: ["/api/admin/cleaning-rates"],
  });

  const getRateForUnit = (unitCode: string) => {
    const rate = rates.find(r => r.unitCode === unitCode);
    return rate?.rate || 0;
  };

  const createWorkerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/cleaning-workers", {
        name: workerName,
        hourlyRate: parseFloat(workerHourlyRate) || 10,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cleaning-workers"] });
      setIsWorkerDialogOpen(false);
      setWorkerName("");
      setWorkerHourlyRate("10");
      toast({ title: "Сотрудник добавлен" });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const updateWorkerMutation = useMutation({
    mutationFn: async () => {
      if (!editingWorker) return;
      return apiRequest("PATCH", `/api/admin/cleaning-workers/${editingWorker.id}`, {
        name: workerName,
        hourlyRate: parseFloat(workerHourlyRate) || 10,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cleaning-workers"] });
      setEditingWorker(null);
      setWorkerName("");
      setWorkerHourlyRate("10");
      toast({ title: "Сотрудник обновлён" });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const toggleWorkerMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/admin/cleaning-workers/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cleaning-workers"] });
    },
  });

  const updateRateMutation = useMutation({
    mutationFn: async ({ unitCode, rate }: { unitCode: string; rate: number }) => {
      return apiRequest("POST", "/api/admin/cleaning-rates", { unitCode, rate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cleaning-rates"] });
      toast({ title: "Тариф обновлён" });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const openEditWorker = (worker: CleaningWorker) => {
    setEditingWorker(worker);
    setWorkerName(worker.name);
    setWorkerHourlyRate(String(worker.hourlyRate || 10));
  };

  const closeWorkerDialog = () => {
    setIsWorkerDialogOpen(false);
    setEditingWorker(null);
    setWorkerName("");
    setWorkerHourlyRate("10");
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Настройки персонала" showBack />

      <main className="flex-1 p-4 space-y-4">
        <Tabs defaultValue="workers" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="workers" data-testid="tab-workers">
              <Users className="h-4 w-4 mr-2" />
              Сотрудники
            </TabsTrigger>
            <TabsTrigger value="rates" data-testid="tab-rates">
              <Banknote className="h-4 w-4 mr-2" />
              Тарифы
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workers" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Сотрудники уборки</CardTitle>
                <Dialog open={isWorkerDialogOpen} onOpenChange={setIsWorkerDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-add-worker">
                      <Plus className="h-4 w-4 mr-1" />
                      Добавить
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Новый сотрудник</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Имя</Label>
                        <Input
                          value={workerName}
                          onChange={e => setWorkerName(e.target.value)}
                          placeholder="Введите имя"
                          data-testid="input-worker-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Почасовая ставка (BYN)</Label>
                        <Input
                          type="number"
                          value={workerHourlyRate}
                          onChange={e => setWorkerHourlyRate(e.target.value)}
                          placeholder="10"
                          data-testid="input-worker-rate"
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => createWorkerMutation.mutate()}
                        disabled={!workerName || createWorkerMutation.isPending}
                        data-testid="button-submit-worker"
                      >
                        {createWorkerMutation.isPending ? "Сохранение..." : "Сохранить"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {workers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Нет сотрудников</p>
                ) : (
                  <div className="space-y-2">
                    {workers.map(worker => (
                      <div key={worker.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <div className="font-medium">{worker.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {worker.hourlyRate || 10} BYN/час
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={worker.isActive}
                            onCheckedChange={isActive => toggleWorkerMutation.mutate({ id: worker.id, isActive })}
                            data-testid={`switch-worker-${worker.id}`}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEditWorker(worker)}
                            data-testid={`button-edit-worker-${worker.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Dialog open={!!editingWorker} onOpenChange={() => closeWorkerDialog()}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Редактировать сотрудника</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Имя</Label>
                    <Input
                      value={workerName}
                      onChange={e => setWorkerName(e.target.value)}
                      placeholder="Введите имя"
                      data-testid="input-edit-worker-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Почасовая ставка (BYN)</Label>
                    <Input
                      type="number"
                      value={workerHourlyRate}
                      onChange={e => setWorkerHourlyRate(e.target.value)}
                      placeholder="10"
                      data-testid="input-edit-worker-rate"
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => updateWorkerMutation.mutate()}
                    disabled={!workerName || updateWorkerMutation.isPending}
                    data-testid="button-update-worker"
                  >
                    {updateWorkerMutation.isPending ? "Сохранение..." : "Сохранить"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="rates" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Тарифы за уборку</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {CLEANING_UNITS.map(unit => (
                    <div key={unit.code} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="font-medium">{unit.label}</div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          className="w-24 text-right"
                          value={getRateForUnit(unit.code)}
                          onChange={e => {
                            const rate = parseFloat(e.target.value) || 0;
                            updateRateMutation.mutate({ unitCode: unit.code, rate });
                          }}
                          data-testid={`input-rate-${unit.code}`}
                        />
                        <span className="text-sm text-muted-foreground">BYN</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
