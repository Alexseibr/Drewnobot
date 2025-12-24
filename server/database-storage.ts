import { randomUUID } from "crypto";
import { eq, and, gte, lt, desc, asc, or, isNull, sql } from "drizzle-orm";
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
} from "@shared/schema";
import {
  usersTable, unitsTable, cleaningTariffsTable, servicePricesTable,
  cottageBookingsTable, bathBookingsTable, spaBookingsTable, quadBookingsTable,
  tasksTable, cashShiftsTable, cashTransactionsTable, incasationsTable,
  workLogsTable, quadPricingTable, instructorBlockedTimesTable, instructorExpensesTable,
  authSessionsTable, staffInvitationsTable, staffAuthorizationsTable, quadMachinesTable, quadMileageLogsTable,
  quadMaintenanceRulesTable, quadMaintenanceEventsTable, siteSettingsTable,
  blockedDatesTable, reviewsTable, laundryBatchesTable, textileAuditsTable,
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
      options: booking.options || { tub: "none", grill: false, charcoal: false },
      pricing,
      payments: b.payments || { eripPaid: 0, cashPaid: 0 },
      status: b.status || "pending_call",
      holdUntil: b.holdUntil,
      assignedAdmin: b.assignedAdmin,
      createdAt: now,
    };
    await db.insert(bathBookingsTable).values({
      id: newBooking.id,
      bathCode: newBooking.bathCode,
      date: newBooking.date,
      startTime: newBooking.startTime,
      endTime: newBooking.endTime,
      customer: newBooking.customer,
      options: newBooking.options,
      pricing: newBooking.pricing,
      payments: newBooking.payments,
      status: newBooking.status,
      holdUntil: newBooking.holdUntil || null,
      assignedAdmin: newBooking.assignedAdmin || null,
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
      options: row.options as any,
      pricing: row.pricing as any,
      payments: row.payments as any,
      status: row.status as any,
      holdUntil: row.holdUntil || undefined,
      assignedAdmin: row.assignedAdmin || undefined,
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

  async createTask(task: InsertTask): Promise<Task> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newTask: Task = {
      id,
      date: task.date,
      unitCode: task.unitCode,
      type: task.type,
      title: task.title,
      checklist: task.checklist,
      status: task.status || "open",
      assignedTo: task.assignedTo,
      createdBySystem: task.createdBySystem || false,
      meta: task.meta,
      createdAt: now,
    };
    await db.insert(tasksTable).values({
      id: newTask.id,
      date: newTask.date,
      unitCode: newTask.unitCode || null,
      type: newTask.type,
      title: newTask.title,
      checklist: newTask.checklist || null,
      status: newTask.status,
      assignedTo: newTask.assignedTo || null,
      createdBySystem: newTask.createdBySystem,
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
    if (updates.checklist !== undefined) updateData.checklist = updates.checklist;
    
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
      checklist: row.checklist as any,
      status: row.status as any,
      assignedTo: row.assignedTo || undefined,
      createdBySystem: row.createdBySystem,
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
    const lastIncasation = await this.getLastIncasation();
    if (!lastIncasation) {
      return this.getCashTransactions();
    }
    const rows = await db.select().from(cashTransactionsTable)
      .where(gte(cashTransactionsTable.createdAt, lastIncasation.performedAt))
      .orderBy(desc(cashTransactionsTable.createdAt));
    return rows.map(r => this.mapRowToCashTransaction(r));
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
  }> {
    const transactions = await this.getCashTransactionsSinceLastIncasation();
    const lastIncasation = await this.getLastIncasation();
    
    let cashRevenue = 0;
    let eripRevenue = 0;
    let totalExpenses = 0;
    const expensesByCategory: Record<string, number> = {};
    
    for (const tx of transactions) {
      if (tx.type === "cash_in") {
        cashRevenue += tx.amount;
      } else if (tx.type === "cash_out") {
        totalExpenses += tx.amount;
        const cat = tx.category || "Прочее";
        expensesByCategory[cat] = (expensesByCategory[cat] || 0) + tx.amount;
      }
    }
    
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
      };
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
    
    if (rows[0]) {
      await db.update(siteSettingsTable).set(updateData).where(eq(siteSettingsTable.id, rows[0].id));
    } else {
      await db.insert(siteSettingsTable).values({
        id: "settings-1",
        ...updateData,
        geofenceCenter: updateData.geofenceCenter || current.geofenceCenter,
        geofenceRadiusM: updateData.geofenceRadiusM || current.geofenceRadiusM,
        closeTime: updateData.closeTime || current.closeTime,
        timezone: updateData.timezone || current.timezone,
      });
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
    
    const cottageRevenue = filteredCottage.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    const bathRevenue = filteredBath.reduce((sum, b) => sum + (b.pricing?.total || 0), 0);
    const quadRevenue = filteredQuad.reduce((sum, b) => sum + (b.pricing?.total || 0), 0);
    
    const cashTotal = filteredCottage.reduce((s, b) => s + (b.payments?.cash || 0), 0)
      + filteredBath.reduce((s, b) => s + (b.payments?.cashPaid || 0), 0)
      + filteredQuad.reduce((s, b) => s + (b.payments?.cashPaid || 0), 0);
    
    const eripTotal = filteredCottage.reduce((s, b) => s + (b.payments?.erip || 0), 0)
      + filteredBath.reduce((s, b) => s + (b.payments?.eripPaid || 0), 0)
      + filteredQuad.reduce((s, b) => s + (b.payments?.eripPaid || 0), 0);
    
    const tubSmallCount = filteredBath.filter(b => b.options?.tub === "small").length;
    const tubLargeCount = filteredBath.filter(b => b.options?.tub === "large").length;
    const tubSmallPrice = 30;
    const tubLargePrice = 50;
    
    const workHoursTotal = filteredWork.reduce((sum, w) => sum + (w.durationMinutes / 60), 0);
    
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
      cleaningsByTariff: {},
      tubSmallCount,
      tubSmallRevenue: tubSmallCount * tubSmallPrice,
      tubLargeCount,
      tubLargeRevenue: tubLargeCount * tubLargePrice,
      workHoursTotal,
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
}
