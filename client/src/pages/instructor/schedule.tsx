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
  Users, 
  Clock, 
  Phone,
  Plus,
  Check,
  X,
  ChevronRight,
  UserPlus
} from "lucide-react";
import { Link } from "wouter";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BookingCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { QuadSession, QuadBooking } from "@shared/schema";

const sessionFormSchema = z.object({
  date: z.date({ required_error: "Выберите дату" }),
  startTime: z.string().min(1, "Укажите время начала"),
  endTime: z.string().min(1, "Укажите время окончания"),
});

type SessionFormData = z.infer<typeof sessionFormSchema>;

const timeSlots = Array.from({ length: 12 }, (_, i) => {
  const hour = 9 + i;
  return `${hour.toString().padStart(2, "0")}:00`;
});

interface InstructorData {
  sessions: (QuadSession & { bookings: QuadBooking[] })[];
}

export default function InstructorSchedulePage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { toast } = useToast();

  const form = useForm<SessionFormData>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      startTime: "10:00",
      endTime: "11:00",
    },
  });

  const { data: instructorData, isLoading } = useQuery<InstructorData>({
    queryKey: ["/api/instructor/quad-schedule", format(selectedDate, "yyyy-MM-dd")],
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data: SessionFormData) => {
      const response = await apiRequest("POST", "/api/instructor/quad-sessions", {
        date: format(data.date, "yyyy-MM-dd"),
        startTime: data.startTime,
        endTime: data.endTime,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructor/quad-schedule"] });
      setShowCreateDialog(false);
      form.reset();
      toast({ title: "Сессия создана" });
    },
    onError: () => {
      toast({ title: "Ошибка создания сессии", variant: "destructive" });
    },
  });

  const confirmBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("POST", `/api/instructor/quad-bookings/${bookingId}/confirm`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructor/quad-schedule"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/instructor/quad-schedule"] });
      toast({ title: "Бронь отменена" });
    },
    onError: () => {
      toast({ title: "Ошибка отмены", variant: "destructive" });
    },
  });

  const sessions = instructorData?.sessions || [];

  const handleSubmitSession = (data: SessionFormData) => {
    createSessionMutation.mutate(data);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Расписание квадро" />
      
      <PageContainer>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
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
                  disabled={(date) => date < addDays(new Date(), -1)}
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
                onClick={() => {
                  form.setValue("date", selectedDate);
                  setShowCreateDialog(true);
                }}
                data-testid="button-create-session"
              >
                <Plus className="h-4 w-4 mr-1" />
                Новая сессия
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              <BookingCardSkeleton />
              <BookingCardSkeleton />
            </div>
          ) : sessions.length > 0 ? (
            <div className="space-y-4">
              {sessions.map((session) => {
                const remaining = session.totalQuads - session.bookedQuads;
                const pendingBookings = session.bookings.filter(b => b.status === "pending_call");
                
                return (
                  <Card key={session.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {session.startTime} - {session.endTime}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {pendingBookings.length > 0 && (
                            <Badge className="bg-status-pending text-black">
                              {pendingBookings.length} ожидают
                            </Badge>
                          )}
                          <div className="flex gap-0.5">
                            {[...Array(4)].map((_, i) => (
                              <div
                                key={i}
                                className={cn(
                                  "w-2 h-6 rounded-sm",
                                  i < remaining
                                    ? "bg-status-confirmed"
                                    : "bg-muted"
                                )}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {session.bookings.length > 0 ? (
                        session.bookings.map((booking) => (
                          <div
                            key={booking.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1">
                                <Bike className="h-4 w-4 text-muted-foreground" />
                                <span className="font-mono text-sm">{booking.quadsCount}</span>
                              </div>
                              <div>
                                <p className="font-medium text-sm">{booking.customer.fullName}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {booking.customer.phone}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {booking.duration} мин
                              </Badge>
                              {booking.status === "pending_call" ? (
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
                              ) : (
                                <StatusBadge status={booking.status} />
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Пока нет бронирований
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-6">
                <EmptyState
                  icon={Bike}
                  title="Нет сессий"
                  description="Создайте сессию для начала работы"
                  action={
                    <Button
                      onClick={() => {
                        form.setValue("date", selectedDate);
                        setShowCreateDialog(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Создать сессию
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          )}
        </div>
      </PageContainer>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать сессию квадро</DialogTitle>
            <DialogDescription>
              Добавьте новую сессию для бронирования гостями
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmitSession)} className="space-y-4">
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

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  disabled={createSessionMutation.isPending}
                >
                  {createSessionMutation.isPending ? "Создание..." : "Создать сессию"}
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
