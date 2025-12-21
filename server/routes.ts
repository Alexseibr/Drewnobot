import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { createHash } from "crypto";
import { storage } from "./storage";
import { insertSpaBookingSchema, insertReviewSchema, UserRole, StaffRole } from "@shared/schema";
import { validateInitData, generateSessionToken, getSessionExpiresAt } from "./telegram-auth";
import { handleTelegramUpdate, setupTelegramWebhook } from "./telegram-bot";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ============ AUTH MIDDLEWARE ============
  async function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Требуется авторизация" });
    }
    
    const token = authHeader.substring(7);
    const session = await storage.getAuthSession(token);
    if (!session) {
      return res.status(401).json({ error: "Сессия истекла" });
    }
    
    const user = await storage.getUser(session.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Пользователь не найден или деактивирован" });
    }
    
    (req as any).user = user;
    (req as any).session = session;
    next();
  }
  
  function requireRole(...roles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = (req as any).user;
      if (!user || !roles.includes(user.role)) {
        return res.status(403).json({ error: "Недостаточно прав" });
      }
      next();
    };
  }
  
  // ============ AUTH ENDPOINTS ============
  app.post("/api/auth/telegram", async (req, res) => {
    try {
      const { initData, phone } = req.body;
      if (!initData) {
        return res.status(400).json({ error: "Отсутствуют данные инициализации" });
      }
      
      const validated = validateInitData(initData);
      if (!validated) {
        return res.status(401).json({ error: "Неверные данные авторизации" });
      }
      
      const { telegramUser } = validated;
      const telegramIdStr = String(telegramUser.id);
      
      let user = await storage.getUserByTelegramId(telegramIdStr);
      
      // If user not found by telegramId but phone provided, check for pending user by phone
      if (!user && phone) {
        const userByPhone = await storage.getUserByPhone(phone);
        if (userByPhone && !userByPhone.telegramId) {
          // Link telegram ID to existing phone-based user
          user = await storage.updateUser(userByPhone.id, {
            telegramId: telegramIdStr,
          }) || userByPhone;
          console.log(`[Auth] Linked Telegram ${telegramIdStr} to existing user by phone ${phone}, role: ${user.role}`);
        }
      }
      
      if (!user) {
        const fullName = [telegramUser.first_name, telegramUser.last_name]
          .filter(Boolean).join(" ");
        
        user = await storage.createUser({
          telegramId: telegramIdStr,
          name: fullName || telegramUser.username || "Пользователь",
          phone: phone || undefined,
          role: "GUEST",
          isActive: true,
        });
      } else {
        const fullName = [telegramUser.first_name, telegramUser.last_name]
          .filter(Boolean).join(" ");
        user = await storage.updateUser(user.id, {
          name: fullName || user.name,
          phone: phone || user.phone,
        }) || user;
      }
      
      const token = generateSessionToken();
      const session = await storage.createAuthSession({
        userId: user.id,
        token,
        expiresAt: getSessionExpiresAt(),
      });
      
      res.json({
        user: {
          id: user.id,
          telegramId: user.telegramId,
          name: user.name,
          role: user.role,
        },
        token: session.token,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      console.error("[Auth] Telegram auth error:", error);
      res.status(500).json({ error: "Ошибка авторизации" });
    }
  });
  
  app.get("/api/auth/me", authMiddleware, async (req, res) => {
    const user = (req as any).user;
    res.json({
      id: user.id,
      telegramId: user.telegramId,
      name: user.name,
      role: user.role,
    });
  });
  
  app.post("/api/auth/logout", authMiddleware, async (req, res) => {
    const session = (req as any).session;
    await storage.deleteAuthSession(session.token);
    res.json({ success: true });
  });
  
  // ============ STAFF MANAGEMENT (SUPER_ADMIN only) ============
  app.get("/api/admin/staff", authMiddleware, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const staff = await storage.getStaffUsers();
      res.json(staff.map(u => ({
        id: u.id,
        telegramId: u.telegramId,
        name: u.name,
        phone: u.phone,
        role: u.role,
        isActive: u.isActive,
      })));
    } catch (error) {
      res.status(500).json({ error: "Ошибка получения списка сотрудников" });
    }
  });
  
  app.patch("/api/admin/staff/:id/role", authMiddleware, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { role } = req.body;
      const validRoles = ["OWNER", "ADMIN", "INSTRUCTOR", "GUEST"];
      
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ error: "Неверная роль" });
      }
      
      const currentUser = (req as any).user;
      if (currentUser.id === req.params.id && role !== "SUPER_ADMIN") {
        const allSuperAdmins = (await storage.getStaffUsers()).filter(u => u.role === "SUPER_ADMIN");
        if (allSuperAdmins.length <= 1) {
          return res.status(400).json({ error: "Нельзя понизить последнего супер-админа" });
        }
      }
      
      const updated = await storage.updateUserRole(req.params.id, role as UserRole);
      if (!updated) {
        return res.status(404).json({ error: "Пользователь не найден" });
      }
      
      res.json({
        id: updated.id,
        telegramId: updated.telegramId,
        name: updated.name,
        role: updated.role,
        isActive: updated.isActive,
      });
    } catch (error) {
      res.status(500).json({ error: "Ошибка обновления роли" });
    }
  });
  
  app.patch("/api/admin/staff/:id/status", authMiddleware, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { isActive } = req.body;
      
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ error: "Неверный статус" });
      }
      
      const currentUser = (req as any).user;
      if (currentUser.id === req.params.id && !isActive) {
        return res.status(400).json({ error: "Нельзя деактивировать себя" });
      }
      
      const updated = await storage.updateUser(req.params.id, { isActive });
      if (!updated) {
        return res.status(404).json({ error: "Пользователь не найден" });
      }
      
      if (!isActive) {
        await storage.deleteUserSessions(updated.id);
      }
      
      res.json({
        id: updated.id,
        telegramId: updated.telegramId,
        name: updated.name,
        role: updated.role,
        isActive: updated.isActive,
      });
    } catch (error) {
      res.status(500).json({ error: "Ошибка обновления статуса" });
    }
  });
  
  // ============ OPS TODAY ============
  app.get("/api/ops/today", async (req, res) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      
      const [tasks, cottageBookings, bathBookings, currentShift] = await Promise.all([
        storage.getTasksForDate(today),
        storage.getCottageBookingsUpcoming(),
        storage.getBathBookingsUpcoming(),
        storage.getCurrentShift(),
      ]);

      const shiftTransactions = currentShift 
        ? await storage.getCashTransactions(currentShift.id)
        : [];

      const cashBalance = shiftTransactions.reduce((sum, tx) => {
        if (tx.type === "cash_in") return sum + tx.amount;
        if (tx.type === "expense" || tx.type === "cash_out") return sum - tx.amount;
        return sum;
      }, 0);

      const todayCottages = cottageBookings.filter(b => 
        b.dateCheckIn === today || b.dateCheckOut === today
      );
      const todayBaths = bathBookings.filter(b => b.date === today);

      res.json({
        tasks,
        cottageBookings: todayCottages,
        bathBookings: todayBaths,
        currentShift,
        stats: {
          checkInsToday: todayCottages.filter(b => b.dateCheckIn === today).length,
          checkOutsToday: todayCottages.filter(b => b.dateCheckOut === today).length,
          bathsToday: todayBaths.length,
          openTasks: tasks.filter(t => t.status === "open").length,
          cashBalance,
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ops data" });
    }
  });

  // ============ TASKS ============
  app.get("/api/tasks", async (req, res) => {
    try {
      const tasks = await storage.getTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.post("/api/tasks/:id/complete", async (req, res) => {
    try {
      const task = await storage.updateTask(req.params.id, { status: "done" });
      if (!task) return res.status(404).json({ error: "Task not found" });
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Failed to complete task" });
    }
  });

  // ============ COTTAGE BOOKINGS ============
  app.get("/api/cottage-bookings/upcoming", async (req, res) => {
    try {
      const bookings = await storage.getCottageBookingsUpcoming();
      res.json(bookings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  app.post("/api/cottage-bookings", async (req, res) => {
    try {
      const booking = await storage.createCottageBooking(req.body);
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  app.patch("/api/cottage-bookings/:id", async (req, res) => {
    try {
      const booking = await storage.updateCottageBooking(req.params.id, req.body);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Failed to update booking" });
    }
  });

  // ============ BATH BOOKINGS - GUEST ============
  app.get("/api/guest/baths/availability", async (req, res) => {
    try {
      const date = req.query.date as string;
      if (!date) return res.status(400).json({ error: "Date is required" });
      
      const existingBookings = await storage.getBathBookingsForDate(date);
      const slots: Array<{ bathCode: string; date: string; startTime: string; endTime: string; available: boolean }> = [];
      
      for (const bathCode of ["B1", "B2"]) {
        const bathBookings = existingBookings.filter(b => 
          b.bathCode === bathCode && 
          !["cancelled", "expired"].includes(b.status)
        );
        
        for (let hour = 10; hour <= 19; hour++) {
          const startTime = `${hour.toString().padStart(2, "0")}:00`;
          const endTime = `${(hour + 3).toString().padStart(2, "0")}:00`;
          
          const isBlocked = bathBookings.some(b => {
            const bStart = parseInt(b.startTime.split(":")[0]);
            const bEnd = parseInt(b.endTime.split(":")[0]);
            return hour < bEnd && (hour + 3) > bStart;
          });
          
          slots.push({
            bathCode,
            date,
            startTime,
            endTime,
            available: !isBlocked && (hour + 3) <= 22,
          });
        }
      }
      
      res.json(slots);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  app.post("/api/guest/bath-bookings", async (req, res) => {
    try {
      const { bathCode, date, startTime, endTime } = req.body;
      
      const existingBookings = await storage.getBathBookingsForDate(date);
      const conflict = existingBookings.some(b => 
        b.bathCode === bathCode && 
        !["cancelled", "expired"].includes(b.status) &&
        !(endTime <= b.startTime || startTime >= b.endTime)
      );
      
      if (conflict) {
        return res.status(400).json({ error: "Time slot is not available" });
      }
      
      const booking = await storage.createBathBooking(req.body);
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // ============ BATH BOOKINGS - ADMIN ============
  app.get("/api/admin/bookings/upcoming", async (req, res) => {
    try {
      const [cottageBookings, bathBookings] = await Promise.all([
        storage.getCottageBookingsUpcoming(),
        storage.getBathBookingsUpcoming(),
      ]);
      res.json({ cottageBookings, bathBookings });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  app.post("/api/admin/bath-bookings/:id/accept", async (req, res) => {
    try {
      const booking = await storage.updateBathBooking(req.params.id, { 
        status: "awaiting_prepayment" 
      });
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Failed to accept booking" });
    }
  });

  app.post("/api/admin/bath-bookings/:id/cancel", async (req, res) => {
    try {
      const booking = await storage.updateBathBooking(req.params.id, { 
        status: "cancelled" 
      });
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Failed to cancel booking" });
    }
  });

  app.post("/api/admin/bath-bookings/:id/prepayment", async (req, res) => {
    try {
      const { amount, method } = req.body;
      const booking = await storage.updateBathBooking(req.params.id, { 
        status: "confirmed",
        payments: { 
          prepayment: { amount, method },
          eripPaid: 0,
          cashPaid: 0,
        },
      });
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Failed to record prepayment" });
    }
  });

  app.post("/api/admin/bath-bookings/:id/close-payment", async (req, res) => {
    try {
      const { method } = req.body;
      const existing = await storage.getBathBooking(req.params.id);
      if (!existing) return res.status(404).json({ error: "Booking not found" });

      const updates = {
        status: "completed" as const,
        payments: {
          ...existing.payments,
          [method === "erip" ? "eripPaid" : "cashPaid"]: existing.pricing.total - (existing.payments.prepayment?.amount || 0),
        },
      };

      const booking = await storage.updateBathBooking(req.params.id, updates);
      
      if (method === "cash") {
        const currentShift = await storage.getCurrentShift();
        if (currentShift) {
          await storage.createCashTransaction({
            shiftId: currentShift.id,
            type: "cash_in",
            amount: updates.payments.cashPaid,
            comment: `Bath ${existing.bathCode} payment`,
            createdBy: "admin",
          });
        }
      }
      
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Failed to close payment" });
    }
  });

  // ============ QUADS - GUEST ============
  // Get available slots for a date with route type pricing info
  app.get("/api/guest/quads/availability", async (req, res) => {
    try {
      const date = req.query.date as string;
      if (!date) return res.status(400).json({ error: "Date is required" });
      
      // Check if date is blocked
      const blockedDate = await storage.getBlockedDate(date);
      if (blockedDate) {
        return res.json({ 
          slots: [], 
          blockedTimes: [], 
          blocked: true,
          message: blockedDate.reason || "День недоступен для бронирования"
        });
      }
      
      // Get existing slots and blocked times
      const slots = await storage.getQuadSlotsForDate(date);
      const blockedTimes = await storage.getInstructorBlockedTimesForDate(date);
      
      // Generate available time slots (09:00 - 19:00)
      const availableSlots: Array<{
        startTime: string;
        routeType: "short" | "long";
        price: number;
        availableQuads: number;
        hasDiscount: boolean;
        discountPrice?: number;
      }> = [];
      
      for (let hour = 9; hour < 19; hour++) {
        for (let min = 0; min < 60; min += 30) {
          const startTime = `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
          
          // Check if time is blocked
          const isBlocked = blockedTimes.some(bt => {
            if (!bt.startTime) return true; // Whole day blocked
            return startTime >= bt.startTime && startTime < (bt.endTime || "23:59");
          });
          
          if (isBlocked) continue;
          
          // For short route (30 min)
          const shortSlot = slots.find(s => s.startTime === startTime && s.routeType === "short");
          const shortAvailable = shortSlot ? 4 - shortSlot.bookedQuads : 4;
          if (shortAvailable > 0) {
            availableSlots.push({
              startTime,
              routeType: "short",
              price: 50,
              availableQuads: shortAvailable,
              hasDiscount: !!shortSlot,
              discountPrice: shortSlot ? Math.round(50 * 0.95) : undefined,
            });
          }
          
          // For long route (60 min) - check if doesn't overlap with next hour
          if (hour < 18 || (hour === 18 && min === 0)) {
            const longSlot = slots.find(s => s.startTime === startTime && s.routeType === "long");
            const longAvailable = longSlot ? 4 - longSlot.bookedQuads : 4;
            if (longAvailable > 0) {
              availableSlots.push({
                startTime,
                routeType: "long",
                price: 80,
                availableQuads: longAvailable,
                hasDiscount: !!longSlot,
                discountPrice: longSlot ? Math.round(80 * 0.95) : undefined,
              });
            }
          }
        }
      }
      
      res.json({ 
        slots: availableSlots, 
        blockedTimes,
        blocked: false 
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  // Create quad booking (guest)
  app.post("/api/guest/quad-bookings", async (req, res) => {
    try {
      const { date, startTime, routeType, quadsCount, customer, comment, slotId } = req.body;
      
      if (!date || !startTime || !routeType || !quadsCount || !customer?.phone || !customer?.fullName) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Check availability
      const existingBookings = await storage.getQuadBookingsForDate(date);
      const sameSlotBookings = existingBookings.filter(b => 
        b.startTime === startTime && 
        b.routeType === routeType && 
        b.status !== "cancelled"
      );
      
      const bookedQuads = sameSlotBookings.reduce((sum, b) => sum + b.quadsCount, 0);
      if (bookedQuads + quadsCount > 4) {
        return res.status(400).json({ 
          error: `Доступно только ${4 - bookedQuads} квадроцикл(ов) на это время` 
        });
      }
      
      // Check rate limit for unauthenticated users - check across all dates
      const allUpcomingBookings = await storage.getQuadBookingsUpcoming();
      const pendingByPhone = allUpcomingBookings.filter(b => 
        b.customer.phone === customer.phone && 
        b.status === "pending_call"
      );
      if (pendingByPhone.length >= 3) {
        return res.status(429).json({ 
          error: "Превышен лимит незавершённых бронирований. Дождитесь подтверждения." 
        });
      }
      
      const booking = await storage.createQuadBooking({
        date,
        startTime,
        routeType,
        quadsCount,
        customer,
        comment,
        slotId: sameSlotBookings.length > 0 ? `${startTime}-${routeType}` : undefined,
      });
      
      // Notify instructors about new booking (async, don't wait)
      import("./telegram-bot").then(({ notifyNewQuadBooking }) => {
        notifyNewQuadBooking(booking).catch(console.error);
      });
      
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // ============ QUADS - INSTRUCTOR/ADMIN ============
  // Get schedule for date
  app.get("/api/instructor/quad-schedule", async (req, res) => {
    try {
      const date = req.query.date as string || new Date().toISOString().split("T")[0];
      
      const bookings = await storage.getQuadBookingsForDate(date);
      const slots = await storage.getQuadSlotsForDate(date);
      const blockedTimes = await storage.getInstructorBlockedTimesForDate(date);
      
      res.json({ bookings, slots, blockedTimes });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch schedule" });
    }
  });

  // Get all upcoming bookings
  app.get("/api/instructor/quad-bookings", async (req, res) => {
    try {
      const bookings = await storage.getQuadBookingsUpcoming();
      res.json(bookings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  // Get instructor schedule (bookings + blocked times for a date)
  app.get("/api/instructor/schedule", async (req, res) => {
    try {
      const { date } = req.query;
      if (!date || typeof date !== "string") {
        return res.status(400).json({ error: "Date is required" });
      }
      
      const bookings = await storage.getQuadBookingsForDate(date);
      const blockedTimes = await storage.getInstructorBlockedTimesForDate(date);
      
      res.json({
        bookings: bookings.filter(b => b.status !== "cancelled"),
        blockedTimes,
      });
    } catch (error) {
      console.error("Error fetching instructor schedule:", error);
      res.status(500).json({ error: "Failed to fetch schedule" });
    }
  });

  // Block instructor time
  app.post("/api/instructor/blocked-times", async (req, res) => {
    try {
      const { date, startTime, endTime, reason } = req.body;
      
      if (!date) {
        return res.status(400).json({ error: "Date is required" });
      }
      
      // Check for overlapping blocked times
      const existingBlocked = await storage.getInstructorBlockedTimesForDate(date);
      
      // If no times specified, it's a full day block
      if (!startTime) {
        // Check if any partial blocks exist for this day
        if (existingBlocked.length > 0) {
          return res.status(400).json({ 
            error: "На этот день уже есть заблокированное время. Сначала удалите его." 
          });
        }
      } else {
        // Check for overlapping time ranges
        const hasOverlap = existingBlocked.some(bt => {
          if (!bt.startTime) return true; // Whole day is blocked
          const btStart = bt.startTime;
          const btEnd = bt.endTime || "23:59";
          const newEnd = endTime || "23:59";
          return !(newEnd <= btStart || startTime >= btEnd);
        });
        
        if (hasOverlap) {
          return res.status(400).json({ 
            error: "Выбранное время пересекается с уже заблокированным периодом" 
          });
        }
      }
      
      const blocked = await storage.createInstructorBlockedTime({
        date,
        startTime,
        endTime,
        reason,
      });
      res.json(blocked);
    } catch (error) {
      res.status(500).json({ error: "Failed to create blocked time" });
    }
  });

  // Delete blocked time
  app.delete("/api/instructor/blocked-times/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteInstructorBlockedTime(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete blocked time" });
    }
  });

  // Confirm booking
  app.post("/api/instructor/quad-bookings/:id/confirm", async (req, res) => {
    try {
      const booking = await storage.updateQuadBooking(req.params.id, { 
        status: "confirmed" 
      });
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Failed to confirm booking" });
    }
  });

  // Cancel booking
  app.post("/api/instructor/quad-bookings/:id/cancel", async (req, res) => {
    try {
      const updated = await storage.updateQuadBooking(req.params.id, { 
        status: "cancelled" 
      });
      if (!updated) return res.status(404).json({ error: "Booking not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to cancel booking" });
    }
  });

  // Complete booking
  app.post("/api/instructor/quad-bookings/:id/complete", async (req, res) => {
    try {
      const { paymentMethod } = req.body;
      const booking = await storage.getQuadBooking(req.params.id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      
      const updates: Partial<import("@shared/schema").QuadBooking> = {
        status: "completed",
        payments: {
          ...booking.payments,
          [paymentMethod === "erip" ? "eripPaid" : "cashPaid"]: booking.pricing.total,
        },
      };
      
      const updated = await storage.updateQuadBooking(req.params.id, updates);
      
      // Record cash transaction if paid in cash
      if (paymentMethod === "cash") {
        const currentShift = await storage.getCurrentShift();
        if (currentShift) {
          await storage.createCashTransaction({
            shiftId: currentShift.id,
            type: "cash_in",
            amount: booking.pricing.total,
            comment: `Квадроцикл ${booking.routeType === "short" ? "30мин" : "60мин"} x${booking.quadsCount}`,
            createdBy: "instructor",
          });
        }
      }
      
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to complete booking" });
    }
  });

  // ============ CASH ============
  app.get("/api/cash/shift/current", async (req, res) => {
    try {
      const currentShift = await storage.getCurrentShift();
      if (!currentShift) {
        return res.json({ currentShift: null, transactions: [], balance: 0 });
      }
      
      const transactions = await storage.getCashTransactions(currentShift.id);
      const balance = transactions.reduce((sum, tx) => {
        if (tx.type === "cash_in") return sum + tx.amount;
        if (tx.type === "expense" || tx.type === "cash_out") return sum - tx.amount;
        return sum;
      }, 0);
      
      res.json({ currentShift, transactions, balance });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch shift" });
    }
  });

  app.post("/api/cash/shift/open", async (req, res) => {
    try {
      const existingShift = await storage.getCurrentShift();
      if (existingShift) {
        return res.status(400).json({ error: "A shift is already open" });
      }
      
      const shift = await storage.createCashShift({
        openedBy: req.body.openedBy || "admin",
      });
      res.json(shift);
    } catch (error) {
      res.status(500).json({ error: "Failed to open shift" });
    }
  });

  app.post("/api/cash/transactions", async (req, res) => {
    try {
      const tx = await storage.createCashTransaction({
        ...req.body,
        createdBy: req.body.createdBy || "admin",
      });
      res.json(tx);
    } catch (error) {
      res.status(500).json({ error: "Failed to create transaction" });
    }
  });

  app.post("/api/cash/shift/incasation", async (req, res) => {
    try {
      const currentShift = await storage.getCurrentShift();
      if (!currentShift) {
        return res.status(400).json({ error: "No open shift" });
      }
      
      const transactions = await storage.getCashTransactions(currentShift.id);
      const balance = transactions.reduce((sum, tx) => {
        if (tx.type === "cash_in") return sum + tx.amount;
        if (tx.type === "expense" || tx.type === "cash_out") return sum - tx.amount;
        return sum;
      }, 0);
      
      if (balance > 0) {
        await storage.createCashTransaction({
          shiftId: currentShift.id,
          type: "cash_out",
          amount: balance,
          comment: "Incasation",
          createdBy: "admin",
        });
      }
      
      const closedShift = await storage.updateCashShift(currentShift.id, {
        isOpen: false,
        closedAt: new Date().toISOString(),
        visibleToAdmin: false,
      });
      
      res.json(closedShift);
    } catch (error) {
      res.status(500).json({ error: "Failed to close shift" });
    }
  });

  // ============ WORK LOGS ============
  app.get("/api/owner/worklogs", async (req, res) => {
    try {
      const logs = await storage.getWorkLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch work logs" });
    }
  });

  app.post("/api/worklogs", async (req, res) => {
    try {
      const log = await storage.createWorkLog(req.body);
      res.json(log);
    } catch (error) {
      res.status(500).json({ error: "Failed to create work log" });
    }
  });

  // ============ ANALYTICS ============
  app.get("/api/owner/analytics/summary", async (req, res) => {
    try {
      const month = req.query.month as string || new Date().toISOString().slice(0, 7);
      const summary = await storage.getAnalyticsSummary(month);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // ============ SETTINGS ============
  app.get("/api/settings/site", async (req, res) => {
    try {
      const settings = await storage.getSiteSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.put("/api/settings/site", async (req, res) => {
    try {
      const settings = await storage.updateSiteSettings(req.body);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.get("/api/prices", async (req, res) => {
    try {
      const prices = await storage.getServicePrices();
      res.json(prices);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch prices" });
    }
  });

  // ============ SMS VERIFICATION ============
  app.post("/api/guest/sms/send", async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: "Требуется номер телефона" });
      
      // Generate 4-digit code
      const code = process.env.NODE_ENV === "development" 
        ? "0000" 
        : Math.floor(1000 + Math.random() * 9000).toString();
      
      await storage.createSmsCode(phone, code);
      
      // Log code in dev mode
      if (process.env.NODE_ENV === "development") {
        console.log(`[SMS DEV] Код для ${phone}: ${code}`);
      }
      
      // TODO: Integrate with smsline.by when SMSLINE_API_URL is configured
      if (process.env.SMSLINE_API_URL) {
        console.log(`[SMS] Отправка кода на ${phone}`);
      }
      
      res.json({ ok: true, cooldownSeconds: 60 });
    } catch (error) {
      res.status(500).json({ error: "Не удалось отправить SMS" });
    }
  });

  app.post("/api/guest/sms/verify", async (req, res) => {
    try {
      const { phone, code } = req.body;
      if (!phone || !code) return res.status(400).json({ error: "Требуется телефон и код" });
      
      const smsCode = await storage.getSmsCode(phone);
      if (!smsCode) {
        return res.status(400).json({ error: "Код не найден или истёк" });
      }
      
      if (smsCode.attempts >= 5) {
        return res.status(400).json({ error: "Превышено количество попыток" });
      }
      
      const codeHash = createHash("sha256").update(code).digest("hex");
      if (smsCode.codeHash !== codeHash) {
        await storage.updateSmsCode(smsCode.id, { attempts: smsCode.attempts + 1 });
        return res.status(400).json({ error: "Неверный код" });
      }
      
      await storage.updateSmsCode(smsCode.id, { verified: true });
      const verificationToken = await storage.createVerificationToken(phone);
      
      res.json({ verificationToken: verificationToken.token });
    } catch (error) {
      res.status(500).json({ error: "Ошибка проверки кода" });
    }
  });

  // ============ SPA BOOKINGS - GUEST ============
  app.get("/api/guest/spa/availability", async (req, res) => {
    try {
      const date = req.query.date as string;
      if (!date) return res.status(400).json({ error: "Требуется дата" });
      
      const settings = await storage.getSiteSettings();
      const closeHour = parseInt(settings.closeTime.split(":")[0]) || 22;
      const existingBookings = await storage.getSpaBookingsForDate(date);
      
      const slots: Array<{
        spaResource: string;
        date: string;
        startTime: string;
        endTime: string;
        available: boolean;
      }> = [];
      
      for (const spaResource of ["SPA1", "SPA2"]) {
        const spaBookings = existingBookings.filter(b => 
          b.spaResource === spaResource && 
          !["cancelled", "expired", "completed"].includes(b.status)
        );
        
        for (let hour = 10; hour <= closeHour - 3; hour++) {
          const startTime = `${hour.toString().padStart(2, "0")}:00`;
          const endTime = `${(hour + 3).toString().padStart(2, "0")}:00`;
          
          const isBlocked = spaBookings.some(b => {
            const bStart = parseInt(b.startTime.split(":")[0]);
            const bEnd = parseInt(b.endTime.split(":")[0]);
            return hour < bEnd && (hour + 3) > bStart;
          });
          
          slots.push({
            spaResource,
            date,
            startTime,
            endTime,
            available: !isBlocked,
          });
        }
      }
      
      res.json(slots);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить доступность" });
    }
  });

  // Rate limit map for unauthenticated bookings
  const bookingAttempts = new Map<string, { count: number; resetAt: number }>();
  const MAX_UNVERIFIED_PENDING = 3; // Max pending bookings per phone
  const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
  const MAX_REQUESTS_PER_HOUR = 10;
  
  app.post("/api/guest/spa-bookings", async (req, res) => {
    try {
      // Check for auth token (optional - web users can book with phone number)
      const token = req.headers["x-verify-token"] as string || req.body.verificationToken;
      let isVerified = false;
      
      if (token) {
        const verification = await storage.getVerificationToken(token);
        const authSession = await storage.getAuthSession(token);
        isVerified = !!(verification || authSession);
      }
      
      // Rate limiting for unauthenticated requests
      if (!isVerified) {
        const clientIP = req.ip || req.socket.remoteAddress || "unknown";
        const now = Date.now();
        const rateKey = `ip:${clientIP}`;
        
        let attempts = bookingAttempts.get(rateKey);
        if (!attempts || now > attempts.resetAt) {
          attempts = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
        }
        
        if (attempts.count >= MAX_REQUESTS_PER_HOUR) {
          return res.status(429).json({ error: "Слишком много запросов. Попробуйте позже." });
        }
        
        attempts.count++;
        bookingAttempts.set(rateKey, attempts);
      }
      
      const parsed = insertSpaBookingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Неверные данные бронирования", details: parsed.error.errors });
      }
      
      const { spaResource, date, startTime, endTime, durationHours } = parsed.data;
      
      // Validate close time (22:00)
      const settings = await storage.getSiteSettings();
      const closeHour = parseInt(settings.closeTime.split(":")[0]) || 22;
      const endHour = parseInt(endTime.split(":")[0]);
      
      if (endHour > closeHour) {
        return res.status(400).json({ error: `Комплекс закрывается в ${closeHour}:00. Выберите более раннее время.` });
      }
      
      // Validate duration matches times
      const startHour = parseInt(startTime.split(":")[0]);
      if (endHour - startHour !== durationHours) {
        return res.status(400).json({ error: "Время окончания не соответствует продолжительности" });
      }
      
      // Check for conflicts
      const existingBookings = await storage.getSpaBookingsForDate(date);
      const conflict = existingBookings.some(b => 
        b.spaResource === spaResource && 
        !["cancelled", "expired", "completed"].includes(b.status) &&
        !(endTime <= b.startTime || startTime >= b.endTime)
      );
      
      if (conflict) {
        return res.status(400).json({ error: "Это время уже занято" });
      }
      
      // Ensure phone is provided for unverified users
      if (!isVerified && !parsed.data.customer.phone) {
        return res.status(400).json({ error: "Укажите номер телефона для связи" });
      }
      
      // Limit pending bookings per phone to prevent abuse
      if (!isVerified && parsed.data.customer.phone) {
        const phone = parsed.data.customer.phone;
        const allBookings = await storage.getAllSpaBookings();
        const pendingByPhone = allBookings.filter(b => 
          b.customer.phone === phone && 
          ["pending", "awaiting_prepayment"].includes(b.status)
        );
        
        if (pendingByPhone.length >= MAX_UNVERIFIED_PENDING) {
          return res.status(400).json({ 
            error: `У вас уже есть ${MAX_UNVERIFIED_PENDING} ожидающих бронирований. Дождитесь подтверждения.` 
          });
        }
      }
      
      const booking = await storage.createSpaBooking(parsed.data);
      
      // Notification
      console.log(`[NOTIFY] Новая SPA бронь: ${spaResource} на ${date} ${startTime}`);
      
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Не удалось создать бронирование" });
    }
  });

  // ============ SPA BOOKINGS - ADMIN ============
  app.get("/api/admin/spa-bookings/upcoming", async (req, res) => {
    try {
      const bookings = await storage.getSpaBookingsUpcoming();
      res.json(bookings);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить бронирования" });
    }
  });

  app.post("/api/admin/spa-bookings/:id/accept", async (req, res) => {
    try {
      const booking = await storage.updateSpaBooking(req.params.id, { 
        status: "awaiting_prepayment" 
      });
      if (!booking) return res.status(404).json({ error: "Бронирование не найдено" });
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Не удалось принять бронирование" });
    }
  });

  app.post("/api/admin/spa-bookings/:id/cancel", async (req, res) => {
    try {
      const booking = await storage.updateSpaBooking(req.params.id, { 
        status: "cancelled" 
      });
      if (!booking) return res.status(404).json({ error: "Бронирование не найдено" });
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Не удалось отменить бронирование" });
    }
  });

  app.post("/api/admin/spa-bookings/:id/prepayment", async (req, res) => {
    try {
      const { amount, method } = req.body;
      const booking = await storage.updateSpaBooking(req.params.id, { 
        status: "confirmed",
        payments: { 
          prepayment: { amount, method },
          eripPaid: 0,
          cashPaid: 0,
        },
      });
      if (!booking) return res.status(404).json({ error: "Бронирование не найдено" });
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Не удалось внести предоплату" });
    }
  });

  app.post("/api/admin/spa-bookings/:id/close-payment", async (req, res) => {
    try {
      const { method } = req.body;
      const existing = await storage.getSpaBooking(req.params.id);
      if (!existing) return res.status(404).json({ error: "Бронирование не найдено" });

      const remaining = existing.pricing.total - (existing.payments.prepayment?.amount || 0);
      const updates = {
        status: "completed" as const,
        payments: {
          ...existing.payments,
          [method === "erip" ? "eripPaid" : "cashPaid"]: remaining,
        },
      };

      const booking = await storage.updateSpaBooking(req.params.id, updates);
      
      if (method === "cash") {
        const currentShift = await storage.getCurrentShift();
        if (currentShift) {
          await storage.createCashTransaction({
            shiftId: currentShift.id,
            type: "cash_in",
            amount: remaining,
            comment: `SPA ${existing.spaResource} оплата`,
            createdBy: "admin",
          });
        }
      }
      
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Не удалось закрыть оплату" });
    }
  });

  // ============ REVIEWS - GUEST ============
  app.post("/api/guest/reviews", async (req, res) => {
    try {
      const parsed = insertReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Неверные данные отзыва" });
      }
      
      const { bookingRef, customer } = parsed.data;
      
      // Verify booking exists and is completed
      let bookingExists = false;
      let phoneMatches = false;
      
      if (bookingRef.kind === "spa") {
        const booking = await storage.getSpaBooking(bookingRef.id);
        bookingExists = !!booking && booking.status === "completed";
        phoneMatches = booking?.customer.phone === customer.phone;
      } else if (bookingRef.kind === "bath") {
        const booking = await storage.getBathBooking(bookingRef.id);
        bookingExists = !!booking && booking.status === "completed";
        phoneMatches = booking?.customer.phone === customer.phone;
      } else if (bookingRef.kind === "quad") {
        const booking = await storage.getQuadBooking(bookingRef.id);
        bookingExists = !!booking && booking.status === "completed";
        phoneMatches = booking?.customer.phone === customer.phone;
      } else if (bookingRef.kind === "cottage") {
        const booking = await storage.getCottageBooking(bookingRef.id);
        bookingExists = !!booking && booking.status === "completed";
        phoneMatches = booking?.customer.phone === customer.phone;
      }
      
      if (!bookingExists) {
        return res.status(400).json({ error: "Бронирование не найдено или не завершено" });
      }
      
      if (!phoneMatches) {
        return res.status(403).json({ error: "Телефон не совпадает с бронированием" });
      }
      
      const review = await storage.createReview(parsed.data);
      res.json(review);
    } catch (error) {
      res.status(500).json({ error: "Не удалось создать отзыв" });
    }
  });

  // ============ REVIEWS - OWNER ============
  app.get("/api/owner/reviews", async (req, res) => {
    try {
      const reviews = await storage.getReviews();
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить отзывы" });
    }
  });

  app.post("/api/owner/reviews/:id/publish", async (req, res) => {
    try {
      const existing = await storage.getReview(req.params.id);
      if (!existing) return res.status(404).json({ error: "Отзыв не найден" });
      
      const review = await storage.updateReview(req.params.id, { 
        isPublished: !existing.isPublished,
        publishedAt: !existing.isPublished ? new Date().toISOString() : undefined,
        publishedBy: !existing.isPublished ? "owner" : undefined,
      });
      res.json(review);
    } catch (error) {
      res.status(500).json({ error: "Не удалось обновить отзыв" });
    }
  });

  // ============ BLOCKED DATES - INSTRUCTOR ============
  app.get("/api/instructor/blocked-dates", async (req, res) => {
    try {
      const blockedDates = await storage.getBlockedDates();
      res.json(blockedDates);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить заблокированные даты" });
    }
  });

  app.post("/api/instructor/blocked-dates", async (req, res) => {
    try {
      const { date, reason } = req.body;
      if (!date) return res.status(400).json({ error: "Требуется дата" });
      
      const existing = await storage.getBlockedDate(date);
      if (existing) {
        return res.status(400).json({ error: "Дата уже заблокирована" });
      }
      
      const blockedDate = await storage.createBlockedDate({
        date,
        reason,
        createdBy: "instructor",
      });
      res.json(blockedDate);
    } catch (error) {
      res.status(500).json({ error: "Не удалось заблокировать дату" });
    }
  });

  app.delete("/api/instructor/blocked-dates/:date", async (req, res) => {
    try {
      const deleted = await storage.deleteBlockedDate(req.params.date);
      if (!deleted) {
        return res.status(404).json({ error: "Заблокированная дата не найдена" });
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Не удалось разблокировать дату" });
    }
  });

  // ============ INSTRUCTOR MANAGEMENT ============
  app.get("/api/instructors", authMiddleware, requireRole("INSTRUCTOR", "ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const users = await storage.getUsers();
      const instructors = users.filter(u => u.role === "INSTRUCTOR" && u.isActive);
      res.json(instructors);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить список инструкторов" });
    }
  });

  app.post("/api/instructors", authMiddleware, requireRole("INSTRUCTOR", "ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { name, telegramId } = req.body;
      if (!name || !telegramId) {
        return res.status(400).json({ error: "Укажите имя и Telegram ID" });
      }
      
      // Check if user already exists
      const existing = await storage.getUserByTelegramId(telegramId);
      if (existing) {
        return res.status(400).json({ error: "Пользователь с таким Telegram ID уже существует" });
      }
      
      const instructor = await storage.createUser({
        telegramId,
        name,
        role: "INSTRUCTOR",
        isActive: true,
      });
      
      res.json(instructor);
    } catch (error) {
      res.status(500).json({ error: "Не удалось добавить инструктора" });
    }
  });

  app.delete("/api/instructors/:id", authMiddleware, requireRole("INSTRUCTOR", "ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user || user.role !== "INSTRUCTOR") {
        return res.status(404).json({ error: "Инструктор не найден" });
      }
      
      // Deactivate instead of delete
      await storage.updateUser(req.params.id, { isActive: false });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Не удалось удалить инструктора" });
    }
  });

  // ============ DEV AUTH ============
  app.post("/api/auth/dev-login", async (req, res) => {
    if (process.env.NODE_ENV !== "development") {
      return res.status(403).json({ error: "Only available in development" });
    }
    
    const { role } = req.body;
    if (!["ADMIN", "OWNER", "INSTRUCTOR"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    
    const user = {
      id: `dev-${role.toLowerCase()}`,
      telegramId: `dev-${role.toLowerCase()}`,
      name: `Dev ${role}`,
      role,
      isActive: true,
    };
    
    res.json({ token: `dev-token-${role.toLowerCase()}`, user });
  });

  // ============ TELEGRAM BOT WEBHOOK ============
  app.post("/api/telegram/webhook", async (req, res) => {
    try {
      await handleTelegramUpdate(req.body);
      res.json({ ok: true });
    } catch (error) {
      console.error("[Telegram Webhook] Error:", error);
      res.json({ ok: true }); // Always respond OK to Telegram
    }
  });

  // Endpoint to manually setup webhook (for admins)
  app.post("/api/telegram/setup-webhook", authMiddleware, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { webhookUrl } = req.body;
      if (!webhookUrl) {
        return res.status(400).json({ error: "webhookUrl required" });
      }
      await setupTelegramWebhook(webhookUrl);
      res.json({ ok: true, message: "Webhook установлен" });
    } catch (error) {
      console.error("[Telegram] Setup webhook error:", error);
      res.status(500).json({ error: "Ошибка установки webhook" });
    }
  });

  // Setup webhook on startup in production
  if (process.env.NODE_ENV === "production") {
    const replSlug = process.env.REPL_SLUG;
    const replOwner = process.env.REPL_OWNER;
    if (replSlug && replOwner) {
      const webhookUrl = `https://${replSlug}.${replOwner}.repl.co`;
      setupTelegramWebhook(webhookUrl).catch(console.error);
    }
  }

  return httpServer;
}
