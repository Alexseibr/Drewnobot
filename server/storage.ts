import { randomUUID } from "crypto";
import type {
  User, InsertUser,
  Unit, InsertUnit,
  CleaningTariff,
  ServicePrice,
  CottageBooking, InsertCottageBooking,
  BathBooking, InsertBathBooking,
  Task, InsertTask,
  CashShift, InsertCashShift,
  CashTransaction, InsertCashTransaction,
  WorkLog, InsertWorkLog,
  QuadSession, InsertQuadSession,
  QuadBooking, InsertQuadBooking,
  SiteSettings,
  AnalyticsSummary,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByTelegramId(telegramId: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  
  getUnits(): Promise<Unit[]>;
  getUnit(code: string): Promise<Unit | undefined>;
  createUnit(unit: InsertUnit): Promise<Unit>;
  
  getCleaningTariffs(): Promise<CleaningTariff[]>;
  getServicePrices(): Promise<ServicePrice[]>;
  getServicePrice(key: string): Promise<ServicePrice | undefined>;
  
  getCottageBookings(): Promise<CottageBooking[]>;
  getCottageBookingsUpcoming(): Promise<CottageBooking[]>;
  getCottageBooking(id: string): Promise<CottageBooking | undefined>;
  createCottageBooking(booking: InsertCottageBooking): Promise<CottageBooking>;
  updateCottageBooking(id: string, updates: Partial<CottageBooking>): Promise<CottageBooking | undefined>;
  
  getBathBookings(): Promise<BathBooking[]>;
  getBathBookingsUpcoming(): Promise<BathBooking[]>;
  getBathBooking(id: string): Promise<BathBooking | undefined>;
  getBathBookingsForDate(date: string): Promise<BathBooking[]>;
  createBathBooking(booking: InsertBathBooking): Promise<BathBooking>;
  updateBathBooking(id: string, updates: Partial<BathBooking>): Promise<BathBooking | undefined>;
  
  getTasks(): Promise<Task[]>;
  getTasksForDate(date: string): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined>;
  
  getCashShifts(): Promise<CashShift[]>;
  getCurrentShift(): Promise<CashShift | undefined>;
  getCashShift(id: string): Promise<CashShift | undefined>;
  createCashShift(shift: InsertCashShift): Promise<CashShift>;
  updateCashShift(id: string, updates: Partial<CashShift>): Promise<CashShift | undefined>;
  
  getCashTransactions(shiftId?: string): Promise<CashTransaction[]>;
  createCashTransaction(tx: InsertCashTransaction): Promise<CashTransaction>;
  
  getWorkLogs(): Promise<WorkLog[]>;
  createWorkLog(log: InsertWorkLog): Promise<WorkLog>;
  
  getQuadSessions(): Promise<QuadSession[]>;
  getQuadSessionsForDate(date: string): Promise<QuadSession[]>;
  getQuadSession(id: string): Promise<QuadSession | undefined>;
  createQuadSession(session: InsertQuadSession): Promise<QuadSession>;
  updateQuadSession(id: string, updates: Partial<QuadSession>): Promise<QuadSession | undefined>;
  
  getQuadBookings(): Promise<QuadBooking[]>;
  getQuadBookingsForSession(sessionId: string): Promise<QuadBooking[]>;
  getQuadBooking(id: string): Promise<QuadBooking | undefined>;
  createQuadBooking(booking: InsertQuadBooking): Promise<QuadBooking>;
  updateQuadBooking(id: string, updates: Partial<QuadBooking>): Promise<QuadBooking | undefined>;
  
  getSiteSettings(): Promise<SiteSettings>;
  updateSiteSettings(updates: Partial<SiteSettings>): Promise<SiteSettings>;
  
  getAnalyticsSummary(month: string): Promise<AnalyticsSummary>;
}

const PRICES: Record<string, number> = {
  bath_base_3h: 150,
  bath_extra_hour: 30,
  tub_small: 150,
  tub_large: 180,
  grill: 10,
  charcoal: 15,
  quad_30m: 40,
  quad_60m: 80,
};

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private units: Map<string, Unit> = new Map();
  private cleaningTariffs: Map<string, CleaningTariff> = new Map();
  private servicePrices: Map<string, ServicePrice> = new Map();
  private cottageBookings: Map<string, CottageBooking> = new Map();
  private bathBookings: Map<string, BathBooking> = new Map();
  private tasks: Map<string, Task> = new Map();
  private cashShifts: Map<string, CashShift> = new Map();
  private cashTransactions: Map<string, CashTransaction> = new Map();
  private workLogs: Map<string, WorkLog> = new Map();
  private quadSessions: Map<string, QuadSession> = new Map();
  private quadBookings: Map<string, QuadBooking> = new Map();
  private siteSettings: SiteSettings;

  constructor() {
    this.initializeDefaults();
    this.siteSettings = {
      id: randomUUID(),
      geofenceCenter: { lat: 53.9, lng: 27.5667 },
      geofenceRadiusM: 300,
      closeTime: "22:00",
      timezone: "Europe/Minsk",
    };
  }

  private initializeDefaults() {
    const units: InsertUnit[] = [
      { type: "cottage", code: "C1", title: "Cottage 1", cleaningTariffCode: "A", tubPolicy: "small_only", images: [] },
      { type: "cottage", code: "C2", title: "Cottage 2", cleaningTariffCode: "A", tubPolicy: "small_only", images: [] },
      { type: "cottage", code: "C3", title: "Cottage 3", cleaningTariffCode: "A", tubPolicy: "small_only", images: [] },
      { type: "cottage", code: "C4", title: "Cottage 4", cleaningTariffCode: "B", tubPolicy: "small_only", images: [] },
      { type: "bath", code: "B1", title: "Bath 1", cleaningTariffCode: "C", tubPolicy: "small_or_large", images: [] },
      { type: "bath", code: "B2", title: "Bath 2", cleaningTariffCode: "C", tubPolicy: "small_or_large", images: [] },
    ];
    units.forEach(u => {
      const unit: Unit = { id: randomUUID(), ...u };
      this.units.set(unit.id, unit);
    });

    const tariffs: CleaningTariff[] = [
      { id: randomUUID(), code: "A", title: "Standard Cottage", price: 50 },
      { id: randomUUID(), code: "B", title: "Large Cottage", price: 70 },
      { id: randomUUID(), code: "C", title: "Bath", price: 40 },
    ];
    tariffs.forEach(t => this.cleaningTariffs.set(t.id, t));

    Object.entries(PRICES).forEach(([key, price]) => {
      const sp: ServicePrice = { id: randomUUID(), key, price, currency: "BYN" };
      this.servicePrices.set(sp.id, sp);
    });

    const demoUser: User = {
      id: randomUUID(),
      telegramId: "demo-owner",
      name: "Demo Owner",
      role: "OWNER",
      isActive: true,
    };
    this.users.set(demoUser.id, demoUser);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByTelegramId(telegramId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.telegramId === telegramId);
  }

  async getUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = { id: randomUUID(), ...insertUser };
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  async getUnits(): Promise<Unit[]> {
    return Array.from(this.units.values());
  }

  async getUnit(code: string): Promise<Unit | undefined> {
    return Array.from(this.units.values()).find(u => u.code === code);
  }

  async createUnit(insertUnit: InsertUnit): Promise<Unit> {
    const unit: Unit = { id: randomUUID(), ...insertUnit };
    this.units.set(unit.id, unit);
    return unit;
  }

  async getCleaningTariffs(): Promise<CleaningTariff[]> {
    return Array.from(this.cleaningTariffs.values());
  }

  async getServicePrices(): Promise<ServicePrice[]> {
    return Array.from(this.servicePrices.values());
  }

  async getServicePrice(key: string): Promise<ServicePrice | undefined> {
    return Array.from(this.servicePrices.values()).find(p => p.key === key);
  }

  async getCottageBookings(): Promise<CottageBooking[]> {
    return Array.from(this.cottageBookings.values());
  }

  async getCottageBookingsUpcoming(): Promise<CottageBooking[]> {
    const today = new Date().toISOString().split("T")[0];
    return Array.from(this.cottageBookings.values()).filter(b => b.dateCheckOut >= today);
  }

  async getCottageBooking(id: string): Promise<CottageBooking | undefined> {
    return this.cottageBookings.get(id);
  }

  async createCottageBooking(insertBooking: InsertCottageBooking): Promise<CottageBooking> {
    const booking: CottageBooking = {
      id: randomUUID(),
      ...insertBooking,
      payments: insertBooking.payments || { erip: 0, cash: 0 },
      status: insertBooking.status || "planned",
      createdAt: new Date().toISOString(),
    };
    this.cottageBookings.set(booking.id, booking);
    return booking;
  }

  async updateCottageBooking(id: string, updates: Partial<CottageBooking>): Promise<CottageBooking | undefined> {
    const booking = this.cottageBookings.get(id);
    if (!booking) return undefined;
    const updated = { ...booking, ...updates };
    this.cottageBookings.set(id, updated);
    return updated;
  }

  async getBathBookings(): Promise<BathBooking[]> {
    return Array.from(this.bathBookings.values());
  }

  async getBathBookingsUpcoming(): Promise<BathBooking[]> {
    const today = new Date().toISOString().split("T")[0];
    return Array.from(this.bathBookings.values()).filter(b => b.date >= today && b.status !== "cancelled" && b.status !== "expired");
  }

  async getBathBooking(id: string): Promise<BathBooking | undefined> {
    return this.bathBookings.get(id);
  }

  async getBathBookingsForDate(date: string): Promise<BathBooking[]> {
    return Array.from(this.bathBookings.values()).filter(b => b.date === date);
  }

  async createBathBooking(insertBooking: InsertBathBooking): Promise<BathBooking> {
    const prices = await this.getServicePrices();
    const getPrice = (key: string) => prices.find(p => p.key === key)?.price || PRICES[key] || 0;

    const startHour = parseInt(insertBooking.startTime.split(":")[0]);
    const endHour = parseInt(insertBooking.endTime.split(":")[0]);
    const hours = endHour - startHour;

    let base = getPrice("bath_base_3h");
    let extras = 0;
    if (hours > 3) extras += (hours - 3) * getPrice("bath_extra_hour");
    if (insertBooking.options.tub === "small") extras += getPrice("tub_small");
    if (insertBooking.options.tub === "large") extras += getPrice("tub_large");
    if (insertBooking.options.grill) extras += getPrice("grill");
    if (insertBooking.options.charcoal) extras += getPrice("charcoal");

    const booking: BathBooking = {
      id: randomUUID(),
      bathCode: insertBooking.bathCode,
      date: insertBooking.date,
      startTime: insertBooking.startTime,
      endTime: insertBooking.endTime,
      customer: insertBooking.customer,
      options: insertBooking.options || { tub: "none", grill: false, charcoal: false },
      pricing: { base, extras, total: base + extras },
      payments: { eripPaid: 0, cashPaid: 0 },
      status: "pending_call",
      createdAt: new Date().toISOString(),
    };
    this.bathBookings.set(booking.id, booking);
    return booking;
  }

  async updateBathBooking(id: string, updates: Partial<BathBooking>): Promise<BathBooking | undefined> {
    const booking = this.bathBookings.get(id);
    if (!booking) return undefined;
    const updated = { ...booking, ...updates };
    this.bathBookings.set(id, updated);
    return updated;
  }

  async getTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values());
  }

  async getTasksForDate(date: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(t => t.date === date);
  }

  async getTask(id: string): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const task: Task = {
      id: randomUUID(),
      ...insertTask,
      status: insertTask.status || "open",
      createdAt: new Date().toISOString(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined> {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    const updated = { ...task, ...updates };
    this.tasks.set(id, updated);
    return updated;
  }

  async getCashShifts(): Promise<CashShift[]> {
    return Array.from(this.cashShifts.values());
  }

  async getCurrentShift(): Promise<CashShift | undefined> {
    return Array.from(this.cashShifts.values()).find(s => s.isOpen);
  }

  async getCashShift(id: string): Promise<CashShift | undefined> {
    return this.cashShifts.get(id);
  }

  async createCashShift(insertShift: InsertCashShift): Promise<CashShift> {
    const shift: CashShift = {
      id: randomUUID(),
      openedAt: new Date().toISOString(),
      openedBy: insertShift.openedBy,
      isOpen: true,
      visibleToAdmin: true,
    };
    this.cashShifts.set(shift.id, shift);
    return shift;
  }

  async updateCashShift(id: string, updates: Partial<CashShift>): Promise<CashShift | undefined> {
    const shift = this.cashShifts.get(id);
    if (!shift) return undefined;
    const updated = { ...shift, ...updates };
    this.cashShifts.set(id, updated);
    return updated;
  }

  async getCashTransactions(shiftId?: string): Promise<CashTransaction[]> {
    const all = Array.from(this.cashTransactions.values());
    if (shiftId) return all.filter(t => t.shiftId === shiftId);
    return all;
  }

  async createCashTransaction(insertTx: InsertCashTransaction): Promise<CashTransaction> {
    const tx: CashTransaction = {
      id: randomUUID(),
      ...insertTx,
      createdAt: new Date().toISOString(),
    };
    this.cashTransactions.set(tx.id, tx);
    return tx;
  }

  async getWorkLogs(): Promise<WorkLog[]> {
    return Array.from(this.workLogs.values());
  }

  async createWorkLog(insertLog: InsertWorkLog): Promise<WorkLog> {
    const startTime = new Date(insertLog.startAt).getTime();
    const endTime = new Date(insertLog.endAt).getTime();
    const durationMinutes = Math.round((endTime - startTime) / 60000);

    const log: WorkLog = {
      id: randomUUID(),
      ...insertLog,
      durationMinutes,
      createdAt: new Date().toISOString(),
    };
    this.workLogs.set(log.id, log);
    return log;
  }

  async getQuadSessions(): Promise<QuadSession[]> {
    return Array.from(this.quadSessions.values());
  }

  async getQuadSessionsForDate(date: string): Promise<QuadSession[]> {
    return Array.from(this.quadSessions.values()).filter(s => s.date === date);
  }

  async getQuadSession(id: string): Promise<QuadSession | undefined> {
    return this.quadSessions.get(id);
  }

  async createQuadSession(insertSession: InsertQuadSession): Promise<QuadSession> {
    const prices = await this.getServicePrices();
    const base30 = prices.find(p => p.key === "quad_30m")?.price || PRICES.quad_30m;
    const base60 = prices.find(p => p.key === "quad_60m")?.price || PRICES.quad_60m;

    const endHour = parseInt(insertSession.endTime.split(":")[0]);
    const endMin = parseInt(insertSession.endTime.split(":")[1]) || 0;
    const bufferHour = endHour + (endMin >= 30 ? 1 : 0);
    const bufferMin = (endMin + 30) % 60;
    const bufferUntil = `${bufferHour.toString().padStart(2, "0")}:${bufferMin.toString().padStart(2, "0")}`;

    const session: QuadSession = {
      id: randomUUID(),
      date: insertSession.date,
      startTime: insertSession.startTime,
      endTime: insertSession.endTime,
      bufferUntil,
      totalQuads: 4,
      bookedQuads: 0,
      status: "open",
      priceRuleSnapshot: { base30, base60 },
      createdBy: insertSession.createdBy,
      createdAt: new Date().toISOString(),
    };
    this.quadSessions.set(session.id, session);
    return session;
  }

  async updateQuadSession(id: string, updates: Partial<QuadSession>): Promise<QuadSession | undefined> {
    const session = this.quadSessions.get(id);
    if (!session) return undefined;
    const updated = { ...session, ...updates };
    this.quadSessions.set(id, updated);
    return updated;
  }

  async getQuadBookings(): Promise<QuadBooking[]> {
    return Array.from(this.quadBookings.values());
  }

  async getQuadBookingsForSession(sessionId: string): Promise<QuadBooking[]> {
    return Array.from(this.quadBookings.values()).filter(b => b.sessionId === sessionId);
  }

  async getQuadBooking(id: string): Promise<QuadBooking | undefined> {
    return this.quadBookings.get(id);
  }

  async createQuadBooking(insertBooking: InsertQuadBooking): Promise<QuadBooking> {
    const session = await this.getQuadSession(insertBooking.sessionId);
    if (!session) throw new Error("Session not found");

    const basePrice = insertBooking.duration === 30 
      ? (session.priceRuleSnapshot?.base30 || PRICES.quad_30m)
      : (session.priceRuleSnapshot?.base60 || PRICES.quad_60m);
    const total = basePrice * insertBooking.quadsCount;

    const booking: QuadBooking = {
      id: randomUUID(),
      sessionId: insertBooking.sessionId,
      customer: insertBooking.customer,
      duration: insertBooking.duration,
      quadsCount: insertBooking.quadsCount,
      pricing: { total },
      payments: { eripPaid: 0, cashPaid: 0 },
      status: "pending_call",
      assignedInstructor: session.createdBy,
      createdAt: new Date().toISOString(),
    };
    this.quadBookings.set(booking.id, booking);

    await this.updateQuadSession(session.id, {
      bookedQuads: session.bookedQuads + insertBooking.quadsCount,
      status: session.bookedQuads + insertBooking.quadsCount >= session.totalQuads ? "full" : "open",
    });

    return booking;
  }

  async updateQuadBooking(id: string, updates: Partial<QuadBooking>): Promise<QuadBooking | undefined> {
    const booking = this.quadBookings.get(id);
    if (!booking) return undefined;
    const updated = { ...booking, ...updates };
    this.quadBookings.set(id, updated);
    return updated;
  }

  async getSiteSettings(): Promise<SiteSettings> {
    return this.siteSettings;
  }

  async updateSiteSettings(updates: Partial<SiteSettings>): Promise<SiteSettings> {
    this.siteSettings = { ...this.siteSettings, ...updates };
    return this.siteSettings;
  }

  async getAnalyticsSummary(month: string): Promise<AnalyticsSummary> {
    const cottageBookings = Array.from(this.cottageBookings.values()).filter(b => b.createdAt.startsWith(month));
    const bathBookings = Array.from(this.bathBookings.values()).filter(b => b.date.startsWith(month));
    const quadSessions = Array.from(this.quadSessions.values()).filter(s => s.date.startsWith(month));
    const quadBookings = Array.from(this.quadBookings.values());
    const workLogs = Array.from(this.workLogs.values()).filter(l => l.createdAt.startsWith(month));

    const cottageRevenue = cottageBookings.reduce((sum, b) => sum + b.totalAmount, 0);
    const bathRevenue = bathBookings.reduce((sum, b) => sum + b.pricing.total, 0);
    const quadRevenue = quadBookings.reduce((sum, b) => {
      const session = this.quadSessions.get(b.sessionId);
      return session?.date.startsWith(month) ? sum + b.pricing.total : sum;
    }, 0);

    const cashTotal = cottageBookings.reduce((sum, b) => sum + b.payments.cash, 0) +
      bathBookings.reduce((sum, b) => sum + b.payments.cashPaid, 0);
    const eripTotal = cottageBookings.reduce((sum, b) => sum + b.payments.erip, 0) +
      bathBookings.reduce((sum, b) => sum + b.payments.eripPaid, 0);

    const tubSmall = bathBookings.filter(b => b.options.tub === "small");
    const tubLarge = bathBookings.filter(b => b.options.tub === "large");

    return {
      month,
      cottageBookingsCount: cottageBookings.length,
      cottageRevenue,
      bathBookingsCount: bathBookings.length,
      bathRevenue,
      quadSessionsCount: quadSessions.length,
      quadRevenue,
      cashTotal,
      eripTotal,
      cleaningsByTariff: {},
      tubSmallCount: tubSmall.length,
      tubSmallRevenue: tubSmall.length * PRICES.tub_small,
      tubLargeCount: tubLarge.length,
      tubLargeRevenue: tubLarge.length * PRICES.tub_large,
      workHoursTotal: workLogs.reduce((sum, l) => sum + l.durationMinutes / 60, 0),
    };
  }
}

export const storage = new MemStorage();
