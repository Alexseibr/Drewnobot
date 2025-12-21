import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays } from "date-fns";
import { CalendarIcon, Bike, Users, Clock, Phone, User, Check, Minus, Plus } from "lucide-react";
import { Header } from "@/components/layout/header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
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
import type { QuadSession, InsertQuadBooking } from "@shared/schema";

const bookingFormSchema = z.object({
  sessionId: z.string().min(1, "Please select a session"),
  duration: z.union([z.literal(30), z.literal(60)]),
  quadsCount: z.number().min(1).max(4),
  fullName: z.string().min(2, "Name is required"),
  phone: z.string().min(6, "Phone number is required"),
});

type BookingFormData = z.infer<typeof bookingFormSchema>;

const PRICES = {
  quad_30m: 40,
  quad_60m: 80,
};

export default function QuadBookingPage() {
  const [step, setStep] = useState<"date" | "session" | "details" | "confirm" | "success">("date");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const { toast } = useToast();

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      sessionId: "",
      duration: 30,
      quadsCount: 1,
      fullName: "",
      phone: "",
    },
  });

  const watchedValues = form.watch();

  const { data: sessions, isLoading: loadingSessions } = useQuery<QuadSession[]>({
    queryKey: ["/api/guest/quads/availability", selectedDate ? format(selectedDate, "yyyy-MM-dd") : null],
    enabled: !!selectedDate,
  });

  const selectedSession = sessions?.find(s => s.id === watchedValues.sessionId);
  const availableQuads = selectedSession ? selectedSession.totalQuads - selectedSession.bookedQuads : 0;

  const bookingMutation = useMutation({
    mutationFn: async (data: InsertQuadBooking) => {
      const response = await apiRequest("POST", "/api/guest/quad-bookings", data);
      return response.json();
    },
    onSuccess: () => {
      setStep("success");
      queryClient.invalidateQueries({ queryKey: ["/api/guest/quads/availability"] });
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
    const { duration, quadsCount } = watchedValues;
    const basePrice = duration === 30 ? PRICES.quad_30m : PRICES.quad_60m;
    return basePrice * quadsCount;
  };

  const handleSubmit = (data: BookingFormData) => {
    const bookingData: InsertQuadBooking = {
      sessionId: data.sessionId,
      duration: data.duration,
      quadsCount: data.quadsCount,
      customer: {
        fullName: data.fullName,
        phone: data.phone,
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
              Our instructor will contact you to confirm your quad ride booking.
            </p>
            <div className="space-y-2 text-sm text-left w-full max-w-xs">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{selectedDate && format(selectedDate, "MMM d, yyyy")}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Time</span>
                <span className="font-medium">
                  {selectedSession?.startTime} - {selectedSession?.endTime}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium">{watchedValues.duration} minutes</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Quads</span>
                <span className="font-medium">{watchedValues.quadsCount}</span>
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
                setSelectedDate(undefined);
                setStep("date");
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
      <Header title="Book Quad Ride" showBack={step !== "date"} />
      <PageContainer>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {step === "date" && (
              <>
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold" data-testid="text-step-title">
                    Select Date
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
                            {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={(date) => {
                              setSelectedDate(date);
                              form.setValue("sessionId", "");
                            }}
                            disabled={(date) => date < new Date() || date > addDays(new Date(), 30)}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </CardContent>
                  </Card>
                </div>

                {selectedDate && (
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => setStep("session")}
                    data-testid="button-next"
                  >
                    View Available Sessions
                  </Button>
                )}
              </>
            )}

            {step === "session" && (
              <>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold" data-testid="text-step-title">
                      Available Sessions
                    </h2>
                    <Badge variant="outline">
                      {selectedDate && format(selectedDate, "MMM d")}
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
                              "cursor-pointer transition-all",
                              isSelected && "ring-2 ring-primary",
                              isFull && "opacity-50 cursor-not-allowed"
                            )}
                            onClick={() => !isFull && form.setValue("sessionId", session.id)}
                            data-testid={`card-session-${session.id}`}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
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
                                      {remaining} quad{remaining !== 1 ? "s" : ""} available
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {session.bookedQuads > 0 && (
                                    <Badge variant="secondary" className="text-xs">
                                      Join group
                                    </Badge>
                                  )}
                                  <div className="flex gap-0.5">
                                    {[...Array(4)].map((_, i) => (
                                      <div
                                        key={i}
                                        className={cn(
                                          "w-2 h-6 rounded-sm",
                                          i < remaining
                                            ? "bg-status-confirmed"
                                            : "bg-muted"
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
                      title="No sessions available"
                      description="No quad sessions are scheduled for this date. Please try another day."
                    />
                  )}
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep("date")}
                    data-testid="button-back"
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() => setStep("details")}
                    disabled={!watchedValues.sessionId}
                    data-testid="button-next"
                  >
                    Continue
                  </Button>
                </div>
              </>
            )}

            {step === "details" && (
              <>
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold" data-testid="text-step-title">
                    Ride Details
                  </h2>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Select Duration</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FormField
                        control={form.control}
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
                                  <p className="text-sm text-muted-foreground">minutes</p>
                                  <p className="text-sm font-medium text-primary mt-2">
                                    {PRICES.quad_30m} BYN/quad
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
                                  <p className="text-sm text-muted-foreground">minutes</p>
                                  <p className="text-sm font-medium text-primary mt-2">
                                    {PRICES.quad_60m} BYN/quad
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
                      <CardTitle className="text-base">Number of Quads</CardTitle>
                      <CardDescription>
                        {availableQuads} available in this session
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FormField
                        control={form.control}
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
                                  quad{field.value !== 1 ? "s" : ""}
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
                      <CardTitle className="text-base">Contact Information</CardTitle>
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
                    onClick={() => setStep("session")}
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
                    Review
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
                        <Bike className="h-5 w-5 text-primary" />
                        Quad Ride
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
                        <span className="text-muted-foreground">Session Time</span>
                        <span className="font-medium">
                          {selectedSession?.startTime} - {selectedSession?.endTime}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Duration</span>
                        <span className="font-medium">{watchedValues.duration} minutes</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Quads</span>
                        <span className="font-medium">{watchedValues.quadsCount}</span>
                      </div>
                    </CardContent>
                    <CardFooter className="flex-col items-stretch border-t pt-4">
                      <div className="flex justify-between text-lg font-semibold">
                        <span>Total</span>
                        <span className="text-primary">{calculatePrice()} BYN</span>
                      </div>
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
