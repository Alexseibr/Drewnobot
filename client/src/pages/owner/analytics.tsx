import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
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
  ChevronRight
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCardSkeleton } from "@/components/ui/loading-skeleton";
import { cn } from "@/lib/utils";
import type { AnalyticsSummary } from "@shared/schema";

export default function OwnerAnalyticsPage() {
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const { data: analytics, isLoading } = useQuery<AnalyticsSummary>({
    queryKey: ["/api/owner/analytics/summary", format(selectedMonth, "yyyy-MM")],
  });

  const navigateMonth = (direction: "prev" | "next") => {
    setSelectedMonth(prev => 
      direction === "prev" ? subMonths(prev, 1) : subMonths(prev, -1)
    );
  };

  const totalRevenue = analytics 
    ? analytics.cottageRevenue + analytics.bathRevenue + analytics.quadRevenue
    : 0;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Аналитика" />
      
      <PageContainer>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateMonth("prev")}
              data-testid="button-prev-month"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-xl font-semibold capitalize" data-testid="text-selected-month">
              {format(selectedMonth, "LLLL yyyy", { locale: ru })}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateMonth("next")}
              disabled={format(selectedMonth, "yyyy-MM") === format(new Date(), "yyyy-MM")}
              data-testid="button-next-month"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

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
                      <div className="rounded-full bg-chart-4/10 p-2">
                        <Bike className="h-4 w-4 text-chart-4" />
                      </div>
                      <span className="text-sm font-medium">Квадро</span>
                    </div>
                    <p className="text-2xl font-bold font-mono" data-testid="stat-quad-sessions">
                      {analytics.quadSessionsCount}
                    </p>
                    <p className="text-xs text-muted-foreground">сессий</p>
                    <p className="text-sm font-medium text-primary mt-2">
                      {analytics.quadRevenue.toFixed(2)} BYN
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="rounded-full bg-primary/10 p-2">
                        <Clock className="h-4 w-4 text-primary" />
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
            </>
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Нет данных за этот месяц</p>
              </CardContent>
            </Card>
          )}
        </div>
      </PageContainer>

      <BottomNav />
    </div>
  );
}
