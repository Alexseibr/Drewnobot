import { z } from "zod";

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

export const TaskStatus = z.enum(["open", "done"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const CashTransactionType = z.enum(["cash_in", "cash_out", "expense"]);
export type CashTransactionType = z.infer<typeof CashTransactionType>;

export const ExpenseCategory = z.enum(["food_staff", "supplies", "salary", "contractor", "other"]);
export type ExpenseCategory = z.infer<typeof ExpenseCategory>;

export const PaymentMethod = z.enum(["erip", "cash"]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

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
  options: z.object({
    tub: TubType.default("none"),
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
    grill: z.boolean().default(false),
    charcoal: z.boolean().default(false),
  }),
});
export type InsertBathBooking = z.infer<typeof insertBathBookingSchema>;

// ============ TASK ============
export const taskSchema = z.object({
  id: z.string(),
  date: z.string(),
  unitCode: z.string().optional(),
  type: TaskType,
  title: z.string(),
  checklist: z.array(z.string()).optional(),
  status: TaskStatus.default("open"),
  assignedTo: z.string().optional(),
  createdBySystem: z.boolean().default(false),
  meta: z.any().optional(),
  createdAt: z.string(),
});
export type Task = z.infer<typeof taskSchema>;

export const insertTaskSchema = taskSchema.omit({ id: true, createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;

// ============ CASH SHIFT ============
export const cashShiftSchema = z.object({
  id: z.string(),
  openedAt: z.string(),
  closedAt: z.string().optional(),
  openedBy: z.string(),
  isOpen: z.boolean().default(true),
  visibleToAdmin: z.boolean().default(true),
});
export type CashShift = z.infer<typeof cashShiftSchema>;

export const insertCashShiftSchema = cashShiftSchema.omit({ id: true, openedAt: true, isOpen: true, visibleToAdmin: true });
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
  comment: z.string().optional(),
  createdAt: z.string(),
  createdBy: z.string(),
  location: locationSchema.optional(),
});
export type CashTransaction = z.infer<typeof cashTransactionSchema>;

export const insertCashTransactionSchema = cashTransactionSchema.omit({ id: true, createdAt: true });
export type InsertCashTransaction = z.infer<typeof insertCashTransactionSchema>;

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

// ============ QUAD SESSION ============
export const quadSessionSchema = z.object({
  id: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  bufferUntil: z.string(),
  totalQuads: z.number().default(4),
  bookedQuads: z.number().default(0),
  status: QuadSessionStatus.default("open"),
  priceRuleSnapshot: z.object({
    base30: z.number(),
    base60: z.number(),
    groupDiscount: z.object({
      type: z.enum(["percent", "amount"]),
      value: z.number(),
    }).optional(),
  }).optional(),
  createdBy: z.string(),
  createdAt: z.string(),
});
export type QuadSession = z.infer<typeof quadSessionSchema>;

export const insertQuadSessionSchema = z.object({
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  createdBy: z.string(),
});
export type InsertQuadSession = z.infer<typeof insertQuadSessionSchema>;

// ============ QUAD BOOKING ============
export const quadBookingSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  customer: customerSchema,
  duration: z.union([z.literal(30), z.literal(60)]),
  quadsCount: z.number().min(1).max(4),
  pricing: z.object({
    total: z.number(),
    discountApplied: z.string().optional(),
  }),
  payments: z.object({
    prepayment: prepaymentSchema.optional(),
    eripPaid: z.number().default(0),
    cashPaid: z.number().default(0),
  }),
  status: QuadBookingStatus.default("pending_call"),
  assignedInstructor: z.string(),
  createdAt: z.string(),
});
export type QuadBooking = z.infer<typeof quadBookingSchema>;

export const insertQuadBookingSchema = z.object({
  sessionId: z.string(),
  customer: customerSchema,
  duration: z.union([z.literal(30), z.literal(60)]),
  quadsCount: z.number().min(1).max(4),
});
export type InsertQuadBooking = z.infer<typeof insertQuadBookingSchema>;

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
  cleaningsByTariff: z.record(z.string(), z.number()),
  tubSmallCount: z.number(),
  tubSmallRevenue: z.number(),
  tubLargeCount: z.number(),
  tubLargeRevenue: z.number(),
  workHoursTotal: z.number(),
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
  pricing: z.object({
    base: z.number(),
    total: z.number(),
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
