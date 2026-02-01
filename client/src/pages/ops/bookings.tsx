import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, isSameDay, isAfter, parseISO, getYear, getMonth, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isBefore } from "date-fns";
import { ru } from "date-fns/locale";
import { DayPicker } from "react-day-picker";
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
  Droplets,
  Percent,
  RefreshCw,
  Share2,
  ChevronLeft,
  ChevronRight,
  ExternalLink
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BookingCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth-context";
import type { CottageBooking, BathBooking, SpaBooking } from "@shared/schema";

interface BookingsData {
  cottageBookings: CottageBooking[];
  bathBookings: BathBooking[];
}

interface CalendarData {
  year: number;
  month: number;
  dates: { [date: string]: { spa1: boolean; spa2: boolean; spa1Count: number; spa2Count: number } };
}

function formatSpaOptions(options: { tub?: string; terrace?: boolean; grill?: boolean; charcoal?: boolean } | undefined): string[] {
  if (!options) return [];
  const items: string[] = [];
  
  if (options.tub === "none" && !options.terrace) {
    items.push("Баня");
  } else if (options.tub === "small") {
    items.push("Баня", "Купель М");
  } else if (options.tub === "large") {
    items.push("Баня", "Купель Б");
  } else if (options.terrace && options.tub === "none") {
    items.push("Терраса");
  }
  
  if (options.terrace && options.tub !== "none") {
    items.push("Терраса");
  }
  if (options.grill) items.push("Мангал");
  if (options.charcoal) items.push("+уголь");
  
  return items;
}

