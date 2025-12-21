import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addHours } from "date-fns";
import { ru } from "date-fns/locale";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Bath,
  Sparkles,
  Calendar as CalendarIcon
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
});

type SpaBookingFormData = z.infer<typeof spaBookingFormSchema>;

const TIME_SLOTS = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00",
  "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"
];

const BOOKING_TYPES: { value: SpaBookingType; label: string; description: string }[] = [
  { value: "bath_only", label: "Только баня", description: "3-5 часов" },
  { value: "tub_only", label: "Только купель", description: "2-4 чел / 6-8 чел" },
  { value: "bath_with_tub", label: "Баня + купель", description: "До 9 гостей" },
  { value: "terrace_only", label: "Терраса", description: "3-5 часов" },
];

export default function NewBookingPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("spa");
  const { toast } = useToast();

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
    },
  });

  const createSpaBookingMutation = useMutation({
    mutationFn: async (data: SpaBookingFormData) => {
      const endTime = format(
        addHours(new Date(`2000-01-01T${data.startTime}`), data.durationHours),
        "HH:mm"
      );
      
      const bookingData: InsertSpaBooking = {
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
      };

      const response = await apiRequest("POST", "/api/spa/bookings", bookingData);
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
                                <SelectItem value="SPA1">СПА 1</SelectItem>
                                <SelectItem value="SPA2">СПА 2</SelectItem>
                              </SelectContent>
                            </Select>
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
                    </CardHeader>
                    <CardContent className="space-y-4">
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
                                    {field.value ? (
                                      format(field.value, "PPP", { locale: ru })
                                    ) : (
                                      <span>Выберите дату</span>
                                    )}
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  disabled={(date) => date < new Date()}
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
