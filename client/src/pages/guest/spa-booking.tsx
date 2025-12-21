import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarIcon, Phone, User, Check, Loader2, Users, Droplets, Sun, Bath } from "lucide-react";
import { Header } from "@/components/layout/header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

type BookingType = "bath_only" | "terrace_only" | "tub_only" | "bath_with_tub";
type Step = "phone" | "verify" | "select" | "details" | "confirm" | "success";

const phoneSchema = z.object({
  phone: z.string().min(9, "Введите корректный номер телефона"),
});

const verifySchema = z.object({
  code: z.string().length(4, "Код должен содержать 4 цифры"),
});

const bookingFormSchema = z.object({
  bookingType: z.enum(["bath_only", "terrace_only", "tub_only", "bath_with_tub"]),
  spaResource: z.string().min(1, "Выберите СПА"),
  date: z.date({ required_error: "Выберите дату" }),
  startTime: z.string().min(1, "Выберите время начала"),
  guestsCount: z.number().min(1, "Укажите количество гостей").max(10, "Максимум 10 гостей"),
  fullName: z.string().min(2, "Укажите имя"),
});

type PhoneFormData = z.infer<typeof phoneSchema>;
type VerifyFormData = z.infer<typeof verifySchema>;
type BookingFormData = z.infer<typeof bookingFormSchema>;

const timeSlots = [
  "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"
];

const BOOKING_TYPES: { value: BookingType; label: string; description: string; icon: typeof Bath }[] = [
  { value: "bath_only", label: "Только баня", description: "3 часа, до 5 гостей", icon: Bath },
  { value: "terrace_only", label: "Только терраса", description: "3 часа, до 6 гостей", icon: Sun },
  { value: "tub_only", label: "Только купель", description: "3 часа, до 8 гостей", icon: Droplets },
  { value: "bath_with_tub", label: "Баня + Купель", description: "3 часа, до 9 гостей", icon: Bath },
];

const PRICES: Record<BookingType, { base: number; guestThreshold?: number; higherPrice?: number }> = {
  bath_only: { base: 150 },
  terrace_only: { base: 90 },
  tub_only: { base: 150, guestThreshold: 4, higherPrice: 180 },
  bath_with_tub: { base: 300, guestThreshold: 9, higherPrice: 330 },
};

