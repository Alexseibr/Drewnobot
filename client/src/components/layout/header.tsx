import { Moon, Sun, Menu, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme-provider";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import drewnoLogo from "@assets/drewno-logo.webp";

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  onMenuClick?: () => void;
}

export function Header({ title = "Village Drewno", showBack, onMenuClick }: HeaderProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const getRoleBadgeColor = () => {
    switch (user?.role) {
      case "OWNER":
        return "bg-primary text-primary-foreground";
      case "ADMIN":
        return "bg-status-confirmed text-white";
      case "INSTRUCTOR":
        return "bg-status-awaiting text-white";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
      <div className="flex items-center gap-3">
        {showBack ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.history.back()}
            data-testid="button-back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        ) : onMenuClick ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            data-testid="button-menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        ) : null}
        
        <div className="flex items-center gap-2">
          <img 
            src={drewnoLogo} 
            alt="Drewno" 
            className="h-8 w-8 rounded-md object-cover"
            data-testid="img-logo"
          />
          <h1 className="text-lg font-semibold tracking-tight" data-testid="text-header-title">
            {title}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {user && (
          <Badge className={`text-xs ${getRoleBadgeColor()}`} data-testid="badge-user-role">
            {user.role}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          data-testid="button-theme-toggle"
        >
          {resolvedTheme === "dark" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </Button>
      </div>
    </header>
  );
}
