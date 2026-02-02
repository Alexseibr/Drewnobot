import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays, isToday, addHours, isBefore, parse, startOfDay } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarIcon, Clock, Bath, Flame, Package, Phone, User, Check, Loader2, Share2 } from "lucide-react";
import { Header } from "@/components/layout/header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import type { BathAvailabilitySlot, InsertBathBooking } from "@shared/schema";

const bookingFormSchema = z.object({
  bathCode: z.string().min(1, "Выберите баню"),
  date: z.date({ required_error: "Выберите дату" }),
  startTime: z.string().min(1, "Выберите время начала"),
  duration: z.number().min(3, "Минимальная продолжительность 3 часа"),
  tub: z.enum(["none", "small", "large"]),
  grill: z.boolean(),
  charcoal: z.boolean(),
  fullName: z.string().min(2, "Укажите имя"),
  phone: z.string().optional(),
});

type BookingFormData = z.infer<typeof bookingFormSchema>;

const timeSlots = [
  "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"
];

const MIN_HOURS_ADVANCE_SPA = 3;

const isSlotAvailableForToday = (timeSlot: string, minHoursAdvance: number): boolean => {
  const now = new Date();
  const minBookingTime = addHours(now, minHoursAdvance);
  const slotTime = parse(timeSlot, "HH:mm", now);
  return !isBefore(slotTime, minBookingTime);
};

const durationOptions = [3, 4, 5, 6];

const PRICES = {
  base_3h: 150,
  extra_hour: 30,
  tub_small: 150,
  tub_large: 180,
  grill: 15,
  charcoal: 15,
};

