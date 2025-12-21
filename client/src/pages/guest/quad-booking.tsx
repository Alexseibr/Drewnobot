import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarIcon, Bike, Clock, User, Check, Minus, Plus, Loader2, MapPin, MessageCircle, Phone, Percent } from "lucide-react";
import { Header } from "@/components/layout/header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth-context";
import type { QuadRouteType } from "@shared/schema";

type Step = "date" | "route" | "time" | "details" | "success";

interface SlotInfo {
  startTime: string;
  routeType: QuadRouteType;
  price: number;
  availableQuads: number;
  hasDiscount: boolean;
  discountPrice?: number;
}

interface AvailabilityResponse {
  blocked: boolean;
  message?: string;
  slots: SlotInfo[];
  blockedTimes: Array<{
    id: string;
    date: string;
    startTime?: string;
    endTime?: string;
    reason?: string;
  }>;
}

const bookingFormSchema = z.object({
  routeType: z.enum(["short", "long"]),
  startTime: z.string().min(1, "Выберите время"),
  quadsCount: z.number().min(1).max(4),
  fullName: z.string().min(2, "Укажите имя"),
  phone: z.string().min(10, "Укажите номер телефона").regex(/^[\d\s+()-]+$/, "Неверный формат телефона"),
  comment: z.string().optional(),
});

type BookingFormData = z.infer<typeof bookingFormSchema>;

const ROUTE_INFO = {
  short: {
    name: "Малый маршрут",
    description: "30 минут, простая трасса",
    duration: 30,
    price: 50,
    icon: "30 мин",
  },
  long: {
    name: "Большой маршрут", 
    description: "60 минут, полный маршрут",
    duration: 60,
    price: 80,
    icon: "60 мин",
  },
};

