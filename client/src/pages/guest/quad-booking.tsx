import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarIcon, Bike, Clock, Phone, User, Check, Minus, Plus, Loader2 } from "lucide-react";
import { Header } from "@/components/layout/header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import type { QuadSession, InsertQuadBooking } from "@shared/schema";

type Step = "phone" | "verify" | "date" | "session" | "details" | "success";

const phoneSchema = z.object({
  phone: z.string().min(9, "Введите корректный номер телефона"),
});

const verifySchema = z.object({
  code: z.string().length(4, "Код должен содержать 4 цифры"),
});

const bookingFormSchema = z.object({
  sessionId: z.string().min(1, "Выберите сеанс"),
  duration: z.union([z.literal(30), z.literal(60)]),
  quadsCount: z.number().min(1).max(4),
  fullName: z.string().min(2, "Укажите имя"),
});

type PhoneFormData = z.infer<typeof phoneSchema>;
type VerifyFormData = z.infer<typeof verifySchema>;
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
  const [step, setStep] = useState<Step>("phone");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [phone, setPhone] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const { toast } = useToast();

  const phoneForm = useForm<PhoneFormData>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "" },
  });

  const verifyForm = useForm<VerifyFormData>({
    resolver: zodResolver(verifySchema),
    defaultValues: { code: "" },
  });

  const bookingForm = useForm<BookingFormData>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      sessionId: "",
      duration: 30,
      quadsCount: 1,
      fullName: "",
    },
  });

  const watchedValues = bookingForm.watch();

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const sendSmsMutation = useMutation({
    mutationFn: async (data: PhoneFormData) => {
      const response = await apiRequest("POST", "/api/guest/sms/send", data);
      return response.json();
    },
    onSuccess: (data) => {
      setPhone(phoneForm.getValues("phone"));
      setCooldown(data.cooldownSeconds || 60);
      setStep("verify");
      toast({
        title: "Код отправлен",
        description: "Проверьте SMS на вашем телефоне",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка отправки",
        description: error.message || "Попробуйте позже",
        variant: "destructive",
      });
    },
  });

  const verifySmsMutation = useMutation({
    mutationFn: async (data: VerifyFormData) => {
      const response = await apiRequest("POST", "/api/guest/sms/verify", {
        phone,
        code: data.code,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setVerificationToken(data.verificationToken);
      setStep("date");
      toast({
        title: "Телефон подтверждён",
        description: "Теперь выберите дату поездки",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Неверный код",
        description: error.message || "Попробуйте ещё раз",
        variant: "destructive",
      });
    },
  });

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
          phone,
        },
      };
      const response = await apiRequest("POST", "/api/guest/quad-bookings", {
        ...bookingData,
        verificationToken,
      });
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

  const handlePhoneSubmit = (data: PhoneFormData) => {
    sendSmsMutation.mutate(data);
  };

  const handleVerifySubmit = (data: VerifyFormData) => {
    verifySmsMutation.mutate(data);
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
                bookingForm.reset();
                verifyForm.reset();
                phoneForm.reset();
                setSelectedDate(undefined);
                setStep("phone");
                setPhone("");
                setVerificationToken("");
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
      <Header title="Забронировать квадроциклы" showBack={step !== "phone"} />
      <PageContainer>
        {step === "phone" && (
          <Form {...phoneForm}>
            <form onSubmit={phoneForm.handleSubmit(handlePhoneSubmit)} className="space-y-6">
              <div className="space-y-4">
                <h2 className="text-xl font-semibold" data-testid="text-step-title">
                  Подтверждение телефона
                </h2>
                <p className="text-muted-foreground">
                  Введите номер телефона для получения SMS-кода
                </p>

                <FormField
                  control={phoneForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Номер телефона</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="+375 (29) 123-45-67"
                            className="pl-10"
                            {...field}
                            data-testid="input-phone"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={sendSmsMutation.isPending}
                data-testid="button-send-sms"
              >
                {sendSmsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Получить код
              </Button>
            </form>
          </Form>
        )}

        {step === "verify" && (
          <Form {...verifyForm}>
            <form onSubmit={verifyForm.handleSubmit(handleVerifySubmit)} className="space-y-6">
              <div className="space-y-4">
                <h2 className="text-xl font-semibold" data-testid="text-step-title">
                  Введите код из SMS
                </h2>
                <p className="text-muted-foreground">
                  Код отправлен на номер {phone}
                </p>

                <FormField
                  control={verifyForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem className="flex flex-col items-center">
                      <FormControl>
                        <InputOTP
                          maxLength={4}
                          value={field.value}
                          onChange={field.onChange}
                          data-testid="input-sms-code"
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                          </InputOTPGroup>
                        </InputOTP>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {cooldown > 0 && (
                  <p className="text-center text-sm text-muted-foreground">
                    Повторная отправка через {cooldown} сек.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={verifySmsMutation.isPending}
                  data-testid="button-verify"
                >
                  {verifySmsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Подтвердить
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={cooldown > 0}
                  onClick={() => sendSmsMutation.mutate({ phone })}
                  data-testid="button-resend"
                >
                  Отправить код повторно
                </Button>
              </div>
            </form>
          </Form>
        )}

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
                        <CardDescription>
                          Доступно в этом сеансе: {availableQuads}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <FormField
                          control={bookingForm.control}
                          name="quadsCount"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-center gap-6">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => field.onChange(Math.max(1, field.value - 1))}
                                  disabled={field.value <= 1}
                                  data-testid="button-quads-minus"
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <div className="text-center min-w-[80px]">
                                  <p className="text-4xl font-bold">{field.value}</p>
                                  <p className="text-sm text-muted-foreground">
                                    квадр.
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => field.onChange(Math.min(availableQuads, field.value + 1))}
                                  disabled={field.value >= availableQuads}
                                  data-testid="button-quads-plus"
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Контактные данные</CardTitle>
                        <CardDescription>Телефон: {phone}</CardDescription>
                      </CardHeader>
                      <CardContent>
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

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Итого</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Дата</span>
                          <span>{selectedDate && format(selectedDate, "d MMMM", { locale: ru })}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Время</span>
                          <span>{selectedSession?.startTime} - {selectedSession?.endTime}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Длительность</span>
                          <span>{watchedValues.duration} мин.</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Квадроциклов</span>
                          <span>{watchedValues.quadsCount}</span>
                        </div>
                        <div className="flex justify-between font-semibold pt-2 border-t">
                          <span>Стоимость</span>
                          <span className="text-primary">{calculatePrice()} BYN</span>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>

              <div className="space-y-2">
                {watchedValues.sessionId && watchedValues.fullName && (
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={bookingMutation.isPending}
                    data-testid="button-submit"
                  >
                    {bookingMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Отправить заявку
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setStep("date")}
                  data-testid="button-back"
                >
                  Назад
                </Button>
              </div>
            </form>
          </Form>
        )}
      </PageContainer>
    </div>
  );
}
