import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, Calendar, Filter } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ru } from "date-fns/locale";
import type { Task } from "@shared/schema";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";

export default function CompletedTasksPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  const fromDate = dateRange?.from ? format(startOfDay(dateRange.from), "yyyy-MM-dd") : undefined;
  const toDate = dateRange?.to ? format(endOfDay(dateRange.to), "yyyy-MM-dd") : undefined;

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/owner/tasks/completed", { fromDate, toDate }],
    queryFn: async () => {
      const token = localStorage.getItem("drewno_session");
      const params = new URLSearchParams();
      if (fromDate) params.append("fromDate", fromDate);
      if (toDate) params.append("toDate", toDate);
      
      const res = await fetch(`/api/owner/tasks/completed?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
  });

  const tasksByDate = tasks.reduce((acc, task) => {
    const date = task.date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(task);
    return acc;
  }, {} as Record<string, Task[]>);

  const sortedDates = Object.keys(tasksByDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="min-h-screen bg-background ">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-4 px-4 py-3">
          <Link href="/owner/settings">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Выполненные задачи</h1>
            <p className="text-sm text-muted-foreground">
              {tasks.length} задач за выбранный период
            </p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-filter">
                <Filter className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-3 border-b">
                <Label>Период</Label>
              </div>
              <CalendarComponent
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={1}
                locale={ru}
                data-testid="calendar-range"
              />
            </PopoverContent>
          </Popover>
        </div>
      </header>

      <main className="container mx-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Нет выполненных задач за выбранный период
            </CardContent>
          </Card>
        ) : (
          sortedDates.map((date) => (
            <div key={date} className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground sticky top-16 z-30 bg-background py-2">
                <Calendar className="h-4 w-4" />
                {format(new Date(date), "d MMMM yyyy, EEEE", { locale: ru })}
              </div>
              <div className="space-y-2">
                {tasksByDate[date].map((task) => (
                  <Card key={task.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium" data-testid={`text-task-title-${task.id}`}>
                            {task.title}
                          </p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {task.unitCode && (
                              <Badge variant="outline" className="text-xs">
                                {task.unitCode}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-xs">
                              {task.type}
                            </Badge>
                            {task.assignedTo && (
                              <span className="text-xs text-muted-foreground">
                                Исполнитель: {task.assignedTo}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
