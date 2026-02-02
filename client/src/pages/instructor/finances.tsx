import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { ru } from "date-fns/locale";
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Trash2,
  Fuel,
  Wrench,
  Package,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Bike,
  BarChart3
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { BookingCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import type { InstructorExpense } from "@shared/schema";

type InstructorExpenseCategory = "fuel" | "maintenance" | "parts" | "other";

const expenseFormSchema = z.object({
  date: z.string().min(1, "Укажите дату"),
  category: z.enum(["fuel", "maintenance", "parts", "other"]),
  amount: z.string().min(1, "Укажите сумму").refine(v => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "Некорректная сумма"),
  description: z.string().min(1, "Укажите описание"),
});

type ExpenseFormData = z.infer<typeof expenseFormSchema>;

interface FinancesData {
  period: { startDate: string; endDate: string };
  revenue: number;
  bookingsCount: number;
  quadsCount: number;
  totalExpenses: number;
  expensesByCategory: Record<string, number>;
  expenses: InstructorExpense[];
  netProfit: number;
}

const CATEGORY_LABELS: Record<InstructorExpenseCategory, string> = {
  fuel: "Топливо",
  maintenance: "Обслуживание",
  parts: "Запчасти",
  other: "Прочее",
};

const CATEGORY_ICONS: Record<InstructorExpenseCategory, typeof Fuel> = {
  fuel: Fuel,
  maintenance: Wrench,
  parts: Package,
  other: MoreHorizontal,
};

const CATEGORY_COLORS: Record<InstructorExpenseCategory, string> = {
  fuel: "hsl(var(--chart-1))",
  maintenance: "hsl(var(--chart-2))",
  parts: "hsl(var(--chart-3))",
  other: "hsl(var(--chart-4))",
};

export default function InstructorFinancesPage() {
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      date: format(new Date(), "yyyy-MM-dd"),
      category: "fuel",
      amount: "",
      description: "",
    },
  });

  const startDate = format(startOfMonth(selectedMonth), "yyyy-MM-dd");
  const endDate = format(endOfMonth(selectedMonth), "yyyy-MM-dd");

  const { data: financesData, isLoading } = useQuery<FinancesData>({
    queryKey: ["/api/instructor/finances", { startDate, endDate }],
  });

  const createExpenseMutation = useMutation({
    mutationFn: async (data: ExpenseFormData) => {
      const response = await apiRequest("POST", "/api/instructor/expenses", {
        ...data,
        amount: parseFloat(data.amount),
        createdBy: user?.telegramId || "unknown",
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructor/finances"] });
      setShowExpenseDialog(false);
      form.reset({
        date: format(new Date(), "yyyy-MM-dd"),
        category: "fuel",
        amount: "",
        description: "",
      });
      toast({ title: "Расход добавлен" });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/instructor/expenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructor/finances"] });
      toast({ title: "Расход удалён" });
    },
    onError: () => {
      toast({
        title: "Ошибка удаления",
        variant: "destructive",
      });
    },
  });

  const handleSubmitExpense = (data: ExpenseFormData) => {
    createExpenseMutation.mutate(data);
  };

  const goToPreviousMonth = () => {
    setSelectedMonth(prev => subMonths(prev, 1));
  };

  const goToNextMonth = () => {
    setSelectedMonth(prev => addMonths(prev, 1));
  };

  const revenue = financesData?.revenue || 0;
  const totalExpenses = financesData?.totalExpenses || 0;
  const netProfit = financesData?.netProfit || 0;
  const bookingsCount = financesData?.bookingsCount || 0;
  const quadsCount = financesData?.quadsCount || 0;
  const expenses = financesData?.expenses || [];
  const expensesByCategory = financesData?.expensesByCategory || {};

  return (
    <div className="min-h-screen flex flex-col pb-56">
      <Header 
        title="Финансы" 
        showBack
      />
      
      <PageContainer>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={goToPreviousMonth}
              data-testid="button-prev-month"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-lg font-semibold text-center" data-testid="text-month">
              {format(selectedMonth, "LLLL yyyy", { locale: ru })}
            </h2>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={goToNextMonth}
              disabled={selectedMonth >= new Date()}
              data-testid="button-next-month"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              <BookingCardSkeleton />
              <BookingCardSkeleton />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <TrendingUp className="h-5 w-5 mx-auto mb-1 text-status-confirmed" />
                    <p className="text-lg font-bold text-status-confirmed" data-testid="text-revenue">
                      {revenue}
                    </p>
                    <p className="text-xs text-muted-foreground">Выручка</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <TrendingDown className="h-5 w-5 mx-auto mb-1 text-destructive" />
                    <p className="text-lg font-bold text-destructive" data-testid="text-expenses">
                      {totalExpenses}
                    </p>
                    <p className="text-xs text-muted-foreground">Расходы</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <Wallet className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <p className={`text-lg font-bold ${netProfit >= 0 ? "text-status-confirmed" : "text-destructive"}`} data-testid="text-profit">
                      {netProfit}
                    </p>
                    <p className="text-xs text-muted-foreground">Прибыль</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bike className="h-4 w-4" />
                    Статистика поездок
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Завершённых броней</span>
                    <span className="font-medium" data-testid="text-bookings-count">{bookingsCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Квадроциклов выдано</span>
                    <span className="font-medium" data-testid="text-quads-count">{quadsCount}</span>
                  </div>
                  {revenue > 0 && bookingsCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Средний чек</span>
                      <span className="font-medium">{Math.round(revenue / bookingsCount)} BYN</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Visual Charts Section */}
              {(revenue > 0 || totalExpenses > 0) && (
                <Card data-testid="card-financial-overview">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2" data-testid="title-financial-overview">
                      <BarChart3 className="h-4 w-4" />
                      Финансовый обзор
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-32 mb-4" data-testid="chart-revenue-expenses">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={[{ name: "Период", revenue, expenses: totalExpenses }]}
                          layout="vertical"
                        >
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="name" hide />
                          <Tooltip 
                            formatter={(value: number) => [`${value.toFixed(0)} BYN`]}
                          />
                          <Bar dataKey="revenue" name="Выручка" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                          <Bar dataKey="expenses" name="Расходы" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex justify-around pt-3 border-t">
                      <div className="text-center" data-testid="legend-revenue">
                        <p className="text-xs text-muted-foreground">Выручка</p>
                        <p className="text-lg font-bold font-mono text-status-confirmed">+{revenue}</p>
                      </div>
                      <div className="text-center" data-testid="legend-expenses">
                        <p className="text-xs text-muted-foreground">Расходы</p>
                        <p className="text-lg font-bold font-mono text-destructive">-{totalExpenses}</p>
                      </div>
                      <div className="text-center" data-testid="legend-net-profit">
                        <p className="text-xs text-muted-foreground">Чистая</p>
                        <p className={`text-lg font-bold font-mono ${netProfit >= 0 ? 'text-status-confirmed' : 'text-destructive'}`}>
                          {netProfit >= 0 ? '+' : ''}{netProfit}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Expenses by Category Pie Chart */}
              {Object.keys(expensesByCategory).length > 0 && (
                <Card data-testid="card-expense-categories">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2" data-testid="title-expense-categories">
                      <TrendingDown className="h-4 w-4" />
                      Расходы по категориям
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="w-full sm:w-1/2 h-40" data-testid="chart-expense-categories">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={Object.entries(expensesByCategory).map(([category, amount]) => ({
                                name: CATEGORY_LABELS[category as InstructorExpenseCategory],
                                value: amount as number,
                                color: CATEGORY_COLORS[category as InstructorExpenseCategory],
                              }))}
                              cx="50%"
                              cy="50%"
                              innerRadius={35}
                              outerRadius={60}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {Object.entries(expensesByCategory).map(([category], index) => (
                                <Cell 
                                  key={`cell-${index}`} 
                                  fill={CATEGORY_COLORS[category as InstructorExpenseCategory]} 
                                />
                              ))}
                            </Pie>
                            <Tooltip 
                              formatter={(value: number) => [`${value} BYN`]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="w-full sm:w-1/2 space-y-2">
                        {Object.entries(expensesByCategory).map(([category, amount]) => {
                          const Icon = CATEGORY_ICONS[category as InstructorExpenseCategory];
                          const percent = totalExpenses > 0 ? ((amount as number / totalExpenses) * 100).toFixed(0) : 0;
                          return (
                            <div 
                              key={category} 
                              className="flex items-center justify-between text-sm"
                              data-testid={`legend-expense-${category}`}
                            >
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: CATEGORY_COLORS[category as InstructorExpenseCategory] }}
                                />
                                <Icon className="h-3 w-3 text-muted-foreground" />
                                <span>{CATEGORY_LABELS[category as InstructorExpenseCategory]}</span>
                              </div>
                              <span className="font-mono font-medium">
                                {amount} <span className="text-xs text-muted-foreground">({percent}%)</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingDown className="h-4 w-4" />
                    Расходы
                  </CardTitle>
                  <Button 
                    size="sm" 
                    onClick={() => setShowExpenseDialog(true)}
                    data-testid="button-add-expense"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Добавить
                  </Button>
                </CardHeader>
                <CardContent>
                  {Object.keys(expensesByCategory).length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {Object.entries(expensesByCategory).map(([category, amount]) => {
                        const Icon = CATEGORY_ICONS[category as InstructorExpenseCategory];
                        return (
                          <Badge key={category} variant="secondary" className="gap-1">
                            <Icon className="h-3 w-3" />
                            {CATEGORY_LABELS[category as InstructorExpenseCategory]}: {amount} BYN
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  
                  {expenses.length === 0 ? (
                    <EmptyState
                      icon={DollarSign}
                      title="Нет расходов"
                      description="Добавьте первый расход за этот период"
                    />
                  ) : (
                    <div className="space-y-2">
                      {expenses.map((expense) => {
                        const Icon = CATEGORY_ICONS[expense.category];
                        return (
                          <div 
                            key={expense.id} 
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-md"
                            data-testid={`expense-item-${expense.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-full bg-background">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="font-medium text-sm">{expense.description}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(expense.date), "d MMM", { locale: ru })} - {CATEGORY_LABELS[expense.category]}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-destructive">
                                -{expense.amount} BYN
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteExpenseMutation.mutate(expense.id)}
                                disabled={deleteExpenseMutation.isPending}
                                data-testid={`button-delete-expense-${expense.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </PageContainer>

      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить расход</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmitExpense)} className="space-y-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Дата</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-expense-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Категория</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-expense-category">
                          <SelectValue placeholder="Выберите категорию" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="fuel">Топливо</SelectItem>
                        <SelectItem value="maintenance">Обслуживание</SelectItem>
                        <SelectItem value="parts">Запчасти</SelectItem>
                        <SelectItem value="other">Прочее</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Сумма (BYN)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01"
                        placeholder="0.00" 
                        {...field} 
                        data-testid="input-expense-amount" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Описание</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Например: Заправка квадроциклов" 
                        {...field} 
                        data-testid="input-expense-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowExpenseDialog(false)}
                  data-testid="button-cancel-expense"
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  disabled={createExpenseMutation.isPending}
                  data-testid="button-save-expense"
                >
                  {createExpenseMutation.isPending ? "Сохранение..." : "Сохранить"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
