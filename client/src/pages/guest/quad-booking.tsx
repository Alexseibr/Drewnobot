import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarIcon, Bike, Clock, User, Check, Minus, Plus, Loader2 } from "lucide-react";
import { Header } from "@/components/layout/header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EmptyState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/loading-skeleton";
import { useAuth } from "@/lib/auth-context";
import type { QuadSession, InsertQuadBooking } from "@shared/schema";

type Step = "date" | "session" | "details" | "success";

const bookingFormSchema = z.object({
  sessionId: z.string().min(1, "Выберите сеанс"),
  duration: z.union([z.literal(30), z.literal(60)]),
  quadsCount: z.number().min(1).max(4),
  fullName: z.string().min(2, "Укажите имя"),
});

type BookingFormData = z.infer<typeof bookingFormSchema>;

const PRICES = {
  quad_30m: 40,
  quad_60m: 80,
};

interface AvailabilityResponse {
  blocked: boolean;
  reason?: string;
  sessions: QuadSession[];
}

export default function QuadBookingPage() {
  const [step, setStep] = useState<Step>("date");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const { toast } = useToast();
  const { user } = useAuth();

  const bookingForm = useForm<BookingFormData>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      sessionId: "",
      duration: 30,
      quadsCount: 1,
      fullName: user?.name || "",
    },
  });

  const watchedValues = bookingForm.watch();

  const { data: availabilityData, isLoading: loadingSessions } = useQuery<AvailabilityResponse>({
    queryKey: ["/api/guest/quads/availability", selectedDate ? format(selectedDate, "yyyy-MM-dd") : null],
    enabled: !!selectedDate && (step === "date" || step === "session"),
  });

  const sessions = availabilityData?.sessions || [];
  const dateBlocked = availabilityData?.blocked;
  const blockReason = availabilityData?.reason;

  const selectedSession = sessions.find(s => s.id === watchedValues.sessionId);
  const availableQuads = selectedSession ? selectedSession.totalQuads - selectedSession.bookedQuads : 0;

  const bookingMutation = useMutation({
    mutationFn: async (data: BookingFormData) => {
      const bookingData: InsertQuadBooking = {
        sessionId: data.sessionId,
        duration: data.duration,
        quadsCount: data.quadsCount,
        customer: {
          fullName: data.fullName,
          telegramId: user?.telegramId,
        },
      };
      const response = await apiRequest("POST", "/api/guest/quad-bookings", bookingData);
      return response.json();
    },
    onSuccess: () => {
      setStep("success");
      queryClient.invalidateQueries({ queryKey: ["/api/guest/quads/availability"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка бронирования",
        description: error.message || "Попробуйте позже",
        variant: "destructive",
      });
    },
  });

  const calculatePrice = () => {
    const { duration, quadsCount } = watchedValues;
    const basePrice = duration === 30 ? PRICES.quad_30m : PRICES.quad_60m;
    return basePrice * quadsCount;
  };

  const handleBookingSubmit = (data: BookingFormData) => {
    bookingMutation.mutate(data);
  };

  if (step === "success") {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header title="Заявка отправлена" showBack />
        <PageContainer>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-status-confirmed/10 p-6 mb-6">
              <Check className="h-12 w-12 text-status-confirmed" />
            </div>
            <h2 className="text-2xl font-semibold mb-2" data-testid="text-success-title">
              Заявка отправлена
            </h2>
            <p className="text-muted-foreground max-w-xs mb-6" data-testid="text-success-description">
              Наш инструктор свяжется с вами для подтверждения поездки.
            </p>
            <div className="space-y-2 text-sm text-left w-full max-w-xs">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Дата</span>
                <span className="font-medium">
                  {selectedDate && format(selectedDate, "d MMMM yyyy", { locale: ru })}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Время</span>
                <span className="font-medium">
                  {selectedSession?.startTime} - {selectedSession?.endTime}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Длительность</span>
                <span className="font-medium">{watchedValues.duration} минут</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Квадроциклов</span>
                <span className="font-medium">{watchedValues.quadsCount}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Стоимость</span>
                <span className="font-semibold text-primary">{calculatePrice()} BYN</span>
              </div>
            </div>
            <Button
              className="mt-8 w-full max-w-xs"
              onClick={() => {
                bookingForm.reset({ sessionId: "", duration: 30, quadsCount: 1, fullName: user?.name || "" });
                setSelectedDate(undefined);
                setStep("date");
              }}
              data-testid="button-new-booking"
            >
              Новое бронирование
            </Button>
          </div>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Забронировать квадроциклы" showBack={step !== "date"} />
      <PageContainer>
        {step === "date" && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold" data-testid="text-step-title">
                Выберите дату
              </h2>

              <Card>
                <CardContent className="p-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !selectedDate && "text-muted-foreground"
                        )}
                        data-testid="button-date-picker"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate ? format(selectedDate, "PPP", { locale: ru }) : "Выберите дату"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => {
                          setSelectedDate(date);
                          bookingForm.setValue("sessionId", "");
                        }}
                        disabled={(date) => date < new Date() || date > addDays(new Date(), 30)}
                        locale={ru}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </CardContent>
              </Card>

              {dateBlocked && (
                <Card className="border-destructive">
                  <CardContent className="p-4 text-center text-destructive">
                    {blockReason || "Квадроциклы недоступны на эту дату"}
                  </CardContent>
                </Card>
              )}
            </div>

            {selectedDate && !dateBlocked && (
              <Button
                type="button"
                className="w-full"
                onClick={() => setStep("session")}
                data-testid="button-next"
              >
                Посмотреть доступные сеансы
              </Button>
            )}
          </div>
        )}

        {step === "session" && (
          <Form {...bookingForm}>
            <form onSubmit={bookingForm.handleSubmit(handleBookingSubmit)} className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-semibold" data-testid="text-step-title">
                    Доступные сеансы
                  </h2>
                  <Badge variant="outline">
                    {selectedDate && format(selectedDate, "d MMM", { locale: ru })}
                  </Badge>
                </div>

                {loadingSessions ? (
                  <div className="space-y-3">
                    <BookingCardSkeleton />
                    <BookingCardSkeleton />
                  </div>
                ) : sessions && sessions.length > 0 ? (
                  <div className="space-y-3">
                    {sessions.map((session) => {
                      const remaining = session.totalQuads - session.bookedQuads;
                      const isSelected = watchedValues.sessionId === session.id;
                      const isFull = session.status === "full" || remaining === 0;

                      return (
                        <Card
                          key={session.id}
                          className={cn(
                            "cursor-pointer transition-all hover-elevate",
                            isSelected && "ring-2 ring-primary",
                            isFull && "opacity-50 cursor-not-allowed"
                          )}
                          onClick={() => !isFull && bookingForm.setValue("sessionId", session.id)}
                          data-testid={`card-session-${session.id}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "rounded-full p-2",
                                  isSelected ? "bg-primary/10" : "bg-muted"
                                )}>
                                  <Clock className={cn(
                                    "h-5 w-5",
                                    isSelected ? "text-primary" : "text-muted-foreground"
                                  )} />
                                </div>
                                <div>
                                  <p className="font-medium">
                                    {session.startTime} - {session.endTime}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Свободно: {remaining} квадр.
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {session.bookedQuads > 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    Группа
                                  </Badge>
                                )}
                                <div className="flex gap-0.5">
                                  {[...Array(4)].map((_, i) => (
                                    <div
                                      key={i}
                                      className={cn(
                                        "w-2 h-6 rounded-sm",
                                        i < remaining ? "bg-status-confirmed" : "bg-muted"
                                      )}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={Bike}
                    title="Нет доступных сеансов"
                    description="На эту дату нет запланированных сеансов. Попробуйте другую дату."
                  />
                )}

                {watchedValues.sessionId && (
                  <>
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Длительность поездки</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <FormField
                          control={bookingForm.control}
                          name="duration"
                          render={({ field }) => (
                            <FormItem>
                              <div className="grid grid-cols-2 gap-3">
                                <Card
                                  className={cn(
                                    "cursor-pointer hover-elevate",
                                    field.value === 30 && "ring-2 ring-primary"
                                  )}
                                  onClick={() => field.onChange(30)}
                                  data-testid="card-duration-30"
                                >
                                  <CardContent className="p-4 text-center">
                                    <p className="text-2xl font-bold">30</p>
                                    <p className="text-sm text-muted-foreground">минут</p>
                                    <p className="text-sm font-medium text-primary mt-2">
                                      {PRICES.quad_30m} BYN/квадр.
                                    </p>
                                  </CardContent>
                                </Card>
                                <Card
                                  className={cn(
                                    "cursor-pointer hover-elevate",
                                    field.value === 60 && "ring-2 ring-primary"
                                  )}
                                  onClick={() => field.onChange(60)}
                                  data-testid="card-duration-60"
                                >
                                  <CardContent className="p-4 text-center">
                                    <p className="text-2xl font-bold">60</p>
                                    <p className="text-sm text-muted-foreground">минут</p>
                                    <p className="text-sm font-medium text-primary mt-2">
                                      {PRICES.quad_60m} BYN/квадр.
                                    </p>
                                  </CardContent>
                                </Card>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Количество квадроциклов</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <FormField
                          control={bookingForm.control}
                          name="quadsCount"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-center gap-4">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  onClick={() => field.onChange(Math.max(1, field.value - 1))}
                                  disabled={field.value <= 1}
                                  data-testid="button-quads-minus"
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <span className="text-3xl font-bold w-12 text-center">
                                  {field.value}
                                </span>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  onClick={() => field.onChange(Math.min(availableQuads, field.value + 1))}
                                  disabled={field.value >= availableQuads}
                                  data-testid="button-quads-plus"
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                              <p className="text-sm text-muted-foreground text-center mt-2">
                                Доступно: {availableQuads}
                              </p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Контактные данные</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <FormField
                          control={bookingForm.control}
                          name="fullName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Имя</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                  <Input
                                    placeholder="Ваше имя"
                                    className="pl-10"
                                    {...field}
                                    data-testid="input-fullname"
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>

                    <Card className="bg-primary/5 border-primary/20">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Итого:</span>
                          <span className="text-2xl font-bold text-primary">
                            {calculatePrice()} BYN
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>

              {watchedValues.sessionId && (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={bookingMutation.isPending}
                  data-testid="button-submit"
                >
                  {bookingMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Забронировать
                </Button>
              )}
            </form>
          </Form>
        )}
      </PageContainer>
    </div>
  );
}