export default function SpaBookingPage() {
  const [step, setStep] = useState<Step>("phone");
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
      bookingType: "bath_only",
      spaResource: "",
      startTime: "",
      guestsCount: 2,
      fullName: "",
    },
  });

  const selectedDate = bookingForm.watch("date");
  const selectedType = bookingForm.watch("bookingType");
  const selectedResource = bookingForm.watch("spaResource");
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
      setStep("select");
      toast({
        title: "Телефон подтверждён",
        description: "Теперь выберите дату и время",
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

  const { data: availability, isLoading: loadingAvailability } = useQuery<Array<{
    spaResource: string;
    date: string;
    startTime: string;
    endTime: string;
    available: boolean;
  }>>({
    queryKey: ["/api/guest/spa/availability", selectedDate ? format(selectedDate, "yyyy-MM-dd") : null],
    enabled: !!selectedDate && step === "select",
  });

  const bookingMutation = useMutation({
    mutationFn: async (data: BookingFormData) => {
      const endHour = parseInt(data.startTime.split(":")[0]) + 3;
      const endTime = `${endHour.toString().padStart(2, "0")}:00`;
      
      const response = await apiRequest("POST", "/api/guest/spa-bookings", {
        spaResource: data.spaResource,
        bookingType: data.bookingType,
        date: format(data.date, "yyyy-MM-dd"),
        startTime: data.startTime,
        endTime,
        guestsCount: data.guestsCount,
        customer: {
          fullName: data.fullName,
          phone,
        },
        verificationToken,
      });
      return response.json();
    },
    onSuccess: () => {
      setStep("success");
      queryClient.invalidateQueries({ queryKey: ["/api/guest/spa/availability"] });
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
    const { bookingType, guestsCount } = watchedValues;
    const priceConfig = PRICES[bookingType];
    
    if (priceConfig.guestThreshold && guestsCount > priceConfig.guestThreshold) {
      return priceConfig.higherPrice || priceConfig.base;
    }
    return priceConfig.base;
  };

  const calculateEndTime = () => {
    const { startTime } = watchedValues;
    if (!startTime) return "";
    const [hours, minutes] = startTime.split(":").map(Number);
    const endHour = hours + 3;
    return `${endHour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
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
              Мы скоро позвоним вам для подтверждения бронирования и оплаты.
            </p>
            <div className="space-y-2 text-sm text-left w-full max-w-xs">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Тип</span>
                <span className="font-medium">
                  {BOOKING_TYPES.find(t => t.value === watchedValues.bookingType)?.label}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Дата</span>
                <span className="font-medium">
                  {selectedDate && format(selectedDate, "d MMMM yyyy", { locale: ru })}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Время</span>
                <span className="font-medium">{watchedValues.startTime} - {calculateEndTime()}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Гости</span>
                <span className="font-medium">{watchedValues.guestsCount} чел.</span>
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
      <Header
        title="Забронировать СПА"
        showBack={step !== "phone"}
      />
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

        {step === "select" && (
          <Form {...bookingForm}>
            <form className="space-y-6">
              <div className="space-y-4">
                <h2 className="text-xl font-semibold" data-testid="text-step-title">
                  Выберите тип и дату
                </h2>

                <FormField
                  control={bookingForm.control}
                  name="bookingType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Тип бронирования</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="grid grid-cols-2 gap-3"
                        >
                          {BOOKING_TYPES.map(({ value, label, description, icon: Icon }) => (
                            <Label
                              key={value}
                              htmlFor={`type-${value}`}
                              className={cn(
                                "flex flex-col items-center justify-center rounded-lg border-2 border-muted p-4 cursor-pointer hover-elevate text-center",
                                field.value === value && "border-primary bg-primary/5"
                              )}
                            >
                              <RadioGroupItem value={value} id={`type-${value}`} className="sr-only" />
                              <Icon className={cn(
                                "h-6 w-6 mb-2",
                                field.value === value ? "text-primary" : "text-muted-foreground"
                              )} />
                              <span className="text-sm font-medium">{label}</span>
                              <span className="text-xs text-muted-foreground">{description}</span>
                            </Label>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={bookingForm.control}
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
                            disabled={(date) => date < new Date() || date > addDays(new Date(), 60)}
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
                    control={bookingForm.control}
                    name="spaResource"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Выберите СПА</FormLabel>
                        <div className="grid grid-cols-2 gap-4">
                          {["SPA1", "SPA2"].map((code) => (
                            <Card
                              key={code}
                              className={cn(
                                "cursor-pointer transition-all hover-elevate",
                                field.value === code && "ring-2 ring-primary"
                              )}
                              onClick={() => field.onChange(code)}
                              data-testid={`card-spa-${code}`}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "rounded-full p-2",
                                    field.value === code ? "bg-primary/10" : "bg-muted"
                                  )}>
                                    <Droplets className={cn(
                                      "h-5 w-5",
                                      field.value === code ? "text-primary" : "text-muted-foreground"
                                    )} />
                                  </div>
                                  <div>
                                    <p className="font-medium">СПА {code.slice(3)}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {code === "SPA1" ? "Уютный, камерный" : "Просторный"}
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

                {selectedResource && selectedDate && (
                  <FormField
                    control={bookingForm.control}
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
                              const slot = availability?.find(
                                s => s.spaResource === selectedResource && s.startTime === time
                              );
                              const isAvailable = slot?.available ?? true;
                              return (
                                <SelectItem
                                  key={time}
                                  value={time}
                                  disabled={!isAvailable}
                                >
                                  {time} {!isAvailable && "(занято)"}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {watchedValues.startTime && (
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => setStep("details")}
                  data-testid="button-next"
                >
                  Продолжить
                </Button>
              )}
            </form>
          </Form>
        )}

        {step === "details" && (
          <Form {...bookingForm}>
            <form onSubmit={bookingForm.handleSubmit(handleBookingSubmit)} className="space-y-6">
              <div className="space-y-4">
                <h2 className="text-xl font-semibold" data-testid="text-step-title">
                  Детали бронирования
                </h2>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Количество гостей</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={bookingForm.control}
                      name="guestsCount"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <div className="flex items-center gap-4">
                              <Users className="h-5 w-5 text-muted-foreground" />
                              <Input
                                type="number"
                                min={1}
                                max={10}
                                className="w-24"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                data-testid="input-guests"
                              />
                              <span className="text-sm text-muted-foreground">человек</span>
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
                    <CardTitle className="text-base">Контактные данные</CardTitle>
                    <CardDescription>Телефон: {phone}</CardDescription>
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

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Итого</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Тип</span>
                      <span>{BOOKING_TYPES.find(t => t.value === selectedType)?.label}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Дата</span>
                      <span>{selectedDate && format(selectedDate, "d MMMM", { locale: ru })}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Время</span>
                      <span>{watchedValues.startTime} - {calculateEndTime()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Гости</span>
                      <span>{watchedValues.guestsCount} чел.</span>
                    </div>
                    <div className="flex justify-between font-semibold pt-2 border-t">
                      <span>Стоимость</span>
                      <span className="text-primary">{calculatePrice()} BYN</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={bookingMutation.isPending}
                  data-testid="button-submit"
                >
                  {bookingMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Отправить заявку
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setStep("select")}
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
