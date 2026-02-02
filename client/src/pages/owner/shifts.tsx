import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Plus, Calendar, Clock, Trash2, User } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageLoading } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { queryClient } from "@/lib/queryClient";
import type { StaffShift, User as UserType } from "@shared/schema";
import { format, addDays, startOfWeek, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

const SHIFT_TYPES = {
  morning: { label: "Утро (08:00-16:00)", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  evening: { label: "Вечер (16:00-00:00)", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  full_day: { label: "Полный день (08:00-00:00)", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  night: { label: "Ночь (00:00-08:00)", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
};

export default function ShiftsPage() {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  
  const [newShift, setNewShift] = useState({
    userId: "",
    date: "",
    shiftType: "morning" as keyof typeof SHIFT_TYPES,
  });

  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: shifts = [], isLoading } = useQuery<StaffShift[]>({
    queryKey: ["/api/staff-shifts"],
  });
  
  const { data: staffUsers = [] } = useQuery<UserType[]>({
    queryKey: ["/api/admin/staff"],
  });

  const createMutation = useMutation({
    mutationFn: async (shift: typeof newShift) => {
      const res = await fetch("/api/staff-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(shift),
      });
      if (!res.ok) throw new Error("Failed to create shift");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-shifts"] });
      setShowAddDialog(false);
      setNewShift({ userId: "", date: "", shiftType: "morning" });
      toast({ title: "Смена добавлена" });
    },
  });
  
  const deleteMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      const res = await fetch(`/api/staff-shifts/${shiftId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete shift");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-shifts"] });
      toast({ title: "Смена удалена" });
    },
  });

  const handleAddShift = () => {
    if (!newShift.userId || !newShift.date) {
      toast({ title: "Выберите сотрудника и дату", variant: "destructive" });
      return;
    }
    createMutation.mutate(newShift);
  };

  const openAddDialog = (date: Date) => {
    setSelectedDate(format(date, "yyyy-MM-dd"));
    setNewShift({ ...newShift, date: format(date, "yyyy-MM-dd") });
    setShowAddDialog(true);
  };

  const getShiftsForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return shifts.filter((s) => s.date === dateStr);
  };

  const getUserName = (userId: string) => {
    const user = staffUsers.find((u) => u.id === userId);
    return user?.name || user?.phone || "Unknown";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <PageLoading />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-50 bg-background border-b p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link href="/owner/settings">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-lg font-semibold">Расписание смен</h1>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(weekOffset - 1)} data-testid="button-prev-week">
            Пред. неделя
          </Button>
          <span className="text-sm font-medium">
            {format(weekDates[0], "d MMM", { locale: ru })} - {format(weekDates[6], "d MMM yyyy", { locale: ru })}
          </span>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(weekOffset + 1)} data-testid="button-next-week">
            След. неделя
          </Button>
        </div>

        <div className="space-y-3">
          {weekDates.map((date) => {
            const dateShifts = getShiftsForDate(date);
            const isToday = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
            
            return (
              <Card key={date.toISOString()} className={isToday ? "border-primary" : ""}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {format(date, "EEEE, d MMMM", { locale: ru })}
                    {isToday && <Badge variant="secondary">Сегодня</Badge>}
                  </CardTitle>
                  <Button size="icon" variant="ghost" onClick={() => openAddDialog(date)} data-testid={`button-add-shift-${format(date, "yyyy-MM-dd")}`}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {dateShifts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Нет смен</p>
                  ) : (
                    dateShifts.map((shift) => {
                      const shiftType = SHIFT_TYPES[shift.shiftType as keyof typeof SHIFT_TYPES];
                      return (
                        <div
                          key={shift.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
                          data-testid={`shift-${shift.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{getUserName(shift.userId)}</span>
                            <Badge className={shiftType?.color || ""}>
                              {shiftType?.label || shift.shiftType}
                            </Badge>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(shift.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-shift-${shift.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить смену - {selectedDate && format(parseISO(selectedDate), "d MMMM yyyy", { locale: ru })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Сотрудник</Label>
              <Select value={newShift.userId} onValueChange={(v) => setNewShift({ ...newShift, userId: v })}>
                <SelectTrigger data-testid="select-user">
                  <SelectValue placeholder="Выберите сотрудника" />
                </SelectTrigger>
                <SelectContent>
                  {staffUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>{user.name || user.phone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Тип смены</Label>
              <Select value={newShift.shiftType} onValueChange={(v: keyof typeof SHIFT_TYPES) => setNewShift({ ...newShift, shiftType: v })}>
                <SelectTrigger data-testid="select-shift-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SHIFT_TYPES).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Отмена</Button>
            <Button onClick={handleAddShift} disabled={createMutation.isPending} data-testid="button-save-shift">
              {createMutation.isPending ? "Сохранение..." : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
