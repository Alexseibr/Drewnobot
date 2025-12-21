import { useLocation, Link } from "wouter";
import { 
  Home, 
  CalendarDays, 
  Wallet, 
  ClipboardList, 
  BarChart3,
  Bike,
  Bath,
  Settings,
  DollarSign,
  Wrench
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  roles?: string[];
}

const guestNavItems: NavItem[] = [
  { path: "/guest/bath", label: "Баня", icon: Bath },
  { path: "/guest/quads", label: "Квадро", icon: Bike },
];

const adminNavItems: NavItem[] = [
  { path: "/ops", label: "Сегодня", icon: Home },
  { path: "/ops/bookings", label: "Брони", icon: CalendarDays },
  { path: "/ops/cash", label: "Касса", icon: Wallet },
  { path: "/ops/tasks", label: "Задачи", icon: ClipboardList },
];

const instructorNavItems: NavItem[] = [
  { path: "/instructor", label: "Расписание", icon: CalendarDays },
  { path: "/instructor/maintenance", label: "Сервис", icon: Wrench },
  { path: "/instructor/finances", label: "Финансы", icon: Wallet },
  { path: "/instructor/pricing", label: "Цены", icon: DollarSign },
];

const ownerNavItems: NavItem[] = [
  { path: "/owner/cash", label: "Инкасация", icon: Wallet },
  { path: "/owner/analytics", label: "Аналитика", icon: BarChart3 },
  { path: "/owner/settings", label: "Настройки", icon: Settings },
];

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();

  const getNavItems = (): NavItem[] => {
    if (!user) return guestNavItems;
    
    switch (user.role) {
      case "OWNER":
        return [...adminNavItems, ...ownerNavItems];
      case "ADMIN":
        return adminNavItems;
      case "INSTRUCTOR":
        return instructorNavItems;
      default:
        return guestNavItems;
    }
  };

  const navItems = getNavItems();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 safe-area-bottom">
      <div className="flex h-16 items-center justify-around px-2">
        {navItems.map((item) => {
          const isActive = location === item.path || location.startsWith(item.path + "/");
          const Icon = item.icon;
          
          return (
            <Link key={item.path} href={item.path}>
              <button
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-lg px-3 py-2 min-w-[64px] transition-colors hover-elevate",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
                <span className={cn(
                  "text-xs font-medium",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {item.label}
                </span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
