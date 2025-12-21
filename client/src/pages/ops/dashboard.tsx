import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  CalendarCheck, 
  ClipboardList, 
  Wallet, 
  Bath, 
  Home as HomeIcon,
  CheckCircle2,
  Clock,
  Users,
  ArrowRight,
  Plus
} from "lucide-react";
import { Link } from "wouter";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { StatsCardSkeleton, TaskCardSkeleton, BookingCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Task, CottageBooking, BathBooking, CashShift } from "@shared/schema";

interface OpsData {
  tasks: Task[];
  cottageBookings: CottageBooking[];
  bathBookings: BathBooking[];
  currentShift: CashShift | null;
  stats: {
    checkInsToday: number;
    checkOutsToday: number;
    bathsToday: number;
    openTasks: number;
    cashBalance: number;
  };
}

export default function OpsDashboard() {
  const { toast } = useToast();
  const today = format(new Date(), "EEEE, MMMM d");

  const { data: opsData, isLoading } = useQuery<OpsData>({
    queryKey: ["/api/ops/today"],
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await apiRequest("POST", `/api/tasks/${taskId}/complete`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/today"] });
      toast({ title: "Task completed" });
    },
    onError: () => {
      toast({ title: "Failed to complete task", variant: "destructive" });
    },
  });

  const stats = opsData?.stats;
  const openTasks = opsData?.tasks?.filter(t => t.status === "open") || [];
  const todayBookings = opsData?.cottageBookings || [];
  const todayBaths = opsData?.bathBookings || [];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Operations" />
      
      <PageContainer>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-1" data-testid="text-date">
              {today}
            </h2>
            <p className="text-muted-foreground">Today's overview</p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 gap-4">
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Card className="hover-elevate">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-status-confirmed/10 p-2">
                      <CalendarCheck className="h-5 w-5 text-status-confirmed" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold font-mono" data-testid="stat-checkins">
                        {stats?.checkInsToday || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Check-ins</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-status-pending/10 p-2">
                      <Clock className="h-5 w-5 text-status-pending" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold font-mono" data-testid="stat-checkouts">
                        {stats?.checkOutsToday || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Check-outs</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-status-awaiting/10 p-2">
                      <Bath className="h-5 w-5 text-status-awaiting" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold font-mono" data-testid="stat-baths">
                        {stats?.bathsToday || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Bath bookings</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-primary/10 p-2">
                      <Wallet className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold font-mono" data-testid="stat-cash">
                        {stats?.cashBalance || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Cash BYN</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Tasks
                {openTasks.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {openTasks.length}
                  </Badge>
                )}
              </h3>
              <Link href="/ops/tasks">
                <Button variant="ghost" size="sm" data-testid="link-all-tasks">
                  View all
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <TaskCardSkeleton />
                <TaskCardSkeleton />
              </div>
            ) : openTasks.length > 0 ? (
              <div className="space-y-2">
                {openTasks.slice(0, 4).map((task) => (
                  <Card key={task.id} className="hover-elevate">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={task.status === "done"}
                          onCheckedChange={() => completeTaskMutation.mutate(task.id)}
                          disabled={completeTaskMutation.isPending}
                          data-testid={`checkbox-task-${task.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{task.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {task.unitCode && (
                              <Badge variant="outline" className="text-xs">
                                {task.unitCode}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground capitalize">
                              {task.type.replace("_", " ")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <EmptyState
                    icon={CheckCircle2}
                    title="All caught up!"
                    description="No pending tasks for today"
                    className="py-4"
                  />
                </CardContent>
              </Card>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <HomeIcon className="h-5 w-5" />
                Today's Cottages
              </h3>
              <Link href="/ops/bookings">
                <Button variant="ghost" size="sm" data-testid="link-all-bookings">
                  View all
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <BookingCardSkeleton />
              </div>
            ) : todayBookings.length > 0 ? (
              <div className="space-y-3">
                {todayBookings.slice(0, 3).map((booking) => (
                  <Card key={booking.id} className="hover-elevate">
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
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(booking.dateCheckIn), "MMM d")} - {format(new Date(booking.dateCheckOut), "MMM d")}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <EmptyState
                    icon={HomeIcon}
                    title="No cottage activity"
                    description="No check-ins or check-outs today"
                    className="py-4"
                  />
                </CardContent>
              </Card>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Bath className="h-5 w-5" />
                Bath Bookings
              </h3>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <BookingCardSkeleton />
              </div>
            ) : todayBaths.length > 0 ? (
              <div className="space-y-3">
                {todayBaths.slice(0, 3).map((booking) => (
                  <Card key={booking.id} className="hover-elevate">
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
                      <p className="font-medium">{booking.customer.fullName || booking.customer.phone}</p>
                      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                        {booking.options.tub !== "none" && (
                          <Badge variant="secondary" className="text-xs">
                            Tub: {booking.options.tub}
                          </Badge>
                        )}
                        {booking.options.grill && (
                          <Badge variant="secondary" className="text-xs">Grill</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <EmptyState
                    icon={Bath}
                    title="No bath bookings"
                    description="No bath bookings for today"
                    className="py-4"
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </PageContainer>

      <Link href="/ops/bookings/new">
        <Button
          size="lg"
          className="fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-lg"
          data-testid="button-new-booking"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </Link>

      <BottomNav />
    </div>
  );
}
