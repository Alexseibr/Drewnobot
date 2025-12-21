import { randomUUID, createHash } from "crypto";
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
  Incasation, InsertIncasation,
  WorkLog, InsertWorkLog,
  QuadSlot,
  QuadBooking, InsertQuadBooking,
  QuadPricing, InsertQuadPricing,
  InstructorBlockedTime, InsertInstructorBlockedTime,
  InstructorExpense, InsertInstructorExpense,
  SiteSettings,
  AnalyticsSummary,
  SpaBooking, InsertSpaBooking,
  SmsCode,
  VerificationToken,
  Review, InsertReview,
  BlockedDate, InsertBlockedDate,
  AuthSession, InsertAuthSession,
  UserRole,
  QuadRouteType,
  QuadMachine, InsertQuadMachine,
  QuadMileageLog, InsertQuadMileageLog,
  QuadMaintenanceRule, InsertQuadMaintenanceRule,
  QuadMaintenanceEvent, InsertQuadMaintenanceEvent,
  QuadMaintenanceStatus,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByTelegramId(telegramId: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
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
  getCashTransactionsSinceLastIncasation(): Promise<CashTransaction[]>;
  createCashTransaction(tx: InsertCashTransaction): Promise<CashTransaction>;
  
  // Incasations
  getIncasations(): Promise<Incasation[]>;
  getLastIncasation(): Promise<Incasation | undefined>;
  createIncasation(incasation: InsertIncasation): Promise<Incasation>;
  getIncasationPreview(): Promise<{
    periodStart: string;
    periodEnd: string;
    totalRevenue: number;
    cashRevenue: number;
    eripRevenue: number;
    totalExpenses: number;
    cashOnHand: number;
    expensesByCategory: Record<string, number>;
    shiftsCount: number;
  }>;
  
  getWorkLogs(): Promise<WorkLog[]>;
  createWorkLog(log: InsertWorkLog): Promise<WorkLog>;
  
  // Quad Bookings
  getQuadBookings(): Promise<QuadBooking[]>;
  getQuadBookingsForDate(date: string): Promise<QuadBooking[]>;
  getQuadBookingsUpcoming(): Promise<QuadBooking[]>;
  getQuadBooking(id: string): Promise<QuadBooking | undefined>;
  createQuadBooking(booking: InsertQuadBooking): Promise<QuadBooking>;
  updateQuadBooking(id: string, updates: Partial<QuadBooking>): Promise<QuadBooking | undefined>;
  
  // Quad Slots (dynamic based on bookings)
  getQuadSlotsForDate(date: string): Promise<QuadSlot[]>;
  
  // Instructor blocked times
  getInstructorBlockedTimes(): Promise<InstructorBlockedTime[]>;
  getInstructorBlockedTimesForDate(date: string): Promise<InstructorBlockedTime[]>;
  createInstructorBlockedTime(blocked: InsertInstructorBlockedTime): Promise<InstructorBlockedTime>;
  deleteInstructorBlockedTime(id: string): Promise<boolean>;
  
  // Quad Pricing (default and date-specific overrides)
  getQuadPricing(): Promise<QuadPricing[]>;
  getQuadPriceForDate(routeType: QuadRouteType, date?: string): Promise<number>;
  setQuadPrice(pricing: InsertQuadPricing, createdBy?: string): Promise<QuadPricing>;
  deleteQuadPriceOverride(id: string): Promise<boolean>;
  
  getSiteSettings(): Promise<SiteSettings>;
  updateSiteSettings(updates: Partial<SiteSettings>): Promise<SiteSettings>;
  
  getAnalyticsSummary(month: string): Promise<AnalyticsSummary>;
  
  // SPA Bookings
  getSpaBookings(): Promise<SpaBooking[]>;
  getSpaBookingsUpcoming(): Promise<SpaBooking[]>;
  getSpaBooking(id: string): Promise<SpaBooking | undefined>;
  getSpaBookingsForDate(date: string): Promise<SpaBooking[]>;
  createSpaBooking(booking: InsertSpaBooking): Promise<SpaBooking>;
  updateSpaBooking(id: string, updates: Partial<SpaBooking>): Promise<SpaBooking | undefined>;
  
  // Instructor Expenses
  getInstructorExpenses(): Promise<InstructorExpense[]>;
  getInstructorExpensesForPeriod(startDate: string, endDate: string): Promise<InstructorExpense[]>;
  createInstructorExpense(expense: InsertInstructorExpense): Promise<InstructorExpense>;
  deleteInstructorExpense(id: string): Promise<boolean>;
  
  // SMS & Verification
  createSmsCode(phone: string, code: string): Promise<SmsCode>;
  getSmsCode(phone: string): Promise<SmsCode | undefined>;
  updateSmsCode(id: string, updates: Partial<SmsCode>): Promise<SmsCode | undefined>;
  createVerificationToken(phone: string): Promise<VerificationToken>;
  getVerificationToken(token: string): Promise<VerificationToken | undefined>;
  
  // Reviews
  getReviews(): Promise<Review[]>;
  getReviewsPublished(): Promise<Review[]>;
  getReview(id: string): Promise<Review | undefined>;
  createReview(review: InsertReview): Promise<Review>;
  updateReview(id: string, updates: Partial<Review>): Promise<Review | undefined>;
  
  // Blocked Dates
  getBlockedDates(): Promise<BlockedDate[]>;
  getBlockedDate(date: string): Promise<BlockedDate | undefined>;
  createBlockedDate(blockedDate: InsertBlockedDate): Promise<BlockedDate>;
  deleteBlockedDate(date: string): Promise<boolean>;
  
  // Auth Sessions
  createAuthSession(session: InsertAuthSession): Promise<AuthSession>;
  getAuthSession(token: string): Promise<AuthSession | undefined>;
  deleteAuthSession(token: string): Promise<boolean>;
  deleteUserSessions(userId: string): Promise<void>;
  
  // Staff management (for super admin)
  getStaffUsers(): Promise<User[]>;
  updateUserRole(userId: string, role: UserRole): Promise<User | undefined>;
  
  // Quad Machines (Service Book)
  getQuadMachines(): Promise<QuadMachine[]>;
  getQuadMachine(id: string): Promise<QuadMachine | undefined>;
  createQuadMachine(machine: InsertQuadMachine): Promise<QuadMachine>;
  updateQuadMachine(id: string, updates: Partial<QuadMachine>): Promise<QuadMachine | undefined>;
  
  // Quad Mileage Logs
  getQuadMileageLogs(quadId?: string): Promise<QuadMileageLog[]>;
  createQuadMileageLog(log: InsertQuadMileageLog): Promise<QuadMileageLog>;
  
  // Quad Maintenance Rules
  getQuadMaintenanceRules(quadId?: string): Promise<QuadMaintenanceRule[]>;
  getQuadMaintenanceRule(id: string): Promise<QuadMaintenanceRule | undefined>;
  createQuadMaintenanceRule(rule: InsertQuadMaintenanceRule): Promise<QuadMaintenanceRule>;
  updateQuadMaintenanceRule(id: string, updates: Partial<QuadMaintenanceRule>): Promise<QuadMaintenanceRule | undefined>;
  deleteQuadMaintenanceRule(id: string): Promise<boolean>;
  
  // Quad Maintenance Events (Service History)
  getQuadMaintenanceEvents(quadId?: string): Promise<QuadMaintenanceEvent[]>;
  createQuadMaintenanceEvent(event: InsertQuadMaintenanceEvent): Promise<QuadMaintenanceEvent>;
  
  // Quad Maintenance Status (computed from rules, events, and current mileage)
  getQuadMaintenanceStatuses(): Promise<QuadMaintenanceStatus[]>;
  getQuadMaintenanceStatusesForQuad(quadId: string): Promise<QuadMaintenanceStatus[]>;
}