export default function BookingsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER" || user?.role === "SUPER_ADMIN";
  
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [selectedBookingForDiscount, setSelectedBookingForDiscount] = useState<SpaBooking | null>(null);
  const [discountPercent, setDiscountPercent] = useState("");
  
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [showCalendarView, setShowCalendarView] = useState(true);

  const { data: bookingsData, isLoading } = useQuery<BookingsData>({
    queryKey: ["/api/admin/bookings/upcoming"],
  });

  const { data: spaBookings = [], isLoading: loadingSpa } = useQuery<SpaBooking[]>({
    queryKey: ["/api/admin/spa-bookings/upcoming"],
  });

  const { data: calendarData, isLoading: calendarLoading } = useQuery<CalendarData>({
    queryKey: [`/api/ops/spa-calendar?year=${getYear(calendarMonth)}&month=${getMonth(calendarMonth) + 1}`],
  });

  // Fetch bookings for selected date specifically
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const { data: bookingsForSelectedDate = [], isLoading: loadingDateBookings } = useQuery<SpaBooking[]>({
    queryKey: [`/api/ops/spa-bookings/by-date?date=${selectedDateStr}`],
  });

  const getDateAvailability = (date: Date): { spa1: boolean; spa2: boolean } | undefined => {
    if (!calendarData?.dates) return undefined;
    const dateStr = format(date, "yyyy-MM-dd");
    return calendarData.dates[dateStr];
  };

  const hasBookingsOnDate = (date: Date): boolean => {
    const avail = getDateAvailability(date);
    return avail?.spa1 === true || avail?.spa2 === true;
  };

  const isFullyBooked = (date: Date): boolean => {
    const avail = getDateAvailability(date);
    return avail?.spa1 === true && avail?.spa2 === true;
  };

  const shareBookingLink = (booking: SpaBooking) => {
    const botUsername = "Drewno_bot";
    const dateStr = booking.date;
    const deepLink = `https://t.me/${botUsername}?start=book_spa_${dateStr}`;
    const formattedDate = format(parseISO(booking.date), "d MMMM", { locale: ru });
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(`Забронируйте СПА на ${formattedDate} в Village Drewno!`)}`;
    
    if (window.Telegram?.WebApp) {
      (window.Telegram.WebApp as any).openTelegramLink?.(shareUrl) || window.open(shareUrl, "_blank");
    } else {
      navigator.clipboard.writeText(deepLink);
      toast({ title: "Ссылка скопирована", description: "Отправьте ее гостю в Telegram" });
    }
  };

  const shareBookingDate = (date: Date) => {
    const botUsername = "Drewno_bot";
    const dateStr = format(date, "yyyy-MM-dd");
    const deepLink = `https://t.me/${botUsername}?start=book_spa_${dateStr}`;
    const formattedDate = format(date, "d MMMM yyyy", { locale: ru });
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(`Забронируйте СПА на ${formattedDate} в Village Drewno!`)}`;
    
    if (window.Telegram?.WebApp) {
      (window.Telegram.WebApp as any).openTelegramLink?.(shareUrl) || window.open(shareUrl, "_blank");
    } else {
      navigator.clipboard.writeText(deepLink);
      toast({ title: "Ссылка скопирована", description: "Отправьте ее гостю в Telegram" });
    }
  };

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

  const arriveBathMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("POST", `/api/admin/bath-bookings/${bookingId}/arrive`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/today"] });
      toast({ title: "Гость отмечен как прибывший" });
    },
    onError: () => {
      toast({ title: "Ошибка отметки прибытия", variant: "destructive" });
    },
  });

  const noShowBathMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("POST", `/api/admin/bath-bookings/${bookingId}/no-show`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/today"] });
      toast({ title: "Бронирование отмечено как неявка" });
    },
    onError: () => {
      toast({ title: "Ошибка отметки неявки", variant: "destructive" });
    },
  });

  const invalidateSpaQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/spa-bookings/upcoming"] });
    queryClient.invalidateQueries({ predicate: (query) => 
      typeof query.queryKey[0] === 'string' && 
      (query.queryKey[0].startsWith('/api/ops/spa-calendar') || 
       query.queryKey[0].startsWith('/api/ops/spa-bookings/by-date'))
    });
  };

  const acceptSpaMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("POST", `/api/admin/spa-bookings/${bookingId}/accept`);
      return response.json();
    },
    onSuccess: () => {
      invalidateSpaQueries();
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
      invalidateSpaQueries();
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
      invalidateSpaQueries();
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shift/current"] });
      toast({ title: "Оплата SPA закрыта" });
    },
    onError: () => {
      toast({ title: "Ошибка закрытия оплаты SPA", variant: "destructive" });
    },
  });

  const applySpaDiscountMutation = useMutation({
    mutationFn: async ({ bookingId, discountPercent }: { bookingId: string; discountPercent: number }) => {
      const response = await apiRequest("POST", `/api/owner/spa-bookings/${bookingId}/discount`, {
        discountPercent,
      });
      return response.json();
    },
    onSuccess: () => {
      invalidateSpaQueries();
      setDiscountDialogOpen(false);
      setSelectedBookingForDiscount(null);
      setDiscountPercent("");
      toast({ title: "Скидка применена" });
    },
    onError: () => {
      toast({ title: "Ошибка применения скидки", variant: "destructive" });
    },
  });

  const handleOpenDiscountDialog = (booking: SpaBooking) => {
    setSelectedBookingForDiscount(booking);
    setDiscountPercent(String(booking.pricing.discountPercent || 0));
    setDiscountDialogOpen(true);
  };

  const handleApplyDiscount = () => {
    if (!selectedBookingForDiscount) return;
    const percent = parseInt(discountPercent) || 0;
    if (percent < 0 || percent > 100) {
      toast({ title: "Скидка должна быть от 0 до 100%", variant: "destructive" });
      return;
    }
    applySpaDiscountMutation.mutate({
      bookingId: selectedBookingForDiscount.id,
      discountPercent: percent,
    });
  };

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
    bath_only: "Только СПА",
    terrace_only: "Только терраса",
    tub_only: "Только купель",
    bath_with_tub: "СПА + Купель",
  };

  const renderSpaBookingCard = (booking: SpaBooking, showDate: boolean = false) => (
    <Card key={booking.id} className={booking.status === "pending_call" ? "border-status-pending/30" : ""}>
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
            {showDate && (
              <p className="text-xs text-muted-foreground">
                {format(parseISO(booking.date), "d MMM", { locale: ru })}
              </p>
            )}
          </div>
        </div>
        <p className="font-medium">{booking.customer.fullName}</p>
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          <Phone className="h-3 w-3" />
          {booking.customer.phone}
        </p>
        <div className="flex items-center gap-2 my-2 flex-wrap">
          <Badge variant="secondary" className="text-xs">
            {SPA_TYPE_LABELS[booking.bookingType] || booking.bookingType}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {booking.guestsCount} гост.
          </Badge>
        </div>
        {formatSpaOptions(booking.options).length > 0 && (
          <p className="text-sm text-muted-foreground mb-2">
            {formatSpaOptions(booking.options).join(" / ")}
          </p>
        )}
        <div className="flex items-center justify-between pt-2 border-t gap-2">
          <div>
            <span className="font-semibold">
              {booking.pricing.total} BYN
            </span>
            {booking.pricing.discountPercent > 0 && (
              <span className="text-xs text-status-confirmed ml-1">
                (-{booking.pricing.discountPercent}%)
              </span>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => shareBookingLink(booking)}
              data-testid={`button-share-spa-${booking.id}`}
            >
              <Share2 className="h-4 w-4" />
            </Button>
            {isOwner && booking.status !== "completed" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleOpenDiscountDialog(booking)}
                data-testid={`button-discount-spa-${booking.id}`}
              >
                <Percent className="h-4 w-4" />
              </Button>
            )}
            {booking.status === "pending_call" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
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
              </>
            )}
            {booking.status !== "pending_call" && booking.status !== "completed" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => cancelSpaMutation.mutate(booking.id)}
                disabled={cancelSpaMutation.isPending}
                data-testid={`button-cancel-spa-${booking.id}`}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        
        {booking.status === "confirmed" && (
          <div className="mt-3 pt-3 border-t space-y-2">
            <div className="flex gap-2">
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
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Бронирования" />
      
      <PageContainer>
        <Tabs defaultValue="spa" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="spa" className="gap-2" data-testid="tab-spa">
              <Droplets className="h-4 w-4" />
              СПА
              {pendingSpa.length > 0 && (
                <Badge className="ml-1 text-xs bg-status-pending text-black">
                  {pendingSpa.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="cottages" className="gap-2" data-testid="tab-cottages">
              <Home className="h-4 w-4" />
              Домики
            </TabsTrigger>
          </TabsList>

          <TabsContent value="spa" className="space-y-4">
            {/* Today's date header */}
            <div className="text-center py-2">
              <p className="text-lg font-semibold">
                {format(new Date(), "d MMMM yyyy", { locale: ru })}
              </p>
              <p className="text-sm text-muted-foreground">
                {format(new Date(), "EEEE", { locale: ru })}
              </p>
            </div>

            {/* Calendar with availability */}
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1))}
                    data-testid="button-prev-month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-medium">
                    {format(calendarMonth, "LLLL yyyy", { locale: ru })}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))}
                    data-testid="button-next-month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                
                {calendarLoading ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Загрузка...
                  </div>
                ) : (
                  <DayPicker
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    locale={ru}
                    modifiers={{
                      booked: (date) => hasBookingsOnDate(date),
                      fullyBooked: (date) => isFullyBooked(date),
                    }}
                    modifiersClassNames={{
                      booked: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-semibold",
                      fullyBooked: "bg-red-200 dark:bg-red-800/60 text-red-800 dark:text-red-200 font-bold",
                      selected: "!bg-primary !text-primary-foreground",
                    }}
                    className="rounded-md"
                    classNames={{
                      months: "flex flex-col",
                      month: "space-y-2",
                      caption: "hidden",
                      nav: "hidden",
                      table: "w-full border-collapse",
                      head_row: "flex w-full",
                      head_cell: "text-muted-foreground rounded-md w-full font-normal text-[0.8rem] flex-1 text-center",
                      row: "flex w-full mt-1",
                      cell: "flex-1 text-center text-sm p-0 relative",
                      day: "h-8 w-full p-0 font-normal rounded-md hover-elevate cursor-pointer flex items-center justify-center",
                      day_today: "bg-accent text-accent-foreground",
                      day_outside: "text-muted-foreground opacity-50",
                      day_disabled: "text-muted-foreground opacity-50",
                    }}
                  />
                )}

                {/* Legend */}
                <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm bg-red-100 dark:bg-red-900/40" />
                    <span className="text-muted-foreground">Есть брони</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm bg-red-200 dark:bg-red-800/60" />
                    <span className="text-muted-foreground">Полностью занят</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Selected date bookings */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {format(selectedDate, "d MMMM", { locale: ru })}
                  {isSameDay(selectedDate, new Date()) && (
                    <Badge variant="secondary" className="text-xs">Сегодня</Badge>
                  )}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => shareBookingDate(selectedDate)}
                  data-testid="button-share-date"
                >
                  <Share2 className="h-4 w-4 mr-1" />
                  Поделиться
                </Button>
              </div>

              {loadingDateBookings ? (
                <BookingCardSkeleton />
              ) : bookingsForSelectedDate.length > 0 ? (
                bookingsForSelectedDate.map((booking) => renderSpaBookingCard(booking, false))
              ) : (
                <Card>
                  <CardContent className="p-4 text-center text-sm text-muted-foreground">
                    Нет бронирований на эту дату
                    <div className="mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => shareBookingDate(selectedDate)}
                      >
                        <Share2 className="h-4 w-4 mr-1" />
                        Отправить ссылку для брони
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Pending bookings section */}
            {pendingSpa.length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <h3 className="font-semibold text-sm text-status-pending flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-status-pending animate-pulse" />
                  Ожидают подтверждения ({pendingSpa.length})
                </h3>
                {pendingSpa.map((booking) => renderSpaBookingCard(booking, true))}
              </div>
            )}

            {/* All upcoming bookings */}
            {upcomingSpa.filter(b => b.status !== "pending_call").length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <h3 className="font-semibold text-sm">Все предстоящие</h3>
                {upcomingSpa.filter(b => b.status !== "pending_call").map((booking) => renderSpaBookingCard(booking, true))}
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

      <Dialog open={discountDialogOpen} onOpenChange={setDiscountDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Применить скидку</DialogTitle>
          </DialogHeader>
          {selectedBookingForDiscount && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {selectedBookingForDiscount.customer.fullName} - {selectedBookingForDiscount.spaResource}
                <br />
                {format(parseISO(selectedBookingForDiscount.date), "d MMMM", { locale: ru })} | {selectedBookingForDiscount.startTime} - {selectedBookingForDiscount.endTime}
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount">Скидка (%)</Label>
                <Input
                  id="discount"
                  type="number"
                  min="0"
                  max="100"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder="0-100"
                  data-testid="input-discount-percent"
                />
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Базовая цена: </span>
                <span className="font-mono">{selectedBookingForDiscount.pricing.base} BYN</span>
              </div>
              {parseInt(discountPercent) > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">После скидки: </span>
                  <span className="font-mono font-semibold">
                    {Math.round(selectedBookingForDiscount.pricing.base * (1 - parseInt(discountPercent) / 100))} BYN
                  </span>
                  <span className="text-status-confirmed ml-2">
                    (-{Math.round(selectedBookingForDiscount.pricing.base * parseInt(discountPercent) / 100)} BYN)
                  </span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDiscountDialogOpen(false)}
              data-testid="button-cancel-discount"
            >
              Отмена
            </Button>
            <Button 
              onClick={handleApplyDiscount}
              disabled={applySpaDiscountMutation.isPending}
              data-testid="button-apply-discount"
            >
              {applySpaDiscountMutation.isPending ? "Применение..." : "Применить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
