import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Plus, Package, AlertTriangle, Minus, History } from "lucide-react";
import { Link } from "wouter";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageLoading } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Supply, SupplyTransaction } from "@shared/schema";

const SUPPLY_CATEGORIES = [
  { value: "fuel", label: "Топливо" },
  { value: "cleaning", label: "Уборка" },
  { value: "food", label: "Продукты" },
  { value: "equipment", label: "Инвентарь" },
  { value: "other", label: "Прочее" },
];

export default function SuppliesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [selectedSupply, setSelectedSupply] = useState<Supply | null>(null);
  const [transactionType, setTransactionType] = useState<"add" | "remove">("add");
  
  const [newSupply, setNewSupply] = useState({
    name: "",
    category: "other",
    unit: "",
    currentStock: 0,
    minStock: 0,
  });
  
  const [transactionAmount, setTransactionAmount] = useState(1);
  const [transactionNotes, setTransactionNotes] = useState("");

  const { data: supplies = [], isLoading } = useQuery<Supply[]>({
    queryKey: ["/api/supplies"],
  });
  
  const { data: lowStockSupplies = [] } = useQuery<Supply[]>({
    queryKey: ["/api/supplies/low-stock"],
  });
  
  const { data: transactions = [] } = useQuery<SupplyTransaction[]>({
    queryKey: ["/api/supplies", selectedSupply?.id, "transactions"],
    enabled: !!selectedSupply && showHistoryDialog,
  });

  const createMutation = useMutation({
    mutationFn: async (supply: typeof newSupply) => {
      const res = await fetch("/api/supplies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(supply),
      });
      if (!res.ok) throw new Error("Failed to create supply");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplies"] });
      setShowAddDialog(false);
      setNewSupply({ name: "", category: "other", unit: "", currentStock: 0, minStock: 0 });
      toast({ title: "Расходник добавлен" });
    },
  });
  
  const transactionMutation = useMutation({
    mutationFn: async ({ supplyId, quantity, type, note }: { supplyId: string; quantity: number; type: string; note?: string }) => {
      const res = await fetch(`/api/supplies/${supplyId}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ quantity, type, note }),
      });
      if (!res.ok) throw new Error("Failed to create transaction");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplies"] });
      setShowTransactionDialog(false);
      setSelectedSupply(null);
      setTransactionAmount(1);
      setTransactionNotes("");
      toast({ title: "Транзакция записана" });
    },
  });

  const handleAddSupply = () => {
    if (!newSupply.name || !newSupply.unit) {
      toast({ title: "Заполните название и единицу измерения", variant: "destructive" });
      return;
    }
    createMutation.mutate(newSupply);
  };

  const handleTransaction = () => {
    if (!selectedSupply || transactionAmount <= 0) return;
    const type = transactionType === "add" ? "restock" : "usage";
    transactionMutation.mutate({
      supplyId: selectedSupply.id,
      quantity: transactionAmount,
      type,
      note: transactionNotes || undefined,
    });
  };

  const openTransactionDialog = (supply: Supply, type: "add" | "remove") => {
    setSelectedSupply(supply);
    setTransactionType(type);
    setTransactionAmount(1);
    setTransactionNotes("");
    setShowTransactionDialog(true);
  };

  const openHistoryDialog = (supply: Supply) => {
    setSelectedSupply(supply);
    setShowHistoryDialog(true);
  };

  const isOwner = user?.role === "OWNER" || user?.role === "SUPER_ADMIN";

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
            <h1 className="text-lg font-semibold">Расходники</h1>
          </div>
          {isOwner && (
            <Button size="sm" onClick={() => setShowAddDialog(true)} data-testid="button-add-supply">
              <Plus className="h-4 w-4 mr-1" />
              Добавить
            </Button>
          )}
        </div>
      </header>

      <main className="p-4 space-y-4">
        {lowStockSupplies.length > 0 && (
          <Card className="border-destructive">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Низкий запас
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {lowStockSupplies.map((supply) => (
                <div key={supply.id} className="flex items-center justify-between text-sm" data-testid={`low-stock-${supply.id}`}>
                  <span>{supply.name}</span>
                  <Badge variant="destructive">{supply.currentStock} / {supply.minStock} {supply.unit}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {SUPPLY_CATEGORIES.map((category) => {
            const categorySupplies = supplies.filter((s) => s.category === category.value);
            if (categorySupplies.length === 0) return null;
            
            return (
              <Card key={category.value}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{category.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {categorySupplies.map((supply) => {
                    const isLow = supply.currentStock <= supply.minStock;
                    return (
                      <div
                        key={supply.id}
                        className="flex items-center justify-between gap-2"
                        data-testid={`supply-${supply.id}`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate">{supply.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant={isLow ? "destructive" : "secondary"} className="whitespace-nowrap">
                            {supply.currentStock} {supply.unit}
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openTransactionDialog(supply, "remove")}
                            data-testid={`button-remove-${supply.id}`}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openTransactionDialog(supply, "add")}
                            data-testid={`button-add-${supply.id}`}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openHistoryDialog(supply)}
                            data-testid={`button-history-${supply.id}`}
                          >
                            <History className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {supplies.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            Нет расходников. {isOwner && "Нажмите Добавить."}
          </div>
        )}
      </main>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый расходник</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Название</Label>
              <Input
                value={newSupply.name}
                onChange={(e) => setNewSupply({ ...newSupply, name: e.target.value })}
                placeholder="Например: Бензин АИ-92"
                data-testid="input-supply-name"
              />
            </div>
            <div>
              <Label>Категория</Label>
              <Select value={newSupply.category} onValueChange={(v) => setNewSupply({ ...newSupply, category: v })}>
                <SelectTrigger data-testid="select-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPLY_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Единица измерения</Label>
              <Input
                value={newSupply.unit}
                onChange={(e) => setNewSupply({ ...newSupply, unit: e.target.value })}
                placeholder="литр, шт, кг"
                data-testid="input-unit"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Текущий запас</Label>
                <Input
                  type="number"
                  value={newSupply.currentStock}
                  onChange={(e) => setNewSupply({ ...newSupply, currentStock: parseFloat(e.target.value) || 0 })}
                  data-testid="input-current-stock"
                />
              </div>
              <div>
                <Label>Минимум</Label>
                <Input
                  type="number"
                  value={newSupply.minStock}
                  onChange={(e) => setNewSupply({ ...newSupply, minStock: parseFloat(e.target.value) || 0 })}
                  data-testid="input-min-stock"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Отмена</Button>
            <Button onClick={handleAddSupply} disabled={createMutation.isPending} data-testid="button-save-supply">
              {createMutation.isPending ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTransactionDialog} onOpenChange={setShowTransactionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{transactionType === "add" ? "Пополнить" : "Списать"}: {selectedSupply?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Количество ({selectedSupply?.unit})</Label>
              <Input
                type="number"
                value={transactionAmount}
                onChange={(e) => setTransactionAmount(parseFloat(e.target.value) || 0)}
                min={0.1}
                step={0.1}
                data-testid="input-transaction-amount"
              />
            </div>
            <div>
              <Label>Комментарий (необязательно)</Label>
              <Textarea
                value={transactionNotes}
                onChange={(e) => setTransactionNotes(e.target.value)}
                placeholder="Причина списания / поставщик"
                data-testid="input-transaction-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransactionDialog(false)}>Отмена</Button>
            <Button
              onClick={handleTransaction}
              disabled={transactionMutation.isPending || transactionAmount <= 0}
              variant={transactionType === "remove" ? "destructive" : "default"}
              data-testid="button-confirm-transaction"
            >
              {transactionMutation.isPending ? "..." : transactionType === "add" ? "Пополнить" : "Списать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>История: {selectedSupply?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {transactions.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Нет записей</p>
            ) : (
              transactions.map((tx) => {
                const isRestock = tx.type === "restock";
                return (
                  <div key={tx.id} className="flex items-center justify-between text-sm border-b pb-2" data-testid={`transaction-${tx.id}`}>
                    <div>
                      <span className={isRestock ? "text-green-600" : "text-red-600"}>
                        {isRestock ? "+" : "-"}{tx.quantity} {selectedSupply?.unit}
                      </span>
                      {tx.note && <p className="text-xs text-muted-foreground">{tx.note}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString("ru-RU")}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
