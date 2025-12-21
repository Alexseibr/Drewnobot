import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { 
  Wallet, 
  Plus, 
  Minus, 
  ArrowDownLeft, 
  ArrowUpRight,
  LockKeyhole,
  DollarSign,
  AlertTriangle
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CashCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { CashShift, CashTransaction, ExpenseCategory } from "@shared/schema";

const transactionFormSchema = z.object({
  type: z.enum(["cash_in", "expense"]),
  amount: z.number().min(0.01, "Amount must be positive"),
  category: z.string().optional(),
  comment: z.string().optional(),
});

type TransactionFormData = z.infer<typeof transactionFormSchema>;

const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "food_staff", label: "Staff Food" },
  { value: "supplies", label: "Supplies" },
  { value: "salary", label: "Salary" },
  { value: "contractor", label: "Contractor" },
  { value: "other", label: "Other" },
];

interface CashData {
  currentShift: CashShift | null;
  transactions: CashTransaction[];
  balance: number;
}

export default function CashPage() {
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [transactionType, setTransactionType] = useState<"cash_in" | "expense">("cash_in");
  const { toast } = useToast();

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

  const openShiftMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/cash/shift/open");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shift/current"] });
      toast({ title: "Shift opened" });
    },
    onError: () => {
      toast({ title: "Failed to open shift", variant: "destructive" });
    },
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
      toast({ title: "Transaction added" });
    },
    onError: () => {
      toast({ title: "Failed to add transaction", variant: "destructive" });
    },
  });

  const incasationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/cash/shift/incasation");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shift/current"] });
      toast({ title: "Shift closed successfully" });
    },
    onError: () => {
      toast({ title: "Failed to close shift", variant: "destructive" });
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

  const currentShift = cashData?.currentShift;
  const transactions = cashData?.transactions || [];
  const balance = cashData?.balance || 0;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Cashbox" />
      
      <PageContainer>
        <div className="space-y-6">
          {!currentShift ? (
            <Card>
              <CardContent className="p-6">
                <EmptyState
                  icon={Wallet}
                  title="No active shift"
                  description="Open a new shift to start recording transactions"
                  action={
                    <Button
                      onClick={() => openShiftMutation.mutate()}
                      disabled={openShiftMutation.isPending}
                      data-testid="button-open-shift"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {openShiftMutation.isPending ? "Opening..." : "Open Shift"}
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="bg-primary text-primary-foreground">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-5 w-5" />
                      <span className="text-sm opacity-90">Current Balance</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      Active Shift
                    </Badge>
                  </div>
                  <p className="text-4xl font-bold font-mono" data-testid="text-balance">
                    {balance.toFixed(2)} <span className="text-lg opacity-80">BYN</span>
                  </p>
                  <p className="text-sm opacity-80 mt-2">
                    Opened {currentShift.openedAt && format(new Date(currentShift.openedAt), "MMM d, HH:mm")}
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
                  <span className="text-sm">Cash In</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-16 flex flex-col gap-1"
                  onClick={() => handleOpenTransaction("expense")}
                  data-testid="button-expense"
                >
                  <ArrowUpRight className="h-5 w-5 text-destructive" />
                  <span className="text-sm">Expense</span>
                </Button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold">Transactions</h3>
                  <span className="text-sm text-muted-foreground">
                    {transactions.length} today
                  </span>
                </div>

                {isLoading ? (
                  <div className="space-y-3">
                    <CashCardSkeleton />
                    <CashCardSkeleton />
                  </div>
                ) : transactions.length > 0 ? (
                  <div className="space-y-2">
                    {transactions.map((tx) => (
                      <Card key={tx.id} className="hover-elevate">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "rounded-full p-2",
                                tx.type === "cash_in" 
                                  ? "bg-status-confirmed/10" 
                                  : tx.type === "expense"
                                  ? "bg-destructive/10"
                                  : "bg-muted"
                              )}>
                                {tx.type === "cash_in" ? (
                                  <ArrowDownLeft className="h-4 w-4 text-status-confirmed" />
                                ) : tx.type === "expense" ? (
                                  <ArrowUpRight className="h-4 w-4 text-destructive" />
                                ) : (
                                  <LockKeyhole className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-sm">
                                  {tx.type === "cash_in" ? "Cash In" : 
                                   tx.type === "expense" ? tx.category || "Expense" : 
                                   "Incasation"}
                                </p>
                                {tx.comment && (
                                  <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                                    {tx.comment}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(tx.createdAt), "HH:mm")}
                                </p>
                              </div>
                            </div>
                            <p className={cn(
                              "font-mono font-medium",
                              tx.type === "cash_in" ? "text-status-confirmed" : 
                              tx.type === "expense" ? "text-destructive" : ""
                            )}>
                              {tx.type === "cash_in" ? "+" : "-"}{tx.amount.toFixed(2)}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-6">
                      <EmptyState
                        icon={DollarSign}
                        title="No transactions"
                        description="Start by adding a cash in or expense"
                        className="py-4"
                      />
                    </CardContent>
                  </Card>
                )}
              </div>

              <Separator />

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full border-destructive text-destructive hover:bg-destructive/10"
                    data-testid="button-incasation"
                  >
                    <LockKeyhole className="mr-2 h-4 w-4" />
                    Close Shift (Incasation)
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Close Shift?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will close the current shift with a balance of <strong>{balance.toFixed(2)} BYN</strong>.
                      You won't be able to view this shift's transactions after closing.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => incasationMutation.mutate()}
                      disabled={incasationMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {incasationMutation.isPending ? "Closing..." : "Close Shift"}
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
              {transactionType === "cash_in" ? "Add Cash In" : "Add Expense"}
            </DialogTitle>
            <DialogDescription>
              {transactionType === "cash_in" 
                ? "Record incoming cash payment"
                : "Record an expense from the cashbox"}
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmitTransaction)} className="space-y-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (BYN)</FormLabel>
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

              {transactionType === "expense" && (
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-category">
                            <SelectValue placeholder="Select category" />
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
                    <FormLabel>Comment (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add a note..."
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
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={addTransactionMutation.isPending}
                  data-testid="button-submit-transaction"
                >
                  {addTransactionMutation.isPending ? "Saving..." : "Save"}
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
