import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { 
  Wallet, 
  TrendingUp, 
  CreditCard, 
  Receipt, 
  Banknote,
  LockKeyhole,
  AlertTriangle,
  CheckCircle2,
  Calendar
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CashCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { Incasation } from "@shared/schema";

interface IncasationPreview {
  periodStart: string;
  periodEnd: string;
  totalRevenue: number;
  cashRevenue: number;
  eripRevenue: number;
  totalExpenses: number;
  cashOnHand: number;
  expensesByCategory: Record<string, number>;
  shiftsCount: number;
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  food_staff: "Питание персонала",
  supplies: "Расходники",
  salary: "Зарплата",
  contractor: "Подрядчик",
  other: "Другое",
};

export default function OwnerCashPage() {
  const { toast } = useToast();

  const { data: preview, isLoading: previewLoading } = useQuery<IncasationPreview>({
    queryKey: ["/api/owner/incasation/preview"],
  });

  const { data: incasations, isLoading: incasationsLoading } = useQuery<Incasation[]>({
    queryKey: ["/api/owner/incasations"],
  });

  const performIncasationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/owner/incasation/perform");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/incasation/preview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/owner/incasations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shift/current"] });
      toast({ title: "Инкасация выполнена успешно" });
    },
    onError: () => {
      toast({ title: "Ошибка выполнения инкасации", variant: "destructive" });
    },
  });

  const formatPeriod = (start: string, end: string) => {
    try {
      return `${format(new Date(start), "d MMM", { locale: ru })} - ${format(new Date(end), "d MMM HH:mm", { locale: ru })}`;
    } catch {
      return "Период";
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Инкасация" />
      
      <PageContainer>
        <div className="space-y-6">
          {previewLoading ? (
            <div className="space-y-4">
              <CashCardSkeleton />
              <CashCardSkeleton />
            </div>
          ) : preview ? (
            <>
              <Card className="bg-primary text-primary-foreground">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <Wallet className="h-5 w-5" />
                      Отчет с последней инкасации
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {preview.shiftsCount} смен
                    </Badge>
                  </div>
                  <CardDescription className="text-primary-foreground/80">
                    {formatPeriod(preview.periodStart, preview.periodEnd)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm opacity-80">Общая выручка</p>
                      <p className="text-2xl font-bold font-mono" data-testid="stat-total-revenue">
                        {preview.totalRevenue.toFixed(2)} BYN
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm opacity-80">Наличные сейчас</p>
                      <p className="text-2xl font-bold font-mono" data-testid="stat-cash-on-hand">
                        {preview.cashOnHand.toFixed(2)} BYN
                      </p>
                    </div>
                  </div>

                  <Separator className="bg-primary-foreground/20" />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Banknote className="h-4 w-4 opacity-80" />
                        <span className="text-sm">Наличные</span>
                      </div>
                      <span className="font-mono" data-testid="stat-cash-revenue">
                        {preview.cashRevenue.toFixed(2)} BYN
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 opacity-80" />
                        <span className="text-sm">Безнал (ЕРИП)</span>
                      </div>
                      <span className="font-mono" data-testid="stat-erip-revenue">
                        {preview.eripRevenue.toFixed(2)} BYN
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Receipt className="h-4 w-4 opacity-80" />
                        <span className="text-sm">Расходы</span>
                      </div>
                      <span className="font-mono text-destructive" data-testid="stat-expenses">
                        -{preview.totalExpenses.toFixed(2)} BYN
                      </span>
                    </div>
                  </div>

                  {Object.keys(preview.expensesByCategory).length > 0 && (
                    <>
                      <Separator className="bg-primary-foreground/20" />
                      <div className="space-y-2">
                        <p className="text-sm opacity-80">Расходы по категориям:</p>
                        {Object.entries(preview.expensesByCategory).map(([cat, amount]) => (
                          <div key={cat} className="flex items-center justify-between text-sm">
                            <span className="opacity-80">{EXPENSE_CATEGORY_LABELS[cat] || cat}</span>
                            <span className="font-mono">{(amount as number).toFixed(2)} BYN</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
                <CardFooter>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="secondary" 
                        className="w-full"
                        data-testid="button-incasation"
                      >
                        <LockKeyhole className="mr-2 h-4 w-4" />
                        Выполнить инкасацию
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-status-pending" />
                          Подтвердить инкасацию?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Наличные к инкасации: <strong>{preview.cashOnHand.toFixed(2)} BYN</strong>.
                          Все открытые смены будут закрыты. Это действие нельзя отменить.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Отмена</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => performIncasationMutation.mutate()}
                          disabled={performIncasationMutation.isPending}
                        >
                          {performIncasationMutation.isPending ? "Выполнение..." : "Подтвердить"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardFooter>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-6">
                <EmptyState
                  icon={Wallet}
                  title="Нет данных"
                  description="Данные о кассе недоступны"
                />
              </CardContent>
            </Card>
          )}

          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              История инкасаций
            </h3>

            {incasationsLoading ? (
              <div className="space-y-3">
                <CashCardSkeleton />
              </div>
            ) : incasations && incasations.length > 0 ? (
              <div className="space-y-3">
                {incasations.map((inc) => (
                  <Card key={inc.id} className="hover-elevate">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-status-confirmed" />
                          <span className="font-medium">
                            {format(new Date(inc.performedAt), "d MMMM yyyy, HH:mm", { locale: ru })}
                          </span>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {inc.shiftsIncluded.length} смен
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <div>
                          <span>Выручка: </span>
                          <span className="font-mono text-foreground">
                            {inc.summary.totalRevenue.toFixed(2)} BYN
                          </span>
                        </div>
                        <div>
                          <span>Наличные: </span>
                          <span className="font-mono text-foreground">
                            {inc.summary.cashOnHand.toFixed(2)} BYN
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <EmptyState
                    icon={Calendar}
                    title="Нет истории"
                    description="Инкасации еще не проводились"
                    className="py-4"
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </PageContainer>

      <BottomNav />
    </div>
  );
}
