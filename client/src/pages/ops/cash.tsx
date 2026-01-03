import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { 
  Wallet, 
  ArrowDownLeft, 
  ArrowUpRight,
  LockKeyhole,
  DollarSign,
  AlertTriangle
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CashCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { CashShift, CashTransaction, ExpenseCategory } from "@shared/schema";

const transactionFormSchema = z.object({
  type: z.enum(["cash_in", "expense"]),
  amount: z.number().min(0.01, "Сумма должна быть больше нуля"),
  category: z.string().optional(),
  comment: z.string().optional(),
});

type TransactionFormData = z.infer<typeof transactionFormSchema>;

const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "food_staff", label: "Питание персонала" },
  { value: "supplies", label: "Расходники" },
  { value: "salary", label: "Зарплата" },
  { value: "contractor", label: "Подрядчик" },
  { value: "other", label: "Другое" },
];

const INCOME_SOURCES = [
  { value: "spa", label: "СПА" },
  { value: "cottage_1", label: "Дом 1" },
  { value: "cottage_2", label: "Дом 2" },
  { value: "cottage_3", label: "Дом 3" },
  { value: "cottage_4", label: "Дом 4" },
  { value: "other", label: "Иное" },
];

interface CashData {
  currentShift: CashShift;
  transactions: CashTransaction[];
  balance: number;
}

