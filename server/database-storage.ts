import { randomUUID } from "crypto";
import { eq, and, gte, gt, lt, lte, desc, asc, or, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import type { IStorage } from "./storage";
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
  StaffInvitation, InsertStaffInvitation,
  StaffAuthorization, InsertStaffAuthorization,
  LaundryBatch, InsertLaundryBatch,
  TextileAudit, InsertTextileAudit,
  TextileStock, InsertTextileStock,
  TextileCheckIn, InsertTextileCheckIn,
  TextileEvent, InsertTextileEvent,
  TextileLocation, TextileType, TextileColor,
  Guest, InsertGuest,
  Supply, InsertSupply,
  SupplyTransaction, InsertSupplyTransaction,
  Incident, InsertIncident,
  StaffShift, InsertStaffShift,
  UnitInfo, InsertUnitInfo,
  ThermostatHouse, InsertThermostatHouse,
  ThermostatDailyPlan, InsertThermostatDailyPlan,
  ThermostatActionLog, InsertThermostatActionLog,
  ElectricityMeter, InsertElectricityMeter,
  ElectricityReading, InsertElectricityReading,
  NotificationConfig, InsertNotificationConfig,
  CheckInActionLog, InsertCheckInActionLog,
  CleaningWorker, InsertCleaningWorker,
  CleaningRate, InsertCleaningRate,
  CleaningLog, InsertCleaningLog,
  HourlyLog, InsertHourlyLog,
  SalaryPeriod, InsertSalaryPeriod,
} from "@shared/schema";
import {
  usersTable, unitsTable, cleaningTariffsTable, servicePricesTable,
  cottageBookingsTable, bathBookingsTable, spaBookingsTable, quadBookingsTable,
  tasksTable, cashShiftsTable, cashTransactionsTable, incasationsTable,
  workLogsTable, quadPricingTable, instructorBlockedTimesTable, instructorExpensesTable,
  authSessionsTable, staffInvitationsTable, staffAuthorizationsTable, quadMachinesTable, quadMileageLogsTable,
  quadMaintenanceRulesTable, quadMaintenanceEventsTable, siteSettingsTable,
  blockedDatesTable, reviewsTable, laundryBatchesTable, textileAuditsTable,
  textileStockTable, textileCheckInsTable, textileEventsTable, guestsTable,
  suppliesTable, supplyTransactionsTable, incidentsTable, staffShiftsTable, unitInfoTable,
  thermostatHousesTable, thermostatDailyPlansTable, thermostatActionLogsTable,
  notificationConfigsTable, botMessagesTable, checkInActionLogsTable,
  cleaningWorkersTable, cleaningRatesTable, cleaningLogsTable, hourlyLogsTable, salaryPeriodsTable,
  BotMessage,
} from "@shared/schema";

const PRICES: Record<string, number> = {
  bath_base_3h: 150,
  bath_extra_hour: 30,
  tub_small: 150,
  tub_large: 180,
  grill: 10,
  charcoal: 15,
  quad_30m: 50,
  quad_60m: 80,
  spa_bath_only_base3h: 150,
  spa_terrace_only_base3h: 90,
  spa_tub_only_up_to_4: 150,
  spa_tub_only_5_plus: 180,
  spa_bath_with_tub_up_to_4: 330,
  spa_bath_with_tub_5_plus: 300,
};

function normalizePhoneOrNull(rawPhone: string | undefined | null): string | undefined {
  if (!rawPhone) return undefined;
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length < 7) return undefined;
  return `+${digits}`;
}

export class DatabaseStorage implements IStorage {
  private smsCodes: Map<string, SmsCode> = new Map();
  private verificationTokens: Map<string, VerificationToken> = new Map();
  
  private addMinutes(time: string, minutes: number): string {
    const [h, m] = time.split(":").map(Number);
    const totalMinutes = h * 60 + m + minutes;
    const newH = Math.floor(totalMinutes / 60) % 24;
    const newM = totalMinutes % 60;
    return `${newH.toString().padStart(2, "0")}:${newM.toString().padStart(2, "0")}`;
  }
  
  private calculateDurationMinutes(startAt: string, endAt: string): number {
    const start = new Date(startAt);
    const end = new Date(endAt);
    return Math.round((end.getTime() - start.getTime()) / 60000);
  }
  
  async getUser(id: string): Promise<User | undefined> {
    const rows = await db.select().from(usersTable).where(eq(usersTable.id, id));
    return rows[0] ? this.mapRowToUser(rows[0]) : undefined;
  }

