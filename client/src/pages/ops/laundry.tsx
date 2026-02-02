import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Plus, Loader2, Warehouse, Home, WashingMachine, History, 
  CheckCircle, AlertCircle, Minus
} from "lucide-react";
import type { TextileColor, TextileType, TextileStock, TextileCheckIn, TextileEvent } from "@shared/schema";

const COLOR_LABELS: Record<TextileColor, string> = {
  white: "Белый",
  grey_light: "Светло-серый",
  grey_dark: "Тёмно-серый",
  grey: "Серый",
};

const COLOR_CLASSES: Record<TextileColor, string> = {
  white: "bg-white border border-gray-300 dark:bg-gray-100",
  grey_light: "bg-gray-300 dark:bg-gray-400",
  grey_dark: "bg-gray-600 dark:bg-gray-700",
  grey: "bg-gray-400 dark:bg-gray-500",
};

const TYPE_LABELS: Record<TextileType, string> = {
  sheets: "Простыни",
  duvet_covers: "Пододеяльники",
  pillowcases: "Наволочки",
  towels_large: "Полотенца большие",
  towels_small: "Полотенца малые",
  robes: "Халаты",
  mattress_covers: "Наматрасники",
};

const BEDDING_COLORS: TextileColor[] = ["white", "grey_light", "grey_dark"];
const UNITS = ["D1", "D2", "D3", "D4"];
const UNIT_MAX_SETS: Record<string, number> = { D1: 2, D2: 2, D3: 2, D4: 3 };

type StockSummary = {
  warehouse: { [key: string]: number };
  laundry: { [key: string]: number };
  units: { [unit: string]: { [key: string]: number } };
};

