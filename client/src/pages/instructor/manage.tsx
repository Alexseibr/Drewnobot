import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, UserPlus, Users, Trash2 } from "lucide-react";
import { Loading } from "@/components/ui/spinner";
import type { User } from "@shared/schema";

export default function InstructorManagePage() {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [newTelegramId, setNewTelegramId] = useState("");

  const { data: instructors = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/instructors"],
  });

  const addMutation = useMutation({
    mutationFn: async (data: { name: string; telegramId: string }) => {
      const res = await apiRequest("POST", "/api/instructors", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructors"] });
      toast({ title: "Инструктор добавлен" });
      setNewName("");
      setNewTelegramId("");
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось добавить инструктора", variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/instructors/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructors"] });
      toast({ title: "Инструктор удален" });
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось удалить инструктора", variant: "destructive" });
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newTelegramId.trim()) {
      toast({ title: "Заполните все поля", variant: "destructive" });
      return;
    }
    addMutation.mutate({ name: newName, telegramId: newTelegramId });
  };

  if (!hasRole("INSTRUCTOR", "ADMIN", "OWNER", "SUPER_ADMIN")) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Нет доступа</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background ">
      <header className="sticky top-0 z-50 bg-background border-b p-4">
        <div className="flex items-center gap-4">
          <Link href="/instructor">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Управление инструкторами</h1>
            <p className="text-sm text-muted-foreground">Добавление и удаление</p>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Добавить инструктора
            </CardTitle>
            <CardDescription>
              Укажите имя и Telegram ID нового инструктора
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Имя</Label>
                <Input
                  id="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Иван Петров"
                  data-testid="input-instructor-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telegramId">Telegram ID</Label>
                <Input
                  id="telegramId"
                  value={newTelegramId}
                  onChange={(e) => setNewTelegramId(e.target.value)}
                  placeholder="123456789"
                  data-testid="input-instructor-telegram"
                />
                <p className="text-xs text-muted-foreground">
                  Инструктор может узнать свой ID у бота @userinfobot
                </p>
              </div>
              <Button 
                type="submit" 
                className="w-full"
                disabled={addMutation.isPending}
                data-testid="button-add-instructor"
              >
                {addMutation.isPending ? "Добавление..." : "Добавить"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Список инструкторов
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loading size="sm" />
            ) : instructors.length === 0 ? (
              <p className="text-muted-foreground">Инструкторов пока нет</p>
            ) : (
              <div className="space-y-2">
                {instructors.map((instructor) => (
                  <div 
                    key={instructor.id}
                    className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                    data-testid={`instructor-${instructor.id}`}
                  >
                    <div>
                      <p className="font-medium">{instructor.name}</p>
                      <p className="text-sm text-muted-foreground">
                        ID: {instructor.telegramId}
                      </p>
                    </div>
                    {instructor.telegramId !== user?.telegramId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMutation.mutate(instructor.id)}
                        disabled={removeMutation.isPending}
                        data-testid={`button-remove-${instructor.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
