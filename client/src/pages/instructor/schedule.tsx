import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays } from "date-fns";
import { ru } from "date-fns/locale";
import { 
  CalendarDays, 
  Bike, 
  Clock, 
  Phone,
  Check,
  X,
  UserPlus,
  Ban,
  Plus,
  Trash2
} from "lucide-react";
import { Link } from "wouter";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BookingCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { QuadBooking, InstructorBlockedTime } from "@shared/schema";

const blockedTimeSchema = z.object({
  date: z.date({ required_error: "Выберите дату" }),
  startTime: z.string().min(1, "Укажите время начала"),
  endTime: z.string().min(1, "Укажите время окончания"),
  reason: z.string().optional(),
});

type BlockedTimeFormData = z.infer<typeof blockedTimeSchema>;

const timeSlots = Array.from({ length: 12 }, (_, i) => {
  const hour = 9 + i;
  return `${hour.toString().padStart(2, "0")}:00`;
});

interface InstructorScheduleData {
  bookings: QuadBooking[];
  blockedTimes: InstructorBlockedTime[];
}

export default function InstructorSchedulePage() {
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { toast } = useToast();

  const form = useForm<BlockedTimeFormData>({
    resolver: zodResolver(blockedTimeSchema),
    defaultValues: {
      startTime: "10:00",
      endTime: "12:00",
      reason: "",
    },
  });

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  
  const { data: scheduleData, isLoading } = useQuery<InstructorScheduleData>({
    queryKey: ["/api/instructor/schedule", dateStr],
  });

  const bookings = scheduleData?.bookings || [];
  const blockedTimes = scheduleData?.blockedTimes || [];
  
  const pendingBookings = bookings.filter(b => b.status === "pending_call");
  const confirmedBookings = bookings.filter(b => b.status === "confirmed");
  const activeBookings = [...pendingBookings, ...confirmedBookings].sort(
    (a, b) => a.startTime.localeCompare(b.startTime)
  );

  const createBlockMutation = useMutation({
    mutationFn: async (data: BlockedTimeFormData) => {
      const response = await apiRequest("POST", "/api/instructor/blocked-times", {
        date: format(data.date, "yyyy-MM-dd"),
        startTime: data.startTime,
        endTime: data.endTime,
        reason: data.reason || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructor/schedule"] });
      setShowBlockDialog(false);
      form.reset();
      toast({ title: "Время заблокировано" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: async (blockId: string) => {
      const response = await apiRequest("DELETE", `/api/instructor/blocked-times/${blockId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructor/schedule"] });
      toast({ title: "Блокировка снята" });
    },
    onError: () => {
      toast({ title: "Ошибка удаления", variant: "destructive" });
    },
  });

  const confirmBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("POST", `/api/instructor/quad-bookings/${bookingId}/confirm`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructor/schedule"] });
      toast({ title: "Бронь подтверждена" });
    },
    onError: () => {
      toast({ title: "Ошибка подтверждения", variant: "destructive" });
    },
  });

  const cancelBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("POST", `/api/instructor/quad-bookings/${bookingId}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructor/schedule"] });
      toast({ title: "Бронь отменена" });
    },
    onError: () => {
      toast({ title: "Ошибка отмены", variant: "destructive" });
    },
  });

  const handleSubmitBlock = (data: BlockedTimeFormData) => {
    createBlockMutation.mutate(data);
  };

  const getRouteName = (routeType: string) => {
    return routeType === "short" ? "Малый (30мин)" : "Большой (60мин)";
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Расписание квадро" />
      
      <PageContainer>
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2" data-testid="button-date-picker">
                  <CalendarDays className="h-4 w-4" />
                  {format(selectedDate, "EEEE, d MMM", { locale: ru })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  disabled={(date) => date < addDays(new Date(), -7)}
                  locale={ru}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <div className="flex items-center gap-2">
              <Link href="/instructor/manage">
                <Button variant="outline" size="icon" data-testid="button-manage-instructors">
                  <UserPlus className="h-4 w-4" />
                </Button>
              </Link>
              <Button 
                variant="outline"
                onClick={() => {
                  form.setValue("date", selectedDate);
                  setShowBlockDialog(true);
                }}
                data-testid="button-block-time"
              >
                <Ban className="h-4 w-4 mr-1" />
                Закрыть время
              </Button>
            </div>
          </div>

          {blockedTimes.length > 0 && (
            <Card className="border-destructive/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Ban className="h-4 w-4 text-destructive" />
                  Заблокированное время
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {blockedTimes.map((block) => (
                  <div 
                    key={block.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-destructive/10"
                    data-testid={`blocked-time-${block.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <span className="font-medium">{block.startTime} - {block.endTime}</span>
                        {block.reason && (
                          <p className="text-xs text-muted-foreground">{block.reason}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteBlockMutation.mutate(block.id)}
                      disabled={deleteBlockMutation.isPending}
                      data-testid={`button-delete-block-${block.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {pendingBookings.length > 0 && (
            <Card className="border-status-pending/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-status-pending" />
                  Ожидают подтверждения
                  <Badge className="bg-status-pending text-black ml-auto">
                    {pendingBookings.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-status-pending/10"
                    data-testid={`booking-pending-${booking.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Bike className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-sm">{booking.quadsCount}</span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {booking.startTime} - {booking.endTime}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {booking.customer.fullName || "Гость"} | {getRouteName(booking.routeType)}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {booking.customer.phone}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => cancelBookingMutation.mutate(booking.id)}
                        disabled={cancelBookingMutation.isPending}
                        data-testid={`button-cancel-${booking.id}`}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => confirmBookingMutation.mutate(booking.id)}
                        disabled={confirmBookingMutation.isPending}
                        data-testid={`button-confirm-${booking.id}`}
                      >
                        <Check className="h-4 w-4 text-status-confirmed" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <div className="space-y-4">
              <BookingCardSkeleton />
              <BookingCardSkeleton />
            </div>
          ) : activeBookings.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bike className="h-4 w-4" />
                  Все бронирования на {format(selectedDate, "d MMMM", { locale: ru })}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    data-testid={`booking-${booking.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Bike className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-sm">{booking.quadsCount}</span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {booking.startTime} - {booking.endTime}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {booking.customer.fullName || "Гость"} | {getRouteName(booking.routeType)}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {booking.customer.phone}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {booking.pricing.total} BYN
                      </Badge>
                      <StatusBadge status={booking.status} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6">
                <EmptyState
                  icon={Bike}
                  title="Нет бронирований"
                  description="На этот день пока нет заявок"
                />
              </CardContent>
            </Card>
          )}
        </div>
      </PageContainer>

      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Заблокировать время</DialogTitle>
            <DialogDescription>
              Укажите период, когда бронирование невозможно
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmitBlock)} className="space-y-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Дата</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            <CalendarDays className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "PPP", { locale: ru }) : "Выберите дату"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date()}
                          locale={ru}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Начало</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Начало" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {timeSlots.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Окончание</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Конец" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {timeSlots.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Причина (необязательно)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Например: обед, техобслуживание..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowBlockDialog(false)}
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  disabled={createBlockMutation.isPending}
                >
                  {createBlockMutation.isPending ? "Сохранение..." : "Заблокировать"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
