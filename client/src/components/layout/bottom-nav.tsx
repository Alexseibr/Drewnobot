import { useLocation, Link } from "wouter";
import { 
  Home, 
  CalendarDays, 
  Wallet, 
  ClipboardList, 
  BarChart3,
  Bike,
  Flame,
  Settings,
  DollarSign,
  Wrench,
  Users,
  Shirt
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
}

const guestNavItems: NavItem[] = [
  { path: "/guest/spa", label: "СПА", icon: Flame },
  { path: "/guest/quads", label: "Квадро", icon: Bike },
];

const adminNavItems: NavItem[] = [
  { path: "/ops", label: "Сегодня", icon: Home },
  { path: "/ops/bookings", label: "Брони", icon: CalendarDays },
  { path: "/ops/cash", label: "Касса", icon: Wallet },
  { path: "/ops/laundry", label: "Прачечная", icon: Shirt },
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
  { path: "/owner/staff", label: "Персонал", icon: Users },
  { path: "/owner/settings", label: "Настройки", icon: Settings },
];

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();

  const getNavItems = (): NavItem[] => {
    if (!user) return guestNavItems;
    
    // Home link for all staff to access guest landing page
    const homeItem: NavItem = { path: "/", label: "Главная", icon: Home };
    
    switch (user.role) {
      case "SUPER_ADMIN":
      case "OWNER":
        return [homeItem, ...adminNavItems.slice(1), ...ownerNavItems];
      case "ADMIN":
        return [homeItem, ...adminNavItems.slice(1)];
      case "INSTRUCTOR":
        return [homeItem, ...instructorNavItems];
      default:
        return guestNavItems;
    }
  };

  const navItems = getNavItems();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 safe-area-bottom">
      <div className="flex flex-wrap items-center justify-around px-2 py-2 gap-1">
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
