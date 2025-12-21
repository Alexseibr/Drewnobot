import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  ClipboardList, 
  CheckCircle2, 
  Clock, 
  ThermometerSnowflake,
  Thermometer,
  Trash2,
  Gauge,
  Sparkles,
  Phone,
  HelpCircle
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TaskCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { Task, TaskType } from "@shared/schema";

const taskIcons: Record<TaskType, React.ElementType> = {
  climate_off: ThermometerSnowflake,
  climate_on: Thermometer,
  trash_prep: Trash2,
  meters: Gauge,
  cleaning: Sparkles,
  call_guest: Phone,
  other: HelpCircle,
};

export default function TasksPage() {
  const { toast } = useToast();

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await apiRequest("POST", `/api/tasks/${taskId}/complete`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ops/today"] });
      toast({ title: "Task completed" });
    },
    onError: () => {
      toast({ title: "Failed to complete task", variant: "destructive" });
    },
  });

  const openTasks = tasks?.filter(t => t.status === "open") || [];
  const completedTasks = tasks?.filter(t => t.status === "done") || [];

  const TaskCard = ({ task }: { task: Task }) => {
    const Icon = taskIcons[task.type] || HelpCircle;
    const isCompleted = task.status === "done";

    return (
      <Card className={cn("hover-elevate", isCompleted && "opacity-60")}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={isCompleted}
              onCheckedChange={() => !isCompleted && completeTaskMutation.mutate(task.id)}
              disabled={isCompleted || completeTaskMutation.isPending}
              className="mt-0.5"
              data-testid={`checkbox-task-${task.id}`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className={cn(
                  "font-medium",
                  isCompleted && "line-through text-muted-foreground"
                )}>
                  {task.title}
                </p>
                <div className={cn(
                  "rounded-full p-1.5 shrink-0",
                  isCompleted ? "bg-status-completed/10" : "bg-primary/10"
                )}>
                  <Icon className={cn(
                    "h-4 w-4",
                    isCompleted ? "text-status-completed" : "text-primary"
                  )} />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {task.unitCode && (
                  <Badge variant="outline" className="text-xs">
                    {task.unitCode}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground capitalize">
                  {task.type.replace(/_/g, " ")}
                </span>
                {task.createdBySystem && (
                  <Badge variant="secondary" className="text-xs">
                    Auto
                  </Badge>
                )}
              </div>
              {task.checklist && task.checklist.length > 0 && (
                <div className="mt-3 space-y-1">
                  {task.checklist.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header title="Tasks" />
      
      <PageContainer>
        <Tabs defaultValue="open" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="open" className="gap-2" data-testid="tab-open">
              <Clock className="h-4 w-4" />
              Open
              {openTasks.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {openTasks.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-2" data-testid="tab-completed">
              <CheckCircle2 className="h-4 w-4" />
              Done
            </TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="space-y-3">
            {isLoading ? (
              <>
                <TaskCardSkeleton />
                <TaskCardSkeleton />
                <TaskCardSkeleton />
              </>
            ) : openTasks.length > 0 ? (
              openTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))
            ) : (
              <Card>
                <CardContent className="p-6">
                  <EmptyState
                    icon={CheckCircle2}
                    title="All tasks completed!"
                    description="Great job! You've finished all your tasks."
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-3">
            {isLoading ? (
              <>
                <TaskCardSkeleton />
                <TaskCardSkeleton />
              </>
            ) : completedTasks.length > 0 ? (
              completedTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))
            ) : (
              <Card>
                <CardContent className="p-6">
                  <EmptyState
                    icon={ClipboardList}
                    title="No completed tasks"
                    description="Tasks you complete will appear here."
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