export default function BathBookingPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"select" | "details" | "confirm" | "success">("select");
  const [contactPhone, setContactPhone] = useState("");
  const [isRequestingContact, setIsRequestingContact] = useState(false);
  const { toast } = useToast();

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      bathCode: "",
      startTime: "",
      duration: 3,
      tub: "none",
      grill: false,
      charcoal: false,
      fullName: "",
      phone: "",
    },
  });

  const selectedDate = form.watch("date");
  const selectedBath = form.watch("bathCode");
  const watchedValues = form.watch();

  const { data: availability, isLoading: loadingAvailability } = useQuery<BathAvailabilitySlot[]>({
    queryKey: ["/api/guest/baths/availability", selectedDate ? format(selectedDate, "yyyy-MM-dd") : null],
    enabled: !!selectedDate,
  });

  const bookingMutation = useMutation({
    mutationFn: async (data: InsertBathBooking) => {
      const response = await apiRequest("POST", "/api/guest/bath-bookings", data);
      return response.json();
    },
    onSuccess: () => {
      setStep("success");
      queryClient.invalidateQueries({ queryKey: ["/api/guest/baths/availability"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка бронирования",
        description: error.message || "Попробуйте позже",
        variant: "destructive",
      });
    },
  });

  const handleRequestContact = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.requestContact) {
      toast({
        title: "Откройте в Telegram",
        description: "Для авторизации откройте приложение через Telegram бота @Drewno_bot",
        variant: "destructive",
      });
      return;
    }

    setIsRequestingContact(true);
    tg.requestContact((success: boolean, result?: any) => {
      setIsRequestingContact(false);
      if (success && result?.responseUnsafe?.contact) {
        const contact = result.responseUnsafe.contact;
        setContactPhone(contact.phone_number || "");
        if (contact.first_name) {
          form.setValue("fullName", `${contact.first_name} ${contact.last_name || ""}`.trim());
        }
        toast({
          title: "Контакт получен",
          description: "Номер телефона подтверждён",
        });
      } else {
        toast({
          title: "Не удалось получить контакт",
          description: "Попробуйте ещё раз",
          variant: "destructive",
        });
      }
    });
  };

  const calculatePrice = () => {
    const { duration, tub, grill, charcoal } = watchedValues;
    let total = PRICES.base_3h;
    
    if (duration > 3) {
      total += (duration - 3) * PRICES.extra_hour;
    }
    
    if (tub === "small") total += PRICES.tub_small;
    if (tub === "large") total += PRICES.tub_large;
    if (grill) total += PRICES.grill;
    if (charcoal) total += PRICES.charcoal;
    
    return total;
  };

  const calculateEndTime = () => {
    const { startTime, duration } = watchedValues;
    if (!startTime) return "";
    
    const [hours, minutes] = startTime.split(":").map(Number);
    const endHour = hours + duration;
    return `${endHour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  };

  const isEndTimeValid = () => {
    const endTime = calculateEndTime();
    if (!endTime) return true;
    const [hours] = endTime.split(":").map(Number);
    return hours <= 22;
  };

  const handleSubmit = (data: BookingFormData) => {
    const endTime = calculateEndTime();
    
    const bookingData: InsertBathBooking = {
      bathCode: data.bathCode,
      date: format(data.date, "yyyy-MM-dd"),
      startTime: data.startTime,
      endTime,
      customer: {
        fullName: data.fullName,
        phone: contactPhone || data.phone || "",
      },
      options: {
        tub: data.tub,
        terrace: false,
        grill: data.grill,
        charcoal: data.charcoal,
      },
    };

    bookingMutation.mutate(bookingData);
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
              Мы скоро позвоним вам для подтверждения бронирования и оплаты.
            </p>
            <div className="space-y-2 text-sm text-left w-full max-w-xs">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">СПА</span>
                <span className="font-medium">{watchedValues.bathCode === "B1" ? "СПА 1" : "СПА 2"}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Дата</span>
                <span className="font-medium">{selectedDate && format(selectedDate, "d MMMM yyyy", { locale: ru })}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Время</span>
                <span className="font-medium">{watchedValues.startTime} - {calculateEndTime()}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Примерная стоимость</span>
                <span className="font-semibold text-primary">{calculatePrice()} BYN</span>
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
      <Header title="Забронировать СПА" showBack />
      <PageContainer>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {step === "select" && (
              <>
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold" data-testid="text-step-title">
                    Выберите дату и СПА
                  </h2>

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
                                data-testid="button-date-picker"
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, "PPP", { locale: ru }) : "Выберите дату"}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => {
                                const today = startOfDay(new Date());
                                const dateStart = startOfDay(date);
                                return dateStart.getTime() < today.getTime() || date > addDays(new Date(), 60);
                              }}
                              locale={ru}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {selectedDate && (
                    <FormField
                      control={form.control}
                      name="bathCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Выберите СПА</FormLabel>
                          <div className="grid grid-cols-2 gap-4">
                            {["B1", "B2"].map((code) => (
                              <Card
                                key={code}
                                className={cn(
                                  "cursor-pointer transition-all hover-elevate",
                                  field.value === code && "ring-2 ring-primary"
                                )}
                                onClick={() => field.onChange(code)}
                                data-testid={`card-bath-${code}`}
                              >
                                <CardContent className="p-4">
                                  <div className="flex items-center gap-3">
                                    <div className={cn(
                                      "rounded-full p-2",
                                      field.value === code ? "bg-primary/10" : "bg-muted"
                                    )}>
                                      <Bath className={cn(
                                        "h-5 w-5",
                                        field.value === code ? "text-primary" : "text-muted-foreground"
                                      )} />
                                    </div>
                                    <div>
                                      <p className="font-medium">СПА {code.slice(1)}</p>
                                      <p className="text-sm text-muted-foreground">
                                        {code === "B1" ? "Уютная, традиционная" : "Просторная, современная"}
                                      </p>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {selectedBath && selectedDate && (
                    <>
                      <FormField
                        control={form.control}
                        name="startTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Время начала</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-start-time">
                                  <SelectValue placeholder="Выберите время" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {timeSlots.map((time) => {
                                  const isTooSoon = selectedDate && isToday(selectedDate) && !isSlotAvailableForToday(time, MIN_HOURS_ADVANCE_SPA);
                                  return (
                                    <SelectItem key={time} value={time} disabled={isTooSoon}>
                                      {time} {isTooSoon ? "(слишком рано)" : ""}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="duration"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Продолжительность (часов)</FormLabel>
                            <div className="flex gap-2">
                              {durationOptions.map((hours) => {
                                const isSelected = field.value === hours;
                                return (
                                  <Button
                                    key={hours}
                                    type="button"
                                    variant={isSelected ? "default" : "outline"}
                                    className="flex-1"
                                    onClick={() => field.onChange(hours)}
                                    data-testid={`button-duration-${hours}`}
                                  >
                                    {hours}ч
                                  </Button>
                                );
                              })}
                            </div>
                            {!isEndTimeValid() && (
                              <p className="text-sm text-destructive mt-1">
                                Сеанс должен закончиться до 22:00
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </div>

                {watchedValues.startTime && isEndTimeValid() && (
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => setStep("details")}
                    data-testid="button-next"
                  >
                    Продолжить
                  </Button>
                )}
              </>
            )}

            {step === "details" && (
              <>
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold" data-testid="text-step-title">
                    Опции и контакты
                  </h2>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Дополнительно</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="tub"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Купель</FormLabel>
                            <FormControl>
                              <RadioGroup
                                onValueChange={field.onChange}
                                value={field.value}
                                className="grid grid-cols-3 gap-2"
                              >
                                <Label
                                  htmlFor="tub-none"
                                  className={cn(
                                    "flex flex-col items-center justify-center rounded-lg border-2 border-muted p-3 cursor-pointer hover-elevate",
                                    field.value === "none" && "border-primary bg-primary/5"
                                  )}
                                >
                                  <RadioGroupItem value="none" id="tub-none" className="sr-only" />
                                  <span className="text-sm font-medium">Нет</span>
                                  <span className="text-xs text-muted-foreground">Бесплатно</span>
                                </Label>
                                <Label
                                  htmlFor="tub-small"
                                  className={cn(
                                    "flex flex-col items-center justify-center rounded-lg border-2 border-muted p-3 cursor-pointer hover-elevate",
                                    field.value === "small" && "border-primary bg-primary/5"
                                  )}
                                >
                                  <RadioGroupItem value="small" id="tub-small" className="sr-only" />
                                  <span className="text-sm font-medium">Малая</span>
                                  <span className="text-xs text-muted-foreground">+{PRICES.tub_small} BYN</span>
                                </Label>
                                <Label
                                  htmlFor="tub-large"
                                  className={cn(
                                    "flex flex-col items-center justify-center rounded-lg border-2 border-muted p-3 cursor-pointer hover-elevate",
                                    field.value === "large" && "border-primary bg-primary/5"
                                  )}
                                >
                                  <RadioGroupItem value="large" id="tub-large" className="sr-only" />
                                  <span className="text-sm font-medium">Большая</span>
                                  <span className="text-xs text-muted-foreground">+{PRICES.tub_large} BYN</span>
                                </Label>
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Separator />

                      <FormField
                        control={form.control}
                        name="grill"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Flame className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <FormLabel className="text-base font-normal">Мангал</FormLabel>
                                <p className="text-sm text-muted-foreground">+{PRICES.grill} BYN</p>
                              </div>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-grill"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="charcoal"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Package className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <FormLabel className="text-base font-normal">Уголь</FormLabel>
                                <p className="text-sm text-muted-foreground">+{PRICES.charcoal} BYN</p>
                              </div>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-charcoal"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Контактные данные</CardTitle>
                      <CardDescription>Мы позвоним для подтверждения</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
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

                      <div>
                        <label className="text-sm font-medium">Телефон</label>
                        {!contactPhone ? (
                          <Button 
                            type="button"
                            variant="outline"
                            className="w-full mt-1.5" 
                            onClick={handleRequestContact}
                            disabled={isRequestingContact}
                            data-testid="button-share-contact"
                          >
                            {isRequestingContact ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Share2 className="h-4 w-4 mr-2" />
                            )}
                            Подгрузить номер из Telegram
                          </Button>
                        ) : (
                          <div className="flex items-center gap-3 p-3 mt-1.5 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                            <Check className="h-5 w-5 text-green-600" />
                            <p className="text-sm text-muted-foreground">{contactPhone}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep("select")}
                    data-testid="button-back"
                  >
                    Назад
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() => setStep("confirm")}
                    disabled={!watchedValues.fullName || !watchedValues.phone}
                    data-testid="button-review"
                  >
                    Проверить
                  </Button>
                </div>
              </>
            )}

            {step === "confirm" && (
              <>
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold" data-testid="text-step-title">
                    Подтверждение
                  </h2>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Bath className="h-5 w-5 text-primary" />
                        СПА {selectedBath?.slice(1)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Дата</span>
                        <span className="font-medium">
                          {selectedDate && format(selectedDate, "EEEE, d MMMM yyyy", { locale: ru })}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Время</span>
                        <span className="font-medium">
                          {watchedValues.startTime} - {calculateEndTime()} ({watchedValues.duration}ч)
                        </span>
                      </div>
                      {watchedValues.tub !== "none" && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground">Купель</span>
                          <span className="font-medium">
                            {watchedValues.tub === "small" ? "Малая" : "Большая"}
                          </span>
                        </div>
                      )}
                      {watchedValues.grill && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground">Мангал</span>
                          <span className="font-medium">Да</span>
                        </div>
                      )}
                      {watchedValues.charcoal && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground">Уголь</span>
                          <span className="font-medium">Да</span>
                        </div>
                      )}
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Контакт</span>
                        <span className="font-medium">{watchedValues.fullName}</span>
                      </div>

                      <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          Для подтверждения бронирования требуется предоплата 50 BYN.
                          Администратор свяжется с вами для уточнения деталей.
                        </p>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Телефон</span>
                        <span className="font-medium">{watchedValues.phone}</span>
                      </div>
                    </CardContent>
                    <CardFooter className="bg-muted/50 mt-3">
                      <div className="flex justify-between w-full py-2">
                        <span className="font-semibold">Итого (примерно)</span>
                        <span className="font-bold text-lg text-primary" data-testid="text-total-price">
                          {calculatePrice()} BYN
                        </span>
                      </div>
                    </CardFooter>
                  </Card>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep("details")}
                    data-testid="button-back"
                  >
                    Назад
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={bookingMutation.isPending || !contactPhone}
                    data-testid="button-submit"
                  >
                    {bookingMutation.isPending ? "Отправка..." : !contactPhone ? "Подгрузите номер" : "Отправить заявку"}
                  </Button>
                </div>
                
                <div className="h-8" />
              </>
            )}
          </form>
        </Form>
      </PageContainer>
    </div>
  );
}
