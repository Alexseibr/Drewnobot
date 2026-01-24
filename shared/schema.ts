import { z } from "zod";
import { pgTable, text, varchar, boolean, integer, real, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ============ ENUMS ============
export const UserRole = z.enum(["SUPER_ADMIN", "OWNER", "ADMIN", "INSTRUCTOR", "GUEST"]);
export type UserRole = z.infer<typeof UserRole>;

export const UnitType = z.enum(["cottage", "bath"]);
export type UnitType = z.infer<typeof UnitType>;

export const TubPolicy = z.enum(["none", "small_only", "small_or_large"]);
export type TubPolicy = z.infer<typeof TubPolicy>;

export const TubType = z.enum(["none", "small", "large"]);
export type TubType = z.infer<typeof TubType>;

export const CleaningTariffCode = z.enum(["A", "B", "C"]);
export type CleaningTariffCode = z.infer<typeof CleaningTariffCode>;

export const CottageBookingStatus = z.enum(["planned", "checked_in", "completed", "cancelled", "no_show"]);
export type CottageBookingStatus = z.infer<typeof CottageBookingStatus>;

export const BathBookingStatus = z.enum(["pending_call", "awaiting_prepayment", "confirmed", "cancelled", "expired", "completed"]);
export type BathBookingStatus = z.infer<typeof BathBookingStatus>;

export const QuadSessionStatus = z.enum(["open", "full", "blocked"]);
export type QuadSessionStatus = z.infer<typeof QuadSessionStatus>;

export const QuadBookingStatus = z.enum(["pending_call", "confirmed", "cancelled", "completed"]);
export type QuadBookingStatus = z.infer<typeof QuadBookingStatus>;

// SPA Booking Type and Status
export const SpaBookingType = z.enum(["bath_only", "tub_only", "bath_with_tub", "terrace_only"]);
export type SpaBookingType = z.infer<typeof SpaBookingType>;

export const SpaBookingStatus = z.enum(["pending_call", "awaiting_prepayment", "confirmed", "completed", "cancelled", "expired"]);
export type SpaBookingStatus = z.infer<typeof SpaBookingStatus>;

export const SpaResource = z.enum(["SPA1", "SPA2"]);
export type SpaResource = z.infer<typeof SpaResource>;

export const TaskType = z.enum(["climate_off", "climate_on", "trash_prep", "meters", "cleaning", "call_guest", "other"]);
export type TaskType = z.infer<typeof TaskType>;

// Meter reading data for "meters" task type
export const meterReadingSchema = z.object({
  unit: z.string(), // D1, D2, D3, D4, B1, B2, SPA
  meterType: z.enum(["electricity", "water", "gas"]),
  value: z.number(),
  previousValue: z.number().optional(),
  date: z.string(),
  photo: z.string().optional(), // URL to photo
});
export type MeterReading = z.infer<typeof meterReadingSchema>;

export const meterReadingsMetaSchema = z.object({
  readings: z.array(meterReadingSchema),
  period: z.string(), // YYYY-MM
});
export type MeterReadingsMeta = z.infer<typeof meterReadingsMetaSchema>;

export const TaskStatus = z.enum(["open", "done"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const CashTransactionType = z.enum(["cash_in", "cash_out", "expense", "transfer_to_owner", "transfer_to_admin"]);
export type CashTransactionType = z.infer<typeof CashTransactionType>;

export const ExpenseCategory = z.enum(["food_staff", "supplies", "salary", "contractor", "other"]);
export type ExpenseCategory = z.infer<typeof ExpenseCategory>;

export const CashBoxType = z.enum(["main", "quads"]);
export type CashBoxType = z.infer<typeof CashBoxType>;

// Income source for cash_in transactions
export const IncomeSource = z.enum(["bath", "cottage_1", "cottage_2", "cottage_3", "cottage_4", "quads", "spa", "other"]);
export type IncomeSource = z.infer<typeof IncomeSource>;

export const PaymentMethod = z.enum(["erip", "cash"]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

// ============ LAUNDRY ============
export const LaundryBatchStatus = z.enum(["pending", "washing", "drying", "ready", "delivered"]);
export type LaundryBatchStatus = z.infer<typeof LaundryBatchStatus>;

// Colors for bedding: white, light grey, dark grey; Towels are always grey
export const TextileColor = z.enum(["white", "grey_light", "grey_dark", "grey"]);
export type TextileColor = z.infer<typeof TextileColor>;

// Textile types - duvet_covers added
export const TextileType = z.enum(["sheets", "duvet_covers", "pillowcases", "towels_large", "towels_small", "robes", "mattress_covers"]);
export type TextileType = z.infer<typeof TextileType>;

// Locations for textile tracking
export const TextileLocation = z.enum(["warehouse", "laundry", "D1", "D2", "D3", "D4"]);
export type TextileLocation = z.infer<typeof TextileLocation>;

// ============ USER ============
export const userSchema = z.object({
  id: z.string(),
  telegramId: z.string(),
  name: z.string(),
  phone: z.string().optional(),
  role: UserRole,
  isActive: z.boolean().default(true),
});
export type User = z.infer<typeof userSchema>;

export const insertUserSchema = userSchema.omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;

// ============ UNIT (Cottage/Bath) ============
export const unitSchema = z.object({
  id: z.string(),
  type: UnitType,
  code: z.string(), // C1..C4 or B1, B2
  title: z.string(),
  cleaningTariffCode: CleaningTariffCode,
  tubPolicy: TubPolicy,
  images: z.array(z.string()).default([]),
});
export type Unit = z.infer<typeof unitSchema>;

export const insertUnitSchema = unitSchema.omit({ id: true });
export type InsertUnit = z.infer<typeof insertUnitSchema>;

// ============ CLEANING TARIFF ============
export const cleaningTariffSchema = z.object({
  id: z.string(),
  code: CleaningTariffCode,
  title: z.string(),
  price: z.number(),
});
export type CleaningTariff = z.infer<typeof cleaningTariffSchema>;

// ============ SERVICE PRICE ============
export const servicePriceSchema = z.object({
  id: z.string(),
  key: z.string(), // bath_base_3h, bath_extra_hour, tub_small, tub_large, grill, charcoal, quad_30m, quad_60m
  price: z.number(),
  currency: z.string().default("BYN"),
  activeFrom: z.string().optional(),
  activeTo: z.string().optional(),
});
export type ServicePrice = z.infer<typeof servicePriceSchema>;

// ============ CUSTOMER ============
export const customerSchema = z.object({
  fullName: z.string().optional(),
  phone: z.string().optional(),
  telegramId: z.string().optional(),
});
export type Customer = z.infer<typeof customerSchema>;

// ============ PAYMENT INFO ============
export const prepaymentSchema = z.object({
  amount: z.number(),
  method: PaymentMethod,
});
export type Prepayment = z.infer<typeof prepaymentSchema>;

// Guest rating enum (1-5 stars or flags)
export const GuestRating = z.enum(["excellent", "good", "neutral", "problematic", "blacklisted"]);
export type GuestRating = z.infer<typeof GuestRating>;

// ============ GUEST PROFILE ============
export const guestSchema = z.object({
  id: z.string(),
  phone: z.string(), // normalized phone number (unique)
  fullName: z.string().optional(),
  telegramId: z.string().optional(),
  totalVisits: z.number().default(0),
  completedVisits: z.number().default(0), // only arrived visits count
  noShowCount: z.number().default(0),
  lastVisitAt: z.string().optional(),
  notes: z.string().optional(),
  rating: GuestRating.optional(), // staff rating of guest
  isBlacklisted: z.boolean().default(false), // quick flag for problematic guests
  createdAt: z.string(),
});
export type Guest = z.infer<typeof guestSchema>;

export const insertGuestSchema = guestSchema.omit({ id: true, createdAt: true, totalVisits: true, completedVisits: true, noShowCount: true });
export type InsertGuest = z.infer<typeof insertGuestSchema>;

// ============ COTTAGE BOOKING ============
export const cottageBookingSchema = z.object({
  id: z.string(),
  unitCode: z.string(),
  dateCheckIn: z.string(),
  dateCheckOut: z.string(),
  guestsCount: z.number(),
  tubSmall: z.boolean().default(false),
  totalAmount: z.number(),
  payments: z.object({
    erip: z.number().default(0),
    cash: z.number().default(0),
    prepayment: prepaymentSchema.optional(),
  }),
  customer: customerSchema,
  status: CottageBookingStatus.default("planned"),
  createdBy: z.string(),
  createdAt: z.string(),
});
export type CottageBooking = z.infer<typeof cottageBookingSchema>;

export const insertCottageBookingSchema = cottageBookingSchema.omit({ id: true, createdAt: true });
export type InsertCottageBooking = z.infer<typeof insertCottageBookingSchema>;

// ============ BATH BOOKING ============
export const bathBookingSchema = z.object({
  id: z.string(),
  bathCode: z.string(), // B1 or B2
  date: z.string(),
  startTime: z.string(), // HH:mm
  endTime: z.string(), // HH:mm
  customer: customerSchema,
  guestId: z.string().optional(), // link to guest profile
  options: z.object({
    tub: TubType.default("none"),
    terrace: z.boolean().default(false), // only terrace rental
    grill: z.boolean().default(false),
    charcoal: z.boolean().default(false),
  }),
  pricing: z.object({
    base: z.number(),
    extras: z.number(),
    total: z.number(),
  }),
  payments: z.object({
    prepayment: prepaymentSchema.optional(),
    eripPaid: z.number().default(0),
    cashPaid: z.number().default(0),
  }),
  status: BathBookingStatus.default("pending_call"),
  holdUntil: z.string().optional(),
  assignedAdmin: z.string().optional(),
  arrivedAt: z.string().optional(), // when guest arrived
  noShow: z.boolean().default(false), // marked as no-show
  createdAt: z.string(),
});
export type BathBooking = z.infer<typeof bathBookingSchema>;

export const insertBathBookingSchema = z.object({
  bathCode: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  customer: customerSchema,
  options: z.object({
    tub: TubType.default("none"),
    terrace: z.boolean().default(false),
    grill: z.boolean().default(false),
    charcoal: z.boolean().default(false),
  }),
});
export type InsertBathBooking = z.infer<typeof insertBathBookingSchema>;

// ============ TASK ============
export const TaskPriority = z.enum(["normal", "urgent"]);
export type TaskPriority = z.infer<typeof TaskPriority>;

export const taskSchema = z.object({
  id: z.string(),
  date: z.string(),
  unitCode: z.string().optional(),
  type: TaskType,
  title: z.string(),
  description: z.string().optional(),
  checklist: z.array(z.string()).optional(),
  status: TaskStatus.default("open"),
  assignedTo: z.string().optional(),
  acceptedAt: z.string().optional(), // When the assignee accepted the task
  priority: TaskPriority.default("normal"),
  notifyAt: z.string().optional(),
  notified: z.boolean().default(false),
  createdBySystem: z.boolean().default(false),
  createdBy: z.string().optional(), // User ID who created the task
  meta: z.any().optional(),
  createdAt: z.string(),
});
export type Task = z.infer<typeof taskSchema>;

export const insertTaskSchema = taskSchema.omit({ id: true, createdAt: true, notified: true, createdBy: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;

// ============ CASH SHIFT ============
export const cashShiftSchema = z.object({
  id: z.string(),
  openedAt: z.string(),
  closedAt: z.string().optional(),
  openedBy: z.string(),
  isOpen: z.boolean().default(true),
  visibleToAdmin: z.boolean().default(true),
  cashBox: CashBoxType.default("main"),
});
export type CashShift = z.infer<typeof cashShiftSchema>;

export const insertCashShiftSchema = cashShiftSchema.omit({ id: true, openedAt: true, isOpen: true, visibleToAdmin: true, cashBox: true });
export type InsertCashShift = z.infer<typeof insertCashShiftSchema>;

// ============ CASH TRANSACTION ============
export const locationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  label: z.string().optional(),
  accuracy: z.number().optional(),
  capturedAt: z.string(),
  mode: z.enum(["on_site", "off_site"]).optional(),
});
export type Location = z.infer<typeof locationSchema>;

export const cashTransactionSchema = z.object({
  id: z.string(),
  shiftId: z.string(),
  type: CashTransactionType,
  amount: z.number(),
  category: ExpenseCategory.optional(),
  incomeSource: IncomeSource.optional(),
  cashBox: CashBoxType.optional(),
  comment: z.string().optional(),
  createdAt: z.string(),
  createdBy: z.string(),
  createdByName: z.string().optional(),
  location: locationSchema.optional(),
});
export type CashTransaction = z.infer<typeof cashTransactionSchema>;

export const insertCashTransactionSchema = cashTransactionSchema.omit({ id: true, createdAt: true });
export type InsertCashTransaction = z.infer<typeof insertCashTransactionSchema>;

// ============ INCASATION (Cash Collection) ============
export const incasationSchema = z.object({
  id: z.string(),
  performedAt: z.string(),
  performedBy: z.string(), // userId of owner who performed
  periodStart: z.string(), // Date of last incasation or first transaction
  periodEnd: z.string(), // Date of this incasation
  summary: z.object({
    totalRevenue: z.number(), // Total income during period
    cashRevenue: z.number(), // Cash payments
    eripRevenue: z.number(), // Card/ERIP payments
    totalExpenses: z.number(), // Total expenses
    cashOnHand: z.number(), // Cash balance at time of incasation
    expensesByCategory: z.record(z.string(), z.number()).optional(),
  }),
  shiftsIncluded: z.array(z.string()), // IDs of shifts included in this collection
  createdAt: z.string(),
});
export type Incasation = z.infer<typeof incasationSchema>;

export const insertIncasationSchema = incasationSchema.omit({ id: true, createdAt: true });
export type InsertIncasation = z.infer<typeof insertIncasationSchema>;

// ============ OWNER CASH TRANSACTION ============
export const ownerCashTransactionSchema = z.object({
  id: z.string(),
  type: z.enum(["transfer_in", "transfer_out", "expense", "other"]), // transfer_in from admin, transfer_out to admin
  amount: z.number(),
  comment: z.string().optional(),
  relatedAdminTxId: z.string().optional(), // Links to admin's cash_transactions
  createdBy: z.string(),
  createdAt: z.string(),
});
export type OwnerCashTransaction = z.infer<typeof ownerCashTransactionSchema>;

export const insertOwnerCashTransactionSchema = ownerCashTransactionSchema.omit({ id: true, createdAt: true });
export type InsertOwnerCashTransaction = z.infer<typeof insertOwnerCashTransactionSchema>;

// ============ OWNER CASH BOX ============
export const ownerCashBoxSchema = z.object({
  id: z.string(),
  balance: z.number(),
  updatedAt: z.string(),
});
export type OwnerCashBox = z.infer<typeof ownerCashBoxSchema>;

// ============ WORK LOG ============
export const workLogSchema = z.object({
  id: z.string(),
  employeeName: z.string(),
  byAdmin: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  durationMinutes: z.number(),
  workType: z.string(),
  hourlyRate: z.number().optional(),
  note: z.string().optional(),
  createdAt: z.string(),
  location: locationSchema.optional(),
});
export type WorkLog = z.infer<typeof workLogSchema>;

export const insertWorkLogSchema = z.object({
  employeeName: z.string(),
  byAdmin: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  workType: z.string(),
  hourlyRate: z.number().optional(),
  note: z.string().optional(),
  location: locationSchema.optional(),
});
export type InsertWorkLog = z.infer<typeof insertWorkLogSchema>;

// ============ LAUNDRY BATCH ============
export const laundryItemSchema = z.object({
  type: TextileType,
  color: TextileColor,
  count: z.number().min(1),
});
export type LaundryItem = z.infer<typeof laundryItemSchema>;

export const laundryBatchSchema = z.object({
  id: z.string(),
  unitCode: z.string().optional(), // D1, D2, D3, D4 - where textile came from
  items: z.array(laundryItemSchema),
  status: LaundryBatchStatus.default("pending"),
  createdBy: z.string(),
  createdAt: z.string(),
  washStartedAt: z.string().optional(),
  dryStartedAt: z.string().optional(),
  readyAt: z.string().optional(),
  deliveredAt: z.string().optional(),
  deliveredTo: z.string().optional(), // Unit code where delivered
  notes: z.string().optional(),
});
export type LaundryBatch = z.infer<typeof laundryBatchSchema>;

export const insertLaundryBatchSchema = z.object({
  unitCode: z.string().optional(),
  items: z.array(laundryItemSchema),
  notes: z.string().optional(),
});
export type InsertLaundryBatch = z.infer<typeof insertLaundryBatchSchema>;

// ============ TEXTILE AUDIT ============
export const textileAuditSchema = z.object({
  id: z.string(),
  date: z.string(),
  location: z.string(), // D1, D2, D3, D4, Склад, Прачечная
  items: z.array(z.object({
    type: TextileType,
    color: TextileColor,
    count: z.number(),
    condition: z.enum(["good", "worn", "damaged"]).default("good"),
  })),
  auditedBy: z.string(),
  notes: z.string().optional(),
  createdAt: z.string(),
});
export type TextileAudit = z.infer<typeof textileAuditSchema>;

export const insertTextileAuditSchema = z.object({
  date: z.string(),
  location: z.string(),
  items: z.array(z.object({
    type: TextileType,
    color: TextileColor,
    count: z.number(),
    condition: z.enum(["good", "worn", "damaged"]).default("good"),
  })),
  notes: z.string().optional(),
});
export type InsertTextileAudit = z.infer<typeof insertTextileAuditSchema>;

// ============ TEXTILE STOCK (Inventory by location) ============
export const textileStockSchema = z.object({
  id: z.string(),
  location: TextileLocation, // warehouse, laundry, D1, D2, D3, D4
  type: TextileType,
  color: TextileColor,
  quantity: z.number().min(0),
  updatedBy: z.string().optional(),
  updatedAt: z.string(),
});
export type TextileStock = z.infer<typeof textileStockSchema>;

export const insertTextileStockSchema = z.object({
  location: TextileLocation,
  type: TextileType,
  color: TextileColor,
  quantity: z.number().min(0),
});
export type InsertTextileStock = z.infer<typeof insertTextileStockSchema>;

// ============ TEXTILE CHECK-IN EVENT (Заселение с текстилем) ============
// Bedding set = 1 sheet + 1 duvet_cover + 2 pillowcases
// Towel set = 2 large + 2 small towels
export const beddingSetSchema = z.object({
  color: TextileColor, // white, grey_light, grey_dark
  count: z.number().min(1).max(3), // Number of bedding sets of this color
});

export const textileCheckInSchema = z.object({
  id: z.string(),
  unitCode: z.string(), // D1, D2, D3, D4
  beddingSets: z.array(beddingSetSchema), // e.g. [{color: "white", count: 1}, {color: "grey_dark", count: 1}]
  towelSets: z.number().min(1).max(6), // Total towel sets (typically 2 per bedding set)
  robes: z.number().min(0).max(6).default(0), // Optional robes
  createdBy: z.string(),
  createdAt: z.string(),
  notes: z.string().optional(),
});
export type TextileCheckIn = z.infer<typeof textileCheckInSchema>;

export const insertTextileCheckInSchema = z.object({
  unitCode: z.string(),
  beddingSets: z.array(beddingSetSchema),
  towelSets: z.number().min(1).max(6),
  robes: z.number().min(0).max(6).default(0),
  notes: z.string().optional(),
});
export type InsertTextileCheckIn = z.infer<typeof insertTextileCheckInSchema>;

// ============ TEXTILE EVENT LOG (Audit trail) ============
export const TextileEventType = z.enum([
  "init_stock",      // Initial warehouse stock setup
  "check_in",        // Textiles moved to unit for guest check-in
  "mark_dirty",      // Unit checkout - textiles moved to laundry
  "mark_clean",      // Laundry done - textiles returned to warehouse
  "adjustment",      // Manual correction
  "transfer",        // Move between locations
]);
export type TextileEventType = z.infer<typeof TextileEventType>;

export const textileEventSchema = z.object({
  id: z.string(),
  eventType: TextileEventType,
  fromLocation: TextileLocation.optional(),
  toLocation: TextileLocation.optional(),
  items: z.array(z.object({
    type: TextileType,
    color: TextileColor,
    quantity: z.number(),
  })),
  relatedUnitCode: z.string().optional(), // D1, D2, D3, D4
  createdBy: z.string(),
  createdAt: z.string(),
  notes: z.string().optional(),
});
export type TextileEvent = z.infer<typeof textileEventSchema>;

export const insertTextileEventSchema = z.object({
  eventType: TextileEventType,
  fromLocation: TextileLocation.optional(),
  toLocation: TextileLocation.optional(),
  items: z.array(z.object({
    type: TextileType,
    color: TextileColor,
    quantity: z.number(),
  })),
  relatedUnitCode: z.string().optional(),
  notes: z.string().optional(),
});
export type InsertTextileEvent = z.infer<typeof insertTextileEventSchema>;

// ============ QUAD ROUTE TYPE ============
export const QuadRouteType = z.enum(["short", "long"]); // short = 30min/50 BYN, long = 60min/80 BYN
export type QuadRouteType = z.infer<typeof QuadRouteType>;

// ============ QUAD PRICING ============
// Allows instructors to set default prices and date-specific overrides
export const quadPricingSchema = z.object({
  id: z.string(),
  routeType: QuadRouteType,
  price: z.number().min(0),
  date: z.string().optional(), // If set, this is a date-specific override (YYYY-MM-DD). If null, it's the default price.
  createdBy: z.string().optional(), // User ID who created/updated this
  createdAt: z.string(),
});
export type QuadPricing = z.infer<typeof quadPricingSchema>;

export const insertQuadPricingSchema = z.object({
  routeType: QuadRouteType,
  price: z.number().min(0),
  date: z.string().optional(),
});
export type InsertQuadPricing = z.infer<typeof insertQuadPricingSchema>;

// ============ INSTRUCTOR BLOCKED TIME ============
export const instructorBlockedTimeSchema = z.object({
  id: z.string(),
  date: z.string(),
  startTime: z.string().optional(), // If not set, whole day is blocked
  endTime: z.string().optional(),
  reason: z.string().optional(),
  createdAt: z.string(),
});
export type InstructorBlockedTime = z.infer<typeof instructorBlockedTimeSchema>;

export const insertInstructorBlockedTimeSchema = z.object({
  date: z.string(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  reason: z.string().optional(),
});
export type InsertInstructorBlockedTime = z.infer<typeof insertInstructorBlockedTimeSchema>;

// ============ QUAD SLOT ============
// A time slot for quad rides - created dynamically based on bookings
export const quadSlotSchema = z.object({
  id: z.string(),
  date: z.string(),
  startTime: z.string(), // HH:mm
  endTime: z.string(), // HH:mm (startTime + duration)
  routeType: QuadRouteType,
  totalQuads: z.number().default(4),
  bookedQuads: z.number().default(0),
  basePrice: z.number(), // 50 for short, 80 for long
  hasDiscount: z.boolean().default(false), // 5% discount if joining existing slot
  createdAt: z.string(),
});
export type QuadSlot = z.infer<typeof quadSlotSchema>;

// ============ QUAD BOOKING ============
export const quadBookingSchema = z.object({
  id: z.string(),
  slotId: z.string().optional(), // If joining an existing slot
  date: z.string(),
  startTime: z.string(), // HH:mm
  endTime: z.string(), // HH:mm
  routeType: QuadRouteType,
  quadsCount: z.number().min(1).max(4),
  customer: customerSchema,
  pricing: z.object({
    basePrice: z.number(), // 50 or 80 per quad
    total: z.number(),
    discount: z.number().default(0), // 5% discount amount if applicable
    discountApplied: z.boolean().default(false),
  }),
  payments: z.object({
    prepayment: prepaymentSchema.optional(),
    eripPaid: z.number().default(0),
    cashPaid: z.number().default(0),
  }),
  status: QuadBookingStatus.default("pending_call"),
  comment: z.string().optional(),
  createdAt: z.string(),
});
export type QuadBooking = z.infer<typeof quadBookingSchema>;

export const insertQuadBookingSchema = z.object({
  date: z.string(),
  startTime: z.string(),
  routeType: QuadRouteType,
  quadsCount: z.number().min(1).max(4),
  customer: customerSchema,
  comment: z.string().optional(),
  slotId: z.string().optional(), // If joining existing slot for discount
});
export type InsertQuadBooking = z.infer<typeof insertQuadBookingSchema>;

// ============ INSTRUCTOR EXPENSE ============
export const instructorExpenseCategoryEnum = z.enum(["fuel", "maintenance", "parts", "other"]);
export type InstructorExpenseCategory = z.infer<typeof instructorExpenseCategoryEnum>;

export const instructorExpenseSchema = z.object({
  id: z.string(),
  date: z.string(),
  category: instructorExpenseCategoryEnum,
  amount: z.number().positive(),
  description: z.string(),
  createdBy: z.string(), // instructor telegramId
  createdAt: z.string(),
});
export type InstructorExpense = z.infer<typeof instructorExpenseSchema>;

export const insertInstructorExpenseSchema = instructorExpenseSchema.omit({ 
  id: true, 
  createdAt: true 
});
export type InsertInstructorExpense = z.infer<typeof insertInstructorExpenseSchema>;

// ============ PREPARATION TIME CONSTANTS ============
export const PREPARATION_TIMES = {
  bath: 2, // hours for bath preparation
  tub: 3, // hours for hot tub (kupel) preparation  
  quad: 2, // hours for instructor quad preparation
} as const;

// ============ SITE SETTINGS ============
export const siteSettingsSchema = z.object({
  id: z.string(),
  geofenceCenter: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  geofenceRadiusM: z.number().default(300),
  closeTime: z.string().default("22:00"),
  timezone: z.string().default("Europe/Minsk"),
  adminChatId: z.string().optional(),
  ownerChatId: z.string().optional(),
  instructorChatId: z.string().optional(),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

// ============ ANALYTICS SUMMARY ============
export const cottageAnalyticsSchema = z.object({
  cottageCode: z.string(),
  bookingsCount: z.number(),
  revenue: z.number(),
  cashTotal: z.number(),
  eripTotal: z.number(),
});
export type CottageAnalytics = z.infer<typeof cottageAnalyticsSchema>;

export const serviceAnalyticsSchema = z.object({
  serviceType: z.string(),
  count: z.number(),
  revenue: z.number(),
});
export type ServiceAnalytics = z.infer<typeof serviceAnalyticsSchema>;

export const analyticsSummarySchema = z.object({
  month: z.string(),
  cottageBookingsCount: z.number(),
  cottageRevenue: z.number(),
  bathBookingsCount: z.number(),
  bathRevenue: z.number(),
  quadSessionsCount: z.number(),
  quadRevenue: z.number(),
  cashTotal: z.number(),
  eripTotal: z.number(),
  income: z.number().optional(), // Total cash_in transactions
  expenses: z.number().optional(), // Total cash_out transactions
  cleaningsByTariff: z.record(z.string(), z.number()),
  tubSmallCount: z.number(),
  tubSmallRevenue: z.number(),
  tubLargeCount: z.number(),
  tubLargeRevenue: z.number(),
  workHoursTotal: z.number(),
  cottageBreakdown: z.array(cottageAnalyticsSchema).optional(),
  serviceBreakdown: z.array(serviceAnalyticsSchema).optional(),
});
export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;

// ============ BATH AVAILABILITY SLOT ============
export const bathAvailabilitySlotSchema = z.object({
  bathCode: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  available: z.boolean(),
});
export type BathAvailabilitySlot = z.infer<typeof bathAvailabilitySlotSchema>;

// ============ SPA BOOKING ============
export const spaBookingSchema = z.object({
  id: z.string(),
  spaResource: SpaResource,
  bookingType: SpaBookingType,
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationHours: z.number().min(3).max(5).default(3),
  guestsCount: z.number().min(1).max(12),
  customer: customerSchema,
  comment: z.string().optional(),
  options: z.object({
    tub: TubType.default("none"),
    terrace: z.boolean().default(false),
    grill: z.boolean().default(false),
    charcoal: z.boolean().default(false),
  }).optional(),
  pricing: z.object({
    base: z.number(),
    total: z.number(),
    discountPercent: z.number().min(0).max(100).default(0),
    discountAmount: z.number().default(0),
    priceSnapshot: z.string().optional(),
  }),
  payments: z.object({
    prepayment: prepaymentSchema.optional(),
    eripPaid: z.number().default(0),
    cashPaid: z.number().default(0),
  }),
  status: SpaBookingStatus.default("pending_call"),
  holdUntil: z.string().optional(),
  assignedAdmin: z.string().optional(),
  createdAt: z.string(),
});
export type SpaBooking = z.infer<typeof spaBookingSchema>;

export const insertSpaBookingSchema = z.object({
  spaResource: SpaResource,
  bookingType: SpaBookingType,
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationHours: z.number().min(3).max(5).default(3),
  guestsCount: z.number().min(1).max(12),
  customer: z.object({
    fullName: z.string().min(2),
    phone: z.string().min(10),
    telegramId: z.string().optional(),
  }),
  comment: z.string().optional(),
});
export type InsertSpaBooking = z.infer<typeof insertSpaBookingSchema>;

// ============ SMS CODE ============
export const smsCodeSchema = z.object({
  id: z.string(),
  phone: z.string(),
  codeHash: z.string(),
  expiresAt: z.string(),
  attempts: z.number().default(0),
  verified: z.boolean().default(false),
  createdAt: z.string(),
});
export type SmsCode = z.infer<typeof smsCodeSchema>;

// ============ VERIFICATION TOKEN ============
export const verificationTokenSchema = z.object({
  id: z.string(),
  phone: z.string(),
  token: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type VerificationToken = z.infer<typeof verificationTokenSchema>;

// ============ REVIEW ============
export const reviewBookingRefSchema = z.object({
  kind: z.enum(["spa", "bath", "quad", "cottage"]),
  id: z.string(),
});
export type ReviewBookingRef = z.infer<typeof reviewBookingRefSchema>;

export const reviewSchema = z.object({
  id: z.string(),
  bookingRef: reviewBookingRefSchema,
  customer: z.object({
    name: z.string().optional(),
    phone: z.string(),
  }),
  rating: z.number().min(1).max(5),
  text: z.string(),
  isPublished: z.boolean().default(false),
  publishedAt: z.string().optional(),
  publishedBy: z.string().optional(),
  createdAt: z.string(),
});
export type Review = z.infer<typeof reviewSchema>;

export const insertReviewSchema = z.object({
  bookingRef: reviewBookingRefSchema,
  customer: z.object({
    name: z.string().optional(),
    phone: z.string(),
  }),
  rating: z.number().min(1).max(5),
  text: z.string(),
});
export type InsertReview = z.infer<typeof insertReviewSchema>;

// ============ BLOCKED DATE (Instructor) ============
export const blockedDateSchema = z.object({
  id: z.string(),
  date: z.string(),
  reason: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.string(),
});
export type BlockedDate = z.infer<typeof blockedDateSchema>;

export const insertBlockedDateSchema = z.object({
  date: z.string(),
  reason: z.string().optional(),
  createdBy: z.string(),
});
export type InsertBlockedDate = z.infer<typeof insertBlockedDateSchema>;

// ============ WORK TYPE SUGGESTIONS ============
export const WORK_TYPE_SUGGESTIONS = [
  "Уборка",
  "Ремонт",
  "Благоустройство",
  "Обслуживание",
  "Работа с гостями",
  "Инвентаризация",
  "Кухня",
  "Охрана",
  "Другое",
] as const;

// ============ SPA PRICE KEYS ============
export const SPA_PRICE_KEYS = {
  bath_only_base3h: "spa_bath_only_base3h",
  terrace_only_base3h: "spa_terrace_only_base3h",
  tub_only_up_to_4: "spa_tub_only_up_to_4",
  tub_only_6_to_8: "spa_tub_only_6_to_8",
  bath_with_tub_up_to_9: "spa_bath_with_tub_up_to_9",
  bath_with_tub_alt: "spa_bath_with_tub_alt",
} as const;

// ============ AUTH SESSION ============
export const authSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  token: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

export const insertAuthSessionSchema = authSessionSchema.omit({ id: true, createdAt: true });
export type InsertAuthSession = z.infer<typeof insertAuthSessionSchema>;

// ============ TELEGRAM INIT DATA ============
export const telegramUserSchema = z.object({
  id: z.number(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  is_premium: z.boolean().optional(),
  photo_url: z.string().optional(),
});
export type TelegramUser = z.infer<typeof telegramUserSchema>;

// ============ STAFF ROLES (for management) ============
export const StaffRole = z.enum(["OWNER", "ADMIN", "INSTRUCTOR"]);
export type StaffRole = z.infer<typeof StaffRole>;

// ============ QUAD MACHINE (Service Book) ============
export const QuadOwnerType = z.enum(["rental", "instructor"]);
export type QuadOwnerType = z.infer<typeof QuadOwnerType>;

export const quadMachineSchema = z.object({
  id: z.string(),
  code: z.string(), // Q1, Q2, Q3, Q4, Q5
  name: z.string(), // Display name like "Красный CF Moto"
  ownerType: QuadOwnerType, // rental or instructor's personal
  isActive: z.boolean().default(true),
  currentMileageKm: z.number().default(0),
  commissioningDate: z.string().optional(), // Date when put into service
  notes: z.string().optional(),
  createdAt: z.string(),
});
export type QuadMachine = z.infer<typeof quadMachineSchema>;

export const insertQuadMachineSchema = quadMachineSchema.omit({ id: true, createdAt: true });
export type InsertQuadMachine = z.infer<typeof insertQuadMachineSchema>;

// ============ QUAD MILEAGE LOG ============
export const quadMileageLogSchema = z.object({
  id: z.string(),
  quadId: z.string(),
  mileageKm: z.number(), // Current odometer reading
  previousMileageKm: z.number().optional(), // Previous reading for delta calculation
  notes: z.string().optional(),
  loggedBy: z.string(), // userId
  loggedAt: z.string(),
});
export type QuadMileageLog = z.infer<typeof quadMileageLogSchema>;

export const insertQuadMileageLogSchema = quadMileageLogSchema.omit({ id: true, loggedAt: true });
export type InsertQuadMileageLog = z.infer<typeof insertQuadMileageLogSchema>;

// ============ QUAD MAINTENANCE RULE (Service Intervals) ============
export const MaintenanceTriggerType = z.enum(["mileage", "time", "both"]);
export type MaintenanceTriggerType = z.infer<typeof MaintenanceTriggerType>;

export const quadMaintenanceRuleSchema = z.object({
  id: z.string(),
  quadId: z.string().optional(), // If null, applies to all quads
  title: z.string(), // "Замена масла", "Осмотр", "Шприцовка"
  description: z.string().optional(),
  triggerType: MaintenanceTriggerType,
  intervalKm: z.number().optional(), // e.g., 500 km
  intervalDays: z.number().optional(), // e.g., 7 days for weekly inspection
  warningKm: z.number().optional(), // Warn X km before due
  warningDays: z.number().optional(), // Warn X days before due
  isActive: z.boolean().default(true),
  createdBy: z.string(),
  createdAt: z.string(),
});
export type QuadMaintenanceRule = z.infer<typeof quadMaintenanceRuleSchema>;

export const insertQuadMaintenanceRuleSchema = quadMaintenanceRuleSchema.omit({ id: true, createdAt: true });
export type InsertQuadMaintenanceRule = z.infer<typeof insertQuadMaintenanceRuleSchema>;

// ============ QUAD MAINTENANCE EVENT (Service History) ============
export const quadMaintenanceEventSchema = z.object({
  id: z.string(),
  quadId: z.string(),
  ruleId: z.string().optional(), // Which rule triggered this, if any
  title: z.string(), // "Замена масла двигателя"
  description: z.string().optional(),
  mileageKm: z.number(), // Mileage at time of service
  partsUsed: z.array(z.object({
    name: z.string(),
    quantity: z.number().optional(),
    cost: z.number().optional(),
  })).optional(),
  totalCost: z.number().optional(),
  performedBy: z.string(), // userId
  performedAt: z.string(),
  createdAt: z.string(),
});
export type QuadMaintenanceEvent = z.infer<typeof quadMaintenanceEventSchema>;

export const insertQuadMaintenanceEventSchema = quadMaintenanceEventSchema.omit({ id: true, createdAt: true });
export type InsertQuadMaintenanceEvent = z.infer<typeof insertQuadMaintenanceEventSchema>;

// ============ QUAD MAINTENANCE STATUS (Tracking next service) ============
export const maintenanceStatusEnum = z.enum(["ok", "warning", "due", "overdue"]);
export type MaintenanceStatusType = z.infer<typeof maintenanceStatusEnum>;

export const quadMaintenanceStatusSchema = z.object({
  id: z.string(),
  quadId: z.string(),
  ruleId: z.string(),
  lastServiceMileage: z.number().optional(),
  lastServiceDate: z.string().optional(),
  nextDueMileage: z.number().optional(),
  nextDueDate: z.string().optional(),
  remainingKm: z.number().optional(), // negative = overdue
  remainingDays: z.number().optional(), // negative = overdue
  status: maintenanceStatusEnum.default("ok"),
});
export type QuadMaintenanceStatus = z.infer<typeof quadMaintenanceStatusSchema>;

export const insertQuadMaintenanceStatusSchema = quadMaintenanceStatusSchema.omit({ id: true });
export type InsertQuadMaintenanceStatus = z.infer<typeof insertQuadMaintenanceStatusSchema>;

// ============ STAFF INVITATION (Phone-based role pre-assignment) ============
export const staffInvitationSchema = z.object({
  id: z.string(),
  phone: z.string(), // Normalized phone number
  role: UserRole, // Role to assign when user joins
  note: z.string().optional(), // Admin note about who this is
  createdBy: z.string(), // Admin who created invitation
  usedBy: z.string().optional(), // User ID if invitation was used
  usedAt: z.string().optional(), // When invitation was used
  createdAt: z.string(),
});
export type StaffInvitation = z.infer<typeof staffInvitationSchema>;

export const insertStaffInvitationSchema = staffInvitationSchema.omit({ id: true, usedBy: true, usedAt: true, createdAt: true });
export type InsertStaffInvitation = z.infer<typeof insertStaffInvitationSchema>;

// ============ STAFF AUTHORIZATION (Telegram ID-based role assignment) ============
export const staffAuthorizationSchema = z.object({
  id: z.string(),
  telegramId: z.string(), // Telegram user ID
  role: UserRole, // Role to assign
  note: z.string().optional(), // Admin note about who this is
  assignedBy: z.string(), // User ID who assigned
  isActive: z.boolean().default(true),
  createdAt: z.string(),
});
export type StaffAuthorization = z.infer<typeof staffAuthorizationSchema>;

export const insertStaffAuthorizationSchema = staffAuthorizationSchema.omit({ id: true, createdAt: true }).extend({
  isActive: z.boolean().optional().default(true),
});
export type InsertStaffAuthorization = z.infer<typeof insertStaffAuthorizationSchema>;

// ============================================================================
// DRIZZLE POSTGRESQL TABLES
// These table definitions are used for database persistence with Drizzle ORM
// ============================================================================

// ============ USERS TABLE ============
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  role: text("role").notNull().default("GUEST"),
  isActive: boolean("is_active").notNull().default(true),
});

// ============ UNITS TABLE ============
export const unitsTable = pgTable("units", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // cottage or bath
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  cleaningTariffCode: text("cleaning_tariff_code").notNull(),
  tubPolicy: text("tub_policy").notNull(),
  images: jsonb("images").default([]),
});

// ============ CLEANING TARIFFS TABLE ============
export const cleaningTariffsTable = pgTable("cleaning_tariffs", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  price: real("price").notNull(),
});

// ============ SERVICE PRICES TABLE ============
export const servicePricesTable = pgTable("service_prices", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  price: real("price").notNull(),
  currency: text("currency").notNull().default("BYN"),
  activeFrom: text("active_from"),
  activeTo: text("active_to"),
});

// ============ COTTAGE BOOKINGS TABLE ============
export const cottageBookingsTable = pgTable("cottage_bookings", {
  id: text("id").primaryKey(),
  unitCode: text("unit_code").notNull(),
  dateCheckIn: text("date_check_in").notNull(),
  dateCheckOut: text("date_check_out").notNull(),
  guestsCount: integer("guests_count").notNull(),
  tubSmall: boolean("tub_small").notNull().default(false),
  totalAmount: real("total_amount").notNull(),
  payments: jsonb("payments").notNull(), // { erip, cash, prepayment }
  customer: jsonb("customer").notNull(), // { fullName, phone, telegramId }
  status: text("status").notNull().default("planned"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

// ============ GUESTS TABLE ============
export const guestsTable = pgTable("guests", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull().unique(), // normalized phone
  fullName: text("full_name"),
  telegramId: text("telegram_id"),
  totalVisits: integer("total_visits").notNull().default(0),
  completedVisits: integer("completed_visits").notNull().default(0),
  noShowCount: integer("no_show_count").notNull().default(0),
  lastVisitAt: text("last_visit_at"),
  notes: text("notes"),
  rating: text("rating"), // excellent, good, neutral, problematic, blacklisted
  isBlacklisted: boolean("is_blacklisted").notNull().default(false),
  createdAt: text("created_at").notNull(),
});

// ============ BATH BOOKINGS TABLE ============
export const bathBookingsTable = pgTable("bath_bookings", {
  id: text("id").primaryKey(),
  bathCode: text("bath_code").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  customer: jsonb("customer").notNull(),
  guestId: text("guest_id"), // link to guests table
  options: jsonb("options").notNull(), // { tub, terrace, grill, charcoal }
  pricing: jsonb("pricing").notNull(), // { base, extras, total }
  payments: jsonb("payments").notNull(),
  status: text("status").notNull().default("pending_call"),
  holdUntil: text("hold_until"),
  assignedAdmin: text("assigned_admin"),
  arrivedAt: text("arrived_at"), // when guest actually arrived
  noShow: boolean("no_show").notNull().default(false), // marked as no-show
  createdAt: text("created_at").notNull(),
});

// ============ SPA BOOKINGS TABLE ============
export const spaBookingsTable = pgTable("spa_bookings", {
  id: text("id").primaryKey(),
  spaResource: text("spa_resource").notNull(),
  bookingType: text("booking_type").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  durationHours: integer("duration_hours").notNull().default(3),
  guestsCount: integer("guests_count").notNull(),
  customer: jsonb("customer").notNull(),
  comment: text("comment"),
  options: jsonb("options"), // { tub, terrace, grill, charcoal }
  pricing: jsonb("pricing").notNull(),
  payments: jsonb("payments").notNull(),
  status: text("status").notNull().default("pending_call"),
  holdUntil: text("hold_until"),
  assignedAdmin: text("assigned_admin"),
  createdAt: text("created_at").notNull(),
});

// ============ QUAD BOOKINGS TABLE ============
export const quadBookingsTable = pgTable("quad_bookings", {
  id: text("id").primaryKey(),
  slotId: text("slot_id"),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  routeType: text("route_type").notNull(),
  quadsCount: integer("quads_count").notNull(),
  customer: jsonb("customer").notNull(),
  pricing: jsonb("pricing").notNull(),
  payments: jsonb("payments").notNull(),
  status: text("status").notNull().default("pending_call"),
  comment: text("comment"),
  createdAt: text("created_at").notNull(),
});

// ============ TASKS TABLE ============
export const tasksTable = pgTable("tasks", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  unitCode: text("unit_code"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  checklist: jsonb("checklist"),
  status: text("status").notNull().default("open"),
  assignedTo: text("assigned_to"),
  acceptedAt: text("accepted_at"),
  priority: text("priority").notNull().default("normal"),
  notifyAt: text("notify_at"),
  notified: boolean("notified").notNull().default(false),
  createdBySystem: boolean("created_by_system").notNull().default(false),
  createdBy: text("created_by"),
  meta: jsonb("meta"),
  createdAt: text("created_at").notNull(),
});

// ============ CASH SHIFTS TABLE ============
export const cashShiftsTable = pgTable("cash_shifts", {
  id: text("id").primaryKey(),
  openedAt: text("opened_at").notNull(),
  closedAt: text("closed_at"),
  openedBy: text("opened_by").notNull(),
  isOpen: boolean("is_open").notNull().default(true),
  visibleToAdmin: boolean("visible_to_admin").notNull().default(true),
  cashBox: text("cash_box").notNull().default("main"),
});

// ============ CASH TRANSACTIONS TABLE ============
export const cashTransactionsTable = pgTable("cash_transactions", {
  id: text("id").primaryKey(),
  shiftId: text("shift_id").notNull(),
  type: text("type").notNull(), // cash_in, cash_out, expense
  amount: real("amount").notNull(),
  category: text("category"),
  comment: text("comment"),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
  location: jsonb("location"),
});

// ============ INCASATIONS TABLE ============
export const incasationsTable = pgTable("incasations", {
  id: text("id").primaryKey(),
  performedAt: text("performed_at").notNull(),
  performedBy: text("performed_by").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  summary: jsonb("summary").notNull(),
  shiftsIncluded: jsonb("shifts_included").notNull(),
  createdAt: text("created_at").notNull(),
});

// ============ OWNER CASH BOX TABLE ============
export const ownerCashBoxTable = pgTable("owner_cash_box", {
  id: text("id").primaryKey(),
  balance: real("balance").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

// ============ OWNER CASH TRANSACTIONS TABLE ============
export const ownerCashTransactionsTable = pgTable("owner_cash_transactions", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // transfer_in (from admin), transfer_out (to admin), expense, other
  amount: real("amount").notNull(),
  comment: text("comment"),
  relatedAdminTxId: text("related_admin_tx_id"), // Links to admin's cash_transactions
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

// ============ WORK LOGS TABLE ============
export const workLogsTable = pgTable("work_logs", {
  id: text("id").primaryKey(),
  employeeName: text("employee_name").notNull(),
  byAdmin: text("by_admin").notNull(),
  startAt: text("start_at").notNull(),
  endAt: text("end_at").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  workType: text("work_type").notNull(),
  hourlyRate: real("hourly_rate"),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  location: jsonb("location"),
});

// ============ QUAD PRICING TABLE ============
export const quadPricingTable = pgTable("quad_pricing", {
  id: text("id").primaryKey(),
  routeType: text("route_type").notNull(),
  price: real("price").notNull(),
  date: text("date"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
});

// ============ INSTRUCTOR BLOCKED TIMES TABLE ============
export const instructorBlockedTimesTable = pgTable("instructor_blocked_times", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  reason: text("reason"),
  createdAt: text("created_at").notNull(),
});

// ============ INSTRUCTOR EXPENSES TABLE ============
export const instructorExpensesTable = pgTable("instructor_expenses", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  category: text("category").notNull(),
  amount: real("amount").notNull(),
  description: text("description").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

// ============ AUTH SESSIONS TABLE ============
export const authSessionsTable = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

// ============ STAFF INVITATIONS TABLE ============
export const staffInvitationsTable = pgTable("staff_invitations", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  role: text("role").notNull(),
  note: text("note"),
  createdBy: text("created_by").notNull(),
  usedBy: text("used_by"),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
});

// ============ STAFF AUTHORIZATIONS TABLE ============
export const staffAuthorizationsTable = pgTable("staff_authorizations", {
  id: text("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  role: text("role").notNull(),
  note: text("note"),
  assignedBy: text("assigned_by").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: text("created_at").notNull(),
});

// ============ QUAD MACHINES TABLE ============
export const quadMachinesTable = pgTable("quad_machines", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  ownerType: text("owner_type").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  currentMileageKm: integer("current_mileage_km").notNull().default(0),
  commissioningDate: text("commissioning_date"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

// ============ QUAD MILEAGE LOGS TABLE ============
export const quadMileageLogsTable = pgTable("quad_mileage_logs", {
  id: text("id").primaryKey(),
  quadId: text("quad_id").notNull(),
  mileageKm: integer("mileage_km").notNull(),
  previousMileageKm: integer("previous_mileage_km"),
  notes: text("notes"),
  loggedBy: text("logged_by").notNull(),
  loggedAt: text("logged_at").notNull(),
});

// ============ QUAD MAINTENANCE RULES TABLE ============
export const quadMaintenanceRulesTable = pgTable("quad_maintenance_rules", {
  id: text("id").primaryKey(),
  quadId: text("quad_id"),
  title: text("title").notNull(),
  description: text("description"),
  triggerType: text("trigger_type").notNull(),
  intervalKm: integer("interval_km"),
  intervalDays: integer("interval_days"),
  warningKm: integer("warning_km"),
  warningDays: integer("warning_days"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

// ============ QUAD MAINTENANCE EVENTS TABLE ============
export const quadMaintenanceEventsTable = pgTable("quad_maintenance_events", {
  id: text("id").primaryKey(),
  quadId: text("quad_id").notNull(),
  ruleId: text("rule_id"),
  title: text("title").notNull(),
  description: text("description"),
  mileageKm: integer("mileage_km").notNull(),
  partsUsed: jsonb("parts_used"),
  totalCost: real("total_cost"),
  performedBy: text("performed_by").notNull(),
  performedAt: text("performed_at").notNull(),
  createdAt: text("created_at").notNull(),
});

// ============ SITE SETTINGS TABLE ============
export const siteSettingsTable = pgTable("site_settings", {
  id: text("id").primaryKey(),
  geofenceCenter: jsonb("geofence_center").notNull(),
  geofenceRadiusM: integer("geofence_radius_m").notNull().default(300),
  closeTime: text("close_time").notNull().default("22:00"),
  timezone: text("timezone").notNull().default("Europe/Minsk"),
  adminChatId: text("admin_chat_id"),
  ownerChatId: text("owner_chat_id"),
  instructorChatId: text("instructor_chat_id"),
});

// ============ BLOCKED DATES TABLE ============
export const blockedDatesTable = pgTable("blocked_dates", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  reason: text("reason"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

// ============ REVIEWS TABLE ============
export const reviewsTable = pgTable("reviews", {
  id: text("id").primaryKey(),
  bookingRef: jsonb("booking_ref").notNull(),
  customer: jsonb("customer").notNull(),
  rating: integer("rating").notNull(),
  text: text("text").notNull(),
  isPublished: boolean("is_published").notNull().default(false),
  publishedAt: text("published_at"),
  publishedBy: text("published_by"),
  createdAt: text("created_at").notNull(),
});

// ============ LAUNDRY BATCHES TABLE ============
export const laundryBatchesTable = pgTable("laundry_batches", {
  id: text("id").primaryKey(),
  unitCode: text("unit_code"),
  items: jsonb("items").notNull(),
  status: text("status").notNull().default("pending"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  washStartedAt: text("wash_started_at"),
  dryStartedAt: text("dry_started_at"),
  readyAt: text("ready_at"),
  deliveredAt: text("delivered_at"),
  deliveredTo: text("delivered_to"),
  notes: text("notes"),
});

// ============ TEXTILE AUDITS TABLE ============
export const textileAuditsTable = pgTable("textile_audits", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  location: text("location").notNull(),
  items: jsonb("items").notNull(),
  auditedBy: text("audited_by").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

// ============ TEXTILE STOCK TABLE (Inventory by location) ============
export const textileStockTable = pgTable("textile_stock", {
  id: text("id").primaryKey(),
  location: text("location").notNull(), // warehouse, laundry, D1, D2, D3, D4
  type: text("type").notNull(), // sheets, duvet_covers, pillowcases, towels_large, towels_small, robes
  color: text("color").notNull(), // white, grey_light, grey_dark, grey
  quantity: integer("quantity").notNull().default(0),
  updatedBy: text("updated_by"),
  updatedAt: text("updated_at").notNull(),
});

// ============ TEXTILE CHECK-INS TABLE (Guest check-in textile records) ============
export const textileCheckInsTable = pgTable("textile_check_ins", {
  id: text("id").primaryKey(),
  unitCode: text("unit_code").notNull(), // D1, D2, D3, D4
  beddingSets: jsonb("bedding_sets").notNull(), // [{color: "white", count: 1}]
  towelSets: integer("towel_sets").notNull(),
  robes: integer("robes").notNull().default(0),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  notes: text("notes"),
});

// ============ TEXTILE EVENTS TABLE (Audit trail) ============
export const textileEventsTable = pgTable("textile_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(), // init_stock, check_in, mark_dirty, mark_clean, adjustment, transfer
  fromLocation: text("from_location"),
  toLocation: text("to_location"),
  items: jsonb("items").notNull(), // [{type, color, quantity}]
  relatedUnitCode: text("related_unit_code"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  notes: text("notes"),
});

// ============ CONSUMABLES/SUPPLIES ============
export const SupplyCategory = z.enum(["fuel", "cleaning", "food", "equipment", "other"]);
export type SupplyCategory = z.infer<typeof SupplyCategory>;

export const supplySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: SupplyCategory,
  unit: z.string(), // kg, pcs, liters, bags
  currentStock: z.number().default(0),
  minStock: z.number().default(0), // alert threshold
  lastRestocked: z.string().optional(),
  notes: z.string().optional(),
});
export type Supply = z.infer<typeof supplySchema>;

export const insertSupplySchema = supplySchema.omit({ id: true });
export type InsertSupply = z.infer<typeof insertSupplySchema>;

export const supplyTransactionSchema = z.object({
  id: z.string(),
  supplyId: z.string(),
  type: z.enum(["restock", "usage"]),
  quantity: z.number(),
  note: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.string(),
});
export type SupplyTransaction = z.infer<typeof supplyTransactionSchema>;

export const insertSupplyTransactionSchema = supplyTransactionSchema.omit({ id: true, createdAt: true });
export type InsertSupplyTransaction = z.infer<typeof insertSupplyTransactionSchema>;

// ============ SUPPLIES TABLE ============
export const suppliesTable = pgTable("supplies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // fuel, cleaning, food, equipment, other
  unit: text("unit").notNull(), // kg, pcs, liters, bags
  currentStock: real("current_stock").notNull().default(0),
  minStock: real("min_stock").notNull().default(0),
  lastRestocked: text("last_restocked"),
  notes: text("notes"),
});

export const supplyTransactionsTable = pgTable("supply_transactions", {
  id: text("id").primaryKey(),
  supplyId: text("supply_id").notNull(),
  type: text("type").notNull(), // restock, usage
  quantity: real("quantity").notNull(),
  note: text("note"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

// ============ INCIDENTS/REPAIRS ============
export const IncidentStatus = z.enum(["open", "in_progress", "resolved", "cancelled"]);
export type IncidentStatus = z.infer<typeof IncidentStatus>;

export const IncidentPriority = z.enum(["low", "medium", "high", "critical"]);
export type IncidentPriority = z.infer<typeof IncidentPriority>;

export const incidentSchema = z.object({
  id: z.string(),
  unitCode: z.string().optional(), // D1, D2, D3, D4, B1, B2, SPA, or null for general
  title: z.string(),
  description: z.string().optional(),
  priority: IncidentPriority.default("medium"),
  status: IncidentStatus.default("open"),
  reportedBy: z.string(),
  reportedAt: z.string(),
  assignedTo: z.string().optional(),
  resolvedAt: z.string().optional(),
  resolvedBy: z.string().optional(),
  resolution: z.string().optional(),
  photos: z.array(z.string()).default([]),
});
export type Incident = z.infer<typeof incidentSchema>;

export const insertIncidentSchema = incidentSchema.omit({ id: true, reportedAt: true });
export type InsertIncident = z.infer<typeof insertIncidentSchema>;

// ============ INCIDENTS TABLE ============
export const incidentsTable = pgTable("incidents", {
  id: text("id").primaryKey(),
  unitCode: text("unit_code"),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  reportedBy: text("reported_by").notNull(),
  reportedAt: text("reported_at").notNull(),
  assignedTo: text("assigned_to"),
  resolvedAt: text("resolved_at"),
  resolvedBy: text("resolved_by"),
  resolution: text("resolution"),
  photos: jsonb("photos").default([]),
});

// ============ STAFF SHIFTS ============
export const ShiftType = z.enum(["morning", "evening", "full_day", "night"]);
export type ShiftType = z.infer<typeof ShiftType>;

export const staffShiftSchema = z.object({
  id: z.string(),
  userId: z.string(),
  date: z.string(),
  shiftType: ShiftType,
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.string(),
});
export type StaffShift = z.infer<typeof staffShiftSchema>;

export const insertStaffShiftSchema = staffShiftSchema.omit({ id: true, createdAt: true });
export type InsertStaffShift = z.infer<typeof insertStaffShiftSchema>;

// ============ STAFF SHIFTS TABLE ============
export const staffShiftsTable = pgTable("staff_shifts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(),
  shiftType: text("shift_type").notNull(), // morning, evening, full_day, night
  startTime: text("start_time"),
  endTime: text("end_time"),
  notes: text("notes"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

// ============ UNIT INFO (QR codes, rules, wifi) ============
export const unitInfoSchema = z.object({
  id: z.string(),
  unitCode: z.string(), // D1, D2, D3, D4, B1, B2, SPA
  wifiName: z.string().optional(),
  wifiPassword: z.string().optional(),
  rules: z.string().optional(), // markdown or text
  contactPhone: z.string().optional(),
  contactTelegram: z.string().optional(),
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
  updatedAt: z.string(),
});
export type UnitInfo = z.infer<typeof unitInfoSchema>;

export const insertUnitInfoSchema = unitInfoSchema.omit({ id: true, updatedAt: true });
export type InsertUnitInfo = z.infer<typeof insertUnitInfoSchema>;

// ============ UNIT INFO TABLE ============
export const unitInfoTable = pgTable("unit_info", {
  id: text("id").primaryKey(),
  unitCode: text("unit_code").notNull(),
  wifiName: text("wifi_name"),
  wifiPassword: text("wifi_password"),
  rules: text("rules"),
  contactPhone: text("contact_phone"),
  contactTelegram: text("contact_telegram"),
  checkInTime: text("check_in_time"),
  checkOutTime: text("check_out_time"),
  updatedAt: text("updated_at").notNull(),
});

// ============ SMART THERMOSTAT ============
export const ThermostatPlanType = z.enum(["CHECKIN_TODAY", "NO_CHECKIN", "GUESTS_STAYING"]);
export type ThermostatPlanType = z.infer<typeof ThermostatPlanType>;

export const ThermostatActionTrigger = z.enum(["SCHEDULED", "MANUAL", "SYSTEM"]);
export type ThermostatActionTrigger = z.infer<typeof ThermostatActionTrigger>;

export const thermostatHouseSchema = z.object({
  id: z.string(),
  houseId: z.number().min(1).max(4), // 1-4
  name: z.string(),
  thermostatDeviceId: z.string().optional(),
  providerConfig: z.record(z.any()).optional(),
  currentTemp: z.number().optional(),
  targetTemp: z.number().optional(),
  mode: z.string().optional(),
  online: z.boolean().default(false),
  lastUpdated: z.string().optional(),
});
export type ThermostatHouse = z.infer<typeof thermostatHouseSchema>;

export const insertThermostatHouseSchema = thermostatHouseSchema.omit({ id: true });
export type InsertThermostatHouse = z.infer<typeof insertThermostatHouseSchema>;

export const thermostatDailyPlanSchema = z.object({
  id: z.string(),
  date: z.string(), // YYYY-MM-DD
  houseId: z.number().min(1).max(4),
  planType: ThermostatPlanType,
  setByAdminUserId: z.string().optional(),
  setAt: z.string(),
  appliedAt: z.string().optional(),
  heatStartedAt: z.string().optional(),
});
export type ThermostatDailyPlan = z.infer<typeof thermostatDailyPlanSchema>;

export const insertThermostatDailyPlanSchema = thermostatDailyPlanSchema.omit({ id: true });
export type InsertThermostatDailyPlan = z.infer<typeof insertThermostatDailyPlanSchema>;

export const thermostatActionLogSchema = z.object({
  id: z.string(),
  ts: z.string(),
  houseId: z.number().min(1).max(4),
  actionType: z.string(), // set_temp, get_status, etc.
  targetTemp: z.number().optional(),
  result: z.string().optional(), // success, failure
  error: z.string().optional(),
  correlationId: z.string().optional(),
  triggeredBy: ThermostatActionTrigger,
  userId: z.string().optional(),
});
export type ThermostatActionLog = z.infer<typeof thermostatActionLogSchema>;

export const insertThermostatActionLogSchema = thermostatActionLogSchema.omit({ id: true });
export type InsertThermostatActionLog = z.infer<typeof insertThermostatActionLogSchema>;

// ============ THERMOSTAT TABLES ============
export const thermostatHousesTable = pgTable("thermostat_houses", {
  id: text("id").primaryKey(),
  houseId: integer("house_id").notNull(), // 1-4
  name: text("name").notNull(),
  thermostatDeviceId: text("thermostat_device_id"),
  providerConfig: jsonb("provider_config"),
  currentTemp: real("current_temp"),
  targetTemp: real("target_temp"),
  mode: text("mode"),
  online: boolean("online").default(false),
  lastUpdated: text("last_updated"),
});

export const thermostatDailyPlansTable = pgTable("thermostat_daily_plans", {
  id: text("id").primaryKey(),
  date: text("date").notNull(), // YYYY-MM-DD
  houseId: integer("house_id").notNull(),
  planType: text("plan_type").notNull(), // CHECKIN_TODAY, NO_CHECKIN, GUESTS_STAYING
  setByAdminUserId: text("set_by_admin_user_id"),
  setAt: text("set_at").notNull(),
  appliedAt: text("applied_at"),
  heatStartedAt: text("heat_started_at"),
});

export const thermostatActionLogsTable = pgTable("thermostat_action_logs", {
  id: text("id").primaryKey(),
  ts: text("ts").notNull(),
  houseId: integer("house_id").notNull(),
  actionType: text("action_type").notNull(),
  targetTemp: real("target_temp"),
  result: text("result"),
  error: text("error"),
  correlationId: text("correlation_id"),
  triggeredBy: text("triggered_by").notNull(), // SCHEDULED, MANUAL, SYSTEM
  userId: text("user_id"),
});


// ============ ELECTRICITY METERS ============
export const electricityMetersTable = pgTable("electricity_meters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // "Счетчик 1", "Счетчик 2"
  code: text("code").notNull().unique(), // "METER1", "METER2"
  description: text("description"),
  createdAt: text("created_at").notNull(),
});

export const electricityReadingsTable = pgTable("electricity_readings", {
  id: text("id").primaryKey(),
  meterId: text("meter_id").notNull(),
  reading: real("reading").notNull(),
  previousReading: real("previous_reading"),
  consumption: real("consumption"), // reading - previousReading
  recordedAt: text("recorded_at").notNull(),
  recordedByUserId: text("recorded_by_user_id"),
  note: text("note"),
});

// Electricity Meter Types
export const electricityMeterSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
});
export type ElectricityMeter = z.infer<typeof electricityMeterSchema>;
export const insertElectricityMeterSchema = electricityMeterSchema.omit({ id: true, createdAt: true });
export type InsertElectricityMeter = z.infer<typeof insertElectricityMeterSchema>;

export const electricityReadingSchema = z.object({
  id: z.string(),
  meterId: z.string(),
  reading: z.number(),
  previousReading: z.number().optional(),
  consumption: z.number().optional(),
  recordedAt: z.string(),
  recordedByUserId: z.string().optional(),
  note: z.string().optional(),
});
export type ElectricityReading = z.infer<typeof electricityReadingSchema>;
export const insertElectricityReadingSchema = electricityReadingSchema.omit({ id: true, consumption: true });
export type InsertElectricityReading = z.infer<typeof insertElectricityReadingSchema>;

// ============ NOTIFICATION CONFIGS TABLE ============
export const notificationCadenceEnum = ["daily", "weekly", "monthly", "custom"] as const;
export type NotificationCadence = typeof notificationCadenceEnum[number];

export const notificationActionTypeEnum = [
  "shift_reminder",
  "bath_summary", 
  "climate_on",
  "climate_off",
  "laundry_reminder",
  "weather_check",
  "daily_tasks",
  "weekly_tasks",
  "monthly_tasks",
  "thermostat_prompt",
  "thermostat_base_temp",
  "thermostat_heat",
  "custom_message"
] as const;
export type NotificationActionType = typeof notificationActionTypeEnum[number];

export const notificationConfigsTable = pgTable("notification_configs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  cadence: text("cadence").notNull(), // daily, weekly, monthly, custom
  cronExpression: text("cron_expression").notNull(),
  actionType: text("action_type").notNull(), // what notification function to call
  targetChatId: text("target_chat_id"), // specific telegram chat ID or null for default
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: text("last_run_at"),
  metadata: jsonb("metadata"), // additional config like message template
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const notificationConfigSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  cadence: z.enum(notificationCadenceEnum),
  cronExpression: z.string(),
  actionType: z.enum(notificationActionTypeEnum),
  targetChatId: z.string().optional(),
  enabled: z.boolean(),
  lastRunAt: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NotificationConfig = z.infer<typeof notificationConfigSchema>;
export const insertNotificationConfigSchema = notificationConfigSchema.omit({ id: true, lastRunAt: true, createdAt: true, updatedAt: true });
export type InsertNotificationConfig = z.infer<typeof insertNotificationConfigSchema>;

// ============ BOT MESSAGE TRACKING ============
// Track bot messages per chat for nightly cleanup (delete all except pinned)
export const botMessagesTable = pgTable("bot_messages", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull(),
  messageId: integer("message_id").notNull(),
  isPinned: boolean("is_pinned").notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const botMessageSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  messageId: z.number(),
  isPinned: z.boolean(),
  createdAt: z.string(),
});
export type BotMessage = z.infer<typeof botMessageSchema>;
export const insertBotMessageSchema = botMessageSchema.omit({ id: true, createdAt: true });
export type InsertBotMessage = z.infer<typeof insertBotMessageSchema>;
