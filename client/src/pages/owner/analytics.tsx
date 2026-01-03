import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subMonths, subDays, subWeeks, addDays, addWeeks, addMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ru } from "date-fns/locale";
import { 
  BarChart3, 
  TrendingUp, 
  Home, 
  Bath, 
  Bike, 
  Wallet,
  CreditCard,
  Banknote,
  Clock,
  ChevronLeft,
  ChevronRight,
  Timer,
  ArrowDownCircle,
  ArrowUpCircle,
  Receipt,
  User,
  Building2,
  Calendar,
  CalendarDays
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatsCardSkeleton } from "@/components/ui/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import type { AnalyticsSummary, CashTransaction } from "@shared/schema";
import { useAuth } from "@/lib/auth-context";

interface PeriodicSummary {
  lastWeek: AnalyticsSummary & { periodLabel: string };
  currentMonth: AnalyticsSummary & { periodLabel: string };
}

type PeriodType = "day" | "week" | "month";

export default function OwnerAnalyticsPage() {
  const { user, token } = useAuth();
  const [periodType, setPeriodType] = useState<PeriodType>("day");
  const [selectedDate, setSelectedDate] = useState(new Date());

  const period = `${periodType}:${format(selectedDate, "yyyy-MM-dd")}`;

  const { data: analytics, isLoading } = useQuery<AnalyticsSummary>({
    queryKey: ["/api/owner/analytics/summary", periodType, format(selectedDate, "yyyy-MM-dd")],
    queryFn: async () => {
      const res = await fetch(`/api/owner/analytics/summary?period=${encodeURIComponent(period)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  // Fetch periodic summaries (last week + current month)
  const { data: periodicSummary } = useQuery<PeriodicSummary>({
    queryKey: ["/api/owner/analytics/periodic"],
    queryFn: async () => {
      const res = await fetch("/api/owner/analytics/periodic", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch periodic analytics");
      return res.json();
    },
  });

  // Fetch transactions for super admin
  const { data: transactions, isError: transactionsError } = useQuery<CashTransaction[]>({
    queryKey: ["/api/owner/analytics/transactions", periodType, format(selectedDate, "yyyy-MM-dd")],
    queryFn: async () => {
      const res = await fetch(`/api/owner/analytics/transactions?period=${encodeURIComponent(period)}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    enabled: (user?.role === "SUPER_ADMIN" || user?.role === "OWNER") && !!token,
  });

  const incomeTransactions = transactions?.filter(tx => tx.type === "cash_in") || [];
  const expenseTransactions = transactions?.filter(tx => tx.type === "expense" || tx.type === "cash_out") || [];
  const totalIncome = incomeTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpenses = expenseTransactions.reduce((sum, tx) => sum + tx.amount, 0);

  const navigate = (direction: "prev" | "next") => {
    setSelectedDate(prev => {
      switch (periodType) {
        case "day":
          return direction === "prev" ? subDays(prev, 1) : addDays(prev, 1);
        case "week":
          return direction === "prev" ? subWeeks(prev, 1) : addWeeks(prev, 1);
        case "month":
          return direction === "prev" ? subMonths(prev, 1) : addMonths(prev, 1);
        default:
          return prev;
      }
    });
  };

  const getPeriodLabel = () => {
    switch (periodType) {
      case "day":
        return format(selectedDate, "d MMMM yyyy", { locale: ru });
      case "week": {
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
        return `${format(weekStart, "d MMM", { locale: ru })} - ${format(weekEnd, "d MMM yyyy", { locale: ru })}`;
      }
      case "month":
        return format(selectedDate, "LLLL yyyy", { locale: ru });
      default:
        return "";
    }
  };

  const isCurrentPeriod = () => {
    const now = new Date();
    switch (periodType) {
      case "day":
        return format(selectedDate, "yyyy-MM-dd") === format(now, "yyyy-MM-dd");
      case "week":
        return format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd") === 
               format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
      case "month":
        return format(selectedDate, "yyyy-MM") === format(now, "yyyy-MM");
      default:
        return false;
    }
  };

  const totalRevenue = analytics 
    ? analytics.cottageRevenue + analytics.bathRevenue
    : 0;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Аналитика" />
      
      <PageContainer>
        <div className="space-y-6">
          <Tabs value={periodType} onValueChange={(v) => {
            setPeriodType(v as PeriodType);
            setSelectedDate(new Date());
          }}>
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="day" data-testid="tab-day">День</TabsTrigger>
              <TabsTrigger value="week" data-testid="tab-week">Неделя</TabsTrigger>
              <TabsTrigger value="month" data-testid="tab-month">Месяц</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("prev")}
              data-testid="button-prev-period"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-xl font-semibold capitalize" data-testid="text-selected-period">
              {getPeriodLabel()}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("next")}
              disabled={isCurrentPeriod()}
              data-testid="button-next-period"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Periodic Summaries: Last Week and Current Month */}
          {periodicSummary && (
            <div className="grid grid-cols-2 gap-3">
              <Card data-testid="card-last-week-summary" className="bg-muted/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Прошлая неделя</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {periodicSummary.lastWeek.periodLabel}
                  </p>
                  <p className="text-xl font-bold font-mono" data-testid="text-last-week-revenue">
                    {(periodicSummary.lastWeek.cottageRevenue + periodicSummary.lastWeek.bathRevenue).toFixed(0)}
                    <span className="text-sm font-normal text-muted-foreground ml-1">BYN</span>
                  </p>
                  <div className="text-xs text-muted-foreground mt-1">
                    <span className="text-status-confirmed">нал: {periodicSummary.lastWeek.cashTotal.toFixed(0)}</span>
                    <span className="mx-1">/</span>
                    <span className="text-status-awaiting">ерип: {periodicSummary.lastWeek.eripTotal.toFixed(0)}</span>
                  </div>
                </CardContent>
              </Card>
              
              <Card data-testid="card-current-month-summary" className="bg-muted/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Текущий месяц</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1 capitalize">
                    {periodicSummary.currentMonth.periodLabel}
                  </p>
                  <p className="text-xl font-bold font-mono" data-testid="text-current-month-revenue">
                    {(periodicSummary.currentMonth.cottageRevenue + periodicSummary.currentMonth.bathRevenue).toFixed(0)}
                    <span className="text-sm font-normal text-muted-foreground ml-1">BYN</span>
                  </p>
                  <div className="text-xs text-muted-foreground mt-1">
                    <span className="text-status-confirmed">нал: {periodicSummary.currentMonth.cashTotal.toFixed(0)}</span>
                    <span className="mx-1">/</span>
                    <span className="text-status-awaiting">ерип: {periodicSummary.currentMonth.eripTotal.toFixed(0)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 gap-4">
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
            </div>
          ) : analytics ? (
            <>
              <Card className="bg-primary text-primary-foreground">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-5 w-5" />
                    <span className="text-sm opacity-90">Общая выручка</span>
                  </div>
                  <p className="text-4xl font-bold font-mono" data-testid="text-total-revenue">
                    {totalRevenue.toFixed(2)} <span className="text-lg opacity-80">BYN</span>
                  </p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="rounded-full bg-status-confirmed/10 p-2">
                        <Home className="h-4 w-4 text-status-confirmed" />
                      </div>
                      <span className="text-sm font-medium">Домики</span>
                    </div>
                    <p className="text-2xl font-bold font-mono" data-testid="stat-cottage-bookings">
                      {analytics.cottageBookingsCount}
                    </p>
                    <p className="text-xs text-muted-foreground">бронирований</p>
                    <p className="text-sm font-medium text-primary mt-2">
                      {analytics.cottageRevenue.toFixed(2)} BYN
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="rounded-full bg-status-awaiting/10 p-2">
                        <Bath className="h-4 w-4 text-status-awaiting" />
                      </div>
                      <span className="text-sm font-medium">Бани</span>
                    </div>
                    <p className="text-2xl font-bold font-mono" data-testid="stat-bath-bookings">
                      {analytics.bathBookingsCount}
                    </p>
                    <p className="text-xs text-muted-foreground">бронирований</p>
                    <p className="text-sm font-medium text-primary mt-2">
                      {analytics.bathRevenue.toFixed(2)} BYN
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="rounded-full bg-primary/10 p-2">
                        <Timer className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium">Рабочие часы</span>
                    </div>
                    <p className="text-2xl font-bold font-mono" data-testid="stat-work-hours">
                      {Math.round(analytics.workHoursTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground">часов записано</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Способы оплаты
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-status-confirmed/10 p-2">
                          <Banknote className="h-4 w-4 text-status-confirmed" />
                        </div>
                        <span className="font-medium">Наличные</span>
                      </div>
                      <span className="font-mono font-medium" data-testid="stat-cash-total">
                        {analytics.cashTotal.toFixed(2)} BYN
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-status-awaiting/10 p-2">
                          <CreditCard className="h-4 w-4 text-status-awaiting" />
                        </div>
                        <span className="font-medium">ЕРИП</span>
                      </div>
                      <span className="font-mono font-medium" data-testid="stat-erip-total">
                        {analytics.eripTotal.toFixed(2)} BYN
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cottage Breakdown */}
              {(analytics.cottageBreakdown ?? []).length > 0 && (
                <Card data-testid="card-cottage-breakdown">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      По домикам
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {(analytics.cottageBreakdown ?? []).map(c => (
                        <div key={c.cottageCode} className="flex items-center justify-between" data-testid={`row-cottage-${c.cottageCode}`}>
                          <div className="flex items-center gap-2">
                            <Home className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{c.cottageCode}</span>
                            <Badge variant="secondary" className="text-xs">{c.bookingsCount}</Badge>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-medium">{c.revenue.toFixed(2)} BYN</span>
                            <div className="text-xs text-muted-foreground">
                              <span className="text-status-confirmed">нал: {c.cashTotal.toFixed(0)}</span>
                              <span className="mx-1">/</span>
                              <span className="text-status-awaiting">ерип: {c.eripTotal.toFixed(0)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Service Breakdown */}
              {(analytics.serviceBreakdown ?? []).length > 0 && (
                <Card data-testid="card-service-breakdown">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Receipt className="h-4 w-4" />
                      По услугам
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {(analytics.serviceBreakdown ?? []).filter(s => s.count > 0).map(s => (
                        <div key={s.serviceType} className="flex items-center justify-between" data-testid={`row-service-${s.serviceType}`}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {s.serviceType === "cottages" && "Домики"}
                              {s.serviceType === "baths" && "Бани"}
                              {s.serviceType === "quads" && "Квадроциклы"}
                              {s.serviceType === "tub_small" && "Мал. купели"}
                              {s.serviceType === "tub_large" && "Бол. купели"}
                            </span>
                            <Badge variant="secondary" className="text-xs">{s.count}</Badge>
                          </div>
                          <span className="font-mono font-medium">{s.revenue.toFixed(2)} BYN</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Выручка купелей</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Малые купели</span>
                      <div className="text-right">
                        <span className="font-mono">{analytics.tubSmallCount}</span>
                        <span className="text-muted-foreground text-sm ml-2">
                          ({analytics.tubSmallRevenue.toFixed(2)} BYN)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Большие купели</span>
                      <div className="text-right">
                        <span className="font-mono">{analytics.tubLargeCount}</span>
                        <span className="text-muted-foreground text-sm ml-2">
                          ({analytics.tubLargeRevenue.toFixed(2)} BYN)
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Income and Expenses section for SUPER_ADMIN */}
              {(user?.role === "SUPER_ADMIN" || user?.role === "OWNER") && transactions && transactions.length > 0 && (
                <>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ArrowDownCircle className="h-4 w-4 text-status-confirmed" />
                          Приходы
                        </div>
                        <Badge variant="secondary" className="font-mono">
                          +{totalIncome.toFixed(2)} BYN
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {incomeTransactions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Нет приходов за период</p>
                      ) : (
                        <div className="space-y-3">
                          {incomeTransactions.map(tx => (
                            <div key={tx.id} className="flex items-start justify-between border-b pb-2 last:border-0">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium">
                                    +{tx.amount.toFixed(2)} BYN
                                  </p>
                                  {tx.createdByName && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      {tx.createdByName}
                                    </span>
                                  )}
                                </div>
                                {tx.comment && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {tx.comment}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(tx.createdAt), "dd.MM HH:mm", { locale: ru })}
                                </p>
                              </div>
                              {tx.category && (
                                <Badge variant="outline" className="text-xs">
                                  {tx.category}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ArrowUpCircle className="h-4 w-4 text-destructive" />
                          Расходы
                        </div>
                        <Badge variant="destructive" className="font-mono">
                          -{totalExpenses.toFixed(2)} BYN
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {expenseTransactions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Нет расходов за период</p>
                      ) : (
                        <div className="space-y-3">
                          {expenseTransactions.map(tx => (
                            <div key={tx.id} className="flex items-start justify-between border-b pb-2 last:border-0">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-destructive">
                                    -{tx.amount.toFixed(2)} BYN
                                  </p>
                                  {tx.createdByName && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      {tx.createdByName}
                                    </span>
                                  )}
                                </div>
                                {tx.comment && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {tx.comment}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(tx.createdAt), "dd.MM HH:mm", { locale: ru })}
                                </p>
                              </div>
                              {tx.category && (
                                <Badge variant="outline" className="text-xs">
                                  {tx.category}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Нет данных за этот период</p>
              </CardContent>
            </Card>
          )}
        </div>
      </PageContainer>

      <BottomNav />
    </div>
  );
}
