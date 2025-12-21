import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarIcon, User, Check, Loader2, Users, Droplets, Sun, Bath, Minus, Plus } from "lucide-react";
import { Header } from "@/components/layout/header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useAuth } from "@/lib/auth-context";

type BookingType = "bath_only" | "terrace_only" | "tub_only" | "bath_with_tub";
type Step = "select" | "details" | "success";

const bookingFormSchema = z.object({
  bookingType: z.enum(["bath_only", "terrace_only", "tub_only", "bath_with_tub"]),
  spaResource: z.string().min(1, "Выберите СПА"),
  date: z.date({ required_error: "Выберите дату" }),
  startTime: z.string().min(1, "Выберите время начала"),
  guestsCount: z.number().min(1, "Укажите количество гостей").max(12, "Максимум 12 гостей"),
  fullName: z.string().min(2, "Укажите имя"),
});

type BookingFormData = z.infer<typeof bookingFormSchema>;

const timeSlots = [
  "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"
];

const BOOKING_TYPES: { value: BookingType; label: string; description: string; icon: typeof Bath }[] = [
  { value: "bath_only", label: "Только баня", description: "3 часа, до 6 гостей", icon: Bath },
  { value: "terrace_only", label: "Только терраса", description: "3 часа, до 12 гостей (лето)", icon: Sun },
  { value: "tub_only", label: "Только купель", description: "3 часа, 4-6 гостей", icon: Droplets },
  { value: "bath_with_tub", label: "Баня + Купель", description: "3 часа, 6-10 гостей", icon: Bath },
];

const getMaxGuests = (bookingType: BookingType, spaResource: string): number => {
  const isComplex1 = spaResource === "SPA1";
  switch (bookingType) {
    case "bath_only":
      return 6;
    case "terrace_only":
      return 12;
    case "tub_only":
      return isComplex1 ? 6 : 4;
    case "bath_with_tub":
      return isComplex1 ? 10 : 6;
    default:
      return 6;
  }
};

const PRICES: Record<BookingType, { base: number; guestThreshold?: number; higherPrice?: number }> = {
  bath_only: { base: 150 },
  terrace_only: { base: 90 },
  tub_only: { base: 150, guestThreshold: 4, higherPrice: 180 },
  bath_with_tub: { base: 300, guestThreshold: 9, higherPrice: 330 },
};

export default function SpaBookingPage() {
  const [step, setStep] = useState<Step>("select");
  const { toast } = useToast();
  const { user } = useAuth();

  const bookingForm = useForm<BookingFormData>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      bookingType: "bath_only",
      spaResource: "",
      startTime: "",
      guestsCount: 2,
      fullName: user?.name || "",
    },
  });

  const selectedDate = bookingForm.watch("date");
  const selectedType = bookingForm.watch("bookingType");
  const selectedResource = bookingForm.watch("spaResource");
  const watchedValues = bookingForm.watch();

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
          telegramId: user?.telegramId,
        },
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
                bookingForm.reset({ bookingType: "bath_only", spaResource: "", startTime: "", guestsCount: 2, fullName: user?.name || "" });
                setStep("select");
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
        showBack={step !== "select"}
      />
      <PageContainer>
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
                                    <p className="font-medium">Комплекс {code.slice(3)}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {code === "SPA1" ? "Большая купель (до 6 чел.)" : "Малая купель (до 4 чел.)"}
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
                          <div className="flex items-center justify-center gap-4">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              onClick={() => field.onChange(Math.max(1, field.value - 1))}
                              disabled={field.value <= 1}
                              data-testid="button-guests-minus"
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <div className="flex items-center gap-2">
                              <Users className="h-5 w-5 text-muted-foreground" />
                              <span className="text-3xl font-bold w-12 text-center">
                                {field.value}
                              </span>
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              onClick={() => {
                                const maxGuests = getMaxGuests(selectedType, selectedResource);
                                field.onChange(Math.min(maxGuests, field.value + 1));
                              }}
                              disabled={field.value >= getMaxGuests(selectedType, selectedResource)}
                              data-testid="button-guests-plus"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <p className="text-sm text-muted-foreground text-center mt-2">
                            Максимум для этого типа: {getMaxGuests(selectedType, selectedResource)} гостей
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
                  <CardContent className="p-4 space-y-2">
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
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="font-medium">Итого:</span>
                      <span className="text-2xl font-bold text-primary">
                        {calculatePrice()} BYN
                      </span>
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
                  Забронировать
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setStep("select")}
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
