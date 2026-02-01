import { cn } from "@/lib/utils";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Spinner({ size = "md", className }: SpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4 border-2",
    md: "h-6 w-6 border-2",
    lg: "h-8 w-8 border-3",
  };

  return (
    <div
      className={cn(
        "animate-spin rounded-full border-solid border-primary border-t-transparent",
        sizeClasses[size],
        className
      )}
      data-testid="spinner"
    />
  );
}

interface LoadingProps {
  text?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Loading({ text = "Загрузка...", size = "md", className }: LoadingProps) {
  return (
    <div className={cn("flex items-center justify-center gap-2", className)} data-testid="loading">
      <Spinner size={size} />
      {text && <span className="text-muted-foreground">{text}</span>}
    </div>
  );
}

export function PageLoading({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] gap-3" data-testid="page-loading">
      <Spinner size="lg" />
      {text && <p className="text-muted-foreground">{text}</p>}
    </div>
  );
}