export default function CashPage() {
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [transactionType, setTransactionType] = useState<"cash_in" | "expense">("cash_in");
  const { toast } = useToast();
  const { hasRole } = useAuth();
  
  const canIncasate = hasRole("OWNER", "SUPER_ADMIN");

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      type: "cash_in",
      amount: 0,
      category: "",
      comment: "",
    },
  });

  const { data: cashData, isLoading } = useQuery<CashData>({
    queryKey: ["/api/cash/shift/current"],
  });

  const addTransactionMutation = useMutation({
    mutationFn: async (data: TransactionFormData) => {
      const response = await apiRequest("POST", "/api/cash/transactions", {
        ...data,
        shiftId: cashData?.currentShift?.id,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shift/current"] });
      setShowTransactionDialog(false);
      form.reset();
      toast({ title: "Транзакция добавлена" });
    },
    onError: () => {
      toast({ title: "Ошибка добавления транзакции", variant: "destructive" });
    },
  });

  const incasationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/cash/shift/incasation");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shift/current"] });
      toast({ title: `Инкассация выполнена: ${data.amount?.toFixed(2) || 0} BYN` });
    },
    onError: () => {
      toast({ title: "Ошибка инкассации", variant: "destructive" });
    },
  });

  const handleOpenTransaction = (type: "cash_in" | "expense") => {
    setTransactionType(type);
    form.setValue("type", type);
    setShowTransactionDialog(true);
  };

  const handleSubmitTransaction = (data: TransactionFormData) => {
    addTransactionMutation.mutate(data);
  };

  const transactions: CashTransaction[] = cashData?.transactions || [];
  const balance = cashData?.balance || 0;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Касса" />
      
      <PageContainer>
        <div className="space-y-6">
          <Card className="bg-primary text-primary-foreground">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="h-5 w-5" />
                <span className="text-sm opacity-90">На руках</span>
              </div>
              <p className="text-4xl font-bold font-mono" data-testid="text-balance">
                {balance.toFixed(2)} <span className="text-lg opacity-80">BYN</span>
              </p>
              <p className="text-xs opacity-70 mt-2">
                Накоплено с последней инкассации
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Button
              variant="outline"
              className="h-16 flex flex-col gap-1"
              onClick={() => handleOpenTransaction("cash_in")}
              data-testid="button-cash-in"
            >
              <ArrowDownLeft className="h-5 w-5 text-status-confirmed" />
              <span className="text-sm">Приход</span>
            </Button>
            <Button
              variant="outline"
              className="h-16 flex flex-col gap-1"
              onClick={() => handleOpenTransaction("expense")}
              data-testid="button-expense"
            >
              <ArrowUpRight className="h-5 w-5 text-destructive" />
              <span className="text-sm">Расход</span>
            </Button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Транзакции</h3>
              <span className="text-sm text-muted-foreground">
                {transactions.length} с последней инкассации
              </span>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <CashCardSkeleton />
                <CashCardSkeleton />
              </div>
            ) : transactions.length > 0 ? (
              <div className="space-y-2">
                {transactions.map((tx) => {
                  const isTransfer = tx.type === "transfer_to_owner" || tx.type === "transfer_to_admin";
                  const isIncome = tx.type === "cash_in";
                  const isExpense = tx.type === "expense" || tx.type === "cash_out";
                  
                  return (
                    <Card key={tx.id} className="hover-elevate">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "rounded-full p-2",
                              isIncome 
                                ? "bg-status-confirmed/10" 
                                : isExpense
                                ? "bg-destructive/10"
                                : isTransfer
                                ? "bg-primary/10"
                                : "bg-muted"
                            )}>
                              {isIncome ? (
                                <ArrowDownLeft className="h-4 w-4 text-status-confirmed" />
                              ) : isExpense ? (
                                <ArrowUpRight className="h-4 w-4 text-destructive" />
                              ) : isTransfer ? (
                                <LockKeyhole className="h-4 w-4 text-primary" />
                              ) : (
                                <LockKeyhole className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {isIncome 
                                  ? INCOME_SOURCES.find(s => s.value === tx.category)?.label || "Приход"
                                  : isExpense 
                                  ? EXPENSE_CATEGORIES.find(c => c.value === tx.category)?.label || "Расход" 
                                  : tx.type === "transfer_to_owner"
                                  ? "Инкассация"
                                  : tx.type === "transfer_to_admin"
                                  ? "Перевод от собственника"
                                  : "Другое"}
                              </p>
                              {tx.comment && (
                                <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                                  {tx.comment}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(tx.createdAt), "d MMM, HH:mm", { locale: ru })}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={cn(
                              "font-mono font-medium",
                              isIncome ? "text-status-confirmed" : 
                              isExpense ? "text-destructive" : 
                              isTransfer ? "text-primary" : ""
                            )}>
                              {isIncome || tx.type === "transfer_to_admin" ? "+" : "-"}{tx.amount.toFixed(2)}
                            </p>
                            {isTransfer && (
                              <p className="text-xs text-muted-foreground">перевод</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <EmptyState
                    icon={DollarSign}
                    title="Нет транзакций"
                    description="Начните с добавления прихода или расхода"
                    className="py-4"
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {canIncasate && balance > 0 && (
            <>
              <Separator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full border-destructive text-destructive"
                    data-testid="button-incasation"
                  >
                    <LockKeyhole className="mr-2 h-4 w-4" />
                    Инкассация ({balance.toFixed(2)} BYN)
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Выполнить инкассацию?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Сумма к инкассации: <strong>{balance.toFixed(2)} BYN</strong>.
                      Баланс будет сброшен до нуля.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => incasationMutation.mutate()}
                      disabled={incasationMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {incasationMutation.isPending ? "Обработка..." : "Выполнить"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </PageContainer>

      <Dialog open={showTransactionDialog} onOpenChange={setShowTransactionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {transactionType === "cash_in" ? "Добавить приход" : "Добавить расход"}
            </DialogTitle>
            <DialogDescription>
              {transactionType === "cash_in" 
                ? "Запишите поступление наличных"
                : "Запишите расход из кассы"}
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmitTransaction)} className="space-y-4">
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
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        data-testid="input-amount"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {transactionType === "cash_in" && (
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Источник</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-income-source">
                            <SelectValue placeholder="Выберите за что" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {INCOME_SOURCES.map((src) => (
                            <SelectItem key={src.value} value={src.value}>
                              {src.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {transactionType === "expense" && (
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Категория</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-category">
                            <SelectValue placeholder="Выберите категорию" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {EXPENSE_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="comment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Комментарий (необязательно)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Добавьте заметку..."
                        className="resize-none"
                        {...field}
                        data-testid="input-comment"
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
                  onClick={() => setShowTransactionDialog(false)}
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  disabled={addTransactionMutation.isPending}
                  data-testid="button-submit-transaction"
                >
                  {addTransactionMutation.isPending ? "Сохранение..." : "Сохранить"}
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