  async getUserByTelegramId(telegramId: string): Promise<User | undefined> {
    const rows = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId));
    return rows[0] ? this.mapRowToUser(rows[0]) : undefined;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const normalized = normalizePhoneOrNull(phone);
    if (!normalized) return undefined;
    const rows = await db.select().from(usersTable).where(eq(usersTable.phone, normalized));
    return rows[0] ? this.mapRowToUser(rows[0]) : undefined;
  }

  async getUsers(): Promise<User[]> {
    const rows = await db.select().from(usersTable);
    return rows.map(r => this.mapRowToUser(r));
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const normalizedPhone = normalizePhoneOrNull(user.phone);
    if (user.phone && !normalizedPhone) {
      console.warn(`createUser: Invalid phone '${user.phone}' for user ${user.telegramId}, storing undefined`);
    }
    const newUser: User = {
      id,
      telegramId: user.telegramId,
      name: user.name,
      phone: normalizedPhone,
      role: user.role || "GUEST",
      isActive: user.isActive ?? true,
    };
    await db.insert(usersTable).values({
      id: newUser.id,
      telegramId: newUser.telegramId,
      name: newUser.name,
      phone: newUser.phone || null,
      role: newUser.role,
      isActive: newUser.isActive,
    });
    return newUser;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    
    const updateData: Record<string, any> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.role !== undefined) updateData.role = updates.role;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    if (updates.phone !== undefined) {
      const normalized = normalizePhoneOrNull(updates.phone);
      if (updates.phone && !normalized) {
        console.warn(`updateUser: Invalid phone '${updates.phone}' for user ${id}, keeping existing`);
      } else {
        updateData.phone = normalized || null;
      }
    }
    
    if (Object.keys(updateData).length > 0) {
      await db.update(usersTable).set(updateData).where(eq(usersTable.id, id));
    }
    return this.getUser(id);
  }

  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      telegramId: row.telegramId,
      name: row.name,
      phone: row.phone || undefined,
      role: row.role as UserRole,
      isActive: row.isActive,
    };
  }

  async getUnits(): Promise<Unit[]> {
    const rows = await db.select().from(unitsTable);
    return rows.map(r => ({
      id: r.id,
      type: r.type as any,
      code: r.code,
      title: r.title,
      cleaningTariffCode: r.cleaningTariffCode as any,
      tubPolicy: r.tubPolicy as any,
      images: (r.images as string[]) || [],
    }));
  }

  async getUnit(code: string): Promise<Unit | undefined> {
    const rows = await db.select().from(unitsTable).where(eq(unitsTable.code, code));
    if (!rows[0]) return undefined;
    const r = rows[0];
    return {
      id: r.id,
      type: r.type as any,
      code: r.code,
      title: r.title,
      cleaningTariffCode: r.cleaningTariffCode as any,
      tubPolicy: r.tubPolicy as any,
      images: (r.images as string[]) || [],
    };
  }

  async createUnit(unit: InsertUnit): Promise<Unit> {
    const id = randomUUID();
    const newUnit: Unit = {
      id,
      type: unit.type,
      code: unit.code,
      title: unit.title,
      cleaningTariffCode: unit.cleaningTariffCode,
      tubPolicy: unit.tubPolicy,
      images: unit.images || [],
    };
    await db.insert(unitsTable).values({
      id: newUnit.id,
      type: newUnit.type,
      code: newUnit.code,
      title: newUnit.title,
      cleaningTariffCode: newUnit.cleaningTariffCode,
      tubPolicy: newUnit.tubPolicy,
      images: newUnit.images,
    });
    return newUnit;
  }

  async getCleaningTariffs(): Promise<CleaningTariff[]> {
    const rows = await db.select().from(cleaningTariffsTable);
    if (rows.length === 0) {
      return [
        { id: "tariff-a", code: "A", title: "Влажная уборка", price: 50 },
        { id: "tariff-b", code: "B", title: "Полная уборка", price: 100 },
        { id: "tariff-c", code: "C", title: "Генеральная уборка", price: 150 },
      ];
    }
    return rows.map(r => ({
      id: r.id,
      code: r.code as any,
      title: r.title,
      price: r.price,
    }));
  }

  async getServicePrices(): Promise<ServicePrice[]> {
    const rows = await db.select().from(servicePricesTable);
    if (rows.length === 0) {
      return Object.entries(PRICES).map(([key, price]) => ({
        id: `price-${key}`,
        key,
        price,
        currency: "BYN" as const,
      }));
    }
    return rows.map(r => ({
      id: r.id,
      key: r.key,
      price: r.price,
      currency: r.currency as any,
      activeFrom: r.activeFrom || undefined,
      activeTo: r.activeTo || undefined,
    }));
  }

  async getServicePrice(key: string): Promise<ServicePrice | undefined> {
    const rows = await db.select().from(servicePricesTable).where(eq(servicePricesTable.key, key));
    if (rows[0]) {
      return {
        id: rows[0].id,
        key: rows[0].key,
        price: rows[0].price,
        currency: rows[0].currency as any,
        activeFrom: rows[0].activeFrom || undefined,
        activeTo: rows[0].activeTo || undefined,
      };
    }
    if (PRICES[key] !== undefined) {
      return { id: `price-${key}`, key, price: PRICES[key], currency: "BYN" };
    }
    return undefined;
  }

  async getCottageBookings(): Promise<CottageBooking[]> {
    const rows = await db.select().from(cottageBookingsTable).orderBy(desc(cottageBookingsTable.createdAt));
    return rows.map(r => this.mapRowToCottageBooking(r));
  }

  async getCottageBookingsUpcoming(): Promise<CottageBooking[]> {
    const today = new Date().toISOString().split("T")[0];
    const rows = await db.select().from(cottageBookingsTable)
      .where(gte(cottageBookingsTable.dateCheckIn, today))
      .orderBy(asc(cottageBookingsTable.dateCheckIn));
    return rows.map(r => this.mapRowToCottageBooking(r));
  }

  async getCottageBooking(id: string): Promise<CottageBooking | undefined> {
    const rows = await db.select().from(cottageBookingsTable).where(eq(cottageBookingsTable.id, id));
    return rows[0] ? this.mapRowToCottageBooking(rows[0]) : undefined;
  }

  async createCottageBooking(booking: InsertCottageBooking): Promise<CottageBooking> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newBooking: CottageBooking = {
      id,
      unitCode: booking.unitCode,
      dateCheckIn: booking.dateCheckIn,
      dateCheckOut: booking.dateCheckOut,
      guestsCount: booking.guestsCount,
      tubSmall: booking.tubSmall || false,
      totalAmount: booking.totalAmount,
      payments: booking.payments,
      customer: booking.customer,
      status: booking.status || "planned",
      createdBy: booking.createdBy,
      createdAt: now,
    };
    await db.insert(cottageBookingsTable).values({
      id: newBooking.id,
      unitCode: newBooking.unitCode,
      dateCheckIn: newBooking.dateCheckIn,
      dateCheckOut: newBooking.dateCheckOut,
      guestsCount: newBooking.guestsCount,
      tubSmall: newBooking.tubSmall,
      totalAmount: newBooking.totalAmount,
      payments: newBooking.payments,
      customer: newBooking.customer,
      status: newBooking.status,
      createdBy: newBooking.createdBy,
      createdAt: newBooking.createdAt,
    });
    return newBooking;
  }

  async updateCottageBooking(id: string, updates: Partial<CottageBooking>): Promise<CottageBooking | undefined> {
    const booking = await this.getCottageBooking(id);
    if (!booking) return undefined;
    
    const updateData: Record<string, any> = {};
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.payments !== undefined) updateData.payments = updates.payments;
    if (updates.customer !== undefined) updateData.customer = updates.customer;
    if (updates.guestsCount !== undefined) updateData.guestsCount = updates.guestsCount;
    if (updates.totalAmount !== undefined) updateData.totalAmount = updates.totalAmount;
    
    if (Object.keys(updateData).length > 0) {
      await db.update(cottageBookingsTable).set(updateData).where(eq(cottageBookingsTable.id, id));
    }
    return this.getCottageBooking(id);
  }

  private mapRowToCottageBooking(row: any): CottageBooking {
    return {
      id: row.id,
      unitCode: row.unitCode,
      dateCheckIn: row.dateCheckIn,
      dateCheckOut: row.dateCheckOut,
      guestsCount: row.guestsCount,
      tubSmall: row.tubSmall,
      totalAmount: row.totalAmount,
      payments: row.payments as any,
      customer: row.customer as any,
      status: row.status as any,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };
  }

  async getBathBookings(): Promise<BathBooking[]> {
    const rows = await db.select().from(bathBookingsTable).orderBy(desc(bathBookingsTable.createdAt));
    return rows.map(r => this.mapRowToBathBooking(r));
  }

  async getBathBookingsUpcoming(): Promise<BathBooking[]> {
    const today = new Date().toISOString().split("T")[0];
    const rows = await db.select().from(bathBookingsTable)
      .where(gte(bathBookingsTable.date, today))
      .orderBy(asc(bathBookingsTable.date));
    return rows.map(r => this.mapRowToBathBooking(r));
  }

  async getBathBooking(id: string): Promise<BathBooking | undefined> {
    const rows = await db.select().from(bathBookingsTable).where(eq(bathBookingsTable.id, id));
    return rows[0] ? this.mapRowToBathBooking(rows[0]) : undefined;
  }

  async getBathBookingsForDate(date: string): Promise<BathBooking[]> {
    const rows = await db.select().from(bathBookingsTable).where(eq(bathBookingsTable.date, date));
    return rows.map(r => this.mapRowToBathBooking(r));
  }

  async createBathBooking(booking: InsertBathBooking): Promise<BathBooking> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const b = booking as any;
    
    // Calculate pricing if not provided
    let pricing = b.pricing;
    if (!pricing) {
      const prices = await this.getServicePrices();
      const getPrice = (key: string) => prices.find(p => p.key === key)?.price || PRICES[key] || 0;
      
      const startHour = parseInt(booking.startTime.split(":")[0]);
      const endHour = parseInt(booking.endTime.split(":")[0]);
      const hours = endHour - startHour;
      
      let base = getPrice("bath_base_3h");
      let extras = 0;
      if (hours > 3) extras += (hours - 3) * getPrice("bath_extra_hour");
      if (booking.options?.tub === "small") extras += getPrice("tub_small");
      if (booking.options?.tub === "large") extras += getPrice("tub_large");
      if (booking.options?.grill) extras += getPrice("grill");
      if (booking.options?.charcoal) extras += getPrice("charcoal");
      
      pricing = { base, extras, total: base + extras };
    }
    
    const newBooking: BathBooking = {
      id,
      bathCode: booking.bathCode,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      customer: booking.customer,
      guestId: b.guestId,
      options: booking.options || { tub: "none", terrace: false, grill: false, charcoal: false },
      pricing,
      payments: b.payments || { eripPaid: 0, cashPaid: 0 },
      status: b.status || "pending_call",
      holdUntil: b.holdUntil,
      assignedAdmin: b.assignedAdmin,
      arrivedAt: undefined,
      noShow: false,
      createdAt: now,
    };
    await db.insert(bathBookingsTable).values({
      id: newBooking.id,
      bathCode: newBooking.bathCode,
      date: newBooking.date,
      startTime: newBooking.startTime,
      endTime: newBooking.endTime,
      customer: newBooking.customer,
      guestId: newBooking.guestId || null,
      options: newBooking.options,
      pricing: newBooking.pricing,
      payments: newBooking.payments,
      status: newBooking.status,
      holdUntil: newBooking.holdUntil || null,
      assignedAdmin: newBooking.assignedAdmin || null,
      arrivedAt: newBooking.arrivedAt || null,
      noShow: newBooking.noShow,
      createdAt: newBooking.createdAt,
    });
    return newBooking;
  }

  async updateBathBooking(id: string, updates: Partial<BathBooking>): Promise<BathBooking | undefined> {
    const booking = await this.getBathBooking(id);
    if (!booking) return undefined;
    
    const updateData: Record<string, any> = {};
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.payments !== undefined) updateData.payments = updates.payments;
    if (updates.holdUntil !== undefined) updateData.holdUntil = updates.holdUntil;
    if (updates.assignedAdmin !== undefined) updateData.assignedAdmin = updates.assignedAdmin;
    
    if (Object.keys(updateData).length > 0) {
      await db.update(bathBookingsTable).set(updateData).where(eq(bathBookingsTable.id, id));
    }
    return this.getBathBooking(id);
  }

  private mapRowToBathBooking(row: any): BathBooking {
    return {
      id: row.id,
      bathCode: row.bathCode,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      customer: row.customer as any,
      guestId: row.guestId || undefined,
      options: row.options as any,
      pricing: row.pricing as any,
      payments: row.payments as any,
      status: row.status as any,
      holdUntil: row.holdUntil || undefined,
      assignedAdmin: row.assignedAdmin || undefined,
      arrivedAt: row.arrivedAt || undefined,
      noShow: row.noShow ?? false,
      createdAt: row.createdAt,
    };
  }

  async getSpaBookings(): Promise<SpaBooking[]> {
    const rows = await db.select().from(spaBookingsTable).orderBy(desc(spaBookingsTable.createdAt));
    return rows.map(r => this.mapRowToSpaBooking(r));
  }

  async getSpaBookingsUpcoming(): Promise<SpaBooking[]> {
    const today = new Date().toISOString().split("T")[0];
    const rows = await db.select().from(spaBookingsTable)
      .where(gte(spaBookingsTable.date, today))
      .orderBy(asc(spaBookingsTable.date));
    return rows.map(r => this.mapRowToSpaBooking(r));
  }

  async getSpaBooking(id: string): Promise<SpaBooking | undefined> {
    const rows = await db.select().from(spaBookingsTable).where(eq(spaBookingsTable.id, id));
    return rows[0] ? this.mapRowToSpaBooking(rows[0]) : undefined;
  }

  async getSpaBookingsForDate(date: string): Promise<SpaBooking[]> {
    const rows = await db.select().from(spaBookingsTable).where(eq(spaBookingsTable.date, date));
    return rows.map(r => this.mapRowToSpaBooking(r));
  }

  private calculateSpaPrice(bookingType: string, guestsCount: number): number {
    switch (bookingType) {
      case "bath_only":
        return PRICES.spa_bath_only_base3h;
      case "terrace_only":
        return PRICES.spa_terrace_only_base3h;
      case "tub_only":
        return guestsCount <= 4 ? PRICES.spa_tub_only_up_to_4 : PRICES.spa_tub_only_5_plus;
      case "bath_with_tub":
        return guestsCount <= 4 ? PRICES.spa_bath_with_tub_up_to_4 : PRICES.spa_bath_with_tub_5_plus;
      default:
        return 0;
    }
  }

  private deriveSpaOptions(bookingType: string): { tub: string; terrace: boolean; grill: boolean; charcoal: boolean } {
    switch (bookingType) {
      case "bath_only":
        return { tub: "none", terrace: false, grill: false, charcoal: false };
      case "terrace_only":
        return { tub: "none", terrace: true, grill: false, charcoal: false };
      case "tub_only":
        return { tub: "small", terrace: false, grill: false, charcoal: false };
      case "bath_with_tub":
        return { tub: "large", terrace: false, grill: false, charcoal: false };
      default:
        return { tub: "none", terrace: false, grill: false, charcoal: false };
    }
  }

  async createSpaBooking(booking: InsertSpaBooking): Promise<SpaBooking> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const b = booking as any;
    
    // Calculate pricing if not provided
    let pricing = b.pricing;
    if (!pricing) {
      const basePrice = this.calculateSpaPrice(booking.bookingType, booking.guestsCount);
      pricing = { base: basePrice, total: basePrice, discountPercent: 0, discountAmount: 0 };
    }
    
    // Derive options from bookingType
    const options = b.options || this.deriveSpaOptions(booking.bookingType);
    
    const newBooking: SpaBooking = {
      id,
      spaResource: booking.spaResource,
      bookingType: booking.bookingType,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      durationHours: booking.durationHours || 3,
      guestsCount: booking.guestsCount,
      customer: booking.customer,
      comment: booking.comment,
      options,
      pricing,
      payments: b.payments || { eripPaid: 0, cashPaid: 0 },
      status: b.status || "pending_call",
      holdUntil: b.holdUntil,
      assignedAdmin: b.assignedAdmin,
      createdAt: now,
    };
    await db.insert(spaBookingsTable).values({
      id: newBooking.id,
      spaResource: newBooking.spaResource,
      bookingType: newBooking.bookingType,
      date: newBooking.date,
      startTime: newBooking.startTime,
      endTime: newBooking.endTime,
      durationHours: newBooking.durationHours,
      guestsCount: newBooking.guestsCount,
      customer: newBooking.customer,
      comment: newBooking.comment || null,
      options: newBooking.options || null,
      pricing: newBooking.pricing,
      payments: newBooking.payments,
      status: newBooking.status,
      holdUntil: newBooking.holdUntil || null,
      assignedAdmin: newBooking.assignedAdmin || null,
      createdAt: newBooking.createdAt,
    });
    return newBooking;
  }

  async createSpaBookingWithDiscount(booking: InsertSpaBooking, discountPercent: number): Promise<SpaBooking> {
    const basePrice = this.calculateSpaPrice(booking.bookingType, booking.guestsCount);
    const discountAmount = Math.round(basePrice * discountPercent / 100);
    const totalPrice = basePrice - discountAmount;
    
    const discountedPricing = {
      base: basePrice,
      total: totalPrice,
      discountPercent: discountPercent,
      discountAmount: discountAmount,
    };
    return this.createSpaBooking({ ...booking, pricing: discountedPricing } as any);
  }

  async updateSpaBooking(id: string, updates: Partial<SpaBooking>): Promise<SpaBooking | undefined> {
    const booking = await this.getSpaBooking(id);
    if (!booking) return undefined;
    
    const updateData: Record<string, any> = {};
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.payments !== undefined) updateData.payments = updates.payments;
    if (updates.pricing !== undefined) updateData.pricing = updates.pricing;
    if (updates.holdUntil !== undefined) updateData.holdUntil = updates.holdUntil;
    if (updates.assignedAdmin !== undefined) updateData.assignedAdmin = updates.assignedAdmin;
    
    if (Object.keys(updateData).length > 0) {
      await db.update(spaBookingsTable).set(updateData).where(eq(spaBookingsTable.id, id));
    }
    return this.getSpaBooking(id);
  }

  private mapRowToSpaBooking(row: any): SpaBooking {
    return {
      id: row.id,
      spaResource: row.spaResource as any,
      bookingType: row.bookingType as any,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      durationHours: row.durationHours,
      guestsCount: row.guestsCount,
      customer: row.customer as any,
      comment: row.comment || undefined,
      options: row.options || undefined,
      pricing: row.pricing as any,
      payments: row.payments as any,
      status: row.status as any,
      holdUntil: row.holdUntil || undefined,
      assignedAdmin: row.assignedAdmin || undefined,
      createdAt: row.createdAt,
    };
  }

  async getQuadBookings(): Promise<QuadBooking[]> {
    const rows = await db.select().from(quadBookingsTable).orderBy(desc(quadBookingsTable.createdAt));
    return rows.map(r => this.mapRowToQuadBooking(r));
  }

  async getQuadBookingsForDate(date: string): Promise<QuadBooking[]> {
    const rows = await db.select().from(quadBookingsTable).where(eq(quadBookingsTable.date, date));
    return rows.map(r => this.mapRowToQuadBooking(r));
  }

  async getQuadBookingsUpcoming(): Promise<QuadBooking[]> {
    const today = new Date().toISOString().split("T")[0];
    const rows = await db.select().from(quadBookingsTable)
      .where(gte(quadBookingsTable.date, today))
      .orderBy(asc(quadBookingsTable.date));
    return rows.map(r => this.mapRowToQuadBooking(r));
  }

  async getQuadBooking(id: string): Promise<QuadBooking | undefined> {
    const rows = await db.select().from(quadBookingsTable).where(eq(quadBookingsTable.id, id));
    return rows[0] ? this.mapRowToQuadBooking(rows[0]) : undefined;
  }

  async createQuadBooking(booking: InsertQuadBooking): Promise<QuadBooking> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const b = booking as any;
    
    // Calculate duration and end time
    const duration = booking.routeType === "short" ? 30 : 60;
    const endTime = b.endTime || this.addMinutes(booking.startTime, duration);
    
    // Calculate pricing (if not provided)
    let pricing = b.pricing;
    if (!pricing) {
      const basePrice = booking.routeType === "short" ? PRICES.quad_30m : PRICES.quad_60m;
      
      // Check if joining existing slot for discount
      let discountApplied = false;
      let discount = 0;
      
      if (booking.slotId) {
        const existingBookings = await this.getQuadBookingsForDate(booking.date);
        const sameSlot = existingBookings.find(b => 
          b.startTime === booking.startTime && 
          b.routeType === booking.routeType &&
          b.status !== "cancelled"
        );
        if (sameSlot) {
          discountApplied = true;
          discount = Math.round(basePrice * booking.quadsCount * 0.05);
        }
      }
      
      const total = basePrice * booking.quadsCount - discount;
      pricing = { basePrice, total, discount, discountApplied };
    }
    
    // Default payments if not provided
    const payments = b.payments || { eripPaid: 0, cashPaid: 0 };
    
    const newBooking: QuadBooking = {
      id,
      slotId: booking.slotId,
      date: booking.date,
      startTime: booking.startTime,
      endTime,
      routeType: booking.routeType,
      quadsCount: booking.quadsCount,
      customer: booking.customer,
      pricing,
      payments,
      status: b.status || "pending_call",
      comment: booking.comment,
      createdAt: now,
    };
    await db.insert(quadBookingsTable).values({
      id: newBooking.id,
      slotId: newBooking.slotId || null,
      date: newBooking.date,
      startTime: newBooking.startTime,
      endTime: newBooking.endTime,
      routeType: newBooking.routeType,
      quadsCount: newBooking.quadsCount,
      customer: newBooking.customer,
      pricing: newBooking.pricing,
      payments: newBooking.payments,
      status: newBooking.status,
      comment: newBooking.comment || null,
      createdAt: newBooking.createdAt,
    });
    return newBooking;
  }

  async updateQuadBooking(id: string, updates: Partial<QuadBooking>): Promise<QuadBooking | undefined> {
    const booking = await this.getQuadBooking(id);
    if (!booking) return undefined;
    
    const updateData: Record<string, any> = {};
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.payments !== undefined) updateData.payments = updates.payments;
    if (updates.slotId !== undefined) updateData.slotId = updates.slotId;
    
    if (Object.keys(updateData).length > 0) {
      await db.update(quadBookingsTable).set(updateData).where(eq(quadBookingsTable.id, id));
    }
    return this.getQuadBooking(id);
  }

  private mapRowToQuadBooking(row: any): QuadBooking {
    return {
      id: row.id,
      slotId: row.slotId || undefined,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      routeType: row.routeType as any,
      quadsCount: row.quadsCount,
      customer: row.customer as any,
      pricing: row.pricing as any,
      payments: row.payments as any,
      status: row.status as any,
      comment: row.comment || undefined,
      createdAt: row.createdAt,
    };
  }

  async getQuadSlotsForDate(date: string): Promise<QuadSlot[]> {
    const bookings = await this.getQuadBookingsForDate(date);
    const blocked = await this.getInstructorBlockedTimesForDate(date);
    const slots: QuadSlot[] = [];
    
    for (let hour = 9; hour < 19; hour++) {
      const startTime = `${hour.toString().padStart(2, "0")}:00`;
      const endTime30 = `${hour.toString().padStart(2, "0")}:30`;
      const endTime60 = `${(hour + 1).toString().padStart(2, "0")}:00`;
      
      const isBlocked = blocked.some(b => {
        if (!b.startTime || !b.endTime) return true;
        return b.startTime <= startTime && b.endTime > startTime;
      });
      
      if (isBlocked) continue;
      
      const slotBookings = bookings.filter(b => b.startTime === startTime && b.status !== "cancelled");
      const totalQuads = slotBookings.reduce((sum, b) => sum + b.quadsCount, 0);
      const availableQuads = 4 - totalQuads;
      
      slots.push({
        id: `${date}-${startTime}`,
        date,
        startTime,
        endTime: endTime60,
        routeType: "long",
        totalQuads: 4,
        bookedQuads: totalQuads,
        basePrice: 80,
        hasDiscount: false,
        status: availableQuads > 0 ? "open" : "full",
        bookings: slotBookings,
        createdAt: new Date().toISOString(),
      } as QuadSlot);
    }
    
    return slots;
  }

  async getTasks(): Promise<Task[]> {
    const rows = await db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt));
    return rows.map(r => this.mapRowToTask(r));
  }

  async getTasksForDate(date: string): Promise<Task[]> {
    const rows = await db.select().from(tasksTable).where(eq(tasksTable.date, date));
    return rows.map(r => this.mapRowToTask(r));
  }

  async getTask(id: string): Promise<Task | undefined> {
    const rows = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    return rows[0] ? this.mapRowToTask(rows[0]) : undefined;
  }

  async createTask(task: InsertTask, createdBy?: string): Promise<Task> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newTask: Task = {
      id,
      date: task.date,
      unitCode: task.unitCode,
      type: task.type,
      title: task.title,
      description: task.description,
      checklist: task.checklist,
      status: task.status || "open",
      assignedTo: task.assignedTo,
      priority: task.priority || "normal",
      notifyAt: task.notifyAt,
      notified: false,
      createdBySystem: task.createdBySystem || false,
      createdBy: createdBy,
      meta: task.meta,
      createdAt: now,
    };
    await db.insert(tasksTable).values({
      id: newTask.id,
      date: newTask.date,
      unitCode: newTask.unitCode || null,
      type: newTask.type,
      title: newTask.title,
      description: newTask.description || null,
      checklist: newTask.checklist || null,
      status: newTask.status,
      assignedTo: newTask.assignedTo || null,
      priority: newTask.priority,
      notifyAt: newTask.notifyAt || null,
      notified: newTask.notified,
      createdBySystem: newTask.createdBySystem,
      createdBy: newTask.createdBy || null,
      meta: newTask.meta || null,
      createdAt: newTask.createdAt,
    });
    return newTask;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined> {
    const task = await this.getTask(id);
    if (!task) return undefined;
    
    const updateData: Record<string, any> = {};
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.assignedTo !== undefined) updateData.assignedTo = updates.assignedTo;
    if (updates.acceptedAt !== undefined) updateData.acceptedAt = updates.acceptedAt;
    if (updates.checklist !== undefined) updateData.checklist = updates.checklist;
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.notifyAt !== undefined) updateData.notifyAt = updates.notifyAt;
    if (updates.notified !== undefined) updateData.notified = updates.notified;
    
    if (Object.keys(updateData).length > 0) {
      await db.update(tasksTable).set(updateData).where(eq(tasksTable.id, id));
    }
    return this.getTask(id);
  }

  private mapRowToTask(row: any): Task {
    return {
      id: row.id,
      date: row.date,
      unitCode: row.unitCode || undefined,
      type: row.type as any,
      title: row.title,
      description: row.description || undefined,
      checklist: row.checklist as any,
      status: row.status as any,
      assignedTo: row.assignedTo || undefined,
      acceptedAt: row.acceptedAt || undefined,
      priority: row.priority || "normal",
      notifyAt: row.notifyAt || undefined,
      notified: row.notified || false,
      createdBySystem: row.createdBySystem,
      createdBy: row.createdBy || undefined,
      meta: row.meta as any,
      createdAt: row.createdAt,
    };
  }

  async getCashShifts(): Promise<CashShift[]> {
    const rows = await db.select().from(cashShiftsTable).orderBy(desc(cashShiftsTable.openedAt));
    return rows.map(r => this.mapRowToCashShift(r));
  }

  async getCurrentShift(cashBox: "main" | "quads" = "main"): Promise<CashShift | undefined> {
    const rows = await db.select().from(cashShiftsTable)
      .where(and(eq(cashShiftsTable.isOpen, true), eq(cashShiftsTable.cashBox, cashBox)));
    return rows[0] ? this.mapRowToCashShift(rows[0]) : undefined;
  }

  async getCashShift(id: string): Promise<CashShift | undefined> {
    const rows = await db.select().from(cashShiftsTable).where(eq(cashShiftsTable.id, id));
    return rows[0] ? this.mapRowToCashShift(rows[0]) : undefined;
  }

  async createCashShift(shift: InsertCashShift, cashBox: "main" | "quads" = "main"): Promise<CashShift> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newShift: CashShift = {
      id,
      openedAt: now,
      closedAt: undefined,
      openedBy: shift.openedBy,
      isOpen: true,
      visibleToAdmin: true,
      cashBox,
    };
    await db.insert(cashShiftsTable).values({
      id: newShift.id,
      openedAt: newShift.openedAt,
      closedAt: null,
      openedBy: newShift.openedBy,
      isOpen: newShift.isOpen,
      visibleToAdmin: newShift.visibleToAdmin,
      cashBox: newShift.cashBox,
    });
    return newShift;
  }

  async updateCashShift(id: string, updates: Partial<CashShift>): Promise<CashShift | undefined> {
    const shift = await this.getCashShift(id);
    if (!shift) return undefined;
    
    const updateData: Record<string, any> = {};
    if (updates.isOpen !== undefined) updateData.isOpen = updates.isOpen;
    if (updates.closedAt !== undefined) updateData.closedAt = updates.closedAt;
    if (updates.visibleToAdmin !== undefined) updateData.visibleToAdmin = updates.visibleToAdmin;
    
    if (Object.keys(updateData).length > 0) {
      await db.update(cashShiftsTable).set(updateData).where(eq(cashShiftsTable.id, id));
    }
    return this.getCashShift(id);
  }

  private mapRowToCashShift(row: any): CashShift {
    return {
      id: row.id,
      openedAt: row.openedAt,
      closedAt: row.closedAt || undefined,
      openedBy: row.openedBy,
      isOpen: row.isOpen,
      visibleToAdmin: row.visibleToAdmin,
      cashBox: row.cashBox || "main",
    };
  }

  async getCashTransactions(shiftId?: string): Promise<CashTransaction[]> {
    if (shiftId) {
      const rows = await db.select().from(cashTransactionsTable)
        .where(eq(cashTransactionsTable.shiftId, shiftId))
        .orderBy(desc(cashTransactionsTable.createdAt));
      return rows.map(r => this.mapRowToCashTransaction(r));
    }
    const rows = await db.select().from(cashTransactionsTable).orderBy(desc(cashTransactionsTable.createdAt));
    return rows.map(r => this.mapRowToCashTransaction(r));
  }

  async getCashTransactionsSinceLastIncasation(): Promise<CashTransaction[]> {
    // Find last incasation (transfer_to_owner) transaction as boundary
    // Also check for legacy "cash_out" with incasation-related comments for backwards compatibility
    const allTransactions = await db.select().from(cashTransactionsTable)
      .orderBy(desc(cashTransactionsTable.createdAt));
    
    // Find the last incasation transaction using a more flexible comment check
    const lastIncasationTx = allTransactions.find(tx => 
      tx.type === "transfer_to_owner" ||
      (tx.type === "cash_out" && (
        tx.comment?.includes("Инкассация") ||
        tx.comment?.includes("инкассация") ||
        tx.comment?.includes("перевод собственнику")
      ))
    );
    
    if (!lastIncasationTx) {
      // No incasation ever done - return all transactions
      return this.getCashTransactions();
    }
    
    // Get transactions created AFTER the last incasation (strict >)
    const rows = await db.select().from(cashTransactionsTable)
      .where(gt(cashTransactionsTable.createdAt, lastIncasationTx.createdAt))
      .orderBy(desc(cashTransactionsTable.createdAt));
    return rows.map(r => this.mapRowToCashTransaction(r));
  }

  async getCashTransactionsByPeriod(period: string): Promise<CashTransaction[]> {
    const [type, dateStr] = period.split(":");
    const date = new Date(dateStr);
    
    let startDate: Date, endDate: Date;
    
    if (type === "day") {
      startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
    } else if (type === "week") {
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(date);
      startDate.setDate(diff);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate = new Date(date.getFullYear(), date.getMonth(), 1);
      endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    }
    
    const rows = await db.select({
      transaction: cashTransactionsTable,
      userName: usersTable.name,
    }).from(cashTransactionsTable)
      .leftJoin(usersTable, eq(cashTransactionsTable.createdBy, usersTable.id))
      .where(and(
        gte(cashTransactionsTable.createdAt, startDate.toISOString()),
        lte(cashTransactionsTable.createdAt, endDate.toISOString())
      ))
      .orderBy(desc(cashTransactionsTable.createdAt));
    
    return rows.map(r => ({
      ...this.mapRowToCashTransaction(r.transaction),
      createdByName: r.userName || undefined,
    }));
  }

  async createCashTransaction(tx: InsertCashTransaction): Promise<CashTransaction> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newTx: CashTransaction = {
      id,
      shiftId: tx.shiftId,
      type: tx.type,
      amount: tx.amount,
      category: tx.category,
      comment: tx.comment,
      createdAt: now,
      createdBy: tx.createdBy,
      location: tx.location,
    };
    await db.insert(cashTransactionsTable).values({
      id: newTx.id,
      shiftId: newTx.shiftId,
      type: newTx.type,
      amount: newTx.amount,
      category: newTx.category || null,
      comment: newTx.comment || null,
      createdAt: newTx.createdAt,
      createdBy: newTx.createdBy,
      location: newTx.location || null,
    });
    return newTx;
  }

  private mapRowToCashTransaction(row: any): CashTransaction {
    return {
      id: row.id,
      shiftId: row.shiftId,
      type: row.type as any,
      amount: row.amount,
      category: row.category || undefined,
      comment: row.comment || undefined,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      location: row.location as any,
    };
  }

  async getIncasations(): Promise<Incasation[]> {
    const rows = await db.select().from(incasationsTable).orderBy(desc(incasationsTable.performedAt));
    return rows.map(r => this.mapRowToIncasation(r));
  }

  async getLastIncasation(): Promise<Incasation | undefined> {
    const rows = await db.select().from(incasationsTable).orderBy(desc(incasationsTable.performedAt)).limit(1);
    return rows[0] ? this.mapRowToIncasation(rows[0]) : undefined;
  }

  async createIncasation(incasation: InsertIncasation): Promise<Incasation> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newIncasation: Incasation = {
      id,
      performedAt: now,
      performedBy: incasation.performedBy,
      periodStart: incasation.periodStart,
      periodEnd: incasation.periodEnd,
      summary: incasation.summary,
      shiftsIncluded: incasation.shiftsIncluded,
      createdAt: now,
    };
    await db.insert(incasationsTable).values({
      id: newIncasation.id,
      performedAt: newIncasation.performedAt,
      performedBy: newIncasation.performedBy,
      periodStart: newIncasation.periodStart,
      periodEnd: newIncasation.periodEnd,
      summary: newIncasation.summary,
      shiftsIncluded: newIncasation.shiftsIncluded,
      createdAt: newIncasation.createdAt,
    });
    return newIncasation;
  }

  private mapRowToIncasation(row: any): Incasation {
    return {
      id: row.id,
      performedAt: row.performedAt,
      performedBy: row.performedBy,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      summary: row.summary as any,
      shiftsIncluded: row.shiftsIncluded as any,
      createdAt: row.createdAt,
    };
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
    dailyBreakdown: Array<{
      date: string;
      cashIn: number;
      expenses: number;
      balance: number;
    }>;
  }> {
    const transactions = await this.getCashTransactionsSinceLastIncasation();
    const lastIncasation = await this.getLastIncasation();
    
    let cashRevenue = 0;
    let eripRevenue = 0;
    let totalExpenses = 0;
    const expensesByCategory: Record<string, number> = {};
    const dailyData: Record<string, { cashIn: number; expenses: number }> = {};
    
    for (const tx of transactions) {
      // Get date part only (YYYY-MM-DD)
      const dateKey = tx.createdAt.split('T')[0];
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { cashIn: 0, expenses: 0 };
      }
      
      // Skip transfer transactions - they are NOT income or expenses
      const isTransfer = tx.type === "transfer_to_owner" || tx.type === "transfer_to_admin";
      // Also check for legacy incasation records (cash_out with any incasation-related comment)
      const isLegacyIncasation = tx.type === "cash_out" && (
        tx.comment?.includes("Инкассация") || 
        tx.comment?.includes("инкассация") ||
        tx.comment?.includes("перевод собственнику")
      );
      
      if (isTransfer || isLegacyIncasation) {
        // Skip transfers from analytics - they don't affect income/expense totals
        // But transfer_to_admin adds to admin cash, which we track separately
        if (tx.type === "transfer_to_admin") {
          cashRevenue += tx.amount;
          dailyData[dateKey].cashIn += tx.amount;
        }
        continue;
      }
      
      if (tx.type === "cash_in") {
        cashRevenue += tx.amount;
        dailyData[dateKey].cashIn += tx.amount;
      } else if (tx.type === "cash_out" || tx.type === "expense") {
        // Real business expenses only
        totalExpenses += tx.amount;
        dailyData[dateKey].expenses += tx.amount;
        const cat = tx.category || "Прочее";
        expensesByCategory[cat] = (expensesByCategory[cat] || 0) + tx.amount;
      }
    }
    
    // Convert daily data to sorted array
    const dailyBreakdown = Object.entries(dailyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        cashIn: data.cashIn,
        expenses: data.expenses,
        balance: data.cashIn - data.expenses,
      }));
    
    const shifts = await this.getCashShifts();
    const closedShiftsSinceIncasation = shifts.filter(s => 
      !s.isOpen && 
      (!lastIncasation || s.closedAt! >= lastIncasation.performedAt)
    );
    
    return {
      periodStart: lastIncasation?.performedAt || shifts[shifts.length - 1]?.openedAt || new Date().toISOString(),
      periodEnd: new Date().toISOString(),
      totalRevenue: cashRevenue + eripRevenue,
      cashRevenue,
      eripRevenue,
      totalExpenses,
      cashOnHand: cashRevenue - totalExpenses,
      expensesByCategory,
      shiftsCount: closedShiftsSinceIncasation.length,
      dailyBreakdown,
    };
  }

  async getWorkLogs(): Promise<WorkLog[]> {
    const rows = await db.select().from(workLogsTable).orderBy(desc(workLogsTable.createdAt));
    return rows.map(r => this.mapRowToWorkLog(r));
  }

  async createWorkLog(log: InsertWorkLog): Promise<WorkLog> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const l = log as any;
    const newLog: WorkLog = {
      id,
      employeeName: log.employeeName,
      byAdmin: log.byAdmin,
      startAt: log.startAt,
      endAt: log.endAt,
      durationMinutes: l.durationMinutes || this.calculateDurationMinutes(log.startAt, log.endAt),
      workType: log.workType,
      hourlyRate: log.hourlyRate,
      note: log.note,
      createdAt: now,
      location: log.location,
    };
    await db.insert(workLogsTable).values({
      id: newLog.id,
      employeeName: newLog.employeeName,
      byAdmin: newLog.byAdmin,
      startAt: newLog.startAt,
      endAt: newLog.endAt,
      durationMinutes: newLog.durationMinutes,
      workType: newLog.workType,
      hourlyRate: newLog.hourlyRate || null,
      note: newLog.note || null,
      createdAt: newLog.createdAt,
      location: newLog.location || null,
    });
    return newLog;
  }

  private mapRowToWorkLog(row: any): WorkLog {
    return {
      id: row.id,
      employeeName: row.employeeName,
      byAdmin: row.byAdmin,
      startAt: row.startAt,
      endAt: row.endAt,
      durationMinutes: row.durationMinutes,
      workType: row.workType as any,
      hourlyRate: row.hourlyRate || undefined,
      note: row.note || undefined,
      createdAt: row.createdAt,
      location: row.location as any,
    };
  }

  async getQuadPricing(): Promise<QuadPricing[]> {
    const rows = await db.select().from(quadPricingTable).orderBy(desc(quadPricingTable.createdAt));
    return rows.map(r => ({
      id: r.id,
      routeType: r.routeType as any,
      price: r.price,
      date: r.date || undefined,
      createdBy: r.createdBy || undefined,
      createdAt: r.createdAt,
    }));
  }

  async getQuadPriceForDate(routeType: QuadRouteType, date?: string): Promise<number> {
    if (date) {
      const rows = await db.select().from(quadPricingTable)
        .where(and(eq(quadPricingTable.routeType, routeType), eq(quadPricingTable.date, date)));
      if (rows[0]) return rows[0].price;
    }
    const rows = await db.select().from(quadPricingTable)
      .where(and(eq(quadPricingTable.routeType, routeType), isNull(quadPricingTable.date)));
    if (rows[0]) return rows[0].price;
    return routeType === "short" ? PRICES.quad_30m : PRICES.quad_60m;
  }

  async setQuadPrice(pricing: InsertQuadPricing, createdBy?: string): Promise<QuadPricing> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newPricing: QuadPricing = {
      id,
      routeType: pricing.routeType,
      price: pricing.price,
      date: pricing.date,
      createdBy,
      createdAt: now,
    };
    
    if (pricing.date) {
      await db.delete(quadPricingTable).where(
        and(eq(quadPricingTable.routeType, pricing.routeType), eq(quadPricingTable.date, pricing.date))
      );
    } else {
      await db.delete(quadPricingTable).where(
        and(eq(quadPricingTable.routeType, pricing.routeType), isNull(quadPricingTable.date))
      );
    }
    
    await db.insert(quadPricingTable).values({
      id: newPricing.id,
      routeType: newPricing.routeType,
      price: newPricing.price,
      date: newPricing.date || null,
      createdBy: newPricing.createdBy || null,
      createdAt: newPricing.createdAt,
    });
    return newPricing;
  }

  async deleteQuadPriceOverride(id: string): Promise<boolean> {
    const result = await db.delete(quadPricingTable).where(eq(quadPricingTable.id, id));
    return true;
  }

  async getInstructorBlockedTimes(): Promise<InstructorBlockedTime[]> {
    const rows = await db.select().from(instructorBlockedTimesTable).orderBy(desc(instructorBlockedTimesTable.createdAt));
    return rows.map(r => ({
      id: r.id,
      date: r.date,
      startTime: r.startTime || undefined,
      endTime: r.endTime || undefined,
      reason: r.reason || undefined,
      createdAt: r.createdAt,
    }));
  }

  async getInstructorBlockedTimesForDate(date: string): Promise<InstructorBlockedTime[]> {
    const rows = await db.select().from(instructorBlockedTimesTable).where(eq(instructorBlockedTimesTable.date, date));
    return rows.map(r => ({
      id: r.id,
      date: r.date,
      startTime: r.startTime || undefined,
      endTime: r.endTime || undefined,
      reason: r.reason || undefined,
      createdAt: r.createdAt,
    }));
  }

  async createInstructorBlockedTime(blocked: InsertInstructorBlockedTime): Promise<InstructorBlockedTime> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newBlocked: InstructorBlockedTime = {
      id,
      date: blocked.date,
      startTime: blocked.startTime,
      endTime: blocked.endTime,
      reason: blocked.reason,
      createdAt: now,
    };
    await db.insert(instructorBlockedTimesTable).values({
      id: newBlocked.id,
      date: newBlocked.date,
      startTime: newBlocked.startTime || null,
      endTime: newBlocked.endTime || null,
      reason: newBlocked.reason || null,
      createdAt: newBlocked.createdAt,
    });
    return newBlocked;
  }

  async deleteInstructorBlockedTime(id: string): Promise<boolean> {
    await db.delete(instructorBlockedTimesTable).where(eq(instructorBlockedTimesTable.id, id));
    return true;
  }

  async getInstructorExpenses(): Promise<InstructorExpense[]> {
    const rows = await db.select().from(instructorExpensesTable).orderBy(desc(instructorExpensesTable.createdAt));
    return rows.map(r => ({
      id: r.id,
      date: r.date,
      category: r.category as any,
      amount: r.amount,
      description: r.description,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
  }

  async getInstructorExpensesForPeriod(startDate: string, endDate: string): Promise<InstructorExpense[]> {
    const rows = await db.select().from(instructorExpensesTable)
      .where(and(gte(instructorExpensesTable.date, startDate), lt(instructorExpensesTable.date, endDate)))
      .orderBy(desc(instructorExpensesTable.date));
    return rows.map(r => ({
      id: r.id,
      date: r.date,
      category: r.category as any,
      amount: r.amount,
      description: r.description,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
  }

  async createInstructorExpense(expense: InsertInstructorExpense): Promise<InstructorExpense> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newExpense: InstructorExpense = {
      id,
      date: expense.date,
      category: expense.category,
      amount: expense.amount,
      description: expense.description,
      createdBy: expense.createdBy,
      createdAt: now,
    };
    await db.insert(instructorExpensesTable).values({
      id: newExpense.id,
      date: newExpense.date,
      category: newExpense.category,
      amount: newExpense.amount,
      description: newExpense.description,
      createdBy: newExpense.createdBy,
      createdAt: newExpense.createdAt,
    });
    return newExpense;
  }

  async deleteInstructorExpense(id: string): Promise<boolean> {
    await db.delete(instructorExpensesTable).where(eq(instructorExpensesTable.id, id));
    return true;
  }

  async getSiteSettings(): Promise<SiteSettings> {
    try {
      const rows = await db.select().from(siteSettingsTable);
      if (rows[0]) {
        return {
          id: rows[0].id,
          geofenceCenter: rows[0].geofenceCenter as any,
          geofenceRadiusM: rows[0].geofenceRadiusM,
          closeTime: rows[0].closeTime,
          timezone: rows[0].timezone,
          adminChatId: rows[0].adminChatId || undefined,
          ownerChatId: rows[0].ownerChatId || undefined,
          instructorChatId: rows[0].instructorChatId || undefined,
          ewelinkTokens: rows[0].ewelinkTokens as any || undefined,
        };
      }
    } catch (err: any) {
      if (err?.code === '42703') {
        const rows = await db.execute(
          sql`SELECT id, geofence_center, geofence_radius_m, close_time, timezone, admin_chat_id, owner_chat_id, instructor_chat_id FROM site_settings LIMIT 1`
        );
        if (rows.rows && rows.rows[0]) {
          const r = rows.rows[0] as any;
          try {
            await db.execute(sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS ewelink_tokens jsonb`);
            console.log("[DB] Auto-added ewelink_tokens column to site_settings");
          } catch {}
          return {
            id: r.id,
            geofenceCenter: r.geofence_center as any,
            geofenceRadiusM: r.geofence_radius_m,
            closeTime: r.close_time,
            timezone: r.timezone,
            adminChatId: r.admin_chat_id || undefined,
            ownerChatId: r.owner_chat_id || undefined,
            instructorChatId: r.instructor_chat_id || undefined,
          };
        }
      } else {
        throw err;
      }
    }
    return {
      id: "settings-1",
      geofenceCenter: { lat: 53.9, lng: 27.5667 },
      geofenceRadiusM: 300,
      closeTime: "22:00",
      timezone: "Europe/Minsk",
    };
  }

  async updateSiteSettings(updates: Partial<SiteSettings>): Promise<SiteSettings> {
    const current = await this.getSiteSettings();
    const rows = await db.select().from(siteSettingsTable);
    
    const updateData: Record<string, any> = {};
    if (updates.geofenceCenter !== undefined) updateData.geofenceCenter = updates.geofenceCenter;
    if (updates.geofenceRadiusM !== undefined) updateData.geofenceRadiusM = updates.geofenceRadiusM;
    if (updates.closeTime !== undefined) updateData.closeTime = updates.closeTime;
    if (updates.timezone !== undefined) updateData.timezone = updates.timezone;
    if (updates.adminChatId !== undefined) updateData.adminChatId = updates.adminChatId;
    if (updates.ownerChatId !== undefined) updateData.ownerChatId = updates.ownerChatId;
    if (updates.instructorChatId !== undefined) updateData.instructorChatId = updates.instructorChatId;
    if ((updates as any).ewelinkTokens !== undefined) updateData.ewelinkTokens = (updates as any).ewelinkTokens;
    
    if (rows[0]) {
      try {
        await db.update(siteSettingsTable).set(updateData).where(eq(siteSettingsTable.id, rows[0].id));
      } catch (err: any) {
        if (err?.code === '42703' && updateData.ewelinkTokens !== undefined) {
          // If update failed due to missing ewelink_tokens, try adding it and update again
          try {
            await db.execute(sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS ewelink_tokens jsonb`);
            console.log("[DB] Auto-added ewelink_tokens column during update");
            await db.update(siteSettingsTable).set(updateData).where(eq(siteSettingsTable.id, rows[0].id));
          } catch (retryErr) {
            // If still failing, update other fields only
            const { ewelinkTokens, ...otherData } = updateData;
            if (Object.keys(otherData).length > 0) {
              await db.update(siteSettingsTable).set(otherData).where(eq(siteSettingsTable.id, rows[0].id));
            }
          }
        } else {
          throw err;
        }
      }
    } else {
      // Logic for insert...
      const insertData = {
        id: "settings-1",
        ...updateData,
        geofenceCenter: updateData.geofenceCenter || current.geofenceCenter,
        geofenceRadiusM: updateData.geofenceRadiusM || current.geofenceRadiusM,
        closeTime: updateData.closeTime || current.closeTime,
        timezone: updateData.timezone || current.timezone,
      };

      try {
        await db.insert(siteSettingsTable).values(insertData);
      } catch (err: any) {
        if (err?.code === '42703') {
          try {
            await db.execute(sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS ewelink_tokens jsonb`);
            await db.insert(siteSettingsTable).values(insertData);
          } catch {
            const { ewelinkTokens, ...otherInsertData } = insertData;
            await db.insert(siteSettingsTable).values(otherInsertData as any);
          }
        } else {
          throw err;
        }
      }
    }
    return this.getSiteSettings();
  }

  async getAnalyticsSummary(period: string): Promise<AnalyticsSummary> {
    const [periodType, dateStr] = period.includes(":") ? period.split(":") : ["month", period];
    const baseDate = new Date(dateStr);
    
    let startDate: string;
    let endDate: string;
    
    if (periodType === "day") {
      startDate = dateStr;
      endDate = dateStr;
    } else if (periodType === "week") {
      const d = new Date(dateStr);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      startDate = monday.toISOString().slice(0, 10);
      endDate = sunday.toISOString().slice(0, 10);
    } else {
      const monthStr = dateStr.slice(0, 7);
      startDate = `${monthStr}-01`;
      const nextMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
      endDate = nextMonth.toISOString().slice(0, 10);
    }
    
    const cottageBookings = await this.getCottageBookings();
    const filteredCottage = cottageBookings.filter(b => {
      const bDate = b.dateCheckIn || b.createdAt.slice(0, 10);
      return bDate >= startDate && bDate <= endDate;
    });
    
    const bathBookings = await this.getBathBookings();
    const filteredBath = bathBookings.filter(b => b.date >= startDate && b.date <= endDate);
    
    const quadBookings = await this.getQuadBookings();
    const filteredQuad = quadBookings.filter(b => b.date >= startDate && b.date <= endDate && b.status !== "cancelled");
    
    const workLogs = await this.getWorkLogs();
    const filteredWork = workLogs.filter(w => {
      const wDate = w.startAt.slice(0, 10);
      return wDate >= startDate && wDate <= endDate;
    });
    
    // Get cash transactions for the period - this is the actual source of truth
    const transactions = await this.getCashTransactionsByPeriod(period);
    
    // Calculate income (cash_in) and expenses (cash_out) from transactions
    // EXCLUDE transfer transactions - they are internal cash movements, not income/expenses
    const isTransferTx = (t: CashTransaction) => 
      t.type === "transfer_to_owner" || 
      t.type === "transfer_to_admin" ||
      (t.type === "cash_out" && (
        t.comment?.includes("Инкассация") || 
        t.comment?.includes("инкассация") ||
        t.comment?.includes("перевод собственнику")
      )); // Legacy incasation records with any related comment
    
    const cashIncome = transactions
      .filter(t => t.type === "cash_in" || t.type === "transfer_to_admin")
      .filter(t => !isTransferTx(t) || t.type === "transfer_to_admin") // transfer_to_admin adds to admin cash
      .reduce((sum, t) => sum + t.amount, 0);
    const cashExpenses = transactions
      .filter(t => t.type === "cash_out" || t.type === "expense")
      .filter(t => !isTransferTx(t)) // Exclude all transfers including legacy
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Separate by payment method from transaction comments/categories
    const eripTransactions = transactions.filter(t => 
      t.comment?.toLowerCase().includes('ерип') || 
      t.comment?.toLowerCase().includes('erip') ||
      t.category === 'erip'
    );
    const eripTotal = eripTransactions.reduce((sum, t) => sum + t.amount, 0);
    const cashTotal = cashIncome - eripTotal; // Cash is income minus ERIP
    
    const cottageRevenue = filteredCottage.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    const bathRevenue = filteredBath.reduce((sum, b) => sum + (b.pricing?.total || 0), 0);
    const quadRevenue = filteredQuad.reduce((sum, b) => sum + (b.pricing?.total || 0), 0);
    
    const tubSmallCount = filteredBath.filter(b => b.options?.tub === "small").length;
    const tubLargeCount = filteredBath.filter(b => b.options?.tub === "large").length;
    const tubSmallPrice = 30;
    const tubLargePrice = 50;
    
    const workHoursTotal = filteredWork.reduce((sum, w) => sum + (w.durationMinutes / 60), 0);
    
    // Per-cottage breakdown
    const cottageBreakdown: Array<{cottageCode: string; bookingsCount: number; revenue: number; cashTotal: number; eripTotal: number}> = [];
    const cottageGroups = new Map<string, typeof filteredCottage>();
    for (const b of filteredCottage) {
      const code = b.unitCode || "unknown";
      if (!cottageGroups.has(code)) cottageGroups.set(code, []);
      cottageGroups.get(code)!.push(b);
    }
    for (const [code, bookings] of cottageGroups) {
      cottageBreakdown.push({
        cottageCode: code,
        bookingsCount: bookings.length,
        revenue: bookings.reduce((s, b) => s + (b.totalAmount || 0), 0),
        cashTotal: bookings.reduce((s, b) => s + (b.payments?.cash || 0), 0),
        eripTotal: bookings.reduce((s, b) => s + (b.payments?.erip || 0), 0),
      });
    }
    cottageBreakdown.sort((a, b) => a.cottageCode.localeCompare(b.cottageCode));
    
    // Service breakdown
    const serviceBreakdown: Array<{serviceType: string; count: number; revenue: number}> = [];
    serviceBreakdown.push({ serviceType: "cottages", count: filteredCottage.length, revenue: cottageRevenue });
    serviceBreakdown.push({ serviceType: "baths", count: filteredBath.length, revenue: bathRevenue });
    serviceBreakdown.push({ serviceType: "quads", count: filteredQuad.length, revenue: quadRevenue });
    serviceBreakdown.push({ serviceType: "tub_small", count: tubSmallCount, revenue: tubSmallCount * tubSmallPrice });
    serviceBreakdown.push({ serviceType: "tub_large", count: tubLargeCount, revenue: tubLargeCount * tubLargePrice });
    
    return {
      month: period,
      cottageBookingsCount: filteredCottage.length,
      cottageRevenue,
      bathBookingsCount: filteredBath.length,
      bathRevenue,
      quadSessionsCount: filteredQuad.length,
      quadRevenue,
      cashTotal,
      eripTotal,
      income: cashIncome,
      expenses: cashExpenses,
      cleaningsByTariff: {},
      tubSmallCount,
      tubSmallRevenue: tubSmallCount * tubSmallPrice,
      tubLargeCount,
      tubLargeRevenue: tubLargeCount * tubLargePrice,
      workHoursTotal,
      cottageBreakdown,
      serviceBreakdown,
    };
  }

  async createSmsCode(phone: string, code: string): Promise<SmsCode> {
    const id = randomUUID();
    const smsCode: SmsCode = {
      id,
      phone,
      codeHash: code,
      attempts: 0,
      verified: false,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
    this.smsCodes.set(phone, smsCode);
    return smsCode;
  }

  async getSmsCode(phone: string): Promise<SmsCode | undefined> {
    return this.smsCodes.get(phone);
  }

  async updateSmsCode(id: string, updates: Partial<SmsCode>): Promise<SmsCode | undefined> {
    for (const entry of Array.from(this.smsCodes.entries())) {
      const [phone, code] = entry;
      if (code.id === id) {
        const updated = { ...code, ...updates };
        this.smsCodes.set(phone, updated);
        return updated;
      }
    }
    return undefined;
  }

  async createVerificationToken(phone: string): Promise<VerificationToken> {
    const id = randomUUID();
    const token: VerificationToken = {
      id,
      phone,
      token: randomUUID(),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
    this.verificationTokens.set(token.token, token);
    return token;
  }

  async getVerificationToken(token: string): Promise<VerificationToken | undefined> {
    return this.verificationTokens.get(token);
  }

  async getReviews(): Promise<Review[]> {
    const rows = await db.select().from(reviewsTable).orderBy(desc(reviewsTable.createdAt));
    return rows.map(r => this.mapRowToReview(r));
  }

  async getReviewsPublished(): Promise<Review[]> {
    const rows = await db.select().from(reviewsTable)
      .where(eq(reviewsTable.isPublished, true))
      .orderBy(desc(reviewsTable.createdAt));
    return rows.map(r => this.mapRowToReview(r));
  }

  async getReview(id: string): Promise<Review | undefined> {
    const rows = await db.select().from(reviewsTable).where(eq(reviewsTable.id, id));
    return rows[0] ? this.mapRowToReview(rows[0]) : undefined;
  }

  async createReview(review: InsertReview): Promise<Review> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newReview: Review = {
      id,
      bookingRef: review.bookingRef,
      customer: review.customer,
      rating: review.rating,
      text: review.text,
      isPublished: false,
      createdAt: now,
    };
    await db.insert(reviewsTable).values({
      id: newReview.id,
      bookingRef: newReview.bookingRef,
      customer: newReview.customer,
      rating: newReview.rating,
      text: newReview.text,
      isPublished: newReview.isPublished,
      createdAt: newReview.createdAt,
    });
    return newReview;
  }

  async updateReview(id: string, updates: Partial<Review>): Promise<Review | undefined> {
    const review = await this.getReview(id);
    if (!review) return undefined;
    
    const updateData: Record<string, any> = {};
    if (updates.isPublished !== undefined) updateData.isPublished = updates.isPublished;
    if (updates.publishedAt !== undefined) updateData.publishedAt = updates.publishedAt;
    if (updates.publishedBy !== undefined) updateData.publishedBy = updates.publishedBy;
    
    if (Object.keys(updateData).length > 0) {
      await db.update(reviewsTable).set(updateData).where(eq(reviewsTable.id, id));
    }
    return this.getReview(id);
  }

  private mapRowToReview(row: any): Review {
    return {
      id: row.id,
      bookingRef: row.bookingRef as any,
      customer: row.customer as any,
      rating: row.rating,
      text: row.text,
      isPublished: row.isPublished,
      publishedAt: row.publishedAt || undefined,
      publishedBy: row.publishedBy || undefined,
      createdAt: row.createdAt,
    };
  }

  async getBlockedDates(): Promise<BlockedDate[]> {
    const rows = await db.select().from(blockedDatesTable).orderBy(desc(blockedDatesTable.date));
    return rows.map(r => ({
      id: r.id,
      date: r.date,
      reason: r.reason || undefined,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
  }

  async getBlockedDate(date: string): Promise<BlockedDate | undefined> {
    const rows = await db.select().from(blockedDatesTable).where(eq(blockedDatesTable.date, date));
    if (!rows[0]) return undefined;
    return {
      id: rows[0].id,
      date: rows[0].date,
      reason: rows[0].reason || undefined,
      createdBy: rows[0].createdBy,
      createdAt: rows[0].createdAt,
    };
  }

  async createBlockedDate(blockedDate: InsertBlockedDate): Promise<BlockedDate> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newBlocked: BlockedDate = {
      id,
      date: blockedDate.date,
      reason: blockedDate.reason,
      createdBy: blockedDate.createdBy,
      createdAt: now,
    };
    await db.insert(blockedDatesTable).values({
      id: newBlocked.id,
      date: newBlocked.date,
      reason: newBlocked.reason || null,
      createdBy: newBlocked.createdBy,
      createdAt: newBlocked.createdAt,
    });
    return newBlocked;
  }

  async deleteBlockedDate(date: string): Promise<boolean> {
    await db.delete(blockedDatesTable).where(eq(blockedDatesTable.date, date));
    return true;
  }

  async createAuthSession(session: InsertAuthSession): Promise<AuthSession> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newSession: AuthSession = {
      id,
      userId: session.userId,
      token: session.token,
      expiresAt: session.expiresAt,
      createdAt: now,
    };
    await db.insert(authSessionsTable).values({
      id: newSession.id,
      userId: newSession.userId,
      token: newSession.token,
      expiresAt: newSession.expiresAt,
      createdAt: newSession.createdAt,
    });
    return newSession;
  }

  async getAuthSession(token: string): Promise<AuthSession | undefined> {
    const rows = await db.select().from(authSessionsTable).where(eq(authSessionsTable.token, token));
    if (!rows[0]) return undefined;
    return {
      id: rows[0].id,
      userId: rows[0].userId,
      token: rows[0].token,
      expiresAt: rows[0].expiresAt,
      createdAt: rows[0].createdAt,
    };
  }

  async deleteAuthSession(token: string): Promise<boolean> {
    await db.delete(authSessionsTable).where(eq(authSessionsTable.token, token));
    return true;
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await db.delete(authSessionsTable).where(eq(authSessionsTable.userId, userId));
  }

  async getStaffUsers(): Promise<User[]> {
    const rows = await db.select().from(usersTable)
      .where(sql`${usersTable.role} IN ('SUPER_ADMIN', 'OWNER', 'ADMIN', 'INSTRUCTOR')`);
    return rows.map(r => this.mapRowToUser(r));
  }

  async updateUserRole(userId: string, role: UserRole): Promise<User | undefined> {
    return this.updateUser(userId, { role });
  }

  async getQuadMachines(): Promise<QuadMachine[]> {
    const rows = await db.select().from(quadMachinesTable).orderBy(asc(quadMachinesTable.code));
    return rows.map(r => this.mapRowToQuadMachine(r));
  }

  async getQuadMachine(id: string): Promise<QuadMachine | undefined> {
    const rows = await db.select().from(quadMachinesTable).where(eq(quadMachinesTable.id, id));
    return rows[0] ? this.mapRowToQuadMachine(rows[0]) : undefined;
  }

  async createQuadMachine(machine: InsertQuadMachine): Promise<QuadMachine> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newMachine: QuadMachine = {
      id,
      code: machine.code,
      name: machine.name,
      ownerType: machine.ownerType,
      isActive: machine.isActive ?? true,
      currentMileageKm: machine.currentMileageKm ?? 0,
      commissioningDate: machine.commissioningDate,
      notes: machine.notes,
      createdAt: now,
    };
    await db.insert(quadMachinesTable).values({
      id: newMachine.id,
      code: newMachine.code,
      name: newMachine.name,
      ownerType: newMachine.ownerType,
      isActive: newMachine.isActive,
      currentMileageKm: newMachine.currentMileageKm,
      commissioningDate: newMachine.commissioningDate || null,
      notes: newMachine.notes || null,
      createdAt: newMachine.createdAt,
    });
    return newMachine;
  }

  async updateQuadMachine(id: string, updates: Partial<QuadMachine>): Promise<QuadMachine | undefined> {
    const machine = await this.getQuadMachine(id);
    if (!machine) return undefined;
    
    const updateData: Record<string, any> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    if (updates.currentMileageKm !== undefined) updateData.currentMileageKm = updates.currentMileageKm;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    
    if (Object.keys(updateData).length > 0) {
      await db.update(quadMachinesTable).set(updateData).where(eq(quadMachinesTable.id, id));
    }
    return this.getQuadMachine(id);
  }

  private mapRowToQuadMachine(row: any): QuadMachine {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      ownerType: row.ownerType as any,
      isActive: row.isActive,
      currentMileageKm: row.currentMileageKm,
      commissioningDate: row.commissioningDate || undefined,
      notes: row.notes || undefined,
      createdAt: row.createdAt,
    };
  }

  async getQuadMileageLogs(quadId?: string): Promise<QuadMileageLog[]> {
    if (quadId) {
      const rows = await db.select().from(quadMileageLogsTable)
        .where(eq(quadMileageLogsTable.quadId, quadId))
        .orderBy(desc(quadMileageLogsTable.loggedAt));
      return rows.map(r => this.mapRowToQuadMileageLog(r));
    }
    const rows = await db.select().from(quadMileageLogsTable).orderBy(desc(quadMileageLogsTable.loggedAt));
    return rows.map(r => this.mapRowToQuadMileageLog(r));
  }

  async createQuadMileageLog(log: InsertQuadMileageLog): Promise<QuadMileageLog> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newLog: QuadMileageLog = {
      id,
      quadId: log.quadId,
      mileageKm: log.mileageKm,
      previousMileageKm: log.previousMileageKm,
      notes: log.notes,
      loggedBy: log.loggedBy,
      loggedAt: now,
    };
    await db.insert(quadMileageLogsTable).values({
      id: newLog.id,
      quadId: newLog.quadId,
      mileageKm: newLog.mileageKm,
      previousMileageKm: newLog.previousMileageKm || null,
      notes: newLog.notes || null,
      loggedBy: newLog.loggedBy,
      loggedAt: newLog.loggedAt,
    });
    
    await db.update(quadMachinesTable)
      .set({ currentMileageKm: log.mileageKm })
      .where(eq(quadMachinesTable.id, log.quadId));
    
    return newLog;
  }

  private mapRowToQuadMileageLog(row: any): QuadMileageLog {
    return {
      id: row.id,
      quadId: row.quadId,
      mileageKm: row.mileageKm,
      previousMileageKm: row.previousMileageKm || undefined,
      notes: row.notes || undefined,
      loggedBy: row.loggedBy,
      loggedAt: row.loggedAt,
    };
  }

  async getQuadMaintenanceRules(quadId?: string): Promise<QuadMaintenanceRule[]> {
    if (quadId) {
      const rows = await db.select().from(quadMaintenanceRulesTable)
        .where(or(eq(quadMaintenanceRulesTable.quadId, quadId), isNull(quadMaintenanceRulesTable.quadId)))
        .orderBy(asc(quadMaintenanceRulesTable.title));
      return rows.map(r => this.mapRowToQuadMaintenanceRule(r));
    }
    const rows = await db.select().from(quadMaintenanceRulesTable).orderBy(asc(quadMaintenanceRulesTable.title));
    return rows.map(r => this.mapRowToQuadMaintenanceRule(r));
  }

  async getQuadMaintenanceRule(id: string): Promise<QuadMaintenanceRule | undefined> {
    const rows = await db.select().from(quadMaintenanceRulesTable).where(eq(quadMaintenanceRulesTable.id, id));
    return rows[0] ? this.mapRowToQuadMaintenanceRule(rows[0]) : undefined;
  }

  async createQuadMaintenanceRule(rule: InsertQuadMaintenanceRule): Promise<QuadMaintenanceRule> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newRule: QuadMaintenanceRule = {
      id,
      quadId: rule.quadId,
      title: rule.title,
      description: rule.description,
      triggerType: rule.triggerType,
      intervalKm: rule.intervalKm,
      intervalDays: rule.intervalDays,
      warningKm: rule.warningKm,
      warningDays: rule.warningDays,
      isActive: rule.isActive ?? true,
      createdBy: rule.createdBy,
      createdAt: now,
    };
    await db.insert(quadMaintenanceRulesTable).values({
      id: newRule.id,
      quadId: newRule.quadId || null,
      title: newRule.title,
      description: newRule.description || null,
      triggerType: newRule.triggerType,
      intervalKm: newRule.intervalKm || null,
      intervalDays: newRule.intervalDays || null,
      warningKm: newRule.warningKm || null,
      warningDays: newRule.warningDays || null,
      isActive: newRule.isActive,
      createdBy: newRule.createdBy,
      createdAt: newRule.createdAt,
    });
    return newRule;
  }

  async updateQuadMaintenanceRule(id: string, updates: Partial<QuadMaintenanceRule>): Promise<QuadMaintenanceRule | undefined> {
    const rule = await this.getQuadMaintenanceRule(id);
    if (!rule) return undefined;
    
    const updateData: Record<string, any> = {};
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    if (updates.intervalKm !== undefined) updateData.intervalKm = updates.intervalKm;
    if (updates.intervalDays !== undefined) updateData.intervalDays = updates.intervalDays;
    
    if (Object.keys(updateData).length > 0) {
      await db.update(quadMaintenanceRulesTable).set(updateData).where(eq(quadMaintenanceRulesTable.id, id));
    }
    return this.getQuadMaintenanceRule(id);
  }

  async deleteQuadMaintenanceRule(id: string): Promise<boolean> {
    await db.delete(quadMaintenanceRulesTable).where(eq(quadMaintenanceRulesTable.id, id));
    return true;
  }

  private mapRowToQuadMaintenanceRule(row: any): QuadMaintenanceRule {
    return {
      id: row.id,
      quadId: row.quadId || undefined,
      title: row.title,
      description: row.description || undefined,
      triggerType: row.triggerType as any,
      intervalKm: row.intervalKm || undefined,
      intervalDays: row.intervalDays || undefined,
      warningKm: row.warningKm || undefined,
      warningDays: row.warningDays || undefined,
      isActive: row.isActive,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };
  }

  async getQuadMaintenanceEvents(quadId?: string): Promise<QuadMaintenanceEvent[]> {
    if (quadId) {
      const rows = await db.select().from(quadMaintenanceEventsTable)
        .where(eq(quadMaintenanceEventsTable.quadId, quadId))
        .orderBy(desc(quadMaintenanceEventsTable.performedAt));
      return rows.map(r => this.mapRowToQuadMaintenanceEvent(r));
    }
    const rows = await db.select().from(quadMaintenanceEventsTable).orderBy(desc(quadMaintenanceEventsTable.performedAt));
    return rows.map(r => this.mapRowToQuadMaintenanceEvent(r));
  }

  async createQuadMaintenanceEvent(event: InsertQuadMaintenanceEvent): Promise<QuadMaintenanceEvent> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newEvent: QuadMaintenanceEvent = {
      id,
      quadId: event.quadId,
      ruleId: event.ruleId,
      title: event.title,
      description: event.description,
      mileageKm: event.mileageKm,
      partsUsed: event.partsUsed,
      totalCost: event.totalCost,
      performedBy: event.performedBy,
      performedAt: event.performedAt,
      createdAt: now,
    };
    await db.insert(quadMaintenanceEventsTable).values({
      id: newEvent.id,
      quadId: newEvent.quadId,
      ruleId: newEvent.ruleId || null,
      title: newEvent.title,
      description: newEvent.description || null,
      mileageKm: newEvent.mileageKm,
      partsUsed: newEvent.partsUsed || null,
      totalCost: newEvent.totalCost || null,
      performedBy: newEvent.performedBy,
      performedAt: newEvent.performedAt,
      createdAt: newEvent.createdAt,
    });
    return newEvent;
  }

  private mapRowToQuadMaintenanceEvent(row: any): QuadMaintenanceEvent {
    return {
      id: row.id,
      quadId: row.quadId,
      ruleId: row.ruleId || undefined,
      title: row.title,
      description: row.description || undefined,
      mileageKm: row.mileageKm,
      partsUsed: row.partsUsed as any,
      totalCost: row.totalCost || undefined,
      performedBy: row.performedBy,
      performedAt: row.performedAt,
      createdAt: row.createdAt,
    };
  }

  async getQuadMaintenanceStatuses(): Promise<QuadMaintenanceStatus[]> {
    const machines = await this.getQuadMachines();
    const statuses: QuadMaintenanceStatus[] = [];
    
    for (const machine of machines) {
      const machineStatuses = await this.getQuadMaintenanceStatusesForQuad(machine.id);
      statuses.push(...machineStatuses);
    }
    
    return statuses;
  }

  async getQuadMaintenanceStatusesForQuad(quadId: string): Promise<QuadMaintenanceStatus[]> {
    const machine = await this.getQuadMachine(quadId);
    if (!machine) return [];
    
    const rules = await this.getQuadMaintenanceRules(quadId);
    const events = await this.getQuadMaintenanceEvents(quadId);
    const statuses: QuadMaintenanceStatus[] = [];
    
    for (const rule of rules) {
      if (!rule.isActive) continue;
      
      const ruleEvents = events.filter(e => e.ruleId === rule.id);
      const lastEvent = ruleEvents[0];
      
      let status: "ok" | "warning" | "overdue" = "ok";
      let remainingKm: number | undefined;
      let remainingDays: number | undefined;
      
      if (rule.triggerType === "mileage" && rule.intervalKm) {
        const lastMileage = lastEvent?.mileageKm ?? 0;
        const nextDueMileage = lastMileage + rule.intervalKm;
        remainingKm = nextDueMileage - machine.currentMileageKm;
        
        if (remainingKm <= 0) status = "overdue";
        else if (rule.warningKm && remainingKm <= rule.warningKm) status = "warning";
      }
      
      if (rule.triggerType === "time" && rule.intervalDays) {
        const lastDate = lastEvent?.performedAt ?? machine.createdAt;
        const nextDueDate = new Date(lastDate);
        nextDueDate.setDate(nextDueDate.getDate() + rule.intervalDays);
        remainingDays = Math.floor((nextDueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        
        if (remainingDays <= 0) status = "overdue";
        else if (rule.warningDays && remainingDays <= rule.warningDays) status = "warning";
      }
      
      statuses.push({
        id: `${quadId}-${rule.id}`,
        quadId,
        ruleId: rule.id,
        lastServiceMileage: lastEvent?.mileageKm,
        lastServiceDate: lastEvent?.performedAt,
        remainingKm,
        remainingDays,
        status,
      });
    }
    
    return statuses;
  }

  async getStaffInvitations(): Promise<StaffInvitation[]> {
    const rows = await db.select().from(staffInvitationsTable).orderBy(desc(staffInvitationsTable.createdAt));
    return rows.map(r => ({
      id: r.id,
      phone: r.phone,
      role: r.role as UserRole,
      note: r.note || undefined,
      createdBy: r.createdBy,
      usedBy: r.usedBy || undefined,
      usedAt: r.usedAt || undefined,
      createdAt: r.createdAt,
    }));
  }

  async getStaffInvitationByPhone(phone: string): Promise<StaffInvitation | undefined> {
    const normalized = normalizePhoneOrNull(phone);
    if (!normalized) return undefined;
    const rows = await db.select().from(staffInvitationsTable)
      .where(and(eq(staffInvitationsTable.phone, normalized), isNull(staffInvitationsTable.usedBy)));
    if (!rows[0]) return undefined;
    return {
      id: rows[0].id,
      phone: rows[0].phone,
      role: rows[0].role as UserRole,
      note: rows[0].note || undefined,
      createdBy: rows[0].createdBy,
      usedBy: rows[0].usedBy || undefined,
      usedAt: rows[0].usedAt || undefined,
      createdAt: rows[0].createdAt,
    };
  }

  async createStaffInvitation(invitation: InsertStaffInvitation): Promise<StaffInvitation> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const normalized = normalizePhoneOrNull(invitation.phone);
    if (!normalized) {
      throw new Error("Неверный формат телефона. Требуется минимум 7 цифр.");
    }
    const newInvitation: StaffInvitation = {
      id,
      phone: normalized,
      role: invitation.role,
      note: invitation.note,
      createdBy: invitation.createdBy,
      createdAt: now,
    };
    await db.insert(staffInvitationsTable).values({
      id: newInvitation.id,
      phone: newInvitation.phone,
      role: newInvitation.role,
      note: newInvitation.note || null,
      createdBy: newInvitation.createdBy,
      createdAt: newInvitation.createdAt,
    });
    return newInvitation;
  }

  async useStaffInvitation(id: string, userId: string): Promise<StaffInvitation | undefined> {
    const rows = await db.select().from(staffInvitationsTable).where(eq(staffInvitationsTable.id, id));
    if (!rows[0]) return undefined;
    
    const now = new Date().toISOString();
    await db.update(staffInvitationsTable)
      .set({ usedBy: userId, usedAt: now })
      .where(eq(staffInvitationsTable.id, id));
    
    const updated = await db.select().from(staffInvitationsTable).where(eq(staffInvitationsTable.id, id));
    if (!updated[0]) return undefined;
    return {
      id: updated[0].id,
      phone: updated[0].phone,
      role: updated[0].role as UserRole,
      note: updated[0].note || undefined,
      createdBy: updated[0].createdBy,
      usedBy: updated[0].usedBy || undefined,
      usedAt: updated[0].usedAt || undefined,
      createdAt: updated[0].createdAt,
    };
  }

  async deleteStaffInvitation(id: string): Promise<boolean> {
    await db.delete(staffInvitationsTable).where(eq(staffInvitationsTable.id, id));
    return true;
  }

  // ============ STAFF AUTHORIZATIONS ============
  async getStaffAuthorizations(): Promise<StaffAuthorization[]> {
    const rows = await db.select().from(staffAuthorizationsTable).orderBy(desc(staffAuthorizationsTable.createdAt));
    return rows.map(r => ({
      id: r.id,
      telegramId: r.telegramId,
      role: r.role as UserRole,
      note: r.note || undefined,
      assignedBy: r.assignedBy,
      isActive: r.isActive,
      createdAt: r.createdAt,
    }));
  }

  async getStaffAuthorizationByTelegramId(telegramId: string): Promise<StaffAuthorization | undefined> {
    const rows = await db.select().from(staffAuthorizationsTable)
      .where(and(eq(staffAuthorizationsTable.telegramId, telegramId), eq(staffAuthorizationsTable.isActive, true)));
    if (!rows[0]) return undefined;
    return {
      id: rows[0].id,
      telegramId: rows[0].telegramId,
      role: rows[0].role as UserRole,
      note: rows[0].note || undefined,
      assignedBy: rows[0].assignedBy,
      isActive: rows[0].isActive,
      createdAt: rows[0].createdAt,
    };
  }

  async createStaffAuthorization(auth: InsertStaffAuthorization): Promise<StaffAuthorization> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const staffAuth: StaffAuthorization = {
      id,
      telegramId: auth.telegramId,
      role: auth.role,
      note: auth.note,
      assignedBy: auth.assignedBy,
      isActive: auth.isActive ?? true,
      createdAt,
    };
    await db.insert(staffAuthorizationsTable).values({
      id: staffAuth.id,
      telegramId: staffAuth.telegramId,
      role: staffAuth.role,
      note: staffAuth.note || null,
      assignedBy: staffAuth.assignedBy,
      isActive: staffAuth.isActive,
      createdAt: staffAuth.createdAt,
    });
    return staffAuth;
  }

  async updateStaffAuthorization(id: string, updates: Partial<StaffAuthorization>): Promise<StaffAuthorization | undefined> {
    // Only include fields that are actually provided (filter out undefined)
    const setValues: Record<string, any> = {};
    if (updates.role !== undefined) setValues.role = updates.role;
    if (updates.note !== undefined) setValues.note = updates.note;
    if (updates.isActive !== undefined) setValues.isActive = updates.isActive;
    
    if (Object.keys(setValues).length > 0) {
      await db.update(staffAuthorizationsTable).set(setValues).where(eq(staffAuthorizationsTable.id, id));
    }
    
    const rows = await db.select().from(staffAuthorizationsTable).where(eq(staffAuthorizationsTable.id, id));
    if (!rows[0]) return undefined;
    return {
      id: rows[0].id,
      telegramId: rows[0].telegramId,
      role: rows[0].role as UserRole,
      note: rows[0].note || undefined,
      assignedBy: rows[0].assignedBy,
      isActive: rows[0].isActive,
      createdAt: rows[0].createdAt,
    };
  }

  async deleteStaffAuthorization(id: string): Promise<boolean> {
    await db.delete(staffAuthorizationsTable).where(eq(staffAuthorizationsTable.id, id));
    return true;
  }

  // Laundry Batches
  async getLaundryBatches(): Promise<LaundryBatch[]> {
    const rows = await db.select().from(laundryBatchesTable).orderBy(desc(laundryBatchesTable.createdAt));
    return rows.map(row => ({
      id: row.id,
      unitCode: row.unitCode || undefined,
      items: row.items as any,
      status: row.status as any,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      washStartedAt: row.washStartedAt || undefined,
      dryStartedAt: row.dryStartedAt || undefined,
      readyAt: row.readyAt || undefined,
      deliveredAt: row.deliveredAt || undefined,
      deliveredTo: row.deliveredTo || undefined,
      notes: row.notes || undefined,
    }));
  }

  async getLaundryBatch(id: string): Promise<LaundryBatch | undefined> {
    const rows = await db.select().from(laundryBatchesTable).where(eq(laundryBatchesTable.id, id));
    if (!rows[0]) return undefined;
    const row = rows[0];
    return {
      id: row.id,
      unitCode: row.unitCode || undefined,
      items: row.items as any,
      status: row.status as any,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      washStartedAt: row.washStartedAt || undefined,
      dryStartedAt: row.dryStartedAt || undefined,
      readyAt: row.readyAt || undefined,
      deliveredAt: row.deliveredAt || undefined,
      deliveredTo: row.deliveredTo || undefined,
      notes: row.notes || undefined,
    };
  }

  async createLaundryBatch(batch: InsertLaundryBatch, createdBy: string): Promise<LaundryBatch> {
    const id = randomUUID();
    const newBatch: LaundryBatch = {
      id,
      unitCode: batch.unitCode,
      items: batch.items,
      status: "pending",
      createdBy,
      createdAt: new Date().toISOString(),
      notes: batch.notes,
    };
    await db.insert(laundryBatchesTable).values({
      id: newBatch.id,
      unitCode: newBatch.unitCode || null,
      items: newBatch.items,
      status: newBatch.status,
      createdBy: newBatch.createdBy,
      createdAt: newBatch.createdAt,
      notes: newBatch.notes || null,
    });
    return newBatch;
  }

  async updateLaundryBatch(id: string, updates: Partial<LaundryBatch>): Promise<LaundryBatch | undefined> {
    const setValues: Record<string, any> = {};
    if (updates.status !== undefined) setValues.status = updates.status;
    if (updates.washStartedAt !== undefined) setValues.washStartedAt = updates.washStartedAt;
    if (updates.dryStartedAt !== undefined) setValues.dryStartedAt = updates.dryStartedAt;
    if (updates.readyAt !== undefined) setValues.readyAt = updates.readyAt;
    if (updates.deliveredAt !== undefined) setValues.deliveredAt = updates.deliveredAt;
    if (updates.deliveredTo !== undefined) setValues.deliveredTo = updates.deliveredTo;
    if (updates.notes !== undefined) setValues.notes = updates.notes;
    
    if (Object.keys(setValues).length > 0) {
      await db.update(laundryBatchesTable).set(setValues).where(eq(laundryBatchesTable.id, id));
    }
    return this.getLaundryBatch(id);
  }

  // Textile Audits
  async getTextileAudits(): Promise<TextileAudit[]> {
    const rows = await db.select().from(textileAuditsTable).orderBy(desc(textileAuditsTable.createdAt));
    return rows.map(row => ({
      id: row.id,
      date: row.date,
      location: row.location,
      items: row.items as any,
      auditedBy: row.auditedBy,
      notes: row.notes || undefined,
      createdAt: row.createdAt,
    }));
  }

  async getTextileAudit(id: string): Promise<TextileAudit | undefined> {
    const rows = await db.select().from(textileAuditsTable).where(eq(textileAuditsTable.id, id));
    if (!rows[0]) return undefined;
    const row = rows[0];
    return {
      id: row.id,
      date: row.date,
      location: row.location,
      items: row.items as any,
      auditedBy: row.auditedBy,
      notes: row.notes || undefined,
      createdAt: row.createdAt,
    };
  }

  async createTextileAudit(audit: InsertTextileAudit, auditedBy: string): Promise<TextileAudit> {
    const id = randomUUID();
    const newAudit: TextileAudit = {
      id,
      date: audit.date,
      location: audit.location,
      items: audit.items,
      auditedBy,
      notes: audit.notes,
      createdAt: new Date().toISOString(),
    };
    await db.insert(textileAuditsTable).values({
      id: newAudit.id,
      date: newAudit.date,
      location: newAudit.location,
      items: newAudit.items,
      auditedBy: newAudit.auditedBy,
      notes: newAudit.notes || null,
      createdAt: newAudit.createdAt,
    });
    return newAudit;
  }

  // ============ TEXTILE STOCK METHODS ============
  
  async getTextileStock(): Promise<TextileStock[]> {
    const rows = await db.select().from(textileStockTable);
    return rows.map(row => ({
      id: row.id,
      location: row.location as TextileLocation,
      type: row.type as TextileType,
      color: row.color as TextileColor,
      quantity: row.quantity,
      updatedBy: row.updatedBy || undefined,
      updatedAt: row.updatedAt,
    }));
  }

  async getTextileStockByLocation(location: TextileLocation): Promise<TextileStock[]> {
    const rows = await db.select().from(textileStockTable)
      .where(eq(textileStockTable.location, location));
    return rows.map(row => ({
      id: row.id,
      location: row.location as TextileLocation,
      type: row.type as TextileType,
      color: row.color as TextileColor,
      quantity: row.quantity,
      updatedBy: row.updatedBy || undefined,
      updatedAt: row.updatedAt,
    }));
  }

  async upsertTextileStock(
    location: TextileLocation,
    type: TextileType,
    color: TextileColor,
    quantity: number,
    updatedBy: string
  ): Promise<TextileStock> {
    const existing = await db.select().from(textileStockTable)
      .where(and(
        eq(textileStockTable.location, location),
        eq(textileStockTable.type, type),
        eq(textileStockTable.color, color)
      ));
    
    const now = new Date().toISOString();
    
    if (existing[0]) {
      await db.update(textileStockTable)
        .set({ quantity, updatedBy, updatedAt: now })
        .where(eq(textileStockTable.id, existing[0].id));
      return {
        id: existing[0].id,
        location,
        type,
        color,
        quantity,
        updatedBy,
        updatedAt: now,
      };
    } else {
      const id = randomUUID();
      await db.insert(textileStockTable).values({
        id,
        location,
        type,
        color,
        quantity,
        updatedBy,
        updatedAt: now,
      });
      return { id, location, type, color, quantity, updatedBy, updatedAt: now };
    }
  }

  async adjustTextileStock(
    location: TextileLocation,
    type: TextileType,
    color: TextileColor,
    delta: number,
    updatedBy: string
  ): Promise<TextileStock> {
    const existing = await db.select().from(textileStockTable)
      .where(and(
        eq(textileStockTable.location, location),
        eq(textileStockTable.type, type),
        eq(textileStockTable.color, color)
      ));
    
    const currentQty = existing[0]?.quantity || 0;
    const newQty = Math.max(0, currentQty + delta);
    
    return this.upsertTextileStock(location, type, color, newQty, updatedBy);
  }

  async initWarehouseStock(
    items: { type: TextileType; color: TextileColor; quantity: number }[],
    userId: string
  ): Promise<void> {
    const now = new Date().toISOString();
    
    for (const item of items) {
      await this.upsertTextileStock("warehouse", item.type, item.color, item.quantity, userId);
    }
    
    // Log the event
    await this.createTextileEvent({
      eventType: "init_stock",
      toLocation: "warehouse",
      items: items.map(i => ({ type: i.type, color: i.color, quantity: i.quantity })),
      notes: "Начальная инициализация склада",
    }, userId);
  }

  // ============ TEXTILE CHECK-IN METHODS ============
  
  async getTextileCheckIns(): Promise<TextileCheckIn[]> {
    const rows = await db.select().from(textileCheckInsTable)
      .orderBy(desc(textileCheckInsTable.createdAt));
    return rows.map(row => ({
      id: row.id,
      unitCode: row.unitCode,
      beddingSets: row.beddingSets as any,
      towelSets: row.towelSets,
      robes: row.robes,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      notes: row.notes || undefined,
    }));
  }

  async createTextileCheckIn(
    checkIn: InsertTextileCheckIn,
    userId: string
  ): Promise<TextileCheckIn> {
    // Calculate required stock from warehouse
    const required: { type: TextileType; color: TextileColor; quantity: number }[] = [];
    
    // Process bedding sets (each = 1 sheet + 1 duvet_cover + 2 pillowcases)
    for (const set of checkIn.beddingSets) {
      required.push({ type: "sheets", color: set.color, quantity: set.count });
      required.push({ type: "duvet_covers", color: set.color, quantity: set.count });
      required.push({ type: "pillowcases", color: set.color, quantity: set.count * 2 });
    }
    
    // Process towel sets (each = 2 large + 2 small, always grey)
    required.push({ type: "towels_large", color: "grey", quantity: checkIn.towelSets * 2 });
    required.push({ type: "towels_small", color: "grey", quantity: checkIn.towelSets * 2 });
    
    // Process robes (grey)
    if (checkIn.robes > 0) {
      required.push({ type: "robes", color: "grey", quantity: checkIn.robes });
    }
    
    // Validate warehouse stock sufficiency
    const warehouseStock = await this.getTextileStockByLocation("warehouse");
    const stockMap = new Map<string, number>();
    for (const item of warehouseStock) {
      stockMap.set(`${item.type}_${item.color}`, item.quantity);
    }
    
    const shortages: string[] = [];
    for (const req of required) {
      const key = `${req.type}_${req.color}`;
      const available = stockMap.get(key) || 0;
      if (available < req.quantity) {
        const typeLabel = req.type === "sheets" ? "Простыни" :
          req.type === "duvet_covers" ? "Пододеяльники" :
          req.type === "pillowcases" ? "Наволочки" :
          req.type === "towels_large" ? "Полотенца большие" :
          req.type === "towels_small" ? "Полотенца малые" :
          req.type === "robes" ? "Халаты" : req.type;
        shortages.push(`${typeLabel} (${req.color}): нужно ${req.quantity}, на складе ${available}`);
      }
    }
    
    if (shortages.length > 0) {
      throw new Error(`Недостаточно на складе: ${shortages.join("; ")}`);
    }
    
    const id = randomUUID();
    const now = new Date().toISOString();
    
    const newCheckIn: TextileCheckIn = {
      id,
      unitCode: checkIn.unitCode,
      beddingSets: checkIn.beddingSets,
      towelSets: checkIn.towelSets,
      robes: checkIn.robes,
      createdBy: userId,
      createdAt: now,
      notes: checkIn.notes,
    };
    
    await db.insert(textileCheckInsTable).values({
      id: newCheckIn.id,
      unitCode: newCheckIn.unitCode,
      beddingSets: newCheckIn.beddingSets,
      towelSets: newCheckIn.towelSets,
      robes: newCheckIn.robes,
      createdBy: newCheckIn.createdBy,
      createdAt: newCheckIn.createdAt,
      notes: newCheckIn.notes || null,
    });
    
    // Move textiles from warehouse to unit
    const unitLocation = checkIn.unitCode as TextileLocation;
    
    // Process bedding sets
    for (const set of checkIn.beddingSets) {
      // Each bedding set = 1 sheet + 1 duvet_cover + 2 pillowcases
      await this.adjustTextileStock("warehouse", "sheets", set.color, -set.count, userId);
      await this.adjustTextileStock(unitLocation, "sheets", set.color, set.count, userId);
      
      await this.adjustTextileStock("warehouse", "duvet_covers", set.color, -set.count, userId);
      await this.adjustTextileStock(unitLocation, "duvet_covers", set.color, set.count, userId);
      
      await this.adjustTextileStock("warehouse", "pillowcases", set.color, -set.count * 2, userId);
      await this.adjustTextileStock(unitLocation, "pillowcases", set.color, set.count * 2, userId);
    }
    
    // Process towel sets (always grey color)
    // Each towel set = 2 large + 2 small
    await this.adjustTextileStock("warehouse", "towels_large", "grey", -checkIn.towelSets * 2, userId);
    await this.adjustTextileStock(unitLocation, "towels_large", "grey", checkIn.towelSets * 2, userId);
    
    await this.adjustTextileStock("warehouse", "towels_small", "grey", -checkIn.towelSets * 2, userId);
    await this.adjustTextileStock(unitLocation, "towels_small", "grey", checkIn.towelSets * 2, userId);
    
    // Process robes (grey color)
    if (checkIn.robes > 0) {
      await this.adjustTextileStock("warehouse", "robes", "grey", -checkIn.robes, userId);
      await this.adjustTextileStock(unitLocation, "robes", "grey", checkIn.robes, userId);
    }
    
    // Create event log
    const eventItems: { type: TextileType; color: TextileColor; quantity: number }[] = [];
    for (const set of checkIn.beddingSets) {
      eventItems.push({ type: "sheets", color: set.color, quantity: set.count });
      eventItems.push({ type: "duvet_covers", color: set.color, quantity: set.count });
      eventItems.push({ type: "pillowcases", color: set.color, quantity: set.count * 2 });
    }
    eventItems.push({ type: "towels_large", color: "grey", quantity: checkIn.towelSets * 2 });
    eventItems.push({ type: "towels_small", color: "grey", quantity: checkIn.towelSets * 2 });
    if (checkIn.robes > 0) {
      eventItems.push({ type: "robes", color: "grey", quantity: checkIn.robes });
    }
    
    await this.createTextileEvent({
      eventType: "check_in",
      fromLocation: "warehouse",
      toLocation: unitLocation,
      items: eventItems,
      relatedUnitCode: checkIn.unitCode,
      notes: checkIn.notes,
    }, userId);
    
    return newCheckIn;
  }

  async markTextileDirty(
    unitCode: string,
    userId: string,
    notes?: string
  ): Promise<void> {
    const unitLocation = unitCode as TextileLocation;
    
    // Get all stock at this unit
    const unitStock = await this.getTextileStockByLocation(unitLocation);
    
    const eventItems: { type: TextileType; color: TextileColor; quantity: number }[] = [];
    
    // Move all textiles from unit to laundry
    for (const item of unitStock) {
      if (item.quantity > 0) {
        await this.adjustTextileStock(unitLocation, item.type, item.color, -item.quantity, userId);
        await this.adjustTextileStock("laundry", item.type, item.color, item.quantity, userId);
        eventItems.push({ type: item.type, color: item.color, quantity: item.quantity });
      }
    }
    
    if (eventItems.length > 0) {
      await this.createTextileEvent({
        eventType: "mark_dirty",
        fromLocation: unitLocation,
        toLocation: "laundry",
        items: eventItems,
        relatedUnitCode: unitCode,
        notes,
      }, userId);
    }
  }

  async markTextileClean(
    items: { type: TextileType; color: TextileColor; quantity: number }[],
    userId: string,
    notes?: string
  ): Promise<void> {
    // Move from laundry to warehouse
    for (const item of items) {
      await this.adjustTextileStock("laundry", item.type, item.color, -item.quantity, userId);
      await this.adjustTextileStock("warehouse", item.type, item.color, item.quantity, userId);
    }
    
    await this.createTextileEvent({
      eventType: "mark_clean",
      fromLocation: "laundry",
      toLocation: "warehouse",
      items,
      notes,
    }, userId);
  }

  // ============ TEXTILE EVENT METHODS ============
  
  async getTextileEvents(limit: number = 50): Promise<TextileEvent[]> {
    const rows = await db.select().from(textileEventsTable)
      .orderBy(desc(textileEventsTable.createdAt))
      .limit(limit);
    return rows.map(row => ({
      id: row.id,
      eventType: row.eventType as any,
      fromLocation: row.fromLocation as TextileLocation | undefined,
      toLocation: row.toLocation as TextileLocation | undefined,
      items: row.items as any,
      relatedUnitCode: row.relatedUnitCode || undefined,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      notes: row.notes || undefined,
    }));
  }

  async createTextileEvent(
    event: InsertTextileEvent,
    userId: string
  ): Promise<TextileEvent> {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    const newEvent: TextileEvent = {
      id,
      eventType: event.eventType,
      fromLocation: event.fromLocation,
      toLocation: event.toLocation,
      items: event.items,
      relatedUnitCode: event.relatedUnitCode,
      createdBy: userId,
      createdAt: now,
      notes: event.notes,
    };
    
    await db.insert(textileEventsTable).values({
      id: newEvent.id,
      eventType: newEvent.eventType,
      fromLocation: newEvent.fromLocation || null,
      toLocation: newEvent.toLocation || null,
      items: newEvent.items,
      relatedUnitCode: newEvent.relatedUnitCode || null,
      createdBy: newEvent.createdBy,
      createdAt: newEvent.createdAt,
      notes: newEvent.notes || null,
    });
    
    return newEvent;
  }

  async getTextileStockSummary(): Promise<{
    warehouse: { [key: string]: number };
    laundry: { [key: string]: number };
    units: { [unit: string]: { [key: string]: number } };
  }> {
    const allStock = await this.getTextileStock();
    
    const summary: {
      warehouse: { [key: string]: number };
      laundry: { [key: string]: number };
      units: { [unit: string]: { [key: string]: number } };
    } = {
      warehouse: {},
      laundry: {},
      units: {},
    };
    
    for (const item of allStock) {
      const key = `${item.type}_${item.color}`;
      
      if (item.location === "warehouse") {
        summary.warehouse[key] = (summary.warehouse[key] || 0) + item.quantity;
      } else if (item.location === "laundry") {
        summary.laundry[key] = (summary.laundry[key] || 0) + item.quantity;
      } else {
        if (!summary.units[item.location]) {
          summary.units[item.location] = {};
        }
        summary.units[item.location][key] = (summary.units[item.location][key] || 0) + item.quantity;
      }
    }
    
    return summary;
  }

  // ============ GUEST PROFILE METHODS ============
  
  async getGuests(): Promise<Guest[]> {
    const rows = await db.select().from(guestsTable).orderBy(desc(guestsTable.completedVisits));
    return rows.map(row => ({
      id: row.id,
      phone: row.phone,
      fullName: row.fullName || undefined,
      telegramId: row.telegramId || undefined,
      totalVisits: row.totalVisits,
      completedVisits: row.completedVisits,
      noShowCount: row.noShowCount,
      lastVisitAt: row.lastVisitAt || undefined,
      notes: row.notes || undefined,
      rating: row.rating as Guest["rating"],
      isBlacklisted: row.isBlacklisted,
      createdAt: row.createdAt,
    }));
  }

  async getGuest(id: string): Promise<Guest | undefined> {
    const [row] = await db.select().from(guestsTable).where(eq(guestsTable.id, id));
    if (!row) return undefined;
    return {
      id: row.id,
      phone: row.phone,
      fullName: row.fullName || undefined,
      telegramId: row.telegramId || undefined,
      totalVisits: row.totalVisits,
      completedVisits: row.completedVisits,
      noShowCount: row.noShowCount,
      lastVisitAt: row.lastVisitAt || undefined,
      notes: row.notes || undefined,
      rating: row.rating as Guest["rating"],
      isBlacklisted: row.isBlacklisted,
      createdAt: row.createdAt,
    };
  }

  async getGuestByPhone(phone: string): Promise<Guest | undefined> {
    const normalized = normalizePhoneOrNull(phone);
    if (!normalized) return undefined;
    
    const [row] = await db.select().from(guestsTable).where(eq(guestsTable.phone, normalized));
    if (!row) return undefined;
    return {
      id: row.id,
      phone: row.phone,
      fullName: row.fullName || undefined,
      telegramId: row.telegramId || undefined,
      totalVisits: row.totalVisits,
      completedVisits: row.completedVisits,
      noShowCount: row.noShowCount,
      lastVisitAt: row.lastVisitAt || undefined,
      notes: row.notes || undefined,
      rating: row.rating as Guest["rating"],
      isBlacklisted: row.isBlacklisted,
      createdAt: row.createdAt,
    };
  }

  async createGuest(guest: InsertGuest): Promise<Guest> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const normalized = normalizePhoneOrNull(guest.phone) || guest.phone;
    
    const newGuest: Guest = {
      id,
      phone: normalized,
      fullName: guest.fullName,
      telegramId: guest.telegramId,
      totalVisits: 0,
      completedVisits: 0,
      noShowCount: 0,
      lastVisitAt: guest.lastVisitAt,
      notes: guest.notes,
      rating: guest.rating,
      isBlacklisted: guest.isBlacklisted ?? false,
      createdAt: now,
    };
    
    await db.insert(guestsTable).values({
      id: newGuest.id,
      phone: newGuest.phone,
      fullName: newGuest.fullName || null,
      telegramId: newGuest.telegramId || null,
      totalVisits: newGuest.totalVisits,
      completedVisits: newGuest.completedVisits,
      noShowCount: newGuest.noShowCount,
      lastVisitAt: newGuest.lastVisitAt || null,
      notes: newGuest.notes || null,
      rating: newGuest.rating || null,
      isBlacklisted: newGuest.isBlacklisted,
      createdAt: newGuest.createdAt,
    });
    
    return newGuest;
  }

  async updateGuest(id: string, updates: Partial<Guest>): Promise<Guest | undefined> {
    await db.update(guestsTable)
      .set({
        fullName: updates.fullName,
        telegramId: updates.telegramId,
        totalVisits: updates.totalVisits,
        completedVisits: updates.completedVisits,
        noShowCount: updates.noShowCount,
        lastVisitAt: updates.lastVisitAt,
        notes: updates.notes,
        rating: updates.rating,
        isBlacklisted: updates.isBlacklisted,
      })
      .where(eq(guestsTable.id, id));
    return this.getGuest(id);
  }

  async getOrCreateGuestByPhone(phone: string, name?: string, telegramId?: string): Promise<Guest> {
    const existing = await this.getGuestByPhone(phone);
    if (existing) {
      // Update name/telegramId if provided and different
      if ((name && name !== existing.fullName) || (telegramId && telegramId !== existing.telegramId)) {
        return (await this.updateGuest(existing.id, {
          fullName: name || existing.fullName,
          telegramId: telegramId || existing.telegramId,
        }))!;
      }
      return existing;
    }
    
    return this.createGuest({
      phone,
      fullName: name,
      telegramId,
    });
  }

  async incrementGuestVisit(guestId: string, completed: boolean): Promise<Guest | undefined> {
    const guest = await this.getGuest(guestId);
    if (!guest) return undefined;
    
    const now = new Date().toISOString();
    return this.updateGuest(guestId, {
      totalVisits: guest.totalVisits + 1,
      completedVisits: completed ? guest.completedVisits + 1 : guest.completedVisits,
      lastVisitAt: now,
    });
  }

  async markGuestNoShow(guestId: string): Promise<Guest | undefined> {
    const guest = await this.getGuest(guestId);
    if (!guest) return undefined;
    
    return this.updateGuest(guestId, {
      totalVisits: guest.totalVisits + 1,
      noShowCount: guest.noShowCount + 1,
    });
  }

  // ============ BATH BOOKING ARRIVAL TRACKING ============

  async markBathBookingArrived(bookingId: string): Promise<BathBooking | undefined> {
    const booking = await this.getBathBooking(bookingId);
    if (!booking) return undefined;
    
    const now = new Date().toISOString();
    
    // Update booking with arrival time
    await db.update(bathBookingsTable)
      .set({
        arrivedAt: now,
        noShow: false,
      })
      .where(eq(bathBookingsTable.id, bookingId));
    
    // Increment guest visit count if linked
    if (booking.guestId) {
      await this.incrementGuestVisit(booking.guestId, true);
    }
    
    return this.getBathBooking(bookingId);
  }

  async markBathBookingNoShow(bookingId: string): Promise<BathBooking | undefined> {
    const booking = await this.getBathBooking(bookingId);
    if (!booking) return undefined;
    
    // Update booking as no-show
    await db.update(bathBookingsTable)
      .set({
        noShow: true,
        status: "cancelled",
      })
      .where(eq(bathBookingsTable.id, bookingId));
    
    // Increment guest no-show count if linked
    if (booking.guestId) {
      await this.markGuestNoShow(booking.guestId);
    }
    
    return this.getBathBooking(bookingId);
  }

  // ======= Supplies/Consumables =======
  
  async getSupplies(): Promise<Supply[]> {
    const rows = await db.select().from(suppliesTable).orderBy(asc(suppliesTable.name));
    return rows as Supply[];
  }
  
  async getSupply(id: string): Promise<Supply | undefined> {
    const rows = await db.select().from(suppliesTable).where(eq(suppliesTable.id, id));
    return rows[0] as Supply | undefined;
  }
  
  async createSupply(supply: InsertSupply): Promise<Supply> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.insert(suppliesTable).values({
      id,
      ...supply,
      createdAt: now,
    });
    return this.getSupply(id) as Promise<Supply>;
  }
  
  async updateSupply(id: string, updates: Partial<Supply>): Promise<Supply | undefined> {
    const existing = await this.getSupply(id);
    if (!existing) return undefined;
    await db.update(suppliesTable).set(updates).where(eq(suppliesTable.id, id));
    return this.getSupply(id);
  }
  
  async deleteSupply(id: string): Promise<boolean> {
    const result = await db.delete(suppliesTable).where(eq(suppliesTable.id, id));
    return true;
  }
  
  async getSupplyTransactions(supplyId?: string): Promise<SupplyTransaction[]> {
    if (supplyId) {
      const rows = await db.select().from(supplyTransactionsTable)
        .where(eq(supplyTransactionsTable.supplyId, supplyId))
        .orderBy(desc(supplyTransactionsTable.createdAt));
      return rows as SupplyTransaction[];
    }
    const rows = await db.select().from(supplyTransactionsTable)
      .orderBy(desc(supplyTransactionsTable.createdAt));
    return rows as SupplyTransaction[];
  }
  
  async createSupplyTransaction(tx: InsertSupplyTransaction, createdBy: string): Promise<SupplyTransaction> {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    // Insert transaction
    await db.insert(supplyTransactionsTable).values({
      id,
      ...tx,
      createdBy,
      createdAt: now,
    });
    
    // Update supply current stock
    const supply = await this.getSupply(tx.supplyId);
    if (supply) {
      const delta = tx.type === "restock" ? tx.quantity : -tx.quantity;
      await db.update(suppliesTable).set({
        currentStock: supply.currentStock + delta,
      }).where(eq(suppliesTable.id, tx.supplyId));
    }
    
    const rows = await db.select().from(supplyTransactionsTable).where(eq(supplyTransactionsTable.id, id));
    return rows[0] as SupplyTransaction;
  }
  
  async getLowStockSupplies(): Promise<Supply[]> {
    const rows = await db.select().from(suppliesTable)
      .where(sql`${suppliesTable.currentStock} <= ${suppliesTable.minStock}`);
    return rows as Supply[];
  }

  // ======= Incidents/Repairs =======
  
  async getIncidents(): Promise<Incident[]> {
    const rows = await db.select().from(incidentsTable).orderBy(desc(incidentsTable.reportedAt));
    return rows as Incident[];
  }
  
  async getIncident(id: string): Promise<Incident | undefined> {
    const rows = await db.select().from(incidentsTable).where(eq(incidentsTable.id, id));
    return rows[0] as Incident | undefined;
  }
  
  async getIncidentsByUnit(unitCode: string): Promise<Incident[]> {
    const rows = await db.select().from(incidentsTable)
      .where(eq(incidentsTable.unitCode, unitCode))
      .orderBy(desc(incidentsTable.reportedAt));
    return rows as Incident[];
  }
  
  async createIncident(incident: InsertIncident, reportedBy: string): Promise<Incident> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.insert(incidentsTable).values({
      id,
      ...incident,
      reportedBy,
      reportedAt: now,
    });
    return this.getIncident(id) as Promise<Incident>;
  }
  
  async updateIncident(id: string, updates: Partial<Incident>): Promise<Incident | undefined> {
    const existing = await this.getIncident(id);
    if (!existing) return undefined;
    
    // If being resolved, set resolved timestamp
    if (updates.status === 'resolved' && !existing.resolvedAt) {
      updates.resolvedAt = new Date().toISOString();
    }
    
    await db.update(incidentsTable).set(updates).where(eq(incidentsTable.id, id));
    return this.getIncident(id);
  }

  // ======= Staff Shifts =======
  
  async getStaffShifts(): Promise<StaffShift[]> {
    const rows = await db.select().from(staffShiftsTable).orderBy(desc(staffShiftsTable.date));
    return rows as StaffShift[];
  }
  
  async getStaffShiftsForDate(date: string): Promise<StaffShift[]> {
    const rows = await db.select().from(staffShiftsTable)
      .where(eq(staffShiftsTable.date, date))
      .orderBy(asc(staffShiftsTable.shiftType));
    return rows as StaffShift[];
  }
  
  async getStaffShiftsForUser(userId: string): Promise<StaffShift[]> {
    const rows = await db.select().from(staffShiftsTable)
      .where(eq(staffShiftsTable.userId, userId))
      .orderBy(desc(staffShiftsTable.date));
    return rows as StaffShift[];
  }
  
  async createStaffShift(shift: InsertStaffShift, createdBy: string): Promise<StaffShift> {
    const id = randomUUID();
    await db.insert(staffShiftsTable).values({
      id,
      ...shift,
      createdBy,
    });
    const rows = await db.select().from(staffShiftsTable).where(eq(staffShiftsTable.id, id));
    return rows[0] as StaffShift;
  }
  
  async deleteStaffShift(id: string): Promise<boolean> {
    await db.delete(staffShiftsTable).where(eq(staffShiftsTable.id, id));
    return true;
  }

  // ======= Unit Info (QR codes) =======
  
  async getUnitInfos(): Promise<UnitInfo[]> {
    const rows = await db.select().from(unitInfoTable).orderBy(asc(unitInfoTable.unitCode));
    return rows as UnitInfo[];
  }
  
  async getUnitInfo(unitCode: string): Promise<UnitInfo | undefined> {
    const rows = await db.select().from(unitInfoTable).where(eq(unitInfoTable.unitCode, unitCode));
    return rows[0] as UnitInfo | undefined;
  }
  
  async upsertUnitInfo(info: InsertUnitInfo): Promise<UnitInfo> {
    const existing = await this.getUnitInfo(info.unitCode);
    const now = new Date().toISOString();
    
    if (existing) {
      await db.update(unitInfoTable).set({
        ...info,
        updatedAt: now,
      }).where(eq(unitInfoTable.unitCode, info.unitCode));
    } else {
      await db.insert(unitInfoTable).values({
        ...info,
        createdAt: now,
        updatedAt: now,
      });
    }
    
    return this.getUnitInfo(info.unitCode) as Promise<UnitInfo>;
  }

  // ======= Smart Thermostat =======
  
  async getThermostatHouses(): Promise<ThermostatHouse[]> {
    const rows = await db.select().from(thermostatHousesTable).orderBy(asc(thermostatHousesTable.houseId));
    return rows as ThermostatHouse[];
  }
  
  async getThermostatHouse(houseId: number): Promise<ThermostatHouse | undefined> {
    const rows = await db.select().from(thermostatHousesTable).where(eq(thermostatHousesTable.houseId, houseId));
    return rows[0] as ThermostatHouse | undefined;
  }
  
  async createThermostatHouse(house: InsertThermostatHouse): Promise<ThermostatHouse> {
    const id = randomUUID();
    await db.insert(thermostatHousesTable).values({
      id,
      ...house,
    });
    const rows = await db.select().from(thermostatHousesTable).where(eq(thermostatHousesTable.id, id));
    return rows[0] as ThermostatHouse;
  }
  
  async updateThermostatHouseStatus(houseId: number, updates: Partial<ThermostatHouse>): Promise<ThermostatHouse | undefined> {
    const existing = await this.getThermostatHouse(houseId);
    if (!existing) return undefined;
    await db.update(thermostatHousesTable).set(updates).where(eq(thermostatHousesTable.houseId, houseId));
    return this.getThermostatHouse(houseId);
  }
  
  async getThermostatDailyPlans(date: string): Promise<ThermostatDailyPlan[]> {
    const rows = await db.select().from(thermostatDailyPlansTable)
      .where(eq(thermostatDailyPlansTable.date, date))
      .orderBy(asc(thermostatDailyPlansTable.houseId));
    return rows as ThermostatDailyPlan[];
  }
  
  async getThermostatDailyPlan(date: string, houseId: number): Promise<ThermostatDailyPlan | undefined> {
    const rows = await db.select().from(thermostatDailyPlansTable)
      .where(and(
        eq(thermostatDailyPlansTable.date, date),
        eq(thermostatDailyPlansTable.houseId, houseId)
      ));
    return rows[0] as ThermostatDailyPlan | undefined;
  }
  
  async upsertThermostatDailyPlan(plan: InsertThermostatDailyPlan): Promise<ThermostatDailyPlan> {
    const existing = await this.getThermostatDailyPlan(plan.date, plan.houseId);
    
    if (existing) {
      await db.update(thermostatDailyPlansTable).set({
        planType: plan.planType,
        setByAdminUserId: plan.setByAdminUserId,
        setAt: plan.setAt,
      }).where(eq(thermostatDailyPlansTable.id, existing.id));
      return this.getThermostatDailyPlan(plan.date, plan.houseId) as Promise<ThermostatDailyPlan>;
    } else {
      const id = randomUUID();
      await db.insert(thermostatDailyPlansTable).values({
        id,
        ...plan,
      });
      const rows = await db.select().from(thermostatDailyPlansTable).where(eq(thermostatDailyPlansTable.id, id));
      return rows[0] as ThermostatDailyPlan;
    }
  }
  
  async markThermostatPlanApplied(date: string, houseId: number): Promise<void> {
    const plan = await this.getThermostatDailyPlan(date, houseId);
    if (plan) {
      await db.update(thermostatDailyPlansTable).set({
        appliedAt: new Date().toISOString(),
      }).where(eq(thermostatDailyPlansTable.id, plan.id));
    }
  }
  
  async markThermostatHeatStarted(date: string, houseId: number): Promise<void> {
    const plan = await this.getThermostatDailyPlan(date, houseId);
    if (plan) {
      await db.update(thermostatDailyPlansTable).set({
        heatStartedAt: new Date().toISOString(),
      }).where(eq(thermostatDailyPlansTable.id, plan.id));
    }
  }
  
  async getThermostatActionLogs(houseId?: number, date?: string, limit?: number): Promise<ThermostatActionLog[]> {
    let query = db.select().from(thermostatActionLogsTable);
    
    if (houseId !== undefined && date) {
      query = query.where(and(
        eq(thermostatActionLogsTable.houseId, houseId),
        sql`DATE(${thermostatActionLogsTable.ts}) = ${date}`
      )) as typeof query;
    } else if (houseId !== undefined) {
      query = query.where(eq(thermostatActionLogsTable.houseId, houseId)) as typeof query;
    } else if (date) {
      query = query.where(sql`DATE(${thermostatActionLogsTable.ts}) = ${date}`) as typeof query;
    }
    
    query = query.orderBy(desc(thermostatActionLogsTable.ts)) as typeof query;
    
    if (limit) {
      query = query.limit(limit) as typeof query;
    }
    
    const rows = await query;
    return rows as ThermostatActionLog[];
  }
  
  async createThermostatActionLog(log: InsertThermostatActionLog): Promise<ThermostatActionLog> {
    const id = randomUUID();
    await db.insert(thermostatActionLogsTable).values({
      id,
      ...log,
    });
    const rows = await db.select().from(thermostatActionLogsTable).where(eq(thermostatActionLogsTable.id, id));
    return rows[0] as ThermostatActionLog;
  }
  
  // ============ ELECTRICITY METERS ============
  // In-memory storage for electricity meters (will be migrated to DB later)
  private electricityMeters: Map<string, ElectricityMeter> = new Map();
  private electricityReadings: Map<string, ElectricityReading> = new Map();
  
  async getElectricityMeters(): Promise<ElectricityMeter[]> {
    // Initialize default meters if empty
    if (this.electricityMeters.size === 0) {
      const meter1: ElectricityMeter = {
        id: "meter1",
        name: "Счетчик 1",
        code: "METER1",
        description: "Основной счетчик",
        createdAt: new Date().toISOString(),
      };
      const meter2: ElectricityMeter = {
        id: "meter2",
        name: "Счетчик 2",
        code: "METER2",
        description: "Дополнительный счетчик",
        createdAt: new Date().toISOString(),
      };
      this.electricityMeters.set(meter1.id, meter1);
      this.electricityMeters.set(meter2.id, meter2);
    }
    return Array.from(this.electricityMeters.values());
  }
  
  async getElectricityMeter(id: string): Promise<ElectricityMeter | undefined> {
    await this.getElectricityMeters(); // ensure initialized
    return this.electricityMeters.get(id);
  }
  
  async createElectricityMeter(meter: InsertElectricityMeter): Promise<ElectricityMeter> {
    const created: ElectricityMeter = {
      id: randomUUID(),
      ...meter,
      createdAt: new Date().toISOString(),
    };
    this.electricityMeters.set(created.id, created);
    return created;
  }
  
  async getElectricityReadings(meterId?: string, limit?: number): Promise<ElectricityReading[]> {
    let readings = Array.from(this.electricityReadings.values());
    if (meterId) {
      readings = readings.filter(r => r.meterId === meterId);
    }
    readings.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    if (limit) {
      readings = readings.slice(0, limit);
    }
    return readings;
  }
  
  async getLatestElectricityReading(meterId: string): Promise<ElectricityReading | undefined> {
    const readings = await this.getElectricityReadings(meterId, 1);
    return readings[0];
  }
  
  async createElectricityReading(reading: InsertElectricityReading, userId?: string): Promise<ElectricityReading> {
    const latest = await this.getLatestElectricityReading(reading.meterId);
    const consumption = latest ? reading.reading - latest.reading : undefined;
    
    const created: ElectricityReading = {
      id: randomUUID(),
      ...reading,
      previousReading: latest?.reading,
      consumption,
      recordedByUserId: userId,
    };
    this.electricityReadings.set(created.id, created);
    return created;
  }
  
  async getElectricityStatistics(meterId: string, periodDays: number = 30): Promise<{
    meterId: string;
    totalConsumption: number;
    avgDailyConsumption: number;
    readings: ElectricityReading[];
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - periodDays);
    
    const readings = (await this.getElectricityReadings(meterId))
      .filter(r => new Date(r.recordedAt) >= cutoffDate);
    
    const totalConsumption = readings.reduce((sum, r) => sum + (r.consumption || 0), 0);
    const avgDailyConsumption = periodDays > 0 ? totalConsumption / periodDays : 0;
    
    return {
      meterId,
      totalConsumption,
      avgDailyConsumption,
      readings,
    };
  }
  
  // ============ COMPLETED TASKS ============
  async getCompletedTasks(fromDate?: string, toDate?: string): Promise<Task[]> {
    let query = db.select().from(tasksTable).where(eq(tasksTable.status, "done"));
    
    const rows = await query.orderBy(desc(tasksTable.date));
    let tasks = rows as Task[];
    
    if (fromDate) {
      tasks = tasks.filter(t => t.date >= fromDate);
    }
    if (toDate) {
      tasks = tasks.filter(t => t.date <= toDate);
    }
    
    return tasks;
  }
  
  // ============ NOTIFICATION CONFIGS ============
  async getNotificationConfigs(): Promise<NotificationConfig[]> {
    const rows = await db.select().from(notificationConfigsTable).orderBy(asc(notificationConfigsTable.title));
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description || undefined,
      cadence: r.cadence as NotificationConfig["cadence"],
      cronExpression: r.cronExpression,
      actionType: r.actionType as NotificationConfig["actionType"],
      targetChatId: r.targetChatId || undefined,
      enabled: r.enabled,
      lastRunAt: r.lastRunAt || undefined,
      metadata: r.metadata as Record<string, any> | undefined,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }
  
  async getNotificationConfig(id: string): Promise<NotificationConfig | undefined> {
    const rows = await db.select().from(notificationConfigsTable).where(eq(notificationConfigsTable.id, id));
    if (rows.length === 0) return undefined;
    const r = rows[0];
    return {
      id: r.id,
      title: r.title,
      description: r.description || undefined,
      cadence: r.cadence as NotificationConfig["cadence"],
      cronExpression: r.cronExpression,
      actionType: r.actionType as NotificationConfig["actionType"],
      targetChatId: r.targetChatId || undefined,
      enabled: r.enabled,
      lastRunAt: r.lastRunAt || undefined,
      metadata: r.metadata as Record<string, any> | undefined,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
  
  async getEnabledNotificationConfigs(): Promise<NotificationConfig[]> {
    const rows = await db.select().from(notificationConfigsTable)
      .where(eq(notificationConfigsTable.enabled, true))
      .orderBy(asc(notificationConfigsTable.title));
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description || undefined,
      cadence: r.cadence as NotificationConfig["cadence"],
      cronExpression: r.cronExpression,
      actionType: r.actionType as NotificationConfig["actionType"],
      targetChatId: r.targetChatId || undefined,
      enabled: r.enabled,
      lastRunAt: r.lastRunAt || undefined,
      metadata: r.metadata as Record<string, any> | undefined,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }
  
  async createNotificationConfig(config: InsertNotificationConfig): Promise<NotificationConfig> {
    const now = new Date().toISOString();
    const newConfig = {
      id: randomUUID(),
      title: config.title,
      description: config.description,
      cadence: config.cadence,
      cronExpression: config.cronExpression,
      actionType: config.actionType,
      targetChatId: config.targetChatId,
      enabled: config.enabled,
      metadata: config.metadata,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(notificationConfigsTable).values(newConfig);
    return {
      ...newConfig,
      description: newConfig.description || undefined,
      targetChatId: newConfig.targetChatId || undefined,
      metadata: newConfig.metadata as Record<string, any> | undefined,
    };
  }
  
  async updateNotificationConfig(id: string, updates: Partial<NotificationConfig>): Promise<NotificationConfig | undefined> {
    const existing = await this.getNotificationConfig(id);
    if (!existing) return undefined;
    
    const now = new Date().toISOString();
    await db.update(notificationConfigsTable)
      .set({
        ...updates,
        updatedAt: now,
      })
      .where(eq(notificationConfigsTable.id, id));
    
    return this.getNotificationConfig(id);
  }
  
  async deleteNotificationConfig(id: string): Promise<boolean> {
    const result = await db.delete(notificationConfigsTable).where(eq(notificationConfigsTable.id, id));
    return true;
  }
  
  async toggleNotificationConfig(id: string, enabled: boolean): Promise<NotificationConfig | undefined> {
    return this.updateNotificationConfig(id, { enabled });
  }
  
  async updateNotificationLastRun(id: string): Promise<void> {
    await db.update(notificationConfigsTable)
      .set({
        lastRunAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(notificationConfigsTable.id, id));
  }
  
  async initializeDefaultNotifications(): Promise<void> {
    const existing = await this.getNotificationConfigs();
    if (existing.length > 0) return;
    
    const defaults: InsertNotificationConfig[] = [
      { title: "Напоминание о смене", description: "Ежедневное напоминание о начале смены", cadence: "daily", cronExpression: "30 8 * * *", actionType: "shift_reminder", enabled: false },
      { title: "Сводка по баням", description: "Список бронирований бань на сегодня", cadence: "daily", cronExpression: "0 9 * * *", actionType: "bath_summary", enabled: false },
      { title: "Климат-контроль ВКЛ", description: "Напоминание о включении климат-контроля", cadence: "daily", cronExpression: "0 12 * * *", actionType: "climate_on", enabled: false },
      { title: "Климат-контроль ВЫКЛ", description: "Напоминание о выключении климат-контроля", cadence: "daily", cronExpression: "0 14 * * *", actionType: "climate_off", enabled: false },
      { title: "Напоминание о прачечной", description: "Проверка текстиля для заезда", cadence: "daily", cronExpression: "0 15 * * *", actionType: "laundry_reminder", enabled: false },
      { title: "Проверка погоды", description: "Проверка прогноза на заморозки", cadence: "daily", cronExpression: "0 18 * * *", actionType: "weather_check", enabled: false },
      { title: "Ежедневные задачи", description: "Создание ежедневных задач", cadence: "daily", cronExpression: "0 6 * * *", actionType: "daily_tasks", enabled: false },
      { title: "Еженедельные задачи", description: "Создание еженедельных задач", cadence: "weekly", cronExpression: "0 6 * * 1", actionType: "weekly_tasks", enabled: false },
      { title: "Ежемесячные задачи", description: "Создание ежемесячных задач", cadence: "monthly", cronExpression: "0 6 1 * *", actionType: "monthly_tasks", enabled: false },
      { title: "Термостат: Планирование", description: "Запрос планов на день", cadence: "daily", cronExpression: "0 12 * * *", actionType: "thermostat_prompt", enabled: false },
      { title: "Термостат: Базовая температура", description: "Установка базовых температур", cadence: "daily", cronExpression: "5 12 * * *", actionType: "thermostat_base_temp", enabled: false },
      { title: "Термостат: Прогрев", description: "Начало прогрева для заездов", cadence: "daily", cronExpression: "30 14 * * *", actionType: "thermostat_heat", enabled: false },
      { title: "Бронь СПА", description: "Уведомление о новой брони СПА", cadence: "once", cronExpression: "* * * * *", actionType: "spa_booking", enabled: true },
    ];
    
    for (const config of defaults) {
      await this.createNotificationConfig(config);
    }
  }
  
  // ============ BOT MESSAGE TRACKING ============
  
  async trackBotMessage(chatId: string, messageId: number, isPinned?: boolean): Promise<BotMessage> {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    await db.insert(botMessagesTable).values({
      id,
      chatId,
      messageId,
      isPinned: isPinned || false,
      createdAt: now,
    });
    
    return {
      id,
      chatId,
      messageId,
      isPinned: isPinned || false,
      createdAt: now,
    };
  }
  
  async getBotMessagesForChat(chatId: string): Promise<BotMessage[]> {
    const rows = await db.select().from(botMessagesTable)
      .where(eq(botMessagesTable.chatId, chatId))
      .orderBy(asc(botMessagesTable.createdAt));
    
    return rows.map(r => ({
      id: r.id,
      chatId: r.chatId,
      messageId: r.messageId,
      isPinned: r.isPinned,
      createdAt: r.createdAt,
    }));
  }
  
  async getPinnedBotMessage(chatId: string): Promise<BotMessage | undefined> {
    const rows = await db.select().from(botMessagesTable)
      .where(and(
        eq(botMessagesTable.chatId, chatId),
        eq(botMessagesTable.isPinned, true)
      ))
      .limit(1);
    
    if (rows.length === 0) return undefined;
    
    const r = rows[0];
    return {
      id: r.id,
      chatId: r.chatId,
      messageId: r.messageId,
      isPinned: r.isPinned,
      createdAt: r.createdAt,
    };
  }
  
  async deleteBotMessagesForChat(chatId: string, excludePinned?: boolean): Promise<number> {
    if (excludePinned) {
      await db.delete(botMessagesTable)
        .where(and(
          eq(botMessagesTable.chatId, chatId),
          eq(botMessagesTable.isPinned, false)
        ));
    } else {
      await db.delete(botMessagesTable)
        .where(eq(botMessagesTable.chatId, chatId));
    }
    return 0; // PostgreSQL doesn't easily return affected count
  }
  
  async setPinnedBotMessage(chatId: string, messageId: number): Promise<void> {
    // Unpin existing pinned messages for this chat
    await db.update(botMessagesTable)
      .set({ isPinned: false })
      .where(and(
        eq(botMessagesTable.chatId, chatId),
        eq(botMessagesTable.isPinned, true)
      ));
    
    // Try to update existing message
    const existing = await db.select().from(botMessagesTable)
      .where(and(
        eq(botMessagesTable.chatId, chatId),
        eq(botMessagesTable.messageId, messageId)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      await db.update(botMessagesTable)
        .set({ isPinned: true })
        .where(eq(botMessagesTable.id, existing[0].id));
    } else {
      // Create new pinned message entry
      await this.trackBotMessage(chatId, messageId, true);
    }
  }

  async getCheckInActionLogs(bookingId: string): Promise<CheckInActionLog[]> {
    const rows = await db.select().from(checkInActionLogsTable)
      .where(eq(checkInActionLogsTable.bookingId, bookingId))
      .orderBy(desc(checkInActionLogsTable.actionAt));
    return rows.map(r => ({
      id: r.id,
      bookingId: r.bookingId,
      unitCode: r.unitCode,
      actionType: r.actionType as CheckInActionLog["actionType"],
      adminId: r.adminId,
      adminName: r.adminName,
      actionAt: r.actionAt,
      notes: r.notes || undefined,
    }));
  }

  async createCheckInActionLog(log: InsertCheckInActionLog): Promise<CheckInActionLog> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.insert(checkInActionLogsTable).values({
      id,
      bookingId: log.bookingId,
      unitCode: log.unitCode,
      actionType: log.actionType,
      adminId: log.adminId,
      adminName: log.adminName,
      actionAt: now,
      notes: log.notes || null,
    });
    return {
      id,
      ...log,
      actionAt: now,
    };
  }

  // ============ CLEANING WORKERS ============
  async getCleaningWorkers(): Promise<CleaningWorker[]> {
    const rows = await db.select().from(cleaningWorkersTable)
      .where(eq(cleaningWorkersTable.isActive, true))
      .orderBy(asc(cleaningWorkersTable.name));
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      isActive: r.isActive,
      hourlyRate: r.hourlyRate || undefined,
      createdAt: r.createdAt,
    }));
  }

  async getCleaningWorker(id: string): Promise<CleaningWorker | undefined> {
    const rows = await db.select().from(cleaningWorkersTable).where(eq(cleaningWorkersTable.id, id));
    if (rows.length === 0) return undefined;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      isActive: r.isActive,
      hourlyRate: r.hourlyRate || undefined,
      createdAt: r.createdAt,
    };
  }

  async createCleaningWorker(worker: InsertCleaningWorker): Promise<CleaningWorker> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.insert(cleaningWorkersTable).values({
      id,
      name: worker.name,
      isActive: worker.isActive ?? true,
      hourlyRate: worker.hourlyRate || null,
      createdAt: now,
    });
    return {
      id,
      name: worker.name,
      isActive: worker.isActive ?? true,
      hourlyRate: worker.hourlyRate,
      createdAt: now,
    };
  }

  async updateCleaningWorker(id: string, updates: Partial<CleaningWorker>): Promise<CleaningWorker | undefined> {
    const existing = await this.getCleaningWorker(id);
    if (!existing) return undefined;
    await db.update(cleaningWorkersTable).set({
      name: updates.name ?? existing.name,
      isActive: updates.isActive ?? existing.isActive,
      hourlyRate: updates.hourlyRate ?? existing.hourlyRate ?? null,
    }).where(eq(cleaningWorkersTable.id, id));
    return { ...existing, ...updates };
  }

  // ============ CLEANING RATES ============
  async getCleaningRates(): Promise<CleaningRate[]> {
    const rows = await db.select().from(cleaningRatesTable);
    return rows.map(r => ({
      id: r.id,
      unitCode: r.unitCode as CleaningRate["unitCode"],
      rate: r.rate,
      updatedAt: r.updatedAt,
    }));
  }

  async getCleaningRateForUnit(unitCode: string): Promise<CleaningRate | undefined> {
    const rows = await db.select().from(cleaningRatesTable).where(eq(cleaningRatesTable.unitCode, unitCode));
    if (rows.length === 0) return undefined;
    const r = rows[0];
    return {
      id: r.id,
      unitCode: r.unitCode as CleaningRate["unitCode"],
      rate: r.rate,
      updatedAt: r.updatedAt,
    };
  }

  async setCleaningRate(rate: InsertCleaningRate): Promise<CleaningRate> {
    const now = new Date().toISOString();
    const existing = await this.getCleaningRateForUnit(rate.unitCode);
    if (existing) {
      await db.update(cleaningRatesTable).set({
        rate: rate.rate,
        updatedAt: now,
      }).where(eq(cleaningRatesTable.id, existing.id));
      return { ...existing, rate: rate.rate, updatedAt: now };
    }
    const id = randomUUID();
    await db.insert(cleaningRatesTable).values({
      id,
      unitCode: rate.unitCode,
      rate: rate.rate,
      updatedAt: now,
    });
    return {
      id,
      unitCode: rate.unitCode,
      rate: rate.rate,
      updatedAt: now,
    };
  }

  // ============ CLEANING LOGS ============
  async getCleaningLogs(date?: string): Promise<CleaningLog[]> {
    let query = db.select().from(cleaningLogsTable);
    if (date) {
      query = query.where(eq(cleaningLogsTable.date, date)) as typeof query;
    }
    const rows = await query.orderBy(desc(cleaningLogsTable.date));
    return rows.map(r => ({
      id: r.id,
      date: r.date,
      unitCode: r.unitCode as CleaningLog["unitCode"],
      workerId: r.workerId,
      workerName: r.workerName,
      rate: r.rate,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
  }

  async getCleaningLogsForMonth(month: string): Promise<CleaningLog[]> {
    const rows = await db.select().from(cleaningLogsTable)
      .where(sql`${cleaningLogsTable.date} LIKE ${month + '%'}`)
      .orderBy(desc(cleaningLogsTable.date));
    return rows.map(r => ({
      id: r.id,
      date: r.date,
      unitCode: r.unitCode as CleaningLog["unitCode"],
      workerId: r.workerId,
      workerName: r.workerName,
      rate: r.rate,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
  }

  async createCleaningLog(log: InsertCleaningLog): Promise<CleaningLog> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.insert(cleaningLogsTable).values({
      id,
      date: log.date,
      unitCode: log.unitCode,
      workerId: log.workerId,
      workerName: log.workerName,
      rate: log.rate,
      createdBy: log.createdBy,
      createdAt: now,
    });
    return {
      id,
      ...log,
      createdAt: now,
    };
  }

  async deleteCleaningLog(id: string): Promise<boolean> {
    const result = await db.delete(cleaningLogsTable).where(eq(cleaningLogsTable.id, id));
    return true;
  }

  // ============ HOURLY LOGS ============
  async getHourlyLogs(date?: string): Promise<HourlyLog[]> {
    let query = db.select().from(hourlyLogsTable);
    if (date) {
      query = query.where(eq(hourlyLogsTable.date, date)) as typeof query;
    }
    const rows = await query.orderBy(desc(hourlyLogsTable.date));
    return rows.map(r => ({
      id: r.id,
      date: r.date,
      workerId: r.workerId,
      workerName: r.workerName,
      workType: r.workType as HourlyLog["workType"],
      startTime: r.startTime,
      endTime: r.endTime,
      durationMinutes: r.durationMinutes,
      hourlyRate: r.hourlyRate,
      totalAmount: r.totalAmount,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
  }

  async getHourlyLogsForMonth(month: string): Promise<HourlyLog[]> {
    const rows = await db.select().from(hourlyLogsTable)
      .where(sql`${hourlyLogsTable.date} LIKE ${month + '%'}`)
      .orderBy(desc(hourlyLogsTable.date));
    return rows.map(r => ({
      id: r.id,
      date: r.date,
      workerId: r.workerId,
      workerName: r.workerName,
      workType: r.workType as HourlyLog["workType"],
      startTime: r.startTime,
      endTime: r.endTime,
      durationMinutes: r.durationMinutes,
      hourlyRate: r.hourlyRate,
      totalAmount: r.totalAmount,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
  }

  async createHourlyLog(log: InsertHourlyLog): Promise<HourlyLog> {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    // Calculate duration
    const [startH, startM] = log.startTime.split(":").map(Number);
    const [endH, endM] = log.endTime.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const durationMinutes = endMinutes >= startMinutes ? endMinutes - startMinutes : (24 * 60 - startMinutes) + endMinutes;
    const totalAmount = Math.round((durationMinutes / 60) * log.hourlyRate * 100) / 100;

    await db.insert(hourlyLogsTable).values({
      id,
      date: log.date,
      workerId: log.workerId,
      workerName: log.workerName,
      workType: log.workType,
      startTime: log.startTime,
      endTime: log.endTime,
      durationMinutes,
      hourlyRate: log.hourlyRate,
      totalAmount,
      createdBy: log.createdBy,
      createdAt: now,
    });
    return {
      id,
      ...log,
      durationMinutes,
      totalAmount,
      createdAt: now,
    };
  }

  async deleteHourlyLog(id: string): Promise<boolean> {
    await db.delete(hourlyLogsTable).where(eq(hourlyLogsTable.id, id));
    return true;
  }

  // ============ SALARY PERIODS ============
  async getSalaryPeriods(month?: string): Promise<SalaryPeriod[]> {
    let query = db.select().from(salaryPeriodsTable);
    if (month) {
      query = query.where(eq(salaryPeriodsTable.month, month)) as typeof query;
    }
    const rows = await query.orderBy(desc(salaryPeriodsTable.month));
    return rows.map(r => ({
      id: r.id,
      month: r.month,
      workerId: r.workerId,
      workerName: r.workerName,
      cleaningCount: r.cleaningCount,
      cleaningTotal: r.cleaningTotal,
      hourlyMinutes: r.hourlyMinutes,
      hourlyTotal: r.hourlyTotal,
      totalAmount: r.totalAmount,
      isPaid: r.isPaid,
      paidAt: r.paidAt || undefined,
      paidBy: r.paidBy || undefined,
      closedAt: r.closedAt,
    }));
  }

  async getSalaryPeriod(id: string): Promise<SalaryPeriod | undefined> {
    const rows = await db.select().from(salaryPeriodsTable).where(eq(salaryPeriodsTable.id, id));
    if (rows.length === 0) return undefined;
    const r = rows[0];
    return {
      id: r.id,
      month: r.month,
      workerId: r.workerId,
      workerName: r.workerName,
      cleaningCount: r.cleaningCount,
      cleaningTotal: r.cleaningTotal,
      hourlyMinutes: r.hourlyMinutes,
      hourlyTotal: r.hourlyTotal,
      totalAmount: r.totalAmount,
      isPaid: r.isPaid,
      paidAt: r.paidAt || undefined,
      paidBy: r.paidBy || undefined,
      closedAt: r.closedAt,
    };
  }

  async createSalaryPeriod(period: InsertSalaryPeriod): Promise<SalaryPeriod> {
    const id = randomUUID();
    await db.insert(salaryPeriodsTable).values({
      id,
      month: period.month,
      workerId: period.workerId,
      workerName: period.workerName,
      cleaningCount: period.cleaningCount,
      cleaningTotal: period.cleaningTotal,
      hourlyMinutes: period.hourlyMinutes,
      hourlyTotal: period.hourlyTotal,
      totalAmount: period.totalAmount,
      isPaid: period.isPaid ?? false,
      paidAt: period.paidAt || null,
      paidBy: period.paidBy || null,
      closedAt: period.closedAt,
    });
    return { id, ...period };
  }

  async updateSalaryPeriod(id: string, updates: Partial<SalaryPeriod>): Promise<SalaryPeriod | undefined> {
    const existing = await this.getSalaryPeriod(id);
    if (!existing) return undefined;
    await db.update(salaryPeriodsTable).set({
      isPaid: updates.isPaid ?? existing.isPaid,
      paidAt: updates.paidAt ?? existing.paidAt ?? null,
      paidBy: updates.paidBy ?? existing.paidBy ?? null,
    }).where(eq(salaryPeriodsTable.id, id));
    return { ...existing, ...updates };
  }

  async closeSalaryMonth(month: string): Promise<SalaryPeriod[]> {
    const cleaningLogs = await this.getCleaningLogsForMonth(month);
    const hourlyLogs = await this.getHourlyLogsForMonth(month);
    
    const workerStats = new Map<string, {
      workerName: string;
      cleaningCount: number;
      cleaningTotal: number;
      hourlyMinutes: number;
      hourlyTotal: number;
    }>();
    
    for (const log of cleaningLogs) {
      const stats = workerStats.get(log.workerId) || {
        workerName: log.workerName,
        cleaningCount: 0,
        cleaningTotal: 0,
        hourlyMinutes: 0,
        hourlyTotal: 0,
      };
      stats.cleaningCount++;
      stats.cleaningTotal += log.rate;
      workerStats.set(log.workerId, stats);
    }
    
    for (const log of hourlyLogs) {
      const stats = workerStats.get(log.workerId) || {
        workerName: log.workerName,
        cleaningCount: 0,
        cleaningTotal: 0,
        hourlyMinutes: 0,
        hourlyTotal: 0,
      };
      stats.hourlyMinutes += log.durationMinutes;
      stats.hourlyTotal += log.totalAmount;
      workerStats.set(log.workerId, stats);
    }
    
    const periods: SalaryPeriod[] = [];
    const closedAt = new Date().toISOString();
    
    for (const [workerId, stats] of workerStats.entries()) {
      const period = await this.createSalaryPeriod({
        month,
        workerId,
        workerName: stats.workerName,
        cleaningCount: stats.cleaningCount,
        cleaningTotal: stats.cleaningTotal,
        hourlyMinutes: stats.hourlyMinutes,
        hourlyTotal: stats.hourlyTotal,
        totalAmount: stats.cleaningTotal + stats.hourlyTotal,
        isPaid: false,
        closedAt,
      });
      periods.push(period);
    }
    
    return periods;
  }
}
