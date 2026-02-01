import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Shield, Phone, AlertCircle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

export default function ClaimRolePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const tgWebApp = window.Telegram?.WebApp;
  const isTelegramAvailable = !!tgWebApp?.initData;

  useEffect(() => {
    if (!isTelegramAvailable && !import.meta.env.DEV) {
      setError("Откройте приложение через Telegram бота @Drewno_bot");
    }
  }, [isTelegramAvailable]);

  const handleRequestContact = async () => {
    if (!tgWebApp) {
      if (import.meta.env.DEV) {
        await handleAuthWithPhone("+375291234567");
        return;
      }
      setError("Telegram WebApp недоступен");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      tgWebApp.requestContact((sent: boolean, event?: { responseUnsafe?: { contact?: { phone_number?: string } } }) => {
        if (sent && event?.responseUnsafe?.contact?.phone_number) {
          const phone = "+" + event.responseUnsafe.contact.phone_number.replace(/^\+/, "");
          handleAuthWithPhone(phone);
        } else {
          setIsLoading(false);
          setError("Вы отменили запрос на доступ к контакту");
        }
      });
    } catch (err) {
      console.error("[ClaimRole] Request contact error:", err);
      setIsLoading(false);
      setError("Ошибка при запросе контакта");
    }
  };

  const handleAuthWithPhone = async (phone: string) => {
    try {
      let initData = tgWebApp?.initData;
      
      if (!initData && import.meta.env.DEV) {
        initData = "user=" + encodeURIComponent(JSON.stringify({
          id: Date.now(),
          first_name: "Тест",
          last_name: "Админ",
        })) + "&auth_date=" + Math.floor(Date.now() / 1000) + "&hash=dev";
      }
      
      if (!initData) {
        setError("Данные Telegram недоступны");
        setIsLoading(false);
        return;
      }
      
      const response = await apiRequest("POST", "/api/auth/telegram", { 
        initData,
        phone,
      });
      const data = await response.json();
      
      if (data.user && data.token) {
        localStorage.setItem("drewno-auth", JSON.stringify({ 
          user: data.user, 
          token: data.token 
        }));
        
        if (data.user.role !== "GUEST") {
          toast({
            title: "Успешно",
            description: `Вы авторизованы как ${getRoleName(data.user.role)}`,
          });
          setLocation("/ops");
        } else {
          setError("Ваш номер телефона не зарегистрирован в системе персонала. Обратитесь к владельцу для получения доступа.");
        }
        
        window.location.reload();
      }
    } catch (error) {
      console.error("[ClaimRole] Auth error:", error);
      setError("Не удалось авторизоваться. Попробуйте позже.");
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleName = (role: string) => {
    const names: Record<string, string> = {
      SUPER_ADMIN: "Супер-админ",
      OWNER: "Владелец",
      ADMIN: "Администратор",
      INSTRUCTOR: "Инструктор",
    };
    return names[role] || role;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Авторизация сотрудника</CardTitle>
          <CardDescription>
            Подтвердите свой номер телефона через Telegram для входа в систему
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          
          <div className="text-center text-sm text-muted-foreground space-y-2">
            <p>Нажмите кнопку ниже, чтобы поделиться своим контактом из Telegram.</p>
            <p>Это гарантирует безопасную авторизацию.</p>
          </div>
          
          <Button 
            onClick={handleRequestContact}
            className="w-full" 
            disabled={isLoading || (!isTelegramAvailable && !import.meta.env.DEV)}
            data-testid="button-request-contact"
          >
            {isLoading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Проверка...
              </>
            ) : (
              <>
                <Phone className="mr-2 h-4 w-4" />
                Поделиться контактом
              </>
            )}
          </Button>
          
          <p className="text-xs text-center text-muted-foreground">
            Ваш номер телефона будет использован только для проверки доступа к системе персонала
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
