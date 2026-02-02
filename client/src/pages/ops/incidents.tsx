import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Plus, AlertTriangle, Wrench, CheckCircle, Clock, XCircle } from "lucide-react";
import { Link } from "wouter";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageLoading } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Incident, Unit } from "@shared/schema";

const PRIORITY_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  low: { label: "Низкий", variant: "secondary" },
  medium: { label: "Средний", variant: "default" },
  high: { label: "Высокий", variant: "destructive" },
  critical: { label: "Критический", variant: "destructive" },
};

const STATUS_LABELS: Record<string, { label: string; icon: typeof AlertTriangle }> = {
  open: { label: "Открыт", icon: AlertTriangle },
  in_progress: { label: "В работе", icon: Wrench },
  resolved: { label: "Решён", icon: CheckCircle },
  closed: { label: "Закрыт", icon: XCircle },
};

export default function IncidentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [activeTab, setActiveTab] = useState("open");
  
  const [newIncident, setNewIncident] = useState({
    unitCode: "",
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high" | "critical",
  });

  const { data: incidents = [], isLoading } = useQuery<Incident[]>({
    queryKey: ["/api/incidents"],
  });
  
  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["/api/units"],
  });

  const createMutation = useMutation({
    mutationFn: async (incident: typeof newIncident) => {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(incident),
      });
      if (!res.ok) throw new Error("Failed to create incident");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      setShowAddDialog(false);
      setNewIncident({ unitCode: "", title: "", description: "", priority: "medium" });
      toast({ title: "Инцидент создан" });
    },
  });
  
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Incident> }) => {
      const res = await fetch(`/api/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update incident");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      setShowDetailsDialog(false);
      setSelectedIncident(null);
      toast({ title: "Инцидент обновлён" });
    },
  });

  const handleAddIncident = () => {
    if (!newIncident.unitCode || !newIncident.title) {
      toast({ title: "Заполните юнит и заголовок", variant: "destructive" });
      return;
    }
    createMutation.mutate(newIncident);
  };

  const handleStatusChange = (incident: Incident, newStatus: string) => {
    updateMutation.mutate({
      id: incident.id,
      updates: { status: newStatus as Incident["status"] },
    });
  };

  const openDetails = (incident: Incident) => {
    setSelectedIncident(incident);
    setShowDetailsDialog(true);
  };

  const openIncidents = incidents.filter((i) => i.status === "open" || i.status === "in_progress");
  const closedIncidents = incidents.filter((i) => i.status === "resolved" || i.status === "cancelled");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <PageLoading />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-56">
      <header className="sticky top-0 z-50 bg-background border-b p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link href="/ops">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-lg font-semibold">Инциденты и ремонты</h1>
          </div>
          <Button size="sm" onClick={() => setShowAddDialog(true)} data-testid="button-add-incident">
            <Plus className="h-4 w-4 mr-1" />
            Добавить
          </Button>
        </div>
      </header>

      <main className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full mb-4">
            <TabsTrigger value="open" className="flex-1" data-testid="tab-open">
              Активные ({openIncidents.length})
            </TabsTrigger>
            <TabsTrigger value="closed" className="flex-1" data-testid="tab-closed">
              Закрытые ({closedIncidents.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="space-y-3">
            {openIncidents.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                Нет активных инцидентов
              </div>
            ) : (
              openIncidents.map((incident) => {
                const StatusIcon = STATUS_LABELS[incident.status]?.icon || AlertTriangle;
                return (
                  <Card
                    key={incident.id}
                    className="cursor-pointer hover-elevate"
                    onClick={() => openDetails(incident)}
                    data-testid={`incident-${incident.id}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <StatusIcon className="h-4 w-4" />
                          <CardTitle className="text-sm">{incident.title}</CardTitle>
                        </div>
                        <Badge variant={PRIORITY_LABELS[incident.priority]?.variant || "secondary"}>
                          {PRIORITY_LABELS[incident.priority]?.label || incident.priority}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs">
                        {incident.unitCode} - {new Date(incident.reportedAt).toLocaleDateString("ru-RU")}
                      </CardDescription>
                    </CardHeader>
                    {incident.description && (
                      <CardContent className="pt-0">
                        <p className="text-sm text-muted-foreground line-clamp-2">{incident.description}</p>
                      </CardContent>
                    )}
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="closed" className="space-y-3">
            {closedIncidents.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                Нет закрытых инцидентов
              </div>
            ) : (
              closedIncidents.map((incident) => (
                <Card
                  key={incident.id}
                  className="cursor-pointer opacity-75 hover-elevate"
                  onClick={() => openDetails(incident)}
                  data-testid={`incident-${incident.id}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <CardTitle className="text-sm">{incident.title}</CardTitle>
                      </div>
                      <Badge variant="outline">{incident.unitCode}</Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Решён {incident.resolvedAt ? new Date(incident.resolvedAt).toLocaleDateString("ru-RU") : ""}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый инцидент</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Юнит</Label>
              <Select value={newIncident.unitCode} onValueChange={(v) => setNewIncident({ ...newIncident, unitCode: v })}>
                <SelectTrigger data-testid="select-unit">
                  <SelectValue placeholder="Выберите юнит" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.code} value={unit.code}>{unit.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Заголовок</Label>
              <Input
                value={newIncident.title}
                onChange={(e) => setNewIncident({ ...newIncident, title: e.target.value })}
                placeholder="Краткое описание проблемы"
                data-testid="input-title"
              />
            </div>
            <div>
              <Label>Приоритет</Label>
              <Select value={newIncident.priority} onValueChange={(v: typeof newIncident.priority) => setNewIncident({ ...newIncident, priority: v })}>
                <SelectTrigger data-testid="select-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Низкий</SelectItem>
                  <SelectItem value="medium">Средний</SelectItem>
                  <SelectItem value="high">Высокий</SelectItem>
                  <SelectItem value="critical">Критический</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Описание (необязательно)</Label>
              <Textarea
                value={newIncident.description}
                onChange={(e) => setNewIncident({ ...newIncident, description: e.target.value })}
                placeholder="Подробности..."
                data-testid="input-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Отмена</Button>
            <Button onClick={handleAddIncident} disabled={createMutation.isPending} data-testid="button-save-incident">
              {createMutation.isPending ? "Сохранение..." : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedIncident?.title}</DialogTitle>
          </DialogHeader>
          {selectedIncident && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge>{selectedIncident.unitCode}</Badge>
                <Badge variant={PRIORITY_LABELS[selectedIncident.priority]?.variant || "secondary"}>
                  {PRIORITY_LABELS[selectedIncident.priority]?.label}
                </Badge>
              </div>
              
              {selectedIncident.description && (
                <p className="text-sm text-muted-foreground">{selectedIncident.description}</p>
              )}
              
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Создан: {new Date(selectedIncident.reportedAt).toLocaleString("ru-RU")}</p>
                {selectedIncident.resolvedAt && (
                  <p>Решён: {new Date(selectedIncident.resolvedAt).toLocaleString("ru-RU")}</p>
                )}
              </div>
              
              <div>
                <Label>Статус</Label>
                <Select
                  value={selectedIncident.status}
                  onValueChange={(v) => handleStatusChange(selectedIncident, v)}
                >
                  <SelectTrigger data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Открыт</SelectItem>
                    <SelectItem value="in_progress">В работе</SelectItem>
                    <SelectItem value="resolved">Решён</SelectItem>
                    <SelectItem value="closed">Закрыт</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
