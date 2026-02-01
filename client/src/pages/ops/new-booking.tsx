import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addHours, startOfMonth, getMonth, getYear } from "date-fns";
import { ru } from "date-fns/locale";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Bath,
  Sparkles,
  Calendar as CalendarIcon,
  Percent,
  Info,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loading } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { InsertSpaBooking, SpaBookingType, SpaResource } from "@shared/schema";

const spaBookingFormSchema = z.object({
  spaResource: z.enum(["SPA1", "SPA2"]),
  bookingType: z.enum(["bath_only", "tub_only", "bath_with_tub", "terrace_only"]),
  date: z.date(),
  startTime: z.string().min(1, "Укажите время начала"),
  durationHours: z.number().min(3).max(5),
  guestsCount: z.number().min(1).max(12),
  customer: z.object({
    fullName: z.string().min(2, "Минимум 2 символа"),
    phone: z.string().min(10, "Введите корректный номер"),
  }),
  comment: z.string().optional(),
  discountPercent: z.number().min(0).max(100).default(0),
});

type SpaBookingFormData = z.infer<typeof spaBookingFormSchema>;

const SPA_PRICES = {
  bath_only: 150,
  terrace_only: 90,
  tub_only_up_to_4: 150,
  tub_only_5_plus: 180,
  bath_with_tub_up_to_4: 330,
  bath_with_tub_5_plus: 300,
};

const calculateBasePrice = (bookingType: string, guestsCount: number): number => {
  switch (bookingType) {
    case "bath_only":
      return SPA_PRICES.bath_only;
    case "terrace_only":
      return SPA_PRICES.terrace_only;
    case "tub_only":
      return guestsCount <= 4 ? SPA_PRICES.tub_only_up_to_4 : SPA_PRICES.tub_only_5_plus;
    case "bath_with_tub":
      return guestsCount <= 4 ? SPA_PRICES.bath_with_tub_up_to_4 : SPA_PRICES.bath_with_tub_5_plus;
    default:
      return 0;
  }
};

const TIME_SLOTS = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00",
  "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"
];

const BOOKING_TYPES: { value: SpaBookingType; label: string; description: string }[] = [
  { value: "bath_only", label: "Только СПА", description: "150 BYN" },
  { value: "tub_only", label: "Только купель", description: "150/180 BYN" },
  { value: "bath_with_tub", label: "СПА + купель", description: "330/300 BYN" },
  { value: "terrace_only", label: "Терраса", description: "90 BYN" },
];

interface CalendarData {
  year: number;
  month: number;
  dates: { [date: string]: { spa1: boolean; spa2: boolean; spa1Count: number; spa2Count: number } };
}