const PRICES: Record<string, number> = {
  bath_base_3h: 150,
  bath_extra_hour: 30,
  tub_small: 150,
  tub_large: 180,
  grill: 10,
  charcoal: 15,
  quad_30m: 50,
  quad_60m: 80,
  // SPA prices
  spa_bath_only_base3h: 150,
  spa_terrace_only_base3h: 90,
  spa_tub_only_up_to_4: 150,
  spa_tub_only_6_to_8: 180,
  spa_bath_with_tub_up_to_9: 330,
  spa_bath_with_tub_alt: 300,
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
  private quadBookings: Map<string, QuadBooking> = new Map();
  private instructorBlockedTimes: Map<string, InstructorBlockedTime> = new Map();
  private instructorExpenses: Map<string, InstructorExpense> = new Map();
  private spaBookings: Map<string, SpaBooking> = new Map();
  private smsCodes: Map<string, SmsCode> = new Map();
  private verificationTokens: Map<string, VerificationToken> = new Map();
  private reviews: Map<string, Review> = new Map();
  private blockedDates: Map<string, BlockedDate> = new Map();
  private authSessions: Map<string, AuthSession> = new Map();
  private quadPricing: Map<string, QuadPricing> = new Map();
  private incasations: Map<string, Incasation> = new Map();
  private quadMachines: Map<string, QuadMachine> = new Map();
  private quadMileageLogs: Map<string, QuadMileageLog> = new Map();
  private quadMaintenanceRules: Map<string, QuadMaintenanceRule> = new Map();
  private quadMaintenanceEvents: Map<string, QuadMaintenanceEvent> = new Map();
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

    // Real owner
    const realOwner: User = {
      id: randomUUID(),
      telegramId: "374243315",
      name: "Владелец",
      role: "OWNER",
      isActive: true,
    };
    this.users.set(realOwner.id, realOwner);

    // Pending admin by phone - will be matched during Telegram auth
    const pendingAdmin: User = {
      id: randomUUID(),
      telegramId: "", // Will be filled when they auth via Telegram
      phone: "+375336172984",
      name: "Администратор",
      role: "ADMIN",
      isActive: true,
    };
    this.users.set(pendingAdmin.id, pendingAdmin);

    // Lead instructor - can manage other instructors
    const leadInstructor: User = {
      id: randomUUID(),
      telegramId: "425182418",
      name: "Старший инструктор",
      role: "INSTRUCTOR",
      isActive: true,
    };
    this.users.set(leadInstructor.id, leadInstructor);

    // Initialize default quad pricing
    const defaultShortPrice: QuadPricing = {
      id: randomUUID(),
      routeType: "short",
      price: PRICES.quad_30m,
      createdAt: new Date().toISOString(),
    };
    this.quadPricing.set(defaultShortPrice.id, defaultShortPrice);

    const defaultLongPrice: QuadPricing = {
      id: randomUUID(),
      routeType: "long",
      price: PRICES.quad_60m,
      createdAt: new Date().toISOString(),
    };
    this.quadPricing.set(defaultLongPrice.id, defaultLongPrice);

    // Initialize quad machines (4 rental + 1 instructor)
    const quadMachines: InsertQuadMachine[] = [
      { code: "Q1", name: "Квадроцикл 1", ownerType: "rental", isActive: true, currentMileageKm: 0 },
      { code: "Q2", name: "Квадроцикл 2", ownerType: "rental", isActive: true, currentMileageKm: 0 },
      { code: "Q3", name: "Квадроцикл 3", ownerType: "rental", isActive: true, currentMileageKm: 0 },
      { code: "Q4", name: "Квадроцикл 4", ownerType: "rental", isActive: true, currentMileageKm: 0 },
      { code: "Q5", name: "Квадроцикл инструктора", ownerType: "instructor", isActive: true, currentMileageKm: 0 },
    ];
    quadMachines.forEach(qm => {
      const machine: QuadMachine = { id: randomUUID(), ...qm, createdAt: new Date().toISOString() };
      this.quadMachines.set(machine.id, machine);
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByTelegramId(telegramId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.telegramId === telegramId);
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    // Normalize phone for comparison
    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, "");
    return Array.from(this.users.values()).find(u => {
      if (!u.phone) return false;
      const userPhone = u.phone.replace(/[\s\-\(\)]/g, "");
      return userPhone === normalizedPhone;
    });
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

  async getCashTransactionsSinceLastIncasation(): Promise<CashTransaction[]> {
    const lastIncasation = await this.getLastIncasation();
    const allTransactions = Array.from(this.cashTransactions.values());
    
    if (!lastIncasation) {
      return allTransactions;
    }
    
    return allTransactions.filter(tx => tx.createdAt > lastIncasation.performedAt);
  }

  async getIncasations(): Promise<Incasation[]> {
    return Array.from(this.incasations.values()).sort((a, b) => 
      new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()
    );
  }

  async getLastIncasation(): Promise<Incasation | undefined> {
    const incasations = await this.getIncasations();
    return incasations[0];
  }

  async createIncasation(insertIncasation: InsertIncasation): Promise<Incasation> {
    const incasation: Incasation = {
      id: randomUUID(),
      ...insertIncasation,
      createdAt: new Date().toISOString(),
    };
    this.incasations.set(incasation.id, incasation);
    return incasation;
  }

  async getIncasationPreview(): Promise<{
    periodStart: string;
    periodEnd: string;
    totalRevenue: number;
    cashRevenue: number;
    eripRevenue: number;
    totalExpenses: number;
    cashOnHand: number;
    expensesByCategory: Record<string, number>;
    shiftsCount: number;
  }> {
    const lastIncasation = await this.getLastIncasation();
    const transactions = await this.getCashTransactionsSinceLastIncasation();
    const allShifts = Array.from(this.cashShifts.values());
    
    const periodStart = lastIncasation?.performedAt || 
      (transactions.length > 0 ? transactions[0].createdAt : new Date().toISOString());
    const periodEnd = new Date().toISOString();
    
    let cashRevenue = 0;
    let eripRevenue = 0;
    let totalExpenses = 0;
    const expensesByCategory: Record<string, number> = {};
    
    for (const tx of transactions) {
      if (tx.type === "cash_in") {
        cashRevenue += tx.amount;
      } else if (tx.type === "expense") {
        totalExpenses += tx.amount;
        const cat = tx.category || "other";
        expensesByCategory[cat] = (expensesByCategory[cat] || 0) + tx.amount;
      }
    }
    
    // Calculate ERIP revenue from bookings (not tracked in cash transactions)
    const allBathBookings = Array.from(this.bathBookings.values());
    const allSpaBookings = Array.from(this.spaBookings.values());
    const allQuadBookings = Array.from(this.quadBookings.values());
    
    for (const booking of allBathBookings) {
      if (booking.createdAt > periodStart) {
        eripRevenue += booking.payments?.eripPaid || 0;
      }
    }
    for (const booking of allSpaBookings) {
      if (booking.createdAt > periodStart) {
        eripRevenue += booking.payments?.eripPaid || 0;
      }
    }
    for (const booking of allQuadBookings) {
      if (booking.createdAt > periodStart) {
        eripRevenue += booking.payments?.eripPaid || 0;
      }
    }
    
    const shiftsCount = allShifts.filter(s => 
      !lastIncasation || s.openedAt > lastIncasation.performedAt
    ).length;
    
    const cashOnHand = cashRevenue - totalExpenses;
    const totalRevenue = cashRevenue + eripRevenue;
    
    return {
      periodStart,
      periodEnd,
      totalRevenue,
      cashRevenue,
      eripRevenue,
      totalExpenses,
      cashOnHand,
      expensesByCategory,
      shiftsCount,
    };
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

  // ============ QUAD BOOKINGS ============
  async getQuadBookings(): Promise<QuadBooking[]> {
    return Array.from(this.quadBookings.values());
  }

  async getQuadBookingsForDate(date: string): Promise<QuadBooking[]> {
    return Array.from(this.quadBookings.values()).filter(b => b.date === date);
  }

  async getQuadBookingsUpcoming(): Promise<QuadBooking[]> {
    const today = new Date().toISOString().split("T")[0];
    return Array.from(this.quadBookings.values()).filter(
      b => b.date >= today && b.status !== "cancelled" && b.status !== "completed"
    );
  }

  async getQuadBooking(id: string): Promise<QuadBooking | undefined> {
    return this.quadBookings.get(id);
  }

  async createQuadBooking(insertBooking: InsertQuadBooking): Promise<QuadBooking> {
    const duration = insertBooking.routeType === "short" ? 30 : 60;
    const basePrice = insertBooking.routeType === "short" ? PRICES.quad_30m : PRICES.quad_60m;
    
    // Calculate end time
    const startHour = parseInt(insertBooking.startTime.split(":")[0]);
    const startMin = parseInt(insertBooking.startTime.split(":")[1]) || 0;
    const endMinTotal = startHour * 60 + startMin + duration;
    const endHour = Math.floor(endMinTotal / 60);
    const endMin = endMinTotal % 60;
    const endTime = `${endHour.toString().padStart(2, "0")}:${endMin.toString().padStart(2, "0")}`;
    
    // Check if joining existing slot for discount
    let discountApplied = false;
    let discount = 0;
    
    if (insertBooking.slotId) {
      const existingBookings = await this.getQuadBookingsForDate(insertBooking.date);
      const sameSlot = existingBookings.find(b => 
        b.startTime === insertBooking.startTime && 
        b.routeType === insertBooking.routeType &&
        b.status !== "cancelled"
      );
      if (sameSlot) {
        discountApplied = true;
        discount = Math.round(basePrice * insertBooking.quadsCount * 0.05);
      }
    }
    
    const total = basePrice * insertBooking.quadsCount - discount;

    const booking: QuadBooking = {
      id: randomUUID(),
      slotId: insertBooking.slotId,
      date: insertBooking.date,
      startTime: insertBooking.startTime,
      endTime,
      routeType: insertBooking.routeType,
      quadsCount: insertBooking.quadsCount,
      customer: insertBooking.customer,
      pricing: { 
        basePrice, 
        total, 
        discount, 
        discountApplied 
      },
      payments: { eripPaid: 0, cashPaid: 0 },
      status: "pending_call",
      comment: insertBooking.comment,
      createdAt: new Date().toISOString(),
    };
    this.quadBookings.set(booking.id, booking);
    return booking;
  }

  async updateQuadBooking(id: string, updates: Partial<QuadBooking>): Promise<QuadBooking | undefined> {
    const booking = this.quadBookings.get(id);
    if (!booking) return undefined;
    const updated = { ...booking, ...updates };
    this.quadBookings.set(id, updated);
    return updated;
  }

  // ============ QUAD SLOTS ============
  async getQuadSlotsForDate(date: string): Promise<QuadSlot[]> {
    const bookings = await this.getQuadBookingsForDate(date);
    const blockedTimes = await this.getInstructorBlockedTimesForDate(date);
    
    // Group bookings by startTime + routeType to create slots
    const slotMap = new Map<string, QuadSlot>();
    
    for (const booking of bookings) {
      if (booking.status === "cancelled") continue;
      
      const key = `${booking.startTime}-${booking.routeType}`;
      const existing = slotMap.get(key);
      
      if (existing) {
        existing.bookedQuads += booking.quadsCount;
        existing.hasDiscount = true; // Others can join with discount
      } else {
        slotMap.set(key, {
          id: key,
          date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          routeType: booking.routeType,
          totalQuads: 4,
          bookedQuads: booking.quadsCount,
          basePrice: booking.pricing.basePrice,
          hasDiscount: false,
          createdAt: booking.createdAt,
        });
      }
    }
    
    return Array.from(slotMap.values());
  }

  // ============ INSTRUCTOR BLOCKED TIMES ============
  async getInstructorBlockedTimes(): Promise<InstructorBlockedTime[]> {
    return Array.from(this.instructorBlockedTimes.values());
  }

  async getInstructorBlockedTimesForDate(date: string): Promise<InstructorBlockedTime[]> {
    return Array.from(this.instructorBlockedTimes.values()).filter(b => b.date === date);
  }

  async createInstructorBlockedTime(insertBlocked: InsertInstructorBlockedTime): Promise<InstructorBlockedTime> {
    const blocked: InstructorBlockedTime = {
      id: randomUUID(),
      ...insertBlocked,
      createdAt: new Date().toISOString(),
    };
    this.instructorBlockedTimes.set(blocked.id, blocked);
    return blocked;
  }

  async deleteInstructorBlockedTime(id: string): Promise<boolean> {
    return this.instructorBlockedTimes.delete(id);
  }

  // ============ QUAD PRICING ============
  async getQuadPricing(): Promise<QuadPricing[]> {
    return Array.from(this.quadPricing.values()).sort((a, b) => {
      // Sort by date (nulls first = defaults), then by route type
      if (!a.date && b.date) return -1;
      if (a.date && !b.date) return 1;
      if (a.date && b.date) return a.date.localeCompare(b.date);
      return a.routeType.localeCompare(b.routeType);
    });
  }

  async getQuadPriceForDate(routeType: QuadRouteType, date?: string): Promise<number> {
    const allPricing = Array.from(this.quadPricing.values());
    
    // First try to find a date-specific override
    if (date) {
      const override = allPricing.find(p => p.routeType === routeType && p.date === date);
      if (override) {
        return override.price;
      }
    }
    
    // Fall back to default (no date set)
    const defaultPrice = allPricing.find(p => p.routeType === routeType && !p.date);
    if (defaultPrice) {
      return defaultPrice.price;
    }
    
    // Ultimate fallback to PRICES constant
    return routeType === "short" ? PRICES.quad_30m : PRICES.quad_60m;
  }

  async setQuadPrice(pricing: InsertQuadPricing, createdBy?: string): Promise<QuadPricing> {
    const allPricing = Array.from(this.quadPricing.values());
    
    // Check if we're updating an existing entry
    const existing = allPricing.find(p => 
      p.routeType === pricing.routeType && 
      (pricing.date ? p.date === pricing.date : !p.date)
    );
    
    if (existing) {
      // Update existing entry
      const updated: QuadPricing = {
        ...existing,
        price: pricing.price,
        createdBy,
        createdAt: new Date().toISOString(),
      };
      this.quadPricing.set(existing.id, updated);
      return updated;
    }
    
    // Create new entry
    const newPricing: QuadPricing = {
      id: randomUUID(),
      routeType: pricing.routeType,
      price: pricing.price,
      date: pricing.date,
      createdBy,
      createdAt: new Date().toISOString(),
    };
    this.quadPricing.set(newPricing.id, newPricing);
    return newPricing;
  }

  async deleteQuadPriceOverride(id: string): Promise<boolean> {
    const pricing = this.quadPricing.get(id);
    // Only allow deleting date-specific overrides, not defaults
    if (pricing && pricing.date) {
      return this.quadPricing.delete(id);
    }
    return false;
  }

  // Instructor Expenses
  async getInstructorExpenses(): Promise<InstructorExpense[]> {
    return Array.from(this.instructorExpenses.values())
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async getInstructorExpensesForPeriod(startDate: string, endDate: string): Promise<InstructorExpense[]> {
    return Array.from(this.instructorExpenses.values())
      .filter(e => e.date >= startDate && e.date <= endDate)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async createInstructorExpense(expense: InsertInstructorExpense): Promise<InstructorExpense> {
    const id = randomUUID();
    const newExpense: InstructorExpense = {
      ...expense,
      id,
      createdAt: new Date().toISOString(),
    };
    this.instructorExpenses.set(id, newExpense);
    return newExpense;
  }

  async deleteInstructorExpense(id: string): Promise<boolean> {
    return this.instructorExpenses.delete(id);
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
    const quadBookings = Array.from(this.quadBookings.values()).filter(b => b.date.startsWith(month));
    const workLogs = Array.from(this.workLogs.values()).filter(l => l.createdAt.startsWith(month));

    const cottageRevenue = cottageBookings.reduce((sum, b) => sum + b.totalAmount, 0);
    const bathRevenue = bathBookings.reduce((sum, b) => sum + b.pricing.total, 0);
    const quadRevenue = quadBookings.reduce((sum, b) => sum + b.pricing.total, 0);

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
      quadSessionsCount: quadBookings.length,
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

  // ============ SPA BOOKINGS ============
  async getSpaBookings(): Promise<SpaBooking[]> {
    return Array.from(this.spaBookings.values());
  }

  async getSpaBookingsUpcoming(): Promise<SpaBooking[]> {
    const today = new Date().toISOString().split("T")[0];
    return Array.from(this.spaBookings.values()).filter(
      b => b.date >= today && b.status !== "cancelled" && b.status !== "expired"
    );
  }

  async getSpaBooking(id: string): Promise<SpaBooking | undefined> {
    return this.spaBookings.get(id);
  }

  async getSpaBookingsForDate(date: string): Promise<SpaBooking[]> {
    return Array.from(this.spaBookings.values()).filter(b => b.date === date);
  }

  private calculateSpaPrice(bookingType: string, guestsCount: number): number {
    switch (bookingType) {
      case "bath_only":
        return PRICES.spa_bath_only_base3h;
      case "terrace_only":
        return PRICES.spa_terrace_only_base3h;
      case "tub_only":
        return guestsCount <= 4 ? PRICES.spa_tub_only_up_to_4 : PRICES.spa_tub_only_6_to_8;
      case "bath_with_tub":
        return guestsCount <= 9 ? PRICES.spa_bath_with_tub_up_to_9 : PRICES.spa_bath_with_tub_alt;
      default:
        return 0;
    }
  }

  async createSpaBooking(insertBooking: InsertSpaBooking): Promise<SpaBooking> {
    const basePrice = this.calculateSpaPrice(insertBooking.bookingType, insertBooking.guestsCount);
    
    const booking: SpaBooking = {
      id: randomUUID(),
      spaResource: insertBooking.spaResource,
      bookingType: insertBooking.bookingType,
      date: insertBooking.date,
      startTime: insertBooking.startTime,
      endTime: insertBooking.endTime,
      durationHours: insertBooking.durationHours || 3,
      guestsCount: insertBooking.guestsCount,
      customer: insertBooking.customer,
      comment: insertBooking.comment,
      pricing: { base: basePrice, total: basePrice },
      payments: { eripPaid: 0, cashPaid: 0 },
      status: "pending_call",
      createdAt: new Date().toISOString(),
    };
    this.spaBookings.set(booking.id, booking);
    return booking;
  }

  async updateSpaBooking(id: string, updates: Partial<SpaBooking>): Promise<SpaBooking | undefined> {
    const booking = this.spaBookings.get(id);
    if (!booking) return undefined;
    const updated = { ...booking, ...updates };
    this.spaBookings.set(id, updated);
    return updated;
  }

  // ============ SMS & VERIFICATION ============
  async createSmsCode(phone: string, code: string): Promise<SmsCode> {
    const codeHash = createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
    
    const smsCode: SmsCode = {
      id: randomUUID(),
      phone,
      codeHash,
      expiresAt,
      attempts: 0,
      verified: false,
      createdAt: new Date().toISOString(),
    };
    this.smsCodes.set(smsCode.id, smsCode);
    return smsCode;
  }

  async getSmsCode(phone: string): Promise<SmsCode | undefined> {
    return Array.from(this.smsCodes.values())
      .filter(c => c.phone === phone && !c.verified && new Date(c.expiresAt) > new Date())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }

  async updateSmsCode(id: string, updates: Partial<SmsCode>): Promise<SmsCode | undefined> {
    const code = this.smsCodes.get(id);
    if (!code) return undefined;
    const updated = { ...code, ...updates };
    this.smsCodes.set(id, updated);
    return updated;
  }

  async createVerificationToken(phone: string): Promise<VerificationToken> {
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    
    const verificationToken: VerificationToken = {
      id: randomUUID(),
      phone,
      token,
      expiresAt,
      createdAt: new Date().toISOString(),
    };
    this.verificationTokens.set(verificationToken.id, verificationToken);
    return verificationToken;
  }

  async getVerificationToken(token: string): Promise<VerificationToken | undefined> {
    return Array.from(this.verificationTokens.values())
      .find(t => t.token === token && new Date(t.expiresAt) > new Date());
  }

  // ============ REVIEWS ============
  async getReviews(): Promise<Review[]> {
    return Array.from(this.reviews.values());
  }

  async getReviewsPublished(): Promise<Review[]> {
    return Array.from(this.reviews.values()).filter(r => r.isPublished);
  }

  async getReview(id: string): Promise<Review | undefined> {
    return this.reviews.get(id);
  }

  async createReview(insertReview: InsertReview): Promise<Review> {
    const review: Review = {
      id: randomUUID(),
      bookingRef: insertReview.bookingRef,
      customer: insertReview.customer,
      rating: insertReview.rating,
      text: insertReview.text,
      isPublished: false,
      createdAt: new Date().toISOString(),
    };
    this.reviews.set(review.id, review);
    return review;
  }

  async updateReview(id: string, updates: Partial<Review>): Promise<Review | undefined> {
    const review = this.reviews.get(id);
    if (!review) return undefined;
    const updated = { ...review, ...updates };
    this.reviews.set(id, updated);
    return updated;
  }

  // ============ BLOCKED DATES ============
  async getBlockedDates(): Promise<BlockedDate[]> {
    return Array.from(this.blockedDates.values());
  }

  async getBlockedDate(date: string): Promise<BlockedDate | undefined> {
    return Array.from(this.blockedDates.values()).find(b => b.date === date);
  }

  async createBlockedDate(insertBlockedDate: InsertBlockedDate): Promise<BlockedDate> {
    const blockedDate: BlockedDate = {
      id: randomUUID(),
      date: insertBlockedDate.date,
      reason: insertBlockedDate.reason,
      createdBy: insertBlockedDate.createdBy,
      createdAt: new Date().toISOString(),
    };
    this.blockedDates.set(blockedDate.id, blockedDate);
    return blockedDate;
  }

  async deleteBlockedDate(date: string): Promise<boolean> {
    const blockedDate = Array.from(this.blockedDates.values()).find(b => b.date === date);
    if (!blockedDate) return false;
    this.blockedDates.delete(blockedDate.id);
    return true;
  }

  // ============ AUTH SESSIONS ============
  async createAuthSession(insertSession: InsertAuthSession): Promise<AuthSession> {
    const session: AuthSession = {
      id: randomUUID(),
      userId: insertSession.userId,
      token: insertSession.token,
      expiresAt: insertSession.expiresAt,
      createdAt: new Date().toISOString(),
    };
    this.authSessions.set(session.token, session);
    return session;
  }

  async getAuthSession(token: string): Promise<AuthSession | undefined> {
    const session = this.authSessions.get(token);
    if (!session) return undefined;
    if (new Date(session.expiresAt) < new Date()) {
      this.authSessions.delete(token);
      return undefined;
    }
    return session;
  }

  async deleteAuthSession(token: string): Promise<boolean> {
    return this.authSessions.delete(token);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    const sessions = Array.from(this.authSessions.values()).filter(s => s.userId === userId);
    for (const session of sessions) {
      this.authSessions.delete(session.token);
    }
  }

  // ============ STAFF MANAGEMENT ============
  async getStaffUsers(): Promise<User[]> {
    return Array.from(this.users.values()).filter(u => 
      u.role === "SUPER_ADMIN" || u.role === "OWNER" || u.role === "ADMIN" || u.role === "INSTRUCTOR"
    );
  }

  async updateUserRole(userId: string, role: UserRole): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    const updated = { ...user, role };
    this.users.set(userId, updated);
    return updated;
  }

  // ============ QUAD MACHINES (SERVICE BOOK) ============
  async getQuadMachines(): Promise<QuadMachine[]> {
    return Array.from(this.quadMachines.values()).sort((a, b) => a.code.localeCompare(b.code));
  }

  async getQuadMachine(id: string): Promise<QuadMachine | undefined> {
    return this.quadMachines.get(id);
  }

  async createQuadMachine(insertMachine: InsertQuadMachine): Promise<QuadMachine> {
    const machine: QuadMachine = {
      id: randomUUID(),
      code: insertMachine.code,
      name: insertMachine.name,
      ownerType: insertMachine.ownerType,
      isActive: insertMachine.isActive ?? true,
      currentMileageKm: insertMachine.currentMileageKm ?? 0,
      commissioningDate: insertMachine.commissioningDate,
      notes: insertMachine.notes,
      createdAt: new Date().toISOString(),
    };
    this.quadMachines.set(machine.id, machine);
    return machine;
  }

  async updateQuadMachine(id: string, updates: Partial<QuadMachine>): Promise<QuadMachine | undefined> {
    const machine = this.quadMachines.get(id);
    if (!machine) return undefined;
    const updated = { ...machine, ...updates };
    this.quadMachines.set(id, updated);
    return updated;
  }

  // ============ QUAD MILEAGE LOGS ============
  async getQuadMileageLogs(quadId?: string): Promise<QuadMileageLog[]> {
    let logs = Array.from(this.quadMileageLogs.values());
    if (quadId) {
      logs = logs.filter(l => l.quadId === quadId);
    }
    return logs.sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());
  }

  async createQuadMileageLog(insertLog: InsertQuadMileageLog): Promise<QuadMileageLog> {
    const machine = this.quadMachines.get(insertLog.quadId);
    const previousMileage = machine?.currentMileageKm ?? 0;
    
    const log: QuadMileageLog = {
      id: randomUUID(),
      quadId: insertLog.quadId,
      mileageKm: insertLog.mileageKm,
      previousMileageKm: previousMileage,
      notes: insertLog.notes,
      loggedBy: insertLog.loggedBy,
      loggedAt: new Date().toISOString(),
    };
    this.quadMileageLogs.set(log.id, log);
    
    // Update the quad machine's current mileage
    if (machine) {
      this.quadMachines.set(machine.id, { ...machine, currentMileageKm: insertLog.mileageKm });
    }
    
    return log;
  }

  // ============ QUAD MAINTENANCE RULES ============
  async getQuadMaintenanceRules(quadId?: string): Promise<QuadMaintenanceRule[]> {
    let rules = Array.from(this.quadMaintenanceRules.values()).filter(r => r.isActive);
    if (quadId) {
      // Return rules specific to this quad OR global rules (quadId is null)
      rules = rules.filter(r => r.quadId === quadId || r.quadId === null || r.quadId === undefined);
    }
    return rules.sort((a, b) => a.title.localeCompare(b.title));
  }

  async getQuadMaintenanceRule(id: string): Promise<QuadMaintenanceRule | undefined> {
    return this.quadMaintenanceRules.get(id);
  }

  async createQuadMaintenanceRule(insertRule: InsertQuadMaintenanceRule): Promise<QuadMaintenanceRule> {
    const rule: QuadMaintenanceRule = {
      id: randomUUID(),
      quadId: insertRule.quadId,
      title: insertRule.title,
      description: insertRule.description,
      triggerType: insertRule.triggerType,
      intervalKm: insertRule.intervalKm,
      intervalDays: insertRule.intervalDays,
      warningKm: insertRule.warningKm,
      warningDays: insertRule.warningDays,
      isActive: insertRule.isActive ?? true,
      createdBy: insertRule.createdBy,
      createdAt: new Date().toISOString(),
    };
    this.quadMaintenanceRules.set(rule.id, rule);
    return rule;
  }

  async updateQuadMaintenanceRule(id: string, updates: Partial<QuadMaintenanceRule>): Promise<QuadMaintenanceRule | undefined> {
    const rule = this.quadMaintenanceRules.get(id);
    if (!rule) return undefined;
    const updated = { ...rule, ...updates };
    this.quadMaintenanceRules.set(id, updated);
    return updated;
  }

  async deleteQuadMaintenanceRule(id: string): Promise<boolean> {
    return this.quadMaintenanceRules.delete(id);
  }

  // ============ QUAD MAINTENANCE EVENTS (SERVICE HISTORY) ============
  async getQuadMaintenanceEvents(quadId?: string): Promise<QuadMaintenanceEvent[]> {
    let events = Array.from(this.quadMaintenanceEvents.values());
    if (quadId) {
      events = events.filter(e => e.quadId === quadId);
    }
    return events.sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());
  }

  async createQuadMaintenanceEvent(insertEvent: InsertQuadMaintenanceEvent): Promise<QuadMaintenanceEvent> {
    const event: QuadMaintenanceEvent = {
      id: randomUUID(),
      quadId: insertEvent.quadId,
      ruleId: insertEvent.ruleId,
      title: insertEvent.title,
      description: insertEvent.description,
      mileageKm: insertEvent.mileageKm,
      partsUsed: insertEvent.partsUsed,
      totalCost: insertEvent.totalCost,
      performedBy: insertEvent.performedBy,
      performedAt: insertEvent.performedAt,
      createdAt: new Date().toISOString(),
    };
    this.quadMaintenanceEvents.set(event.id, event);
    return event;
  }

  // ============ QUAD MAINTENANCE STATUS (COMPUTED) ============
  async getQuadMaintenanceStatuses(): Promise<QuadMaintenanceStatus[]> {
    const statuses: QuadMaintenanceStatus[] = [];
    const machines = await this.getQuadMachines();
    const rules = await this.getQuadMaintenanceRules();
    const allEvents = Array.from(this.quadMaintenanceEvents.values());

    for (const machine of machines) {
      const applicableRules = rules.filter(r => 
        r.quadId === machine.id || r.quadId === null || r.quadId === undefined
      );

      for (const rule of applicableRules) {
        // Find the last maintenance event for this rule and quad
        const lastEvent = allEvents
          .filter(e => e.quadId === machine.id && e.ruleId === rule.id)
          .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime())[0];

        let nextDueMileage: number | undefined;
        let nextDueDate: string | undefined;
        let remainingKm: number | undefined;
        let remainingDays: number | undefined;
        let status: "ok" | "warning" | "due" | "overdue" = "ok";
        const now = new Date();

        // Mileage-based trigger
        if (rule.triggerType === "mileage" || rule.triggerType === "both") {
          if (rule.intervalKm) {
            const lastMileage = lastEvent?.mileageKm ?? 0;
            nextDueMileage = lastMileage + rule.intervalKm;
            remainingKm = nextDueMileage - machine.currentMileageKm;
            
            if (remainingKm <= 0) {
              status = "overdue";
            } else if (rule.warningKm && remainingKm <= rule.warningKm) {
              if (status !== "overdue") status = "warning";
            }
          }
        }

        // Time-based trigger
        if (rule.triggerType === "time" || rule.triggerType === "both") {
          if (rule.intervalDays) {
            // Guard against missing createdAt - use now as fallback
            const baseDate = lastEvent?.performedAt 
              ? new Date(lastEvent.performedAt) 
              : (machine.createdAt ? new Date(machine.createdAt) : now);
            const dueDate = new Date(baseDate);
            dueDate.setDate(dueDate.getDate() + rule.intervalDays);
            nextDueDate = dueDate.toISOString().split('T')[0];
            remainingDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            if (remainingDays <= 0) {
              status = "overdue";
            } else if (rule.warningDays && remainingDays <= rule.warningDays) {
              if (status !== "overdue") status = status === "ok" ? "warning" : status;
            }
          }
        }

        // For "both" trigger type, if either is overdue, status is overdue
        // If either is in warning (and nothing is overdue), status is warning
        // "due" is used when exactly at the threshold (remainingKm=0 or remainingDays=0)
        if (status === "overdue" && ((remainingKm !== undefined && remainingKm === 0) || (remainingDays !== undefined && remainingDays === 0))) {
          status = "due";
        }

        statuses.push({
          id: `${machine.id}-${rule.id}`,
          quadId: machine.id,
          ruleId: rule.id,
          lastServiceMileage: lastEvent?.mileageKm,
          lastServiceDate: lastEvent?.performedAt,
          nextDueMileage,
          nextDueDate,
          remainingKm,
          remainingDays,
          status,
        });
      }
    }

    return statuses;
  }

  async getQuadMaintenanceStatusesForQuad(quadId: string): Promise<QuadMaintenanceStatus[]> {
    const allStatuses = await this.getQuadMaintenanceStatuses();
    return allStatuses.filter(s => s.quadId === quadId);
  }
}

export const storage = new MemStorage();