export default function QuadBookingPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("date");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<SlotInfo | undefined>();
  const { toast } = useToast();
  const { user } = useAuth();

  const bookingForm = useForm<BookingFormData>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      routeType: "short",
      startTime: "",
      quadsCount: 1,
      fullName: user?.name || "",
      phone: "",
      comment: "",
    },
  });

  const watchedValues = bookingForm.watch();
  const routeType = watchedValues.routeType;

  const { data: availabilityData, isLoading: loadingSlots } = useQuery<AvailabilityResponse>({
    queryKey: ["/api/guest/quads/availability", selectedDate ? format(selectedDate, "yyyy-MM-dd") : null],
    enabled: !!selectedDate,
  });

  const dateBlocked = availabilityData?.blocked;
  const blockMessage = availabilityData?.message;
  const allSlots = availabilityData?.slots || [];

  const filteredSlots = useMemo(() => {
    return allSlots.filter(s => s.routeType === routeType);
  }, [allSlots, routeType]);

  const selectedSlotInfo = useMemo(() => {
    const st = watchedValues.startTime;
    return filteredSlots.find(s => s.startTime === st);
  }, [filteredSlots, watchedValues.startTime]);

  const availableQuads = selectedSlotInfo?.availableQuads || 4;
  const hasDiscount = selectedSlotInfo?.hasDiscount || false;

  const calculatePrice = () => {
    const basePrice = routeType === "short" ? 50 : 80;
    const count = watchedValues.quadsCount;
    const total = basePrice * count;
    
    if (hasDiscount) {
      const discount = Math.round(total * 0.05);
      return { total: total - discount, discount, original: total };
    }
    return { total, discount: 0, original: total };
  };

  const bookingMutation = useMutation({
    mutationFn: async (data: BookingFormData) => {
      const bookingData = {
        date: format(selectedDate!, "yyyy-MM-dd"),
        startTime: data.startTime,
        routeType: data.routeType,
        quadsCount: data.quadsCount,
        customer: {
          fullName: data.fullName,
          phone: data.phone,
          telegramId: user?.telegramId,
        },
        comment: data.comment,
        slotId: hasDiscount ? `${data.startTime}-${data.routeType}` : undefined,
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

  const handleBookingSubmit = (data: BookingFormData) => {
    bookingMutation.mutate(data);
  };

  const handleReset = () => {
    bookingForm.reset({
      routeType: "short",
      startTime: "",
      quadsCount: 1,
      fullName: user?.name || "",
      phone: "",
      comment: "",
    });
    setSelectedDate(undefined);
    setSelectedSlot(undefined);
    setStep("date");
  };

  const priceInfo = calculatePrice();

  if (step === "success") {
    const routeInfo = ROUTE_INFO[watchedValues.routeType];
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
                <span className="text-muted-foreground">Маршрут</span>
                <span className="font-medium">{routeInfo.name}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Время</span>
                <span className="font-medium">{watchedValues.startTime}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Квадроциклов</span>
                <span className="font-medium">{watchedValues.quadsCount}</span>
              </div>
              {priceInfo.discount > 0 && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Скидка группы</span>
                  <span className="font-medium text-status-confirmed">-{priceInfo.discount} BYN</span>
                </div>
              )}
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Стоимость</span>
                <span className="font-semibold text-primary">{priceInfo.total} BYN</span>
              </div>
            </div>
            <Button
              className="mt-8 w-full max-w-xs"
              onClick={() => setLocation("/")}
              data-testid="button-back-home"
            >
              На главную
            </Button>
          </div>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header 
        title="Забронировать квадроциклы" 
        showBack={step === "date"}
      />
      
      {step !== "date" && (
        <div className="px-4 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (step === "route") setStep("date");
              else if (step === "time") setStep("route");
              else if (step === "details") setStep("time");
            }}
            data-testid="button-back-step"
          >
            Назад
          </Button>
        </div>
      )}
      <PageContainer>
        <Form {...bookingForm}>
          <form onSubmit={bookingForm.handleSubmit(handleBookingSubmit)} className="space-y-6">
            
            {step === "date" && (
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
                            bookingForm.setValue("startTime", "");
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
                      {blockMessage || "Квадроциклы недоступны на эту дату"}
                    </CardContent>
                  </Card>
                )}

                {selectedDate && !dateBlocked && (
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => setStep("route")}
                    data-testid="button-next-step"
                  >
                    Далее
                  </Button>
                )}
              </div>
            )}

            {step === "route" && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold" data-testid="text-step-title">
                  Выберите маршрут
                </h2>

                <FormField
                  control={bookingForm.control}
                  name="routeType"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RadioGroup
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            bookingForm.setValue("startTime", "");
                          }}
                          className="space-y-3"
                        >
                          {(["short", "long"] as const).map((type) => {
                            const info = ROUTE_INFO[type];
                            return (
                              <Card
                                key={type}
                                className={cn(
                                  "cursor-pointer transition-colors",
                                  field.value === type && "border-primary ring-1 ring-primary"
                                )}
                                onClick={() => {
                                  field.onChange(type);
                                  bookingForm.setValue("startTime", "");
                                }}
                              >
                                <CardContent className="p-4">
                                  <div className="flex items-start gap-3">
                                    <RadioGroupItem value={type} id={type} className="mt-1" />
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <Label htmlFor={type} className="text-base font-semibold cursor-pointer">
                                          {info.name}
                                        </Label>
                                        <Badge variant="secondary" className="text-xs">
                                          {info.icon}
                                        </Badge>
                                      </div>
                                      <p className="text-sm text-muted-foreground">{info.description}</p>
                                      <p className="text-lg font-bold text-primary mt-2">{info.price} BYN</p>
                                    </div>
                                    <Bike className="h-8 w-8 text-muted-foreground" />
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <Button
                  type="button"
                  className="w-full"
                  onClick={() => setStep("time")}
                  data-testid="button-next-step"
                >
                  Далее
                </Button>
              </div>
            )}

            {step === "time" && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold" data-testid="text-step-title">
                  Выберите время
                </h2>

                {loadingSlots ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredSlots.length === 0 ? (
                  <EmptyState
                    icon={Clock}
                    title="Нет доступного времени"
                    description="На выбранную дату и маршрут нет свободных слотов"
                  />
                ) : (
                  <FormField
                    control={bookingForm.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="grid grid-cols-2 gap-2">
                            {filteredSlots.map((slot) => (
                              <Button
                                key={slot.startTime}
                                type="button"
                                variant={field.value === slot.startTime ? "default" : "outline"}
                                className={cn(
                                  "h-auto py-3 flex-col items-start relative",
                                  field.value === slot.startTime && "ring-2 ring-primary"
                                )}
                                onClick={() => {
                                  field.onChange(slot.startTime);
                                  setSelectedSlot(slot);
                                }}
                                data-testid={`button-slot-${slot.startTime}`}
                              >
                                <div className="flex items-center gap-2 w-full">
                                  <Clock className="h-4 w-4" />
                                  <span className="font-medium">{slot.startTime}</span>
                                  {slot.hasDiscount && (
                                    <Badge variant="secondary" className="ml-auto text-xs bg-status-confirmed/10 text-status-confirmed">
                                      <Percent className="h-3 w-3 mr-1" />
                                      -5%
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 w-full text-xs mt-1 text-muted-foreground">
                                  <Bike className="h-3 w-3" />
                                  <span>Свободно: {slot.availableQuads}/4</span>
                                </div>
                              </Button>
                            ))}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {watchedValues.startTime && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Количество квадроциклов</span>
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            const current = bookingForm.getValues("quadsCount");
                            if (current > 1) bookingForm.setValue("quadsCount", current - 1);
                          }}
                          disabled={watchedValues.quadsCount <= 1}
                          data-testid="button-decrease-quads"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center font-semibold" data-testid="text-quads-count">
                          {watchedValues.quadsCount}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            const current = bookingForm.getValues("quadsCount");
                            if (current < availableQuads) bookingForm.setValue("quadsCount", current + 1);
                          }}
                          disabled={watchedValues.quadsCount >= availableQuads}
                          data-testid="button-increase-quads"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {hasDiscount && (
                      <Card className="bg-status-confirmed/5 border-status-confirmed/20">
                        <CardContent className="p-3 flex items-center gap-2 text-sm">
                          <Percent className="h-4 w-4 text-status-confirmed" />
                          <span className="text-status-confirmed">
                            Скидка 5% за присоединение к группе
                          </span>
                        </CardContent>
                      </Card>
                    )}

                    <Card>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Стоимость</span>
                          <div className="text-right">
                            {priceInfo.discount > 0 && (
                              <span className="text-sm text-muted-foreground line-through mr-2">
                                {priceInfo.original} BYN
                              </span>
                            )}
                            <span className="text-xl font-bold text-primary">
                              {priceInfo.total} BYN
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Button
                      type="button"
                      className="w-full"
                      onClick={() => setStep("details")}
                      data-testid="button-next-step"
                    >
                      Далее
                    </Button>
                  </div>
                )}
              </div>
            )}

            {step === "details" && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold" data-testid="text-step-title">
                  Контактные данные
                </h2>

                <Card>
                  <CardContent className="p-4 space-y-4">
                    <FormField
                      control={bookingForm.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ваше имя</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input {...field} placeholder="Иван Иванов" className="pl-10" data-testid="input-name" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={bookingForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Номер телефона</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input {...field} placeholder="+375 29 123-45-67" className="pl-10" data-testid="input-phone" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={bookingForm.control}
                      name="comment"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Комментарий (необязательно)</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <MessageCircle className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Textarea {...field} placeholder="Пожелания, вопросы..." className="pl-10 min-h-[80px]" data-testid="input-comment" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Детали бронирования</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Дата</span>
                      <span>{selectedDate && format(selectedDate, "d MMMM", { locale: ru })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Маршрут</span>
                      <span>{ROUTE_INFO[routeType].name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Время</span>
                      <span>{watchedValues.startTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Квадроциклов</span>
                      <span>{watchedValues.quadsCount}</span>
                    </div>
                    {priceInfo.discount > 0 && (
                      <div className="flex justify-between text-status-confirmed">
                        <span>Скидка группы</span>
                        <span>-{priceInfo.discount} BYN</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold pt-2 border-t">
                      <span>Итого</span>
                      <span className="text-primary">{priceInfo.total} BYN</span>
                    </div>
                  </CardContent>
                </Card>

                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Оплата производится на месте. Инструктор свяжется с вами для подтверждения бронирования.
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={bookingMutation.isPending}
                  data-testid="button-submit-booking"
                >
                  {bookingMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Отправка...
                    </>
                  ) : (
                    "Отправить заявку"
                  )}
                </Button>
              </div>
            )}
          </form>
        </Form>
      </PageContainer>
    </div>
  );
}
