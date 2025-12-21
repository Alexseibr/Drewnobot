import { useQuery, useMutation } from "@tanstack/react-query";
import { format, isSameDay, isAfter, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { 
  Home, 
  Bath, 
  Users, 
  Phone,
  Calendar,
  Check,
  X,
  CreditCard,
  Banknote,
  Droplets
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BookingCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { CottageBooking, BathBooking, SpaBooking } from "@shared/schema";

interface BookingsData {
  cottageBookings: CottageBooking[];
  bathBookings: BathBooking[];
}

export default function BookingsPage() {
  const { toast } = useToast();

  const { data: bookingsData, isLoading } = useQuery<BookingsData>({
    queryKey: ["/api/admin/bookings/upcoming"],
  });

  const { data: spaBookings = [], isLoading: loadingSpa } = useQuery<SpaBooking[]>({
    queryKey: ["/api/admin/spa-bookings/upcoming"],
  });

  const acceptBathMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("POST", `/api/admin/bath-bookings/${bookingId}/accept`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/today"] });
      toast({ title: "Бронирование принято" });
    },
    onError: () => {
      toast({ title: "Ошибка принятия", variant: "destructive" });
    },
  });

  const cancelBathMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("POST", `/api/admin/bath-bookings/${bookingId}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/today"] });
      toast({ title: "Бронирование отменено" });
    },
    onError: () => {
      toast({ title: "Ошибка отмены", variant: "destructive" });
    },
  });

  const closeBathPaymentMutation = useMutation({
    mutationFn: async ({ bookingId, method }: { bookingId: string; method: "erip" | "cash" }) => {
      const response = await apiRequest("POST", `/api/admin/bath-bookings/${bookingId}/close-payment`, {
        method,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shift/current"] });
      toast({ title: "Оплата закрыта" });
    },
    onError: () => {
      toast({ title: "Ошибка закрытия оплаты", variant: "destructive" });
    },
  });

  const acceptSpaMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("POST", `/api/admin/spa-bookings/${bookingId}/accept`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/spa-bookings/upcoming"] });
      toast({ title: "SPA бронирование принято" });
    },
    onError: () => {
      toast({ title: "Ошибка принятия SPA", variant: "destructive" });
    },
  });

  const cancelSpaMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("POST", `/api/admin/spa-bookings/${bookingId}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/spa-bookings/upcoming"] });
      toast({ title: "SPA бронирование отменено" });
    },
    onError: () => {
      toast({ title: "Ошибка отмены SPA", variant: "destructive" });
    },
  });

  const closeSpaPaymentMutation = useMutation({
    mutationFn: async ({ bookingId, method }: { bookingId: string; method: "erip" | "cash" }) => {
      const response = await apiRequest("POST", `/api/admin/spa-bookings/${bookingId}/close-payment`, {
        method,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/spa-bookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shift/current"] });
      toast({ title: "Оплата SPA закрыта" });
    },
    onError: () => {
      toast({ title: "Ошибка закрытия оплаты SPA", variant: "destructive" });
    },
  });

  const cottageBookings = bookingsData?.cottageBookings || [];
  const bathBookings = bookingsData?.bathBookings || [];

  const today = new Date();
  const todayCottages = cottageBookings.filter(b => 
    isSameDay(parseISO(b.dateCheckIn), today) || isSameDay(parseISO(b.dateCheckOut), today)
  );
  const upcomingCottages = cottageBookings.filter(b => 
    isAfter(parseISO(b.dateCheckIn), today)
  );

  const todayBaths = bathBookings.filter(b => isSameDay(parseISO(b.date), today));
  const upcomingBaths = bathBookings.filter(b => isAfter(parseISO(b.date), today));
  const pendingBaths = bathBookings.filter(b => b.status === "pending_call");

  const todaySpa = spaBookings.filter(b => isSameDay(parseISO(b.date), today));
  const upcomingSpa = spaBookings.filter(b => isAfter(parseISO(b.date), today));
  const pendingSpa = spaBookings.filter(b => b.status === "pending_call");

  const SPA_TYPE_LABELS: Record<string, string> = {
    bath_only: "Только баня",
    terrace_only: "Только терраса",
    tub_only: "Только купель",
    bath_with_tub: "Баня + Купель",
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Бронирования" />
      
      <PageContainer>
        <Tabs defaultValue="spa" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="spa" className="gap-2" data-testid="tab-spa">
              <Droplets className="h-4 w-4" />
              СПА
              {pendingSpa.length > 0 && (
                <Badge className="ml-1 text-xs bg-status-pending text-black">
                  {pendingSpa.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="baths" className="gap-2" data-testid="tab-baths">
              <Bath className="h-4 w-4" />
              Бани
              {pendingBaths.length > 0 && (
                <Badge className="ml-1 text-xs bg-status-pending text-black">
                  {pendingBaths.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="cottages" className="gap-2" data-testid="tab-cottages">
              <Home className="h-4 w-4" />
              Домики
            </TabsTrigger>
          </TabsList>

          <TabsContent value="spa" className="space-y-4">
            {loadingSpa ? (
              <div className="space-y-3">
                <BookingCardSkeleton />
                <BookingCardSkeleton />
              </div>
            ) : (
              <>
                {pendingSpa.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-status-pending flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-status-pending animate-pulse" />
                      Ожидают подтверждения
                    </h3>
                    {pendingSpa.map((booking) => (
                      <Card key={booking.id} className="border-status-pending/30">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3 gap-2">
                            <div>
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Badge variant="outline">{booking.spaResource}</Badge>
                                <StatusBadge status={booking.status} />
                              </div>
                              <p className="font-medium">{booking.customer.fullName}</p>
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {booking.customer.phone}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-sm">
                                {booking.startTime} - {booking.endTime}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {format(parseISO(booking.date), "d MMM", { locale: ru })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mb-3 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              {SPA_TYPE_LABELS[booking.bookingType] || booking.bookingType}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {booking.guestsCount} гост.
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between pt-3 border-t gap-2">
                            <p className="font-semibold">
                              {booking.pricing.total} BYN
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => cancelSpaMutation.mutate(booking.id)}
                                disabled={cancelSpaMutation.isPending}
                                data-testid={`button-cancel-spa-${booking.id}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => acceptSpaMutation.mutate(booking.id)}
                                disabled={acceptSpaMutation.isPending}
                                data-testid={`button-accept-spa-${booking.id}`}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Принять
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {todaySpa.filter(b => b.status !== "pending_call").length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm">Сегодня</h3>
                    {todaySpa.filter(b => b.status !== "pending_call").map((booking) => (
                      <Card key={booking.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2 gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline">{booking.spaResource}</Badge>
                              <StatusBadge status={booking.status} />
                            </div>
                            <span className="text-sm font-mono">
                              {booking.startTime} - {booking.endTime}
                            </span>
                          </div>
                          <p className="font-medium">{booking.customer.fullName}</p>
                          <p className="text-sm text-muted-foreground">{booking.customer.phone}</p>
                          
                          {booking.status === "confirmed" && (
                            <div className="flex gap-2 mt-3 pt-3 border-t">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => closeSpaPaymentMutation.mutate({ 
                                  bookingId: booking.id, 
                                  method: "erip" 
                                })}
                                disabled={closeSpaPaymentMutation.isPending}
                                data-testid={`button-erip-spa-${booking.id}`}
                              >
                                <CreditCard className="h-4 w-4 mr-1" />
                                ЕРИП
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => closeSpaPaymentMutation.mutate({ 
                                  bookingId: booking.id, 
                                  method: "cash" 
                                })}
                                disabled={closeSpaPaymentMutation.isPending}
                                data-testid={`button-cash-spa-${booking.id}`}
                              >
                                <Banknote className="h-4 w-4 mr-1" />
                                Наличные
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {upcomingSpa.filter(b => b.status !== "pending_call").length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm">Предстоящие</h3>
                    {upcomingSpa.filter(b => b.status !== "pending_call").map((booking) => (
                      <Card key={booking.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2 gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline">{booking.spaResource}</Badge>
                              <StatusBadge status={booking.status} />
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-sm">
                                {booking.startTime} - {booking.endTime}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(parseISO(booking.date), "d MMM", { locale: ru })}
                              </p>
                            </div>
                          </div>
                          <p className="font-medium">{booking.customer.fullName}</p>
                          <p className="text-sm text-muted-foreground">{booking.customer.phone}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {spaBookings.length === 0 && (
                  <Card>
                    <CardContent className="p-6">
                      <EmptyState
                        icon={Droplets}
                        title="Нет SPA бронирований"
                        description="SPA бронирования появятся здесь"
                      />
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="baths" className="space-y-4">
            {pendingBaths.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-status-pending flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-status-pending animate-pulse" />
                  Ожидают подтверждения
                </h3>
                {pendingBaths.map((booking) => (
                  <Card key={booking.id} className="border-status-pending/30">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3 gap-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant="outline">{booking.bathCode}</Badge>
                            <StatusBadge status={booking.status} />
                          </div>
                          <p className="font-medium">{booking.customer.fullName}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {booking.customer.phone}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm">
                            {booking.startTime} - {booking.endTime}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(parseISO(booking.date), "d MMM", { locale: ru })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        {booking.options.tub !== "none" && (
                          <Badge variant="secondary" className="text-xs">
                            Купель: {booking.options.tub === "small" ? "малая" : "большая"}
                          </Badge>
                        )}
                        {booking.options.grill && (
                          <Badge variant="secondary" className="text-xs">Мангал</Badge>
                        )}
                        {booking.options.charcoal && (
                          <Badge variant="secondary" className="text-xs">Уголь</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t gap-2">
                        <p className="font-semibold">
                          {booking.pricing.total} BYN
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => cancelBathMutation.mutate(booking.id)}
                            disabled={cancelBathMutation.isPending}
                            data-testid={`button-cancel-${booking.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => acceptBathMutation.mutate(booking.id)}
                            disabled={acceptBathMutation.isPending}
                            data-testid={`button-accept-${booking.id}`}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Принять
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {todayBaths.filter(b => b.status !== "pending_call").length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Сегодня</h3>
                {todayBaths.filter(b => b.status !== "pending_call").map((booking) => (
                  <Card key={booking.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">{booking.bathCode}</Badge>
                          <StatusBadge status={booking.status} />
                        </div>
                        <span className="text-sm font-mono">
                          {booking.startTime} - {booking.endTime}
                        </span>
                      </div>
                      <p className="font-medium">{booking.customer.fullName}</p>
                      <p className="text-sm text-muted-foreground">{booking.customer.phone}</p>
                      
                      {booking.status === "confirmed" && (
                        <div className="flex gap-2 mt-3 pt-3 border-t">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => closeBathPaymentMutation.mutate({ 
                              bookingId: booking.id, 
                              method: "erip" 
                            })}
                            disabled={closeBathPaymentMutation.isPending}
                            data-testid={`button-erip-${booking.id}`}
                          >
                            <CreditCard className="h-4 w-4 mr-1" />
                            ЕРИП
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => closeBathPaymentMutation.mutate({ 
                              bookingId: booking.id, 
                              method: "cash" 
                            })}
                            disabled={closeBathPaymentMutation.isPending}
                            data-testid={`button-cash-${booking.id}`}
                          >
                            <Banknote className="h-4 w-4 mr-1" />
                            Наличные
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {upcomingBaths.filter(b => b.status !== "pending_call").length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Предстоящие</h3>
                {upcomingBaths.filter(b => b.status !== "pending_call").map((booking) => (
                  <Card key={booking.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">{booking.bathCode}</Badge>
                          <StatusBadge status={booking.status} />
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm">
                            {booking.startTime} - {booking.endTime}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(booking.date), "d MMM", { locale: ru })}
                          </p>
                        </div>
                      </div>
                      <p className="font-medium">{booking.customer.fullName}</p>
                      <p className="text-sm text-muted-foreground">{booking.customer.phone}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {bathBookings.length === 0 && !isLoading && (
              <Card>
                <CardContent className="p-6">
                  <EmptyState
                    icon={Bath}
                    title="Нет бронирований бань"
                    description="Бронирования бань появятся здесь"
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="cottages" className="space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                <BookingCardSkeleton />
                <BookingCardSkeleton />
              </div>
            ) : cottageBookings.length > 0 ? (
              <>
                {todayCottages.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm">Сегодня</h3>
                    {todayCottages.map((booking) => (
                      <Card key={booking.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2 gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline">{booking.unitCode}</Badge>
                              <StatusBadge status={booking.status} />
                            </div>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Users className="h-4 w-4" />
                              {booking.guestsCount}
                            </div>
                          </div>
                          <p className="font-medium">{booking.customer.fullName || booking.customer.phone}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(parseISO(booking.dateCheckIn), "d MMM", { locale: ru })} - {format(parseISO(booking.dateCheckOut), "d MMM", { locale: ru })}
                          </p>
                          {booking.tubSmall && (
                            <Badge variant="secondary" className="text-xs mt-2">
                              Малая купель
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {upcomingCottages.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm">Предстоящие</h3>
                    {upcomingCottages.map((booking) => (
                      <Card key={booking.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2 gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline">{booking.unitCode}</Badge>
                              <StatusBadge status={booking.status} />
                            </div>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Users className="h-4 w-4" />
                              {booking.guestsCount}
                            </div>
                          </div>
                          <p className="font-medium">{booking.customer.fullName || booking.customer.phone}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(parseISO(booking.dateCheckIn), "d MMM", { locale: ru })} - {format(parseISO(booking.dateCheckOut), "d MMM", { locale: ru })}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <EmptyState
                    icon={Home}
                    title="Нет бронирований домиков"
                    description="Бронирования домиков появятся здесь"
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </PageContainer>

      <BottomNav />
    </div>
  );
}
