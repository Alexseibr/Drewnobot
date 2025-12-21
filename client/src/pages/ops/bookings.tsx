import { useQuery, useMutation } from "@tanstack/react-query";
import { format, isSameDay, isAfter, parseISO } from "date-fns";
import { 
  Home, 
  Bath, 
  Users, 
  Phone,
  Calendar,
  Check,
  X,
  CreditCard,
  Banknote
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BookingCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { CottageBooking, BathBooking } from "@shared/schema";

interface BookingsData {
  cottageBookings: CottageBooking[];
  bathBookings: BathBooking[];
}

export default function BookingsPage() {
  const { toast } = useToast();

  const { data: bookingsData, isLoading } = useQuery<BookingsData>({
    queryKey: ["/api/admin/bookings/upcoming"],
  });

  const acceptBathMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("POST", `/api/admin/bath-bookings/${bookingId}/accept`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/today"] });
      toast({ title: "Booking accepted" });
    },
    onError: () => {
      toast({ title: "Failed to accept booking", variant: "destructive" });
    },
  });

  const cancelBathMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await apiRequest("POST", `/api/admin/bath-bookings/${bookingId}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/today"] });
      toast({ title: "Booking cancelled" });
    },
    onError: () => {
      toast({ title: "Failed to cancel booking", variant: "destructive" });
    },
  });

  const closeBathPaymentMutation = useMutation({
    mutationFn: async ({ bookingId, method }: { bookingId: string; method: "erip" | "cash" }) => {
      const response = await apiRequest("POST", `/api/admin/bath-bookings/${bookingId}/close-payment`, {
        method,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shift/current"] });
      toast({ title: "Payment closed" });
    },
    onError: () => {
      toast({ title: "Failed to close payment", variant: "destructive" });
    },
  });

  const cottageBookings = bookingsData?.cottageBookings || [];
  const bathBookings = bookingsData?.bathBookings || [];

  const today = new Date();
  const todayCottages = cottageBookings.filter(b => 
    isSameDay(parseISO(b.dateCheckIn), today) || isSameDay(parseISO(b.dateCheckOut), today)
  );
  const upcomingCottages = cottageBookings.filter(b => 
    isAfter(parseISO(b.dateCheckIn), today)
  );

  const todayBaths = bathBookings.filter(b => isSameDay(parseISO(b.date), today));
  const upcomingBaths = bathBookings.filter(b => isAfter(parseISO(b.date), today));
  const pendingBaths = bathBookings.filter(b => b.status === "pending_call");

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Bookings" />
      
      <PageContainer>
        <Tabs defaultValue="baths" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="baths" className="gap-2" data-testid="tab-baths">
              <Bath className="h-4 w-4" />
              Baths
              {pendingBaths.length > 0 && (
                <Badge className="ml-1 text-xs bg-status-pending text-black">
                  {pendingBaths.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="cottages" className="gap-2" data-testid="tab-cottages">
              <Home className="h-4 w-4" />
              Cottages
            </TabsTrigger>
          </TabsList>

          <TabsContent value="baths" className="space-y-4">
            {pendingBaths.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-status-pending flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-status-pending animate-pulse" />
                  Pending Confirmation
                </h3>
                {pendingBaths.map((booking) => (
                  <Card key={booking.id} className="border-status-pending/30">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline">{booking.bathCode}</Badge>
                            <StatusBadge status={booking.status} />
                          </div>
                          <p className="font-medium">{booking.customer.fullName}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {booking.customer.phone}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm">
                            {booking.startTime} - {booking.endTime}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(parseISO(booking.date), "MMM d")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        {booking.options.tub !== "none" && (
                          <Badge variant="secondary" className="text-xs">
                            Tub: {booking.options.tub}
                          </Badge>
                        )}
                        {booking.options.grill && (
                          <Badge variant="secondary" className="text-xs">Grill</Badge>
                        )}
                        {booking.options.charcoal && (
                          <Badge variant="secondary" className="text-xs">Charcoal</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t">
                        <p className="font-semibold">
                          {booking.pricing.total} BYN
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => cancelBathMutation.mutate(booking.id)}
                            disabled={cancelBathMutation.isPending}
                            data-testid={`button-cancel-${booking.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => acceptBathMutation.mutate(booking.id)}
                            disabled={acceptBathMutation.isPending}
                            data-testid={`button-accept-${booking.id}`}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Accept
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {todayBaths.filter(b => b.status !== "pending_call").length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Today</h3>
                {todayBaths.filter(b => b.status !== "pending_call").map((booking) => (
                  <Card key={booking.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{booking.bathCode}</Badge>
                          <StatusBadge status={booking.status} />
                        </div>
                        <span className="text-sm font-mono">
                          {booking.startTime} - {booking.endTime}
                        </span>
                      </div>
                      <p className="font-medium">{booking.customer.fullName}</p>
                      <p className="text-sm text-muted-foreground">{booking.customer.phone}</p>
                      
                      {booking.status === "confirmed" && (
                        <div className="flex gap-2 mt-3 pt-3 border-t">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => closeBathPaymentMutation.mutate({ 
                              bookingId: booking.id, 
                              method: "erip" 
                            })}
                            disabled={closeBathPaymentMutation.isPending}
                            data-testid={`button-erip-${booking.id}`}
                          >
                            <CreditCard className="h-4 w-4 mr-1" />
                            ERIP
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => closeBathPaymentMutation.mutate({ 
                              bookingId: booking.id, 
                              method: "cash" 
                            })}
                            disabled={closeBathPaymentMutation.isPending}
                            data-testid={`button-cash-${booking.id}`}
                          >
                            <Banknote className="h-4 w-4 mr-1" />
                            Cash
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {upcomingBaths.filter(b => b.status !== "pending_call").length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Upcoming</h3>
                {upcomingBaths.filter(b => b.status !== "pending_call").map((booking) => (
                  <Card key={booking.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{booking.bathCode}</Badge>
                          <StatusBadge status={booking.status} />
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm">
                            {booking.startTime} - {booking.endTime}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(booking.date), "MMM d")}
                          </p>
                        </div>
                      </div>
                      <p className="font-medium">{booking.customer.fullName}</p>
                      <p className="text-sm text-muted-foreground">{booking.customer.phone}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {bathBookings.length === 0 && !isLoading && (
              <Card>
                <CardContent className="p-6">
                  <EmptyState
                    icon={Bath}
                    title="No bath bookings"
                    description="Bath bookings will appear here"
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="cottages" className="space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                <BookingCardSkeleton />
                <BookingCardSkeleton />
              </div>
            ) : cottageBookings.length > 0 ? (
              <>
                {todayCottages.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm">Today</h3>
                    {todayCottages.map((booking) => (
                      <Card key={booking.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{booking.unitCode}</Badge>
                              <StatusBadge status={booking.status} />
                            </div>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Users className="h-4 w-4" />
                              {booking.guestsCount}
                            </div>
                          </div>
                          <p className="font-medium">{booking.customer.fullName || booking.customer.phone}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(parseISO(booking.dateCheckIn), "MMM d")} - {format(parseISO(booking.dateCheckOut), "MMM d")}
                          </p>
                          {booking.tubSmall && (
                            <Badge variant="secondary" className="text-xs mt-2">
                              Small Tub
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {upcomingCottages.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm">Upcoming</h3>
                    {upcomingCottages.map((booking) => (
                      <Card key={booking.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{booking.unitCode}</Badge>
                              <StatusBadge status={booking.status} />
                            </div>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Users className="h-4 w-4" />
                              {booking.guestsCount}
                            </div>
                          </div>
                          <p className="font-medium">{booking.customer.fullName || booking.customer.phone}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(parseISO(booking.dateCheckIn), "MMM d")} - {format(parseISO(booking.dateCheckOut), "MMM d")}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <EmptyState
                    icon={Home}
                    title="No cottage bookings"
                    description="Cottage bookings will appear here"
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </PageContainer>

      <BottomNav />
    </div>
  );
}
