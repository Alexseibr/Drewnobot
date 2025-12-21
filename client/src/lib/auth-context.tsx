import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { UserRole } from "@shared/schema";
import { apiRequest } from "./queryClient";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
        disableVerticalSwipes: () => void;
        enableVerticalSwipes: () => void;
        isVerticalSwipesEnabled: boolean;
      };
    };
  }
}

type AuthUser = {
  id: string;
  telegramId: string;
  name: string;
  role: UserRole;
};

type AuthContextType = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  hasRole: (...roles: UserRole[]) => boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isSuperAdmin: boolean;
  isStaff: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "drewno-auth";
const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 5,
  OWNER: 4,
  ADMIN: 3,
  INSTRUCTOR: 2,
  GUEST: 1,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const saveAuth = useCallback((userData: AuthUser | null, authToken: string | null) => {
    if (userData && authToken) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: userData, token: authToken }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setUser(userData);
    setToken(authToken);
  }, []);

  const login = useCallback(async () => {
    try {
      const tgWebApp = window.Telegram?.WebApp;
      let initData = tgWebApp?.initData;
      
      if (!initData) {
        if (process.env.NODE_ENV === "development" || import.meta.env.DEV) {
          initData = "user=" + encodeURIComponent(JSON.stringify({
            id: 123456789,
            first_name: "Тест",
            last_name: "Пользователь",
            username: "test_user",
          })) + "&auth_date=" + Math.floor(Date.now() / 1000) + "&hash=dev";
        } else {
          console.warn("[Auth] No Telegram initData available");
          return;
        }
      }
      
      const response = await apiRequest("POST", "/api/auth/telegram", { initData });
      const data = await response.json();
      
      if (data.user && data.token) {
        saveAuth(data.user, data.token);
      }
    } catch (error) {
      console.error("[Auth] Login failed:", error);
    }
  }, [saveAuth]);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });
      } catch (error) {
        console.error("[Auth] Logout error:", error);
      }
    }
    saveAuth(null, null);
  }, [token, saveAuth]);

  useEffect(() => {
    // Initialize Telegram WebApp - disable vertical swipes to prevent accidental closing
    const tgWebApp = window.Telegram?.WebApp;
    if (tgWebApp) {
      tgWebApp.ready();
      tgWebApp.expand();
      if (typeof tgWebApp.disableVerticalSwipes === 'function') {
        tgWebApp.disableVerticalSwipes();
      }
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const { user: storedUser, token: storedToken } = JSON.parse(stored);
        if (storedUser && storedToken) {
          setUser(storedUser);
          setToken(storedToken);
          
          fetch("/api/auth/me", {
            headers: { "Authorization": `Bearer ${storedToken}` },
          })
            .then(res => {
              if (res.ok) return res.json();
              throw new Error("Session expired");
            })
            .then(userData => {
              saveAuth(userData, storedToken);
            })
            .catch(() => {
              saveAuth(null, null);
              login();
            });
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        login();
      }
    } else {
      login();
    }
    setIsLoading(false);
  }, [login, saveAuth]);

  const hasRole = useCallback((...roles: UserRole[]): boolean => {
    if (!user) return false;
    if (user.role === "SUPER_ADMIN") return true;
    return roles.some(role => {
      if (role === user.role) return true;
      if (user.role === "OWNER" && role !== "SUPER_ADMIN") return true;
      return false;
    });
  }, [user]);

  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isStaff = user?.role !== "GUEST" && !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        hasRole,
        isLoading,
        login,
        logout,
        isSuperAdmin,
        isStaff,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export function getAuthToken(): string | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const { token } = JSON.parse(stored);
      return token;
    } catch {
      return null;
    }
  }
  return null;
}
