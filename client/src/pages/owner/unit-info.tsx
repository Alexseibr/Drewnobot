import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Save, QrCode, Wifi, Phone, Home, Clock } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Unit, UnitInfo } from "@shared/schema";

export default function UnitInfoPage() {
  const { toast } = useToast();
  const [activeUnit, setActiveUnit] = useState<string | null>(null);
  const [editingInfo, setEditingInfo] = useState<Partial<UnitInfo>>({});

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["/api/units"],
  });
  
  const { data: unitInfos = [] } = useQuery<UnitInfo[]>({
    queryKey: ["/api/unit-info"],
  });

  const saveMutation = useMutation({
    mutationFn: async ({ unitCode, info }: { unitCode: string; info: Partial<UnitInfo> }) => {
      const token = localStorage.getItem("drewno_session");
      // Clean payload - only include defined string fields
      const payload: Record<string, string> = {};
      if (info.wifiName) payload.wifiName = info.wifiName;
      if (info.wifiPassword) payload.wifiPassword = info.wifiPassword;
      if (info.checkInTime) payload.checkInTime = info.checkInTime;
      if (info.checkOutTime) payload.checkOutTime = info.checkOutTime;
      if (info.contactPhone) payload.contactPhone = info.contactPhone;
      if (info.rules) payload.rules = info.rules;
      
      const res = await fetch(`/api/unit-info/${unitCode}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/unit-info"] });
      toast({ title: "Информация сохранена" });
    },
  });

  const handleUnitSelect = (unitCode: string) => {
    setActiveUnit(unitCode);
    const existing = unitInfos.find((u) => u.unitCode === unitCode);
    setEditingInfo(existing || { unitCode });
  };

  const handleSave = () => {
    if (!activeUnit) return;
    saveMutation.mutate({ unitCode: activeUnit, info: editingInfo });
  };

  const getQrCodeUrl = (unitCode: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/unit/${unitCode}`;
  };

  const generateQrSvg = (data: string, size: number = 200) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
  };

  const cottages = units.filter((u) => u.type === "cottage");
  const baths = units.filter((u) => u.type === "bath");

  return (
    <div className="min-h-screen bg-background pb-56">
      <header className="sticky top-0 z-50 bg-background border-b p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link href="/owner/settings">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-lg font-semibold">Информация для гостей (QR)</h1>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <Tabs defaultValue="cottages">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="cottages" className="flex-1" data-testid="tab-cottages">
              Домики ({cottages.length})
            </TabsTrigger>
            <TabsTrigger value="baths" className="flex-1" data-testid="tab-baths">
              Бани ({baths.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cottages" className="space-y-3">
            {cottages.map((unit) => {
              const info = unitInfos.find((u) => u.unitCode === unit.code);
              return (
                <Card
                  key={unit.code}
                  className={`cursor-pointer hover-elevate ${activeUnit === unit.code ? "border-primary" : ""}`}
                  onClick={() => handleUnitSelect(unit.code)}
                  data-testid={`unit-card-${unit.code}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Home className="h-4 w-4" />
                        {unit.title}
                      </CardTitle>
                      {info && <QrCode className="h-4 w-4 text-green-600" />}
                    </div>
                    <CardDescription>
                      {info ? "Настроено" : "Не настроено"}
                    </CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="baths" className="space-y-3">
            {baths.map((unit) => {
              const info = unitInfos.find((u) => u.unitCode === unit.code);
              return (
                <Card
                  key={unit.code}
                  className={`cursor-pointer hover-elevate ${activeUnit === unit.code ? "border-primary" : ""}`}
                  onClick={() => handleUnitSelect(unit.code)}
                  data-testid={`unit-card-${unit.code}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Home className="h-4 w-4" />
                        {unit.title}
                      </CardTitle>
                      {info && <QrCode className="h-4 w-4 text-green-600" />}
                    </div>
                    <CardDescription>
                      {info ? "Настроено" : "Не настроено"}
                    </CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>

        {activeUnit && (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="text-sm">Редактирование: {units.find(u => u.code === activeUnit)?.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-1">
                    <Wifi className="h-3 w-3" /> WiFi Сеть
                  </Label>
                  <Input
                    value={editingInfo.wifiName || ""}
                    onChange={(e) => setEditingInfo({ ...editingInfo, wifiName: e.target.value })}
                    placeholder="VillageDrewno"
                    data-testid="input-wifi-ssid"
                  />
                </div>
                <div>
                  <Label>WiFi Пароль</Label>
                  <Input
                    value={editingInfo.wifiPassword || ""}
                    onChange={(e) => setEditingInfo({ ...editingInfo, wifiPassword: e.target.value })}
                    placeholder="********"
                    data-testid="input-wifi-password"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Заезд
                  </Label>
                  <Input
                    value={editingInfo.checkInTime || ""}
                    onChange={(e) => setEditingInfo({ ...editingInfo, checkInTime: e.target.value })}
                    placeholder="14:00"
                    data-testid="input-checkin"
                  />
                </div>
                <div>
                  <Label>Выезд</Label>
                  <Input
                    value={editingInfo.checkOutTime || ""}
                    onChange={(e) => setEditingInfo({ ...editingInfo, checkOutTime: e.target.value })}
                    placeholder="12:00"
                    data-testid="input-checkout"
                  />
                </div>
              </div>

              <div>
                <Label className="flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Контактный телефон
                </Label>
                <Input
                  value={editingInfo.contactPhone || ""}
                  onChange={(e) => setEditingInfo({ ...editingInfo, contactPhone: e.target.value })}
                  placeholder="+375 29 123 45 67"
                  data-testid="input-contact-phone"
                />
              </div>

              <div>
                <Label>Правила дома</Label>
                <Textarea
                  value={editingInfo.rules || ""}
                  onChange={(e) => setEditingInfo({ ...editingInfo, rules: e.target.value })}
                  placeholder="Тишина после 23:00. Курение на улице. Домашние животные по согласованию."
                  rows={4}
                  data-testid="input-house-rules"
                />
              </div>

              <div className="flex items-center justify-between gap-4 pt-4 border-t">
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs text-muted-foreground">QR-код для гостей</p>
                  <img
                    src={generateQrSvg(getQrCodeUrl(activeUnit))}
                    alt="QR Code"
                    className="w-24 h-24 border rounded"
                  />
                  <p className="text-xs text-muted-foreground break-all max-w-[150px] text-center">
                    {getQrCodeUrl(activeUnit)}
                  </p>
                </div>
                <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-info">
                  <Save className="h-4 w-4 mr-2" />
                  {saveMutation.isPending ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
