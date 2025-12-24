import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Loader2, WashingMachine, Wind, Package, CheckCircle } from "lucide-react";
import type { LaundryBatch, LaundryBatchStatus, TextileColor, TextileType } from "@shared/schema";

const STATUS_LABELS: Record<LaundryBatchStatus, string> = {
  pending: "Ожидает",
  washing: "Стирка",
  drying: "Сушка",
  ready: "Готово",
  delivered: "Доставлено",
};

const STATUS_COLORS: Record<LaundryBatchStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  washing: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  drying: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  ready: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  delivered: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const COLOR_LABELS: Record<TextileColor, string> = {
  white: "Белый",
  beige: "Бежевый",
  green: "Зелёный",
  grey: "Серый",
};

const TYPE_LABELS: Record<TextileType, string> = {
  sheets: "Простыни",
  pillowcases: "Наволочки",
  towels_large: "Полотенца большие",
  towels_small: "Полотенца малые",
  robes: "Халаты",
  mattress_covers: "Наматрасники",
};

const UNITS = ["D1", "D2", "D3", "D4"];

export default function LaundryPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newBatch, setNewBatch] = useState({
    unitCode: "",
    items: [] as { type: TextileType; color: TextileColor; count: number }[],
    notes: "",
  });
  const [currentItem, setCurrentItem] = useState({
    type: "sheets" as TextileType,
    color: "white" as TextileColor,
    count: 1,
  });

  const { data: batches = [], isLoading } = useQuery<LaundryBatch[]>({
    queryKey: ["/api/laundry/batches"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newBatch) => {
      const res = await apiRequest("POST", "/api/laundry/batches", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/laundry/batches"] });
      setIsCreateOpen(false);
      setNewBatch({ unitCode: "", items: [], notes: "" });
      toast({ title: "Партия создана" });
    },
    onError: () => {
      toast({ title: "Ошибка создания", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LaundryBatchStatus }) => {
      const res = await apiRequest("PATCH", `/api/laundry/batches/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/laundry/batches"] });
      toast({ title: "Статус обновлён" });
    },
    onError: () => {
      toast({ title: "Ошибка обновления", variant: "destructive" });
    },
  });

  const addItem = () => {
    if (currentItem.count > 0) {
      setNewBatch((prev) => ({
        ...prev,
        items: [...prev.items, { ...currentItem }],
      }));
      setCurrentItem({ type: "sheets", color: "white", count: 1 });
    }
  };

  const removeItem = (index: number) => {
    setNewBatch((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const getNextStatus = (current: LaundryBatchStatus): LaundryBatchStatus | null => {
    const flow: LaundryBatchStatus[] = ["pending", "washing", "drying", "ready", "delivered"];
    const idx = flow.indexOf(current);
    return idx < flow.length - 1 ? flow[idx + 1] : null;
  };

  const getStatusIcon = (status: LaundryBatchStatus) => {
    switch (status) {
      case "pending": return <Package className="h-4 w-4" />;
      case "washing": return <WashingMachine className="h-4 w-4" />;
      case "drying": return <Wind className="h-4 w-4" />;
      case "ready": return <CheckCircle className="h-4 w-4" />;
      case "delivered": return <CheckCircle className="h-4 w-4" />;
    }
  };

  const activeBatches = batches.filter(b => b.status !== "delivered");
  const deliveredBatches = batches.filter(b => b.status === "delivered").slice(0, 5);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Прачечная</h1>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-batch">
              <Plus className="h-4 w-4 mr-2" />
              Новая партия
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Новая партия белья</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Откуда</Label>
                <Select
                  value={newBatch.unitCode}
                  onValueChange={(v) => setNewBatch((prev) => ({ ...prev, unitCode: v }))}
                >
                  <SelectTrigger data-testid="select-unit">
                    <SelectValue placeholder="Выберите домик" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="border rounded-md p-3 space-y-3">
                <Label>Добавить предмет</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Select
                    value={currentItem.type}
                    onValueChange={(v) => setCurrentItem((prev) => ({ ...prev, type: v as TextileType }))}
                  >
                    <SelectTrigger data-testid="select-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TYPE_LABELS) as TextileType[]).map((t) => (
                        <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={currentItem.color}
                    onValueChange={(v) => setCurrentItem((prev) => ({ ...prev, color: v as TextileColor }))}
                  >
                    <SelectTrigger data-testid="select-color">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(COLOR_LABELS) as TextileColor[]).map((c) => (
                        <SelectItem key={c} value={c}>{COLOR_LABELS[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    value={currentItem.count}
                    onChange={(e) => setCurrentItem((prev) => ({ ...prev, count: parseInt(e.target.value) || 1 }))}
                    data-testid="input-count"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={addItem} data-testid="button-add-item">
                  Добавить
                </Button>

                {newBatch.items.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {newBatch.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span>{TYPE_LABELS[item.type]} ({COLOR_LABELS[item.color]}) x{item.count}</span>
                        <Button variant="ghost" size="sm" onClick={() => removeItem(i)}>X</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label>Заметки</Label>
                <Textarea
                  value={newBatch.notes}
                  onChange={(e) => setNewBatch((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Опционально"
                  data-testid="input-notes"
                />
              </div>

              <Button
                className="w-full"
                onClick={() => createMutation.mutate(newBatch)}
                disabled={newBatch.items.length === 0 || createMutation.isPending}
                data-testid="button-save-batch"
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Создать партию"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {activeBatches.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Нет активных партий
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {activeBatches.map((batch) => {
            const nextStatus = getNextStatus(batch.status);
            return (
              <Card key={batch.id} data-testid={`card-batch-${batch.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(batch.status)}
                      <CardTitle className="text-base">
                        {batch.unitCode ? `${batch.unitCode}` : "Общая"}
                      </CardTitle>
                    </div>
                    <Badge className={STATUS_COLORS[batch.status]}>
                      {STATUS_LABELS[batch.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm text-muted-foreground">
                    {batch.items.map((item, i) => (
                      <span key={i}>
                        {TYPE_LABELS[item.type as TextileType]} ({COLOR_LABELS[item.color as TextileColor]}) x{item.count}
                        {i < batch.items.length - 1 && ", "}
                      </span>
                    ))}
                  </div>
                  {batch.notes && (
                    <p className="text-sm text-muted-foreground italic">{batch.notes}</p>
                  )}
                  {nextStatus && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateMutation.mutate({ id: batch.id, status: nextStatus })}
                      disabled={updateMutation.isPending}
                      data-testid={`button-next-status-${batch.id}`}
                    >
                      {STATUS_LABELS[nextStatus]}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {deliveredBatches.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-medium mb-2 text-muted-foreground">Недавно доставлено</h2>
          <div className="space-y-2 opacity-70">
            {deliveredBatches.map((batch) => (
              <Card key={batch.id} className="bg-muted/30">
                <CardContent className="py-3 text-sm">
                  <span className="font-medium">{batch.unitCode || "Общая"}</span>
                  {" - "}
                  {batch.items.length} предметов
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
