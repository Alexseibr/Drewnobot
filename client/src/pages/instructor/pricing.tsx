import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, DollarSign, CalendarIcon, Trash2, Save, Bike } from "lucide-react";
import { format, addDays } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { QuadPricing } from "@shared/schema";

export default function InstructorPricingPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  
  const [longDefaultPrice, setLongDefaultPrice] = useState<string>("");
  
  const [overrideDate, setOverrideDate] = useState<Date | undefined>();
  const [overrideLongPrice, setOverrideLongPrice] = useState<string>("");

  const { data: pricing = [], isLoading } = useQuery<QuadPricing[]>({
    queryKey: ["/api/instructor/quads/pricing"],
  });

  const defaults = pricing.filter(p => !p.date);
  const overrides = pricing.filter(p => p.date && p.routeType === "long");

  const longDefault = defaults.find(p => p.routeType === "long");

  const saveMutation = useMutation({
    mutationFn: async (data: { routeType: string; price: number; date?: string }) => {
      const res = await apiRequest("POST", "/api/instructor/quads/pricing", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructor/quads/pricing"] });
      toast({ title: "Цена сохранена" });
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось сохранить цену", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/instructor/quads/pricing/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructor/quads/pricing"] });
      toast({ title: "Цена удалена" });
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось удалить цену", variant: "destructive" });
    },
  });

  const handleSaveDefaults = () => {
    const longPrice = parseFloat(longDefaultPrice);
    
    if (longDefaultPrice && !isNaN(longPrice) && longPrice >= 0) {
      saveMutation.mutate({ routeType: "long", price: longPrice });
    }
  };

  const handleAddOverride = () => {
    if (!overrideDate) {
      toast({ title: "Выберите дату", variant: "destructive" });
      return;
    }
    
    const dateStr = format(overrideDate, "yyyy-MM-dd");
    const longPrice = parseFloat(overrideLongPrice);
    
    if (!overrideLongPrice) {
      toast({ title: "Укажите цену", variant: "destructive" });
      return;
    }
    
    if (overrideLongPrice && !isNaN(longPrice) && longPrice >= 0) {
      saveMutation.mutate({ routeType: "long", price: longPrice, date: dateStr });
    }
    
    setOverrideDate(undefined);
    setOverrideLongPrice("");
  };

  if (!hasRole("INSTRUCTOR", "ADMIN", "OWNER", "SUPER_ADMIN")) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Нет доступа</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background ">
      <header className="sticky top-0 z-50 bg-background border-b p-4">
        <div className="flex items-center gap-4">
          <Link href="/instructor">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Цены на квадроциклы</h1>
            <p className="text-sm text-muted-foreground">Базовые и специальные цены</p>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Базовые цены
            </CardTitle>
            <CardDescription>
              Цены по умолчанию для всех дней
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="long-price">Часовая поездка (60 мин)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="long-price"
                  type="number"
                  value={longDefaultPrice}
                  onChange={(e) => setLongDefaultPrice(e.target.value)}
                  placeholder={longDefault?.price?.toString() || "80"}
                  data-testid="input-long-default-price"
                />
                <span className="text-muted-foreground">BYN</span>
              </div>
              {longDefault && (
                <p className="text-xs text-muted-foreground">
                  Текущая: {longDefault.price} BYN
                </p>
              )}
            </div>
            <Button 
              onClick={handleSaveDefaults}
              disabled={saveMutation.isPending || !longDefaultPrice}
              data-testid="button-save-defaults"
            >
              <Save className="h-4 w-4 mr-2" />
              Сохранить базовую цену
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Специальные цены на дату
            </CardTitle>
            <CardDescription>
              Установите другие цены для конкретных дней (праздники, акции)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Дата</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !overrideDate && "text-muted-foreground"
                      )}
                      data-testid="button-override-date-picker"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {overrideDate ? format(overrideDate, "d MMMM yyyy", { locale: ru }) : "Выберите дату"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={overrideDate}
                      onSelect={setOverrideDate}
                      disabled={(date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="override-long">Цена (60 мин)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="override-long"
                    type="number"
                    value={overrideLongPrice}
                    onChange={(e) => setOverrideLongPrice(e.target.value)}
                    placeholder="Цена"
                    data-testid="input-override-long-price"
                  />
                  <span className="text-muted-foreground text-sm">BYN</span>
                </div>
              </div>
              
              <Button 
                onClick={handleAddOverride}
                disabled={saveMutation.isPending || !overrideDate}
                data-testid="button-add-override"
              >
                Добавить специальную цену
              </Button>
            </div>
          </CardContent>
        </Card>

        {overrides.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bike className="h-5 w-5" />
                Установленные специальные цены
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {overrides
                  .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
                  .map((override) => (
                    <div 
                      key={override.id} 
                      className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                      data-testid={`override-${override.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">
                          {override.date && format(new Date(override.date), "d MMM", { locale: ru })}
                        </Badge>
                        <span className="font-medium">
                          {override.routeType === "short" ? "Малый" : "Большой"}
                        </span>
                        <span className="text-primary font-semibold">
                          {override.price} BYN
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(override.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-override-${override.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
