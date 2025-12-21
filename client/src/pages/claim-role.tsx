import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Shield, Phone } from "lucide-react";

export default function ClaimRolePage() {
  const [phone, setPhone] = useState("+375");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const formatPhone = (value: string) => {
    // Keep only digits and +
    let digits = value.replace(/[^\d+]/g, "");
    if (!digits.startsWith("+")) {
      digits = "+" + digits;
    }
    return digits;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (phone.length < 12) {
      toast({
        title: "Ошибка",
        description: "Введите корректный номер телефона",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      const tgWebApp = window.Telegram?.WebApp;
      let initData = tgWebApp?.initData;
      
      if (!initData) {
        if (import.meta.env.DEV) {
          initData = "user=" + encodeURIComponent(JSON.stringify({
            id: Date.now(),
            first_name: "Тест",
            last_name: "Админ",
          })) + "&auth_date=" + Math.floor(Date.now() / 1000) + "&hash=dev";
        } else {
          toast({
            title: "Ошибка",
            description: "Откройте приложение через Telegram",
            variant: "destructive",
          });
          return;
        }
      }
      
      const response = await apiRequest("POST", "/api/auth/telegram", { 
        initData,
        phone: formatPhone(phone),
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
            description: `Вы авторизованы как ${data.user.role === "ADMIN" ? "Администратор" : data.user.role}`,
          });
          setLocation("/ops");
        } else {
          toast({
            title: "Номер не найден",
            description: "Данный номер не зарегистрирован в системе персонала",
            variant: "destructive",
          });
        }
        
        // Reload to update auth state
        window.location.reload();
      }
    } catch (error) {
      console.error("[ClaimRole] Error:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось авторизоваться",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
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
            Введите номер телефона, зарегистрированный в системе
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Номер телефона</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  placeholder="+375 (XX) XXX-XX-XX"
                  className="pl-10"
                  data-testid="input-phone"
                />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
              data-testid="button-claim-role"
            >
              {isLoading ? "Проверка..." : "Войти"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
