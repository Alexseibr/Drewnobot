import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, addDays, isToday, addHours, isBefore, parse, startOfDay, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import { 
  CalendarIcon, User, Check, Loader2, Users, Droplets, Sun, Bath, 
  Minus, Plus, MessageCircle, Flame, ArrowLeft, ArrowRight, Clock,
  Share2, Phone
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";

type BookingType = "bath_only" | "terrace_only" | "tub_only" | "bath_with_tub";
type Step = "calendar" | "service" | "time" | "details" | "confirm" | "success";

const CLOSE_HOUR = 22;
const MIN_HOURS_ADVANCE_SPA = 3;

const timeSlots = [
  "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"
];

const isSlotAvailableForToday = (timeSlot: string, minHoursAdvance: number): boolean => {
  const now = new Date();
  const minBookingTime = addHours(now, minHoursAdvance);
  const slotTime = parse(timeSlot, "HH:mm", now);
  return !isBefore(slotTime, minBookingTime);
};

const BOOKING_TYPES: { value: BookingType; label: string; description: string; icon: typeof Flame }[] = [
  { value: "bath_only", label: "Баня", description: "3 часа, до 6 гостей", icon: Flame },
  { value: "tub_only", label: "Купель", description: "3 часа, 4-6 гостей", icon: Droplets },
  { value: "terrace_only", label: "Терраса", description: "3 часа, до 12 гостей", icon: Sun },
  { value: "bath_with_tub", label: "Баня + Купель", description: "3 часа, 6-10 гостей", icon: Flame },
];

const getMaxGuests = (bookingType: BookingType, spaResource: string): number => {
  const isComplex1 = spaResource === "SPA1";
  switch (bookingType) {
    case "bath_only": return 6;
    case "terrace_only": return 12;
    case "tub_only": return isComplex1 ? 6 : 4;
    case "bath_with_tub": return isComplex1 ? 10 : 6;
    default: return 6;
  }
};

const PRICES: Record<BookingType, { base: number; guestThreshold?: number; higherPrice?: number }> = {
  bath_only: { base: 150 },
  terrace_only: { base: 90 },
  tub_only: { base: 150, guestThreshold: 4, higherPrice: 180 },
  bath_with_tub: { base: 300, guestThreshold: 9, higherPrice: 330 },
};

const EXTRA_HOUR_PRICE = 30;
const ADDITIONAL_SERVICES = {
  grill: { name: "Аренда мангала", price: 15 },
  charcoal: { name: "Угли", price: 15 },
};

export default function SpaBookingPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("calendar");
  const { toast } = useToast();
  const { user } = useAuth();

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedType, setSelectedType] = useState<BookingType>("bath_only");
  const [selectedResource, setSelectedResource] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [durationHours, setDurationHours] = useState(3);
  const [guestsCount, setGuestsCount] = useState(2);
  const [grill, setGrill] = useState(false);
  const [charcoal, setCharcoal] = useState(false);
  const [fullName, setFullName] = useState(user?.name || "");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [isRequestingContact, setIsRequestingContact] = useState(false);

  useEffect(() => {
    if (user?.name && !fullName) {
      setFullName(user.name);
    }
  }, [user]);

  // Handle return from bot with contact data
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const phoneFromBot = params.get("phone");
    const nameFromBot = params.get("name");
    const dateFromBot = params.get("date");
    const timeFromBot = params.get("time");
    const resourceFromBot = params.get("resource");
    const serviceFromBot = params.get("service") as BookingType | null;
    const durationFromBot = params.get("duration");
    const guestsFromBot = params.get("guests");

    if (phoneFromBot) {
      setPhone(phoneFromBot);
      if (nameFromBot) setFullName(nameFromBot);
      if (dateFromBot) setSelectedDate(new Date(dateFromBot));
      if (timeFromBot) setSelectedTime(timeFromBot);
      if (resourceFromBot) setSelectedResource(resourceFromBot);
      if (serviceFromBot && ["bath_only", "terrace_only", "tub_only", "bath_with_tub"].includes(serviceFromBot)) {
        setSelectedType(serviceFromBot);
      }
      if (durationFromBot) setDurationHours(parseInt(durationFromBot) || 3);
      if (guestsFromBot) setGuestsCount(parseInt(guestsFromBot) || 2);
      
      // Go to confirm step since we have verified phone
      setStep("confirm");
      
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
      
      toast({
        title: "Контакт подтверждён",
        description: "Проверьте данные и подтвердите бронирование",
      });
    }
  }, []);

  const { data: availability, isLoading: loadingAvailability } = useQuery<Array<{
    spaResource: string;
    date: string;
    startTime: string;
    endTime: string;
    available: boolean;
    maxDuration: number;
  }>>({
    queryKey: ["/api/guest/spa/availability", selectedDate ? format(selectedDate, "yyyy-MM-dd") : null],
    enabled: !!selectedDate,
  });

  const { data: allAvailability } = useQuery<Array<{
    date: string;
    hasBookings: boolean;
    fullyBooked: boolean;
  }>>({
    queryKey: ["/api/guest/spa/calendar-availability"],
  });

  const bookingMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDate || !selectedTime || !selectedResource) {
        throw new Error("Заполните все обязательные поля");
      }

      const endHour = parseInt(selectedTime.split(":")[0]) + durationHours;
      const endTime = `${endHour.toString().padStart(2, "0")}:00`;
      
      const storedAuth = localStorage.getItem("drewno-auth");
      const authToken = storedAuth ? JSON.parse(storedAuth).token : null;
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (authToken) {
        headers["x-verify-token"] = authToken;
      }
      
      const response = await fetch("/api/guest/spa-bookings", {
        method: "POST",
        headers,
        body: JSON.stringify({
          spaResource: selectedResource,
          bookingType: selectedType,
          date: format(selectedDate, "yyyy-MM-dd"),
          startTime: selectedTime,
          endTime,
          durationHours,
          guestsCount,
          options: { grill, charcoal },
          customer: {
            fullName,
            phone,
            telegramId: user?.telegramId,
          },
          comment: comment || undefined,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Ошибка бронирования");
      }
      
      return response.json();
    },
    onSuccess: () => {
      setStep("success");
      queryClient.invalidateQueries({ queryKey: ["/api/guest/spa/availability"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guest/spa/calendar-availability"] });
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
    const priceConfig = PRICES[selectedType];
    let basePrice = priceConfig.base;
    if (priceConfig.guestThreshold && guestsCount > priceConfig.guestThreshold) {
      basePrice = priceConfig.higherPrice || priceConfig.base;
    }
    const extraHours = Math.max(0, durationHours - 3);
    const extraHoursPrice = extraHours * EXTRA_HOUR_PRICE;
    let servicesPrice = 0;
    if (grill) servicesPrice += ADDITIONAL_SERVICES.grill.price;
    if (charcoal) servicesPrice += ADDITIONAL_SERVICES.charcoal.price;
    return basePrice + extraHoursPrice + servicesPrice;
  };

  const calculateEndTime = () => {
    if (!selectedTime) return "";
    const [hours, minutes] = selectedTime.split(":").map(Number);
    const endHour = hours + durationHours;
    return `${endHour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  };

  const getMaxDuration = (startTime: string): number => {
    if (!startTime) return 5;
    // Get maxDuration from API if available
    const slot = availability?.find(
      s => s.spaResource === selectedResource && s.startTime === startTime
    );
    if (slot?.maxDuration) {
      return slot.maxDuration;
    }
    // Fallback to closing time calculation
    const startHour = parseInt(startTime.split(":")[0]);
    return Math.min(5, CLOSE_HOUR - startHour);
  };

  const handleRequestContact = async () => {
    const tg = (window as any).Telegram?.WebApp;
    
    // Check if requestContact is supported (version 6.9+)
    const version = tg?.version || "6.0";
    const versionNum = parseFloat(version);
    const supportsRequestContact = versionNum >= 6.9 && typeof tg?.requestContact === 'function';
    
    if (!supportsRequestContact) {
      // For older versions or non-Telegram browsers, ask server to send contact request via bot
      const userId = tg?.initDataUnsafe?.user?.id;
      
      if (!userId) {
        // Not in Telegram WebApp - show manual phone input hint
        toast({
          title: "Введите номер вручную",
          description: "Откройте приложение через Telegram для автоматической подгрузки номера",
        });
        return;
      }
      
      const bookingData = {
        date: selectedDate ? format(selectedDate, "yyyy-MM-dd") : "",
        time: selectedTime,
        resource: selectedResource,
        service: selectedType,
        duration: durationHours,
        guests: guestsCount,
      };
      
      try {
        const response = await fetch("/api/guest/request-contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, bookingData }),
        });
        
        if (response.ok) {
          toast({
            title: "Проверьте чат с ботом",
            description: "Нажмите кнопку 'Поделиться номером' в чате @Drewno_bot",
          });
          // Close WebApp to show bot chat
          if (tg?.close) {
            tg.close();
          }
        } else {
          toast({
            title: "Ошибка",
            description: "Не удалось отправить запрос. Попробуйте позже.",
            variant: "destructive",
          });
        }
      } catch (e) {
        toast({
          title: "Ошибка",
          description: "Не удалось отправить запрос",
          variant: "destructive",
        });
      }
      return;
    }

    setIsRequestingContact(true);
    tg.requestContact((success: boolean, result?: any) => {
      setIsRequestingContact(false);
      if (success && result?.responseUnsafe?.contact) {
        const contact = result.responseUnsafe.contact;
        setPhone(contact.phone_number || "");
        if (contact.first_name) {
          setFullName(`${contact.first_name} ${contact.last_name || ""}`.trim());
        }
        toast({
          title: "Контакт получен",
          description: "Номер телефона подтверждён",
        });
        setStep("confirm");
      } else {
        toast({
          title: "Не удалось получить контакт",
          description: "Попробуйте ещё раз",
          variant: "destructive",
        });
      }
    });
  };

  const getDateClassName = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const dayData = allAvailability?.find(d => d.date === dateStr);
    
    if (dayData?.fullyBooked) {
      return "bg-red-500 text-white hover:bg-red-600";
    }
    if (dayData?.hasBookings) {
      return "bg-orange-200 dark:bg-orange-800 hover:bg-orange-300 dark:hover:bg-orange-700";
    }
    return "";
  };

  const stepTitles: Record<Step, string> = {
    calendar: "Выберите дату",
    service: "Выберите услугу",
    time: "Выберите время",
    details: "Детали бронирования",
    confirm: "Подтверждение",
    success: "Готово",
  };

  if (step === "success") {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header title="Заявка отправлена" showBack />
        <PageContainer>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-green-100 dark:bg-green-900 p-6 mb-6">
              <Check className="h-12 w-12 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-2xl font-semibold mb-2" data-testid="text-success-title">
              Заявка отправлена!
            </h2>
            <p className="text-muted-foreground max-w-xs mb-6" data-testid="text-success-description">
              Мы скоро свяжемся с вами для подтверждения бронирования.
            </p>
            <Card className="w-full max-w-sm">
              <CardContent className="p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Услуга</span>
                  <span className="font-medium">{BOOKING_TYPES.find(t => t.value === selectedType)?.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Дата</span>
                  <span className="font-medium">{selectedDate && format(selectedDate, "d MMMM yyyy", { locale: ru })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Время</span>
                  <span className="font-medium">{selectedTime} - {calculateEndTime()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Гости</span>
                  <span className="font-medium">{guestsCount} чел.</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-medium">Стоимость</span>
                  <span className="font-bold text-primary">{calculatePrice()} BYN</span>
                </div>
              </CardContent>
            </Card>
            <p className="text-sm text-muted-foreground mt-4">
              В день заезда вам придёт напоминание с инструкциями.
            </p>
            <Button className="mt-6 w-full max-w-sm" onClick={() => setLocation("/")} data-testid="button-back-home">
              На главную
            </Button>
          </div>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title={stepTitles[step]} showBack />
      <PageContainer>
        <div className="space-y-6">
          <div className="flex items-center justify-center gap-1">
            {["calendar", "service", "time", "details", "confirm"].map((s, i) => (
              <div 
                key={s} 
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  s === step ? "w-8 bg-primary" : "w-4 bg-muted",
                  ["calendar", "service", "time", "details", "confirm"].indexOf(step) > i && "bg-primary/50"
                )} 
              />
            ))}
          </div>

          {step === "calendar" && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5" />
                    Выберите дату
                  </CardTitle>
                  <CardDescription>
                    Оранжевый — есть брони, красный — всё занято
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      setSelectedDate(date);
                      if (date) {
                        setStep("service");
                      }
                    }}
                    disabled={(date) => {
                      const today = startOfDay(new Date());
                      const dateStart = startOfDay(date);
                      return dateStart.getTime() < today.getTime() || date > addDays(new Date(), 60);
                    }}
                    locale={ru}
                    className="w-full"
                    classNames={{
                      months: "flex flex-col",
                      month: "space-y-4 w-full",
                      table: "w-full border-collapse",
                      head_row: "flex w-full",
                      head_cell: "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem]",
                      row: "flex w-full mt-2",
                      cell: "flex-1 text-center text-sm p-0 relative",
                      day: cn(
                        "h-10 w-full p-0 font-normal rounded-md",
                        "hover:bg-accent hover:text-accent-foreground",
                        "focus:bg-accent focus:text-accent-foreground"
                      ),
                      day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                      day_today: "border-2 border-primary",
                      day_outside: "text-muted-foreground opacity-50",
                      day_disabled: "text-muted-foreground opacity-50",
                    }}
                    modifiers={{
                      hasBookings: (date: Date) => {
                        const dateStr = format(date, "yyyy-MM-dd");
                        const dayData = allAvailability?.find(d => d.date === dateStr);
                        return !!(dayData?.hasBookings && !dayData?.fullyBooked);
                      },
                      fullyBooked: (date: Date) => {
                        const dateStr = format(date, "yyyy-MM-dd");
                        const dayData = allAvailability?.find(d => d.date === dateStr);
                        return !!dayData?.fullyBooked;
                      },
                    }}
                    modifiersClassNames={{
                      hasBookings: "bg-orange-200 dark:bg-orange-800",
                      fullyBooked: "bg-red-500 text-white",
                    }}
                  />
                </CardContent>
              </Card>
            </div>
          )}

          {step === "service" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarIcon className="h-4 w-4" />
                <span>{selectedDate && format(selectedDate, "d MMMM yyyy", { locale: ru })}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {BOOKING_TYPES.map(({ value, label, description, icon: Icon }) => (
                  <Card
                    key={value}
                    className={cn(
                      "cursor-pointer transition-all hover-elevate",
                      selectedType === value && "ring-2 ring-primary"
                    )}
                    onClick={() => {
                      setSelectedType(value);
                      setStep("time");
                    }}
                    data-testid={`card-type-${value}`}
                  >
                    <CardContent className="p-4 text-center">
                      <Icon className={cn(
                        "h-8 w-8 mx-auto mb-2",
                        selectedType === value ? "text-primary" : "text-muted-foreground"
                      )} />
                      <p className="font-medium text-sm">{label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Button variant="ghost" className="w-full" onClick={() => setStep("calendar")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Назад к календарю
              </Button>
            </div>
          )}

          {step === "time" && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  <span>{selectedDate && format(selectedDate, "d MMM", { locale: ru })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4" />
                  <span>{BOOKING_TYPES.find(t => t.value === selectedType)?.label}</span>
                </div>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Выберите СПА комплекс</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {["SPA1", "SPA2"].map((code) => (
                    <div
                      key={code}
                      className={cn(
                        "p-3 rounded-lg border cursor-pointer transition-all",
                        selectedResource === code ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      )}
                      onClick={() => setSelectedResource(code)}
                      data-testid={`card-spa-${code}`}
                    >
                      <div className="flex items-center gap-3">
                        <Droplets className={cn(
                          "h-5 w-5",
                          selectedResource === code ? "text-primary" : "text-muted-foreground"
                        )} />
                        <div>
                          <p className="font-medium">Комплекс {code.slice(3)}</p>
                          <p className="text-sm text-muted-foreground">
                            {code === "SPA1" ? "Большая купель (до 6 чел.)" : "Малая купель (до 4 чел.)"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {selectedResource && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Время начала
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingAvailability ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2">
                        {timeSlots.map((time) => {
                          const slot = availability?.find(
                            s => s.spaResource === selectedResource && s.startTime === time
                          );
                          const isAvailable = slot?.available ?? true;
                          const isTooSoon = selectedDate && isToday(selectedDate) && !isSlotAvailableForToday(time, MIN_HOURS_ADVANCE_SPA);
                          const isDisabled = !isAvailable || isTooSoon;

                          return (
                            <Button
                              key={time}
                              variant={selectedTime === time ? "default" : "outline"}
                              size="sm"
                              disabled={isDisabled}
                              onClick={() => {
                                setSelectedTime(time);
                                setStep("details");
                              }}
                              className={cn(
                                isDisabled && "opacity-40 line-through text-muted-foreground bg-muted cursor-not-allowed"
                              )}
                              data-testid={`button-time-${time}`}
                            >
                              {time}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Button variant="ghost" className="w-full" onClick={() => setStep("service")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Назад
              </Button>
            </div>
          )}

          {step === "details" && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                <span>{selectedDate && format(selectedDate, "d MMM", { locale: ru })}</span>
                <span>{BOOKING_TYPES.find(t => t.value === selectedType)?.label}</span>
                <span>{selectedTime}</span>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Продолжительность</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center gap-3">
                    {[3, 4, 5].map((hours) => {
                      const maxDuration = getMaxDuration(selectedTime);
                      const isDisabled = hours > maxDuration;
                      return (
                        <Button
                          key={hours}
                          variant={durationHours === hours ? "default" : "outline"}
                          className="flex-1"
                          onClick={() => !isDisabled && setDurationHours(hours)}
                          disabled={isDisabled}
                          data-testid={`button-duration-${hours}`}
                        >
                          {hours} ч
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-sm text-muted-foreground text-center mt-2">
                    {selectedTime} - {calculateEndTime()}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Количество гостей</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center gap-4">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setGuestsCount(Math.max(1, guestsCount - 1))}
                      disabled={guestsCount <= 1}
                      data-testid="button-guests-minus"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-muted-foreground" />
                      <span className="text-3xl font-bold w-12 text-center">{guestsCount}</span>
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        const maxGuests = getMaxGuests(selectedType, selectedResource);
                        setGuestsCount(Math.min(maxGuests, guestsCount + 1));
                      }}
                      disabled={guestsCount >= getMaxGuests(selectedType, selectedResource)}
                      data-testid="button-guests-plus"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Дополнительные услуги</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Flame className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{ADDITIONAL_SERVICES.grill.name}</p>
                        <p className="text-xs text-muted-foreground">{ADDITIONAL_SERVICES.grill.price} BYN</p>
                      </div>
                    </div>
                    <Checkbox checked={grill} onCheckedChange={(c) => setGrill(!!c)} data-testid="checkbox-grill" />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Flame className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{ADDITIONAL_SERVICES.charcoal.name}</p>
                        <p className="text-xs text-muted-foreground">{ADDITIONAL_SERVICES.charcoal.price} BYN</p>
                      </div>
                    </div>
                    <Checkbox checked={charcoal} onCheckedChange={(c) => setCharcoal(!!c)} data-testid="checkbox-charcoal" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Услуга</span>
                    <span>{BOOKING_TYPES.find(t => t.value === selectedType)?.label}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Время</span>
                    <span>{selectedTime} - {calculateEndTime()} ({durationHours} ч.)</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Гости</span>
                    <span>{guestsCount} чел.</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="font-medium">Итого:</span>
                    <span className="text-2xl font-bold text-primary">{calculatePrice()} BYN</span>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("time")}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Назад
                </Button>
                <Button className="flex-1" onClick={() => setStep("confirm")} data-testid="button-next">
                  Далее
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Подтверждение через Telegram</CardTitle>
                  <CardDescription>
                    Поделитесь контактом для подтверждения бронирования
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!phone ? (
                    <Button 
                      className="w-full" 
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
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                        <Check className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-medium">{fullName}</p>
                          <p className="text-sm text-muted-foreground">{phone}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="fullName">Имя</Label>
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Ваше имя"
                        data-testid="input-fullname"
                      />
                    </div>
                    <div>
                      <Label htmlFor="comment">Комментарий (необязательно)</Label>
                      <Input
                        id="comment"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Пожелания..."
                        data-testid="input-comment"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Дата</span>
                    <span>{selectedDate && format(selectedDate, "d MMMM yyyy", { locale: ru })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Услуга</span>
                    <span>{BOOKING_TYPES.find(t => t.value === selectedType)?.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Время</span>
                    <span>{selectedTime} - {calculateEndTime()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Гости</span>
                    <span>{guestsCount} чел.</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t font-medium">
                    <span>Итого</span>
                    <span className="text-primary">{calculatePrice()} BYN</span>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("details")}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Назад
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={() => bookingMutation.mutate()}
                  disabled={bookingMutation.isPending || !fullName || !phone}
                  data-testid="button-submit"
                >
                  {bookingMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Забронировать
                </Button>
              </div>
            </div>
          )}
          
          <div className="h-8" />
        </div>
      </PageContainer>
    </div>
  );
}
