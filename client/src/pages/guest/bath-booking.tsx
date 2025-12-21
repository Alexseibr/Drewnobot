import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays, parse, differenceInHours, setHours, setMinutes } from "date-fns";
import { CalendarIcon, Clock, Bath, Flame, Package, Phone, User, Check } from "lucide-react";
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
  bathCode: z.string().min(1, "Please select a bath"),
  date: z.date({ required_error: "Please select a date" }),
  startTime: z.string().min(1, "Please select a start time"),
  duration: z.number().min(3, "Minimum duration is 3 hours"),
  tub: z.enum(["none", "small", "large"]),
  grill: z.boolean(),
  charcoal: z.boolean(),
  fullName: z.string().min(2, "Name is required"),
  phone: z.string().min(6, "Phone number is required"),
});

type BookingFormData = z.infer<typeof bookingFormSchema>;

const timeSlots = [
  "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"
];

const durationOptions = [3, 4, 5, 6];

const PRICES = {
  base_3h: 150,
  extra_hour: 30,
  tub_small: 150,
  tub_large: 180,
  grill: 10,
  charcoal: 15,
};

export default function BathBookingPage() {
  const [step, setStep] = useState<"select" | "details" | "confirm" | "success">("select");
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
        title: "Booking failed",
        description: error.message || "Please try again later",
        variant: "destructive",
      });
    },
  });

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
        phone: data.phone,
      },
      options: {
        tub: data.tub,
        grill: data.grill,
        charcoal: data.charcoal,
      },
    };

    bookingMutation.mutate(bookingData);
  };

  if (step === "success") {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Header title="Booking Submitted" showBack />
        <PageContainer>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-status-confirmed/10 p-6 mb-6">
              <Check className="h-12 w-12 text-status-confirmed" />
            </div>
            <h2 className="text-2xl font-semibold mb-2" data-testid="text-success-title">
              Request Submitted
            </h2>
            <p className="text-muted-foreground max-w-xs mb-6" data-testid="text-success-description">
              We will call you shortly to confirm your bath booking and arrange prepayment.
            </p>
            <div className="space-y-2 text-sm text-left w-full max-w-xs">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Bath</span>
                <span className="font-medium">{watchedValues.bathCode}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{selectedDate && format(selectedDate, "MMM d, yyyy")}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Time</span>
                <span className="font-medium">{watchedValues.startTime} - {calculateEndTime()}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Estimated Total</span>
                <span className="font-semibold text-primary">{calculatePrice()} BYN</span>
              </div>
            </div>
            <Button 
              className="mt-8 w-full max-w-xs" 
              onClick={() => {
                form.reset();
                setStep("select");
              }}
              data-testid="button-new-booking"
            >
              Make Another Booking
            </Button>
          </div>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Book a Bath" showBack={step !== "select"} />
      <PageContainer>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {step === "select" && (
              <>
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold" data-testid="text-step-title">
                    Select Date & Bath
                  </h2>

                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
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
                                {field.value ? format(field.value, "PPP") : "Pick a date"}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date < new Date() || date > addDays(new Date(), 60)}
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
                          <FormLabel>Select Bath</FormLabel>
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
                                      <p className="font-medium">Bath {code.slice(1)}</p>
                                      <p className="text-sm text-muted-foreground">
                                        {code === "B1" ? "Cozy & Traditional" : "Spacious & Modern"}
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
                            <FormLabel>Start Time</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-start-time">
                                  <SelectValue placeholder="Select time" />
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
                        name="duration"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Duration (hours)</FormLabel>
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
                                    {hours}h
                                  </Button>
                                );
                              })}
                            </div>
                            {!isEndTimeValid() && (
                              <p className="text-sm text-destructive mt-1">
                                Session must end by 22:00
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
                    Continue
                  </Button>
                )}
              </>
            )}

            {step === "details" && (
              <>
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold" data-testid="text-step-title">
                    Options & Contact
                  </h2>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Extras</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="tub"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Hot Tub</FormLabel>
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
                                  <span className="text-sm font-medium">None</span>
                                  <span className="text-xs text-muted-foreground">Free</span>
                                </Label>
                                <Label
                                  htmlFor="tub-small"
                                  className={cn(
                                    "flex flex-col items-center justify-center rounded-lg border-2 border-muted p-3 cursor-pointer hover-elevate",
                                    field.value === "small" && "border-primary bg-primary/5"
                                  )}
                                >
                                  <RadioGroupItem value="small" id="tub-small" className="sr-only" />
                                  <span className="text-sm font-medium">Small</span>
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
                                  <span className="text-sm font-medium">Large</span>
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
                                <FormLabel className="text-base font-normal">Grill</FormLabel>
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
                                <FormLabel className="text-base font-normal">Charcoal</FormLabel>
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
                      <CardTitle className="text-base">Contact Information</CardTitle>
                      <CardDescription>We'll call you to confirm the booking</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="fullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder="Your name"
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

                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone Number</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder="+375 XX XXX XX XX"
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
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() => setStep("confirm")}
                    disabled={!watchedValues.fullName || !watchedValues.phone}
                    data-testid="button-review"
                  >
                    Review Booking
                  </Button>
                </div>
              </>
            )}

            {step === "confirm" && (
              <>
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold" data-testid="text-step-title">
                    Confirm Booking
                  </h2>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Bath className="h-5 w-5 text-primary" />
                        Bath {watchedValues.bathCode?.slice(1)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Date</span>
                        <span className="font-medium">
                          {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Time</span>
                        <span className="font-medium">
                          {watchedValues.startTime} - {calculateEndTime()}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Duration</span>
                        <span className="font-medium">{watchedValues.duration} hours</span>
                      </div>
                      {watchedValues.tub !== "none" && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground">Hot Tub</span>
                          <span className="font-medium capitalize">{watchedValues.tub}</span>
                        </div>
                      )}
                      {watchedValues.grill && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground">Grill</span>
                          <span className="font-medium">Yes</span>
                        </div>
                      )}
                      {watchedValues.charcoal && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground">Charcoal</span>
                          <span className="font-medium">Yes</span>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter className="flex-col items-stretch border-t pt-4">
                      <div className="flex justify-between text-lg font-semibold">
                        <span>Total</span>
                        <span className="text-primary">{calculatePrice()} BYN</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Final price will be confirmed after our call
                      </p>
                    </CardFooter>
                  </Card>

                  <Card>
                    <CardContent className="p-4 space-y-2">
                      <p className="font-medium">{watchedValues.fullName}</p>
                      <p className="text-sm text-muted-foreground">{watchedValues.phone}</p>
                    </CardContent>
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
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={bookingMutation.isPending}
                    data-testid="button-submit"
                  >
                    {bookingMutation.isPending ? "Submitting..." : "Submit Request"}
                  </Button>
                </div>
              </>
            )}
          </form>
        </Form>
      </PageContainer>
    </div>
  );
}