export default function NewBookingPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("spa");
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const { toast } = useToast();

  // Fetch calendar availability data
  const { data: calendarData, isLoading: calendarLoading } = useQuery<CalendarData>({
    queryKey: [`/api/ops/spa-calendar?year=${getYear(calendarMonth)}&month=${getMonth(calendarMonth) + 1}`],
  });

  const getDateAvailability = (date: Date): { spa1: boolean; spa2: boolean; spa1Count: number; spa2Count: number } | undefined => {
    if (!calendarData?.dates) return undefined;
    const dateStr = format(date, "yyyy-MM-dd");
    return calendarData.dates[dateStr];
  };

  // Check if date is fully booked (both SPAs have bookings)
  const isFullyBooked = (date: Date): boolean => {
    const avail = getDateAvailability(date);
    return avail?.spa1 === true && avail?.spa2 === true;
  };

  // Check if date is partially booked (one SPA has booking)
  const isPartiallyBooked = (date: Date): boolean => {
    const avail = getDateAvailability(date);
    if (!avail) return false;
    return (avail.spa1 === true || avail.spa2 === true) && !(avail.spa1 === true && avail.spa2 === true);
  };

  const form = useForm<SpaBookingFormData>({
    resolver: zodResolver(spaBookingFormSchema),
    defaultValues: {
      spaResource: "SPA1",
      bookingType: "bath_only",
      date: new Date(),
      startTime: "12:00",
      durationHours: 3,
      guestsCount: 4,
      customer: {
        fullName: "",
        phone: "",
      },
      comment: "",
      discountPercent: 0,
    },
  });

  const watchedValues = form.watch();
  
  const priceInfo = useMemo(() => {
    const basePrice = calculateBasePrice(watchedValues.bookingType, watchedValues.guestsCount);
    const discountAmount = Math.round(basePrice * (watchedValues.discountPercent || 0) / 100);
    const finalPrice = basePrice - discountAmount;
    return { basePrice, discountAmount, finalPrice, discountPercent: watchedValues.discountPercent || 0 };
  }, [watchedValues.bookingType, watchedValues.guestsCount, watchedValues.discountPercent]);

  const getTubInfo = (spaResource: string) => {
    if (spaResource === "SPA1") return "большая купель";
    return "малая купель";
  };

  const createSpaBookingMutation = useMutation({
    mutationFn: async (data: SpaBookingFormData) => {
      const endTime = format(
        addHours(new Date(`2000-01-01T${data.startTime}`), data.durationHours),
        "HH:mm"
      );
      
      const bookingData = {
        spaResource: data.spaResource as SpaResource,
        bookingType: data.bookingType as SpaBookingType,
        date: format(data.date, "yyyy-MM-dd"),
        startTime: data.startTime,
        endTime,
        durationHours: data.durationHours,
        guestsCount: data.guestsCount,
        customer: {
          fullName: data.customer.fullName,
          phone: data.customer.phone,
        },
        comment: data.comment,
        discountPercent: data.discountPercent || 0,
      };

      const response = await apiRequest("POST", "/api/ops/spa-bookings", bookingData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spa"] });
      toast({ title: "Бронь СПА создана" });
      navigate("/ops");
    },
    onError: () => {
      toast({ title: "Ошибка создания брони", variant: "destructive" });
    },
  });

  const handleSubmit = (data: SpaBookingFormData) => {
    createSpaBookingMutation.mutate(data);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Новая бронь" showBack />
      
      <PageContainer>
        <div className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="spa" className="flex items-center gap-2" data-testid="tab-spa">
                <Sparkles className="h-4 w-4" />
                СПА
              </TabsTrigger>
              <TabsTrigger value="bath" className="flex items-center gap-2" data-testid="tab-bath">
                <Bath className="h-4 w-4" />
                Баня
              </TabsTrigger>
            </TabsList>

            <TabsContent value="spa" className="mt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Тип бронирования</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="spaResource"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ресурс</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-spa-resource">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="SPA1">СПА 1 (большая купель)</SelectItem>
                                <SelectItem value="SPA2">СПА 2 (малая купель)</SelectItem>
                              </SelectContent>
                            </Select>
                            {(watchedValues.bookingType === "tub_only" || watchedValues.bookingType === "bath_with_tub") && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Info className="w-3 h-3" />
                                Доступна: {getTubInfo(field.value)}
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="bookingType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Тип</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-booking-type">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {BOOKING_TYPES.map((type) => (
                                  <SelectItem key={type.value} value={type.value}>
                                    {type.label} ({type.description})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Дата и время</CardTitle>
                      <CardDescription>
                        Выберите дату. Цветные метки показывают занятость.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Legend for calendar */}
                      <div className="flex flex-wrap gap-3 text-xs">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                          <span>Свободно</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-full bg-amber-500" />
                          <span>Частично занято</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-full bg-red-500" />
                          <span>Полностью занято</span>
                        </div>
                      </div>

                      <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <div className="flex flex-col items-center">
                                <div className="flex items-center justify-between w-full mb-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      const prev = new Date(calendarMonth);
                                      prev.setMonth(prev.getMonth() - 1);
                                      setCalendarMonth(prev);
                                    }}
                                    data-testid="button-prev-month"
                                  >
                                    <ChevronLeft className="h-4 w-4" />
                                  </Button>
                                  <span className="font-medium text-sm">
                                    {format(calendarMonth, "LLLL yyyy", { locale: ru })}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      const next = new Date(calendarMonth);
                                      next.setMonth(next.getMonth() + 1);
                                      setCalendarMonth(next);
                                    }}
                                    data-testid="button-next-month"
                                  >
                                    <ChevronRight className="h-4 w-4" />
                                  </Button>
                                </div>
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={(date) => {
                                    field.onChange(date);
                                  }}
                                  month={calendarMonth}
                                  onMonthChange={setCalendarMonth}
                                  disabled={(date) => {
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    return date < today;
                                  }}
                                  locale={ru}
                                  modifiers={{
                                    booked: (date) => isFullyBooked(date),
                                    partial: (date) => isPartiallyBooked(date),
                                  }}
                                  modifiersClassNames={{
                                    booked: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
                                    partial: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
                                  }}
                                  className="rounded-md border"
                                />
                                {field.value && (
                                  <div className="mt-2 text-sm text-muted-foreground">
                                    Выбрано: {format(field.value, "d MMMM yyyy", { locale: ru })}
                                    {getDateAvailability(field.value) && (
                                      <span className="ml-2">
                                        (СПА1: {getDateAvailability(field.value)?.spa1Count || 0} брон., СПА2: {getDateAvailability(field.value)?.spa2Count || 0} брон.)
                                      </span>
                                    )}
                                  </div>
                                )}
                                {calendarLoading && (
                                  <div className="mt-2">
                                    <Loading size="sm" />
                                  </div>
                                )}
                              </div>
                            </FormControl>
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
                                  <SelectTrigger data-testid="select-start-time">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {TIME_SLOTS.map((time) => (
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
                          name="durationHours"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Часов</FormLabel>
                              <Select 
                                onValueChange={(v) => field.onChange(parseInt(v))} 
                                value={field.value.toString()}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-duration">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="3">3 часа</SelectItem>
                                  <SelectItem value="4">4 часа</SelectItem>
                                  <SelectItem value="5">5 часов</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="guestsCount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Количество гостей</FormLabel>
                            <Select 
                              onValueChange={(v) => field.onChange(parseInt(v))} 
                              value={field.value.toString()}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-guests">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                                  <SelectItem key={n} value={n.toString()}>
                                    {n} {n === 1 ? "гость" : n < 5 ? "гостя" : "гостей"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Контакты гостя</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="customer.fullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Имя</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Иван Иванов" 
                                {...field} 
                                data-testid="input-guest-name"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="customer.phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Телефон</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="+375 29 123 45 67" 
                                {...field}
                                data-testid="input-guest-phone"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="comment"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Комментарий</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Дополнительная информация..."
                                className="resize-none"
                                {...field}
                                data-testid="input-comment"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Percent className="h-4 w-4" />
                        Стоимость
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="discountPercent"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Скидка (%)</FormLabel>
                            <FormControl>
                              <Input 
                                type="number"
                                min={0}
                                max={100}
                                value={field.value}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                                data-testid="input-discount"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="space-y-2 pt-2 border-t">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Базовая цена:</span>
                          <span className={priceInfo.discountPercent > 0 ? "line-through text-muted-foreground" : "font-medium"}>
                            {priceInfo.basePrice} BYN
                          </span>
                        </div>
                        {priceInfo.discountPercent > 0 && (
                          <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                            <span>Скидка ({priceInfo.discountPercent}%):</span>
                            <span>-{priceInfo.discountAmount} BYN</span>
                          </div>
                        )}
                        <div className="flex justify-between font-medium text-lg pt-1">
                          <span>Итого:</span>
                          <span data-testid="text-final-price">{priceInfo.finalPrice} BYN</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={createSpaBookingMutation.isPending}
                    data-testid="button-submit-booking"
                  >
                    {createSpaBookingMutation.isPending ? "Сохранение..." : "Создать бронь"}
                  </Button>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="bath" className="mt-6">
              <Card>
                <CardContent className="p-6">
                  <div className="text-center text-muted-foreground py-8">
                    <Bath className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Бронирование бань скоро будет доступно</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </PageContainer>
    </div>
  );
}
