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
import { Plus, Loader2, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { TextileAudit, TextileColor, TextileType } from "@shared/schema";

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

const CONDITION_LABELS: Record<string, string> = {
  good: "Хорошее",
  worn: "Изношенное",
  damaged: "Повреждённое",
};

const LOCATIONS = ["D1", "D2", "D3", "D4", "Склад", "Прачечная"];

type AuditItem = {
  type: TextileType;
  color: TextileColor;
  count: number;
  condition: "good" | "worn" | "damaged";
};

export default function TextileAuditPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newAudit, setNewAudit] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    location: "",
    items: [] as AuditItem[],
    notes: "",
  });
  const [currentItem, setCurrentItem] = useState<AuditItem>({
    type: "sheets",
    color: "white",
    count: 0,
    condition: "good",
  });

  const { data: audits = [], isLoading } = useQuery<TextileAudit[]>({
    queryKey: ["/api/textile/audits"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newAudit) => {
      const res = await apiRequest("POST", "/api/textile/audits", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/textile/audits"] });
      setIsCreateOpen(false);
      setNewAudit({ date: format(new Date(), "yyyy-MM-dd"), location: "", items: [], notes: "" });
      toast({ title: "Аудит сохранён" });
    },
    onError: () => {
      toast({ title: "Ошибка сохранения", variant: "destructive" });
    },
  });

  const addItem = () => {
    if (currentItem.count >= 0) {
      setNewAudit((prev) => ({
        ...prev,
        items: [...prev.items, { ...currentItem }],
      }));
      setCurrentItem({ type: "sheets", color: "white", count: 0, condition: "good" });
    }
  };

  const removeItem = (index: number) => {
    setNewAudit((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 ">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Аудит текстиля</h1>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-audit">
              <Plus className="h-4 w-4 mr-2" />
              Новый аудит
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Новый аудит текстиля</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Дата</Label>
                  <Input
                    type="date"
                    value={newAudit.date}
                    onChange={(e) => setNewAudit((prev) => ({ ...prev, date: e.target.value }))}
                    data-testid="input-date"
                  />
                </div>
                <div>
                  <Label>Локация</Label>
                  <Select
                    value={newAudit.location}
                    onValueChange={(v) => setNewAudit((prev) => ({ ...prev, location: v }))}
                  >
                    <SelectTrigger data-testid="select-location">
                      <SelectValue placeholder="Выберите" />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCATIONS.map((loc) => (
                        <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border rounded-md p-3 space-y-3">
                <Label>Добавить позицию</Label>
                <div className="grid grid-cols-2 gap-2">
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
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Количество</Label>
                    <Input
                      type="number"
                      min={0}
                      value={currentItem.count}
                      onChange={(e) => setCurrentItem((prev) => ({ ...prev, count: parseInt(e.target.value) || 0 }))}
                      data-testid="input-count"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Состояние</Label>
                    <Select
                      value={currentItem.condition}
                      onValueChange={(v) => setCurrentItem((prev) => ({ ...prev, condition: v as any }))}
                    >
                      <SelectTrigger data-testid="select-condition">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="good">Хорошее</SelectItem>
                        <SelectItem value="worn">Изношенное</SelectItem>
                        <SelectItem value="damaged">Повреждённое</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={addItem} data-testid="button-add-item">
                  Добавить
                </Button>

                {newAudit.items.length > 0 && (
                  <div className="space-y-1 mt-2 max-h-40 overflow-y-auto">
                    {newAudit.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-muted/50 p-1 rounded">
                        <span>
                          {TYPE_LABELS[item.type]} ({COLOR_LABELS[item.color]}) x{item.count}
                          <Badge variant="outline" className="ml-1 text-xs">
                            {CONDITION_LABELS[item.condition]}
                          </Badge>
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => removeItem(i)}>X</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label>Заметки</Label>
                <Textarea
                  value={newAudit.notes}
                  onChange={(e) => setNewAudit((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Опционально"
                  data-testid="input-notes"
                />
              </div>

              <Button
                className="w-full"
                onClick={() => createMutation.mutate(newAudit)}
                disabled={!newAudit.location || newAudit.items.length === 0 || createMutation.isPending}
                data-testid="button-save-audit"
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить аудит"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {audits.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
            Нет записей аудита
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {audits.map((audit) => (
            <Card key={audit.id} data-testid={`card-audit-${audit.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{audit.location}</CardTitle>
                  <Badge variant="outline">
                    {format(new Date(audit.date), "dd MMM yyyy", { locale: ru })}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {(audit.items as AuditItem[]).map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span>{TYPE_LABELS[item.type]} ({COLOR_LABELS[item.color]})</span>
                      <span className="font-medium">x{item.count}</span>
                      <Badge 
                        variant="outline" 
                        className={
                          item.condition === "damaged" ? "text-red-500 border-red-300" :
                          item.condition === "worn" ? "text-yellow-600 border-yellow-300" :
                          "text-green-600 border-green-300"
                        }
                      >
                        {CONDITION_LABELS[item.condition]}
                      </Badge>
                    </div>
                  ))}
                </div>
                {audit.notes && (
                  <p className="text-sm text-muted-foreground mt-2 italic">{audit.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
