import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { 
  User, 
  Phone,
  Star,
  AlertTriangle,
  Ban,
  MessageSquare,
  CheckCircle,
  Search
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { Guest, GuestRating } from "@shared/schema";

const RATING_LABELS: Record<GuestRating, { label: string; color: string; icon: typeof Star }> = {
  excellent: { label: "Отлично", color: "bg-green-500/20 text-green-700 dark:text-green-400", icon: Star },
  good: { label: "Хорошо", color: "bg-blue-500/20 text-blue-700 dark:text-blue-400", icon: CheckCircle },
  neutral: { label: "Нейтрально", color: "bg-gray-500/20 text-gray-700 dark:text-gray-400", icon: User },
  problematic: { label: "Проблемный", color: "bg-orange-500/20 text-orange-700 dark:text-orange-400", icon: AlertTriangle },
  blacklisted: { label: "Чёрный список", color: "bg-red-500/20 text-red-700 dark:text-red-400", icon: Ban },
};

function GuestCard({ guest, onEdit }: { guest: Guest; onEdit: (guest: Guest) => void }) {
  const ratingInfo = guest.rating ? RATING_LABELS[guest.rating] : null;
  const RatingIcon = ratingInfo?.icon;

  return (
    <Card 
      className={`${guest.isBlacklisted ? "border-red-500/50" : ""}`}
      data-testid={`card-guest-${guest.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate" data-testid={`text-guest-name-${guest.id}`}>
                {guest.fullName || "Без имени"}
              </span>
              {guest.isBlacklisted && (
                <Badge variant="destructive" className="text-xs" data-testid={`badge-blacklisted-${guest.id}`}>
                  <Ban className="w-3 h-3 mr-1" />
                  ЧС
                </Badge>
              )}
              {ratingInfo && !guest.isBlacklisted && (
                <Badge className={`text-xs ${ratingInfo.color}`} data-testid={`badge-rating-${guest.id}`}>
                  {RatingIcon && <RatingIcon className="w-3 h-3 mr-1" />}
                  {ratingInfo.label}
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
              <Phone className="w-3 h-3" />
              <span data-testid={`text-guest-phone-${guest.id}`}>{guest.phone}</span>
            </div>
            
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span>Визиты: {guest.completedVisits}/{guest.totalVisits}</span>
              {guest.noShowCount > 0 && (
                <span className="text-orange-600 dark:text-orange-400">
                  Неявки: {guest.noShowCount}
                </span>
              )}
              {guest.lastVisitAt && (
                <span>
                  Посл.: {format(new Date(guest.lastVisitAt), "dd.MM.yy", { locale: ru })}
                </span>
              )}
            </div>
            
            {guest.notes && (
              <div className="mt-2 p-2 bg-muted rounded-md text-sm">
                <MessageSquare className="w-3 h-3 inline mr-1" />
                {guest.notes}
              </div>
            )}
          </div>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onEdit(guest)}
            data-testid={`button-edit-guest-${guest.id}`}
          >
            Изменить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GuestsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editRating, setEditRating] = useState<GuestRating | "">("");
  const [editBlacklisted, setEditBlacklisted] = useState(false);

  const { data: guests = [], isLoading } = useQuery<Guest[]>({
    queryKey: ["/api/guests"],
  });

  const updateGuestMutation = useMutation({
    mutationFn: async ({ id, notes, rating, isBlacklisted }: { 
      id: string; 
      notes?: string; 
      rating?: GuestRating; 
      isBlacklisted?: boolean;
    }) => {
      const response = await apiRequest("PATCH", `/api/guests/${id}`, {
        notes,
        rating: rating || undefined,
        isBlacklisted,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      toast({ title: "Гость обновлён" });
      setEditDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Ошибка обновления", variant: "destructive" });
    },
  });

  const handleEdit = (guest: Guest) => {
    setSelectedGuest(guest);
    setEditNotes(guest.notes || "");
    setEditRating(guest.rating || "");
    setEditBlacklisted(guest.isBlacklisted);
    setEditDialogOpen(true);
  };

  const handleSave = () => {
    if (!selectedGuest) return;
    updateGuestMutation.mutate({
      id: selectedGuest.id,
      notes: editNotes || undefined,
      rating: editRating || undefined,
      isBlacklisted: editBlacklisted,
    });
  };

  const filteredGuests = guests.filter(g => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      g.fullName?.toLowerCase().includes(query) ||
      g.phone.includes(query) ||
      g.notes?.toLowerCase().includes(query)
    );
  });

  const blacklistedGuests = filteredGuests.filter(g => g.isBlacklisted);
  const problematicGuests = filteredGuests.filter(g => !g.isBlacklisted && g.rating === "problematic");
  const regularGuests = filteredGuests.filter(g => !g.isBlacklisted && g.rating !== "problematic");

  return (
    <PageContainer>
      <Header title="Гости" showBack />
      
      <div className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени, телефону..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-guests"
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-5 w-32 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredGuests.length === 0 ? (
          <EmptyState
            icon={User}
            title="Гости не найдены"
            description={searchQuery ? "Попробуйте изменить запрос поиска" : "Гости появятся после первого бронирования"}
          />
        ) : (
          <div className="space-y-4">
            {blacklistedGuests.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2 flex items-center gap-1">
                  <Ban className="w-4 h-4" />
                  Чёрный список ({blacklistedGuests.length})
                </h3>
                <div className="space-y-2">
                  {blacklistedGuests.map(guest => (
                    <GuestCard key={guest.id} guest={guest} onEdit={handleEdit} />
                  ))}
                </div>
              </div>
            )}

            {problematicGuests.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-orange-600 dark:text-orange-400 mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  Проблемные ({problematicGuests.length})
                </h3>
                <div className="space-y-2">
                  {problematicGuests.map(guest => (
                    <GuestCard key={guest.id} guest={guest} onEdit={handleEdit} />
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Все гости ({regularGuests.length})
              </h3>
              <div className="space-y-2">
                {regularGuests.map(guest => (
                  <GuestCard key={guest.id} guest={guest} onEdit={handleEdit} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать гостя</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Имя</Label>
              <p className="text-sm">{selectedGuest?.fullName || "Без имени"}</p>
            </div>
            
            <div>
              <Label>Телефон</Label>
              <p className="text-sm">{selectedGuest?.phone}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rating">Рейтинг</Label>
              <Select 
                value={editRating} 
                onValueChange={(v) => setEditRating(v as GuestRating)}
              >
                <SelectTrigger data-testid="select-rating">
                  <SelectValue placeholder="Выберите рейтинг" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excellent">Отлично</SelectItem>
                  <SelectItem value="good">Хорошо</SelectItem>
                  <SelectItem value="neutral">Нейтрально</SelectItem>
                  <SelectItem value="problematic">Проблемный</SelectItem>
                  <SelectItem value="blacklisted">Чёрный список</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="blacklisted"
                checked={editBlacklisted}
                onChange={(e) => setEditBlacklisted(e.target.checked)}
                className="w-4 h-4"
                data-testid="checkbox-blacklisted"
              />
              <Label htmlFor="blacklisted" className="text-red-600 dark:text-red-400 flex items-center gap-1">
                <Ban className="w-4 h-4" />
                В чёрном списке
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Заметки</Label>
              <Textarea
                id="notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Заметки о госте..."
                rows={3}
                data-testid="textarea-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Отмена
            </Button>
            <Button 
              onClick={handleSave}
              disabled={updateGuestMutation.isPending}
              data-testid="button-save-guest"
            >
              {updateGuestMutation.isPending ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </PageContainer>
  );
}
