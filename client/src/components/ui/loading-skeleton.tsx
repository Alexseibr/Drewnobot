import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function BookingCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="flex gap-2 mt-4">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 flex-1" />
      </div>
    </Card>
  );
}

export function TaskCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-5 rounded" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-6 w-12 rounded-full" />
      </div>
    </Card>
  );
}

export function CashCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <Skeleton className="h-5 w-16" />
      </div>
    </Card>
  );
}

export function StatsCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    </Card>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-48 mb-6" />
      <div className="grid grid-cols-2 gap-4">
        <StatsCardSkeleton />
        <StatsCardSkeleton />
      </div>
      <div className="space-y-3">
        <BookingCardSkeleton />
        <BookingCardSkeleton />
        <BookingCardSkeleton />
      </div>
    </div>
  );
}