export default function LaundryPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("stock");
  const [isInitOpen, setIsInitOpen] = useState(false);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isMarkCleanOpen, setIsMarkCleanOpen] = useState(false);

  // Stock initialization state
  const [initStock, setInitStock] = useState<{ type: TextileType; color: TextileColor; quantity: number }[]>([]);

  // Check-in state
  const [checkInUnit, setCheckInUnit] = useState("");
  const [checkInBeddingSets, setCheckInBeddingSets] = useState<{ color: TextileColor; count: number }[]>([]);
  const [checkInTowelSets, setCheckInTowelSets] = useState(2);
  const [checkInRobes, setCheckInRobes] = useState(0);
  const [checkInNotes, setCheckInNotes] = useState("");

  // Mark clean state
  const [cleanItems, setCleanItems] = useState<{ type: TextileType; color: TextileColor; quantity: number }[]>([]);

  // Queries
  const { data: stockSummary, isLoading: stockLoading } = useQuery<StockSummary>({
    queryKey: ["/api/textile/stock/summary"],
  });

  const { data: checkIns = [], isLoading: checkInsLoading } = useQuery<TextileCheckIn[]>({
    queryKey: ["/api/textile/check-ins"],
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<TextileEvent[]>({
    queryKey: ["/api/textile/events"],
  });

  const { data: allStock = [] } = useQuery<TextileStock[]>({
    queryKey: ["/api/textile/stock"],
  });

  // Check if warehouse is initialized (has any stock)
  const isWarehouseInitialized = Object.keys(stockSummary?.warehouse || {}).length > 0;

  // Mutations
  const initMutation = useMutation({
    mutationFn: async (items: typeof initStock) => {
      const res = await apiRequest("POST", "/api/textile/stock/init", { items });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/textile/stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/textile/stock/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/textile/events"] });
      setIsInitOpen(false);
      setInitStock([]);
      toast({ title: "Склад инициализирован" });
    },
    onError: () => {
      toast({ title: "Ошибка инициализации", variant: "destructive" });
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async (data: { unitCode: string; beddingSets: typeof checkInBeddingSets; towelSets: number; robes: number; notes?: string }) => {
      const res = await apiRequest("POST", "/api/textile/check-ins", data);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Ошибка заселения");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/textile/stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/textile/stock/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/textile/check-ins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/textile/events"] });
      resetCheckInForm();
      setIsCheckInOpen(false);
      toast({ title: "Заселение оформлено" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Ошибка заселения", variant: "destructive" });
    },
  });

  const markDirtyMutation = useMutation({
    mutationFn: async (unitCode: string) => {
      const res = await apiRequest("POST", "/api/textile/mark-dirty", { unitCode });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/textile/stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/textile/stock/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/textile/events"] });
      toast({ title: "Бельё отправлено в прачечную" });
    },
    onError: () => {
      toast({ title: "Ошибка", variant: "destructive" });
    },
  });

  const markCleanMutation = useMutation({
    mutationFn: async (items: typeof cleanItems) => {
      const res = await apiRequest("POST", "/api/textile/mark-clean", { items });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/textile/stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/textile/stock/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/textile/events"] });
      setIsMarkCleanOpen(false);
      setCleanItems([]);
      toast({ title: "Бельё возвращено на склад" });
    },
    onError: () => {
      toast({ title: "Ошибка", variant: "destructive" });
    },
  });

  const resetCheckInForm = () => {
    setCheckInUnit("");
    setCheckInBeddingSets([]);
    setCheckInTowelSets(2);
    setCheckInRobes(0);
    setCheckInNotes("");
  };

  // Initialize stock form
  const addInitItem = (type: TextileType, color: TextileColor) => {
    const existing = initStock.find(i => i.type === type && i.color === color);
    if (!existing) {
      setInitStock([...initStock, { type, color, quantity: 0 }]);
    }
  };

  const updateInitItem = (type: TextileType, color: TextileColor, quantity: number) => {
    setInitStock(prev => prev.map(i => 
      i.type === type && i.color === color ? { ...i, quantity } : i
    ));
  };

  // Check-in bedding set handlers
  const addBeddingSet = (color: TextileColor) => {
    const totalSets = checkInBeddingSets.reduce((sum, s) => sum + s.count, 0);
    const maxSets = UNIT_MAX_SETS[checkInUnit] || 2;
    if (totalSets >= maxSets) return;
    
    const existing = checkInBeddingSets.find(s => s.color === color);
    if (existing) {
      setCheckInBeddingSets(prev => prev.map(s => 
        s.color === color ? { ...s, count: s.count + 1 } : s
      ));
    } else {
      setCheckInBeddingSets([...checkInBeddingSets, { color, count: 1 }]);
    }
  };

  const removeBeddingSet = (color: TextileColor) => {
    const existing = checkInBeddingSets.find(s => s.color === color);
    if (!existing) return;
    
    if (existing.count === 1) {
      setCheckInBeddingSets(prev => prev.filter(s => s.color !== color));
    } else {
      setCheckInBeddingSets(prev => prev.map(s => 
        s.color === color ? { ...s, count: s.count - 1 } : s
      ));
    }
  };

  const totalBeddingSets = checkInBeddingSets.reduce((sum, s) => sum + s.count, 0);
  const suggestedTowelSets = totalBeddingSets * 2;

  // Parse stock key
  const parseStockKey = (key: string): { type: TextileType; color: TextileColor } => {
    const [type, color] = key.split("_");
    // Handle types with underscores like towels_large_grey
    const parts = key.split("_");
    if (parts.length === 3) {
      return { type: `${parts[0]}_${parts[1]}` as TextileType, color: parts[2] as TextileColor };
    }
    return { type: type as TextileType, color: color as TextileColor };
  };

  // Build clean items from laundry
  const buildCleanItemsFromLaundry = () => {
    const items: typeof cleanItems = [];
    Object.entries(stockSummary?.laundry || {}).forEach(([key, qty]) => {
      if (qty > 0) {
        const { type, color } = parseStockKey(key);
        items.push({ type, color, quantity: qty });
      }
    });
    setCleanItems(items);
    setIsMarkCleanOpen(true);
  };

  const getEventTypeLabel = (eventType: string) => {
    switch (eventType) {
      case "init_stock": return "Инициализация";
      case "check_in": return "Заселение";
      case "mark_dirty": return "В прачечную";
      case "mark_clean": return "На склад";
      case "adjustment": return "Корректировка";
      default: return eventType;
    }
  };

  if (stockLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 pb-48">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-semibold">Прачечная</h1>
        {!isWarehouseInitialized && (
          <Button onClick={() => setIsInitOpen(true)} data-testid="button-init-warehouse">
            <Warehouse className="h-4 w-4 mr-2" />
            Внести остатки
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="stock" data-testid="tab-stock">
            <Warehouse className="h-4 w-4 mr-1" />
            Склад
          </TabsTrigger>
          <TabsTrigger value="checkin" data-testid="tab-checkin">
            <Home className="h-4 w-4 mr-1" />
            Заселить
          </TabsTrigger>
          <TabsTrigger value="laundry" data-testid="tab-laundry">
            <WashingMachine className="h-4 w-4 mr-1" />
            Стирка
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="h-4 w-4 mr-1" />
            История
          </TabsTrigger>
        </TabsList>

        {/* STOCK TAB */}
        <TabsContent value="stock" className="space-y-4">
          {!isWarehouseInitialized ? (
            <Card>
              <CardContent className="py-8 text-center">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">Склад не инициализирован</p>
                <Button onClick={() => setIsInitOpen(true)} data-testid="button-init-warehouse-empty">
                  Внести начальные остатки
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Warehouse className="h-4 w-4" />
                    На складе
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(stockSummary?.warehouse || {}).map(([key, qty]) => {
                      const { type, color } = parseStockKey(key);
                      return (
                        <div key={key} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded ${COLOR_CLASSES[color]}`} />
                            <span>{TYPE_LABELS[type] || type}</span>
                          </div>
                          <Badge variant="secondary">{qty}</Badge>
                        </div>
                      );
                    })}
                    {Object.keys(stockSummary?.warehouse || {}).length === 0 && (
                      <p className="text-sm text-muted-foreground">Пусто</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Units overview */}
              <div className="grid grid-cols-2 gap-2">
                {UNITS.map(unit => {
                  const unitStock = stockSummary?.units[unit] || {};
                  const hasStock = Object.values(unitStock).some(v => v > 0);
                  return (
                    <Card key={unit}>
                      <CardHeader className="pb-1">
                        <CardTitle className="text-sm flex items-center justify-between gap-2">
                          <span>{unit}</span>
                          {hasStock && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => markDirtyMutation.mutate(unit)}
                              disabled={markDirtyMutation.isPending}
                              data-testid={`button-mark-dirty-${unit}`}
                            >
                              В стирку
                            </Button>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="py-2">
                        {hasStock ? (
                          <div className="space-y-1 text-xs">
                            {Object.entries(unitStock).map(([key, qty]) => {
                              if (qty === 0) return null;
                              const { type, color } = parseStockKey(key);
                              return (
                                <div key={key} className="flex items-center gap-1">
                                  <div className={`w-2 h-2 rounded ${COLOR_CLASSES[color]}`} />
                                  <span className="truncate">{TYPE_LABELS[type]?.slice(0, 10) || type}</span>
                                  <span className="ml-auto">{qty}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Пусто</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>

        {/* CHECK-IN TAB */}
        <TabsContent value="checkin" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Заселение с бельём</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Домик</Label>
                <Select value={checkInUnit} onValueChange={setCheckInUnit}>
                  <SelectTrigger data-testid="select-checkin-unit">
                    <SelectValue placeholder="Выберите домик" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => (
                      <SelectItem key={u} value={u}>
                        {u} (макс. {UNIT_MAX_SETS[u]} компл.)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {checkInUnit && (
                <>
                  <div>
                    <Label className="mb-2 block">Постельное бельё (цвет и количество)</Label>
                    <div className="space-y-2">
                      {BEDDING_COLORS.map(color => {
                        const set = checkInBeddingSets.find(s => s.color === color);
                        const count = set?.count || 0;
                        return (
                          <div key={color} className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded ${COLOR_CLASSES[color]}`} />
                            <span className="flex-1">{COLOR_LABELS[color]}</span>
                            <Button 
                              variant="outline" 
                              size="icon"
                              onClick={() => removeBeddingSet(color)}
                              disabled={count === 0}
                              data-testid={`button-bedding-minus-${color}`}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-medium">{count}</span>
                            <Button 
                              variant="outline" 
                              size="icon"
                              onClick={() => addBeddingSet(color)}
                              disabled={totalBeddingSets >= UNIT_MAX_SETS[checkInUnit]}
                              data-testid={`button-bedding-plus-${color}`}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Выбрано: {totalBeddingSets} из {UNIT_MAX_SETS[checkInUnit]} комплектов
                    </p>
                  </div>

                  {totalBeddingSets > 0 && (
                    <div>
                      <Label className="mb-2 block">
                        Полотенца (комплектов)
                        {totalBeddingSets === 1 && (
                          <span className="text-muted-foreground ml-2">по умолч. 2</span>
                        )}
                        {totalBeddingSets >= 2 && (
                          <span className="text-muted-foreground ml-2">рекоменд. {suggestedTowelSets}</span>
                        )}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => setCheckInTowelSets(Math.max(1, checkInTowelSets - 1))}
                          data-testid="button-towels-minus"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center font-medium">{checkInTowelSets}</span>
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => setCheckInTowelSets(Math.min(6, checkInTowelSets + 1))}
                          data-testid="button-towels-plus"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <span className="text-sm text-muted-foreground ml-2">
                          = {checkInTowelSets * 2} больших + {checkInTowelSets * 2} малых
                        </span>
                      </div>
                    </div>
                  )}

                  {totalBeddingSets > 0 && (
                    <div>
                      <Label className="mb-2 block">Халаты (опционально)</Label>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => setCheckInRobes(Math.max(0, checkInRobes - 1))}
                          data-testid="button-robes-minus"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center font-medium">{checkInRobes}</span>
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => setCheckInRobes(Math.min(6, checkInRobes + 1))}
                          data-testid="button-robes-plus"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  <div>
                    <Label>Заметки</Label>
                    <Textarea
                      value={checkInNotes}
                      onChange={(e) => setCheckInNotes(e.target.value)}
                      placeholder="Опционально"
                      data-testid="input-checkin-notes"
                    />
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => checkInMutation.mutate({
                      unitCode: checkInUnit,
                      beddingSets: checkInBeddingSets,
                      towelSets: checkInTowelSets,
                      robes: checkInRobes,
                      notes: checkInNotes || undefined,
                    })}
                    disabled={totalBeddingSets === 0 || checkInMutation.isPending}
                    data-testid="button-submit-checkin"
                  >
                    {checkInMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Оформить заселение
                      </>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Recent check-ins */}
          {checkIns.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Недавние заселения</h3>
              <div className="space-y-2">
                {checkIns.slice(0, 5).map(ci => (
                  <Card key={ci.id} className="bg-muted/30">
                    <CardContent className="py-2 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{ci.unitCode}</span>
                        <span className="text-muted-foreground">
                          {new Date(ci.createdAt).toLocaleDateString("ru")}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {ci.beddingSets.map((s: any) => `${COLOR_LABELS[s.color as TextileColor]} x${s.count}`).join(", ")}
                        , полотенец: {ci.towelSets}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* LAUNDRY TAB */}
        <TabsContent value="laundry" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <WashingMachine className="h-4 w-4" />
                В прачечной
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(stockSummary?.laundry || {}).filter(k => (stockSummary?.laundry || {})[k] > 0).length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет белья в прачечной</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(stockSummary?.laundry || {}).map(([key, qty]) => {
                    if (qty === 0) return null;
                    const { type, color } = parseStockKey(key);
                    return (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded ${COLOR_CLASSES[color]}`} />
                          <span>{TYPE_LABELS[type] || type}</span>
                        </div>
                        <Badge variant="secondary">{qty}</Badge>
                      </div>
                    );
                  })}
                  <Button 
                    className="w-full mt-4"
                    onClick={buildCleanItemsFromLaundry}
                    data-testid="button-mark-clean-all"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Вернуть всё на склад
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="space-y-4">
          {eventsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                История пуста
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {events.map(event => (
                <Card key={event.id} className="bg-muted/30">
                  <CardContent className="py-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <Badge variant="outline">{getEventTypeLabel(event.eventType)}</Badge>
                      <span className="text-muted-foreground text-xs">
                        {new Date(event.createdAt).toLocaleString("ru")}
                      </span>
                    </div>
                    {event.relatedUnitCode && (
                      <span className="text-xs">{event.relatedUnitCode}</span>
                    )}
                    {event.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{event.notes}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Initialize Stock Dialog */}
      <Dialog open={isInitOpen} onOpenChange={setIsInitOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Начальные остатки склада</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Укажите количество каждого типа белья на складе
            </p>
            
            {/* Bedding items */}
            <div className="space-y-2">
              <Label className="font-medium">Постельное бельё</Label>
              {(["sheets", "duvet_covers", "pillowcases"] as TextileType[]).map(type => (
                <div key={type} className="space-y-1">
                  <span className="text-sm">{TYPE_LABELS[type]}</span>
                  <div className="grid grid-cols-3 gap-2">
                    {BEDDING_COLORS.map(color => {
                      const item = initStock.find(i => i.type === type && i.color === color);
                      return (
                        <div key={color} className="flex items-center gap-1">
                          <div className={`w-4 h-4 rounded ${COLOR_CLASSES[color]}`} />
                          <Input
                            type="number"
                            min={0}
                            className="h-8"
                            placeholder="0"
                            value={item?.quantity || ""}
                            onChange={(e) => {
                              const qty = parseInt(e.target.value) || 0;
                              if (item) {
                                updateInitItem(type, color, qty);
                              } else if (qty > 0) {
                                addInitItem(type, color);
                                updateInitItem(type, color, qty);
                              }
                            }}
                            data-testid={`input-init-${type}-${color}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Towels */}
            <div className="space-y-2">
              <Label className="font-medium">Полотенца (серые)</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["towels_large", "towels_small"] as TextileType[]).map(type => {
                  const item = initStock.find(i => i.type === type && i.color === "grey");
                  return (
                    <div key={type} className="flex items-center gap-2">
                      <span className="text-sm flex-1">{TYPE_LABELS[type]}</span>
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-20"
                        placeholder="0"
                        value={item?.quantity || ""}
                        onChange={(e) => {
                          const qty = parseInt(e.target.value) || 0;
                          if (item) {
                            updateInitItem(type, "grey", qty);
                          } else if (qty > 0) {
                            addInitItem(type, "grey");
                            updateInitItem(type, "grey", qty);
                          }
                        }}
                        data-testid={`input-init-${type}-grey`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Robes */}
            <div className="space-y-2">
              <Label className="font-medium">Халаты (серые)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm flex-1">{TYPE_LABELS.robes}</span>
                <Input
                  type="number"
                  min={0}
                  className="h-8 w-20"
                  placeholder="0"
                  value={initStock.find(i => i.type === "robes" && i.color === "grey")?.quantity || ""}
                  onChange={(e) => {
                    const qty = parseInt(e.target.value) || 0;
                    const item = initStock.find(i => i.type === "robes" && i.color === "grey");
                    if (item) {
                      updateInitItem("robes", "grey", qty);
                    } else if (qty > 0) {
                      addInitItem("robes", "grey");
                      updateInitItem("robes", "grey", qty);
                    }
                  }}
                  data-testid="input-init-robes-grey"
                />
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => initMutation.mutate(initStock.filter(i => i.quantity > 0))}
              disabled={initStock.filter(i => i.quantity > 0).length === 0 || initMutation.isPending}
              data-testid="button-save-init"
            >
              {initMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mark Clean Dialog */}
      <Dialog open={isMarkCleanOpen} onOpenChange={setIsMarkCleanOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Вернуть на склад</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Подтвердите возврат белья из прачечной на склад
            </p>
            <div className="space-y-2">
              {cleanItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded ${COLOR_CLASSES[item.color]}`} />
                    <span>{TYPE_LABELS[item.type]}</span>
                  </div>
                  <span>{item.quantity} шт.</span>
                </div>
              ))}
            </div>
            <Button
              className="w-full"
              onClick={() => markCleanMutation.mutate(cleanItems)}
              disabled={markCleanMutation.isPending}
              data-testid="button-confirm-clean"
            >
              {markCleanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Подтвердить"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
