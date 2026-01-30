import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { createHash } from "crypto";
import { z } from "zod";
import { storage } from "./storage";
import { insertSpaBookingSchema, insertReviewSchema, UserRole, StaffRole, SpaBooking, GuestRating, insertUnitInfoSchema } from "@shared/schema";
import { validateInitData, generateSessionToken, getSessionExpiresAt } from "./telegram-auth";
import { handleTelegramUpdate, setupTelegramWebhook, sendTaskNotification, sendFinancialNotification, pinAdminPanelForAllStaff, performNightlyCleanup } from "./telegram-bot";

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
        
        // Check for staff authorization by Telegram ID first (new system)
        let assignedRole: UserRole = "GUEST";
        let invitation = null;
        const staffAuth = await storage.getStaffAuthorizationByTelegramId(telegramIdStr);
        if (staffAuth) {
          assignedRole = staffAuth.role;
          console.log(`[Auth] Found staff authorization for Telegram ID ${telegramIdStr}, assigning role: ${assignedRole}`);
        } else if (phone) {
          // Fall back to phone-based invitation (legacy system)
          invitation = await storage.getStaffInvitationByPhone(phone);
          if (invitation) {
            assignedRole = invitation.role;
            console.log(`[Auth] Found staff invitation for phone ${phone}, assigning role: ${assignedRole}`);
          }
        }
        
        user = await storage.createUser({
          telegramId: telegramIdStr,
          name: fullName || telegramUser.username || "Пользователь",
          phone: phone || undefined,
          role: assignedRole,
          isActive: true,
        });
        
        // Mark authorization/invitation as used after user creation
        if (staffAuth) {
          // Deactivate Telegram ID authorization to prevent repeated use
          await storage.updateStaffAuthorization(staffAuth.id, { isActive: false });
          console.log(`[Auth] Staff authorization ${staffAuth.id} deactivated after user creation`);
        } else if (invitation) {
          await storage.useStaffInvitation(invitation.id, user.id);
          console.log(`[Auth] Staff invitation ${invitation.id} marked as used by user ${user.id}`);
        }
      } else {
        const fullName = [telegramUser.first_name, telegramUser.last_name]
          .filter(Boolean).join(" ");
        // Only update phone if a new valid phone is provided
        // Pass undefined to preserve existing phone (not null which clears it)
        const phoneToUpdate = phone && phone.trim() ? phone : undefined;
        
        // Check for staff authorization/invitation for existing GUEST users
        let upgradedRole = user.role;
        if (user.role === "GUEST") {
          // First check Telegram ID-based authorization (new system)
          const staffAuth = await storage.getStaffAuthorizationByTelegramId(telegramIdStr);
          if (staffAuth) {
            upgradedRole = staffAuth.role;
            // Deactivate the authorization after use to prevent repeated privilege escalation
            await storage.updateStaffAuthorization(staffAuth.id, { isActive: false });
            console.log(`[Auth] Upgraded existing GUEST ${user.id} to ${upgradedRole} via Telegram authorization (authorization deactivated)`);
          } else if (phone) {
            // Fall back to phone-based invitation (legacy system)
            const invitation = await storage.getStaffInvitationByPhone(phone);
            if (invitation) {
              upgradedRole = invitation.role;
              await storage.useStaffInvitation(invitation.id, user.id);
              console.log(`[Auth] Upgraded existing GUEST ${user.id} to ${upgradedRole} via invitation for phone ${phone}`);
            }
          }
        }
        
        user = await storage.updateUser(user.id, {
          name: fullName || user.name,
          ...(phoneToUpdate ? { phone: phoneToUpdate } : {}),
          ...(upgradedRole !== user.role ? { role: upgradedRole } : {}),
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
  
  // ============ STAFF INVITATIONS (Phone-based role pre-assignment) ============
  app.get("/api/admin/invitations", authMiddleware, requireRole("SUPER_ADMIN", "OWNER"), async (req, res) => {
    try {
      const invitations = await storage.getStaffInvitations();
      res.json(invitations);
    } catch (error) {
      res.status(500).json({ error: "Ошибка получения списка приглашений" });
    }
  });
  
  app.post("/api/admin/invitations", authMiddleware, requireRole("SUPER_ADMIN", "OWNER"), async (req, res) => {
    try {
      const { phone, role, note } = req.body;
      const currentUser = (req as any).user;
      
      if (!phone || !role) {
        return res.status(400).json({ error: "Укажите номер телефона и роль" });
      }
      
      const validRoles = ["OWNER", "ADMIN", "INSTRUCTOR"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "Недопустимая роль" });
      }
      
      // Validate phone format (at least 7 digits)
      const phoneDigits = phone.replace(/\D/g, '');
      if (phoneDigits.length < 7) {
        return res.status(400).json({ error: "Номер телефона должен содержать минимум 7 цифр" });
      }
      
      // Check if invitation for this phone already exists
      const existing = await storage.getStaffInvitationByPhone(phone);
      if (existing) {
        return res.status(400).json({ error: "Приглашение для этого номера уже существует" });
      }
      
      const invitation = await storage.createStaffInvitation({
        phone,
        role: role as UserRole,
        note,
        createdBy: currentUser.id,
      });
      
      console.log(`[Admin] Staff invitation created for phone ${phone} with role ${role} by ${currentUser.name}`);
      res.json(invitation);
    } catch (error) {
      res.status(500).json({ error: "Ошибка создания приглашения" });
    }
  });
  
  app.delete("/api/admin/invitations/:id", authMiddleware, requireRole("SUPER_ADMIN", "OWNER"), async (req, res) => {
    try {
      const deleted = await storage.deleteStaffInvitation(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Приглашение не найдено" });
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Ошибка удаления приглашения" });
    }
  });

  // ============ STAFF AUTHORIZATIONS (Telegram ID-based) ============
  app.get("/api/admin/authorizations", authMiddleware, requireRole("SUPER_ADMIN", "OWNER"), async (req, res) => {
    try {
      const authorizations = await storage.getStaffAuthorizations();
      res.json(authorizations);
    } catch (error) {
      res.status(500).json({ error: "Ошибка получения авторизаций" });
    }
  });
  
  app.post("/api/admin/authorizations", authMiddleware, requireRole("SUPER_ADMIN", "OWNER"), async (req, res) => {
    try {
      const { telegramId, role, note } = req.body;
      const currentUser = (req as any).user;
      
      if (!telegramId || !role) {
        return res.status(400).json({ error: "Укажите Telegram ID и роль" });
      }
      
      const validRoles = ["OWNER", "ADMIN", "INSTRUCTOR"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "Недопустимая роль" });
      }
      
      // Check if authorization for this Telegram ID already exists
      const existing = await storage.getStaffAuthorizationByTelegramId(telegramId);
      if (existing) {
        return res.status(400).json({ error: "Авторизация для этого Telegram ID уже существует" });
      }
      
      const authorization = await storage.createStaffAuthorization({
        telegramId,
        role: role as UserRole,
        note,
        assignedBy: currentUser.id,
        isActive: true,
      });
      
      console.log(`[Admin] Staff authorization created for Telegram ID ${telegramId} with role ${role} by ${currentUser.name}`);
      res.json(authorization);
    } catch (error) {
      res.status(500).json({ error: "Ошибка создания авторизации" });
    }
  });

  app.patch("/api/admin/authorizations/:id", authMiddleware, requireRole("SUPER_ADMIN", "OWNER"), async (req, res) => {
    try {
      const { role, note, isActive } = req.body;
      const updates: Partial<{ role: UserRole; note: string; isActive: boolean }> = {};
      
      if (role !== undefined) {
        const validRoles = ["OWNER", "ADMIN", "INSTRUCTOR"];
        if (!validRoles.includes(role)) {
          return res.status(400).json({ error: "Недопустимая роль" });
        }
        updates.role = role as UserRole;
      }
      if (note !== undefined) updates.note = note;
      if (isActive !== undefined) updates.isActive = isActive;
      
      // Only update if there are actual changes
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "Нет данных для обновления" });
      }
      
      const updated = await storage.updateStaffAuthorization(req.params.id, updates);
      if (!updated) {
        return res.status(404).json({ error: "Авторизация не найдена" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Ошибка обновления авторизации" });
    }
  });
  
  app.delete("/api/admin/authorizations/:id", authMiddleware, requireRole("SUPER_ADMIN", "OWNER"), async (req, res) => {
    try {
      const deleted = await storage.deleteStaffAuthorization(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Авторизация не найдена" });
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Ошибка удаления авторизации" });
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

  // ============ STAFF MEMBERS FOR TASK ASSIGNMENT ============
  app.get("/api/staff-members", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const staff = await storage.getStaffUsers();
      res.json(staff.map(u => ({
        id: u.id,
        name: u.name,
        role: u.role,
      })));
    } catch (error) {
      console.error("[StaffMembers] Fetch error:", error);
      res.status(500).json({ error: "Failed to fetch staff members" });
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

  // Authenticated task overview - separates my tasks from delegated tasks
  app.get("/api/tasks/overview", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const userId = req.user!.id;
      const allTasks = await storage.getTasks();
      const today = new Date().toISOString().slice(0, 10);
      
      // Filter to today's tasks only
      const todayTasks = allTasks.filter(t => t.date === today);
      
      // Tasks assigned to me (or I accepted)
      const myTasks = todayTasks.filter(t => 
        t.assignedTo === userId || 
        // Tasks I created without assigning to anyone else
        (t.createdBy === userId && !t.assignedTo)
      );
      
      // Tasks I delegated to others (I created them AND assigned to someone else)
      const delegatedTasks = todayTasks.filter(t => 
        t.createdBy === userId && 
        t.assignedTo && 
        t.assignedTo !== userId
      );
      
      // Unassigned pool - tasks without assignee that I didn't create
      const unassignedPool = todayTasks.filter(t => 
        !t.assignedTo && 
        t.createdBy !== userId
      );
      
      // Get staff info for delegated tasks
      const staffMembers = await storage.getStaffUsers();
      const staffMap = new Map(staffMembers.map(s => [s.id, s.name]));
      
      // Enrich delegated tasks with assignee names
      const enrichedDelegated = delegatedTasks.map(t => ({
        ...t,
        assigneeName: t.assignedTo ? staffMap.get(t.assignedTo) || "Неизвестно" : null,
        isAccepted: !!t.acceptedAt, // Task is accepted when acceptedAt is set
      }));
      
      res.json({
        myTasks,
        delegatedTasks: enrichedDelegated,
        unassignedPool,
      });
    } catch (error) {
      console.error("[Tasks] Overview error:", error);
      res.status(500).json({ error: "Failed to fetch task overview" });
    }
  });

  app.post("/api/tasks", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { title, description, type, date, unitCode, priority, notifyAt, assignedTo } = req.body;
      
      if (!title || !type || !date) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const task = await storage.createTask({
        title,
        description: description || undefined,
        type,
        date,
        unitCode: unitCode && unitCode !== "none" ? unitCode : undefined,
        priority: priority || "normal",
        notifyAt: notifyAt || undefined,
        assignedTo: assignedTo || undefined,
        status: "open",
        createdBySystem: false,
      }, req.user!.id);
      
      // Only send notification immediately if no scheduled time is set
      if (!notifyAt) {
        sendTaskNotification({
          id: task.id,
          title: task.title,
          type: task.type,
          date: task.date,
          unitCode: task.unitCode,
          priority: task.priority,
          assignedTo: task.assignedTo,
        }).catch(err => console.error("[Tasks] Notification error:", err));
        
        // Mark as notified immediately
        await storage.updateTask(task.id, { notified: true });
      }
      
      res.json(task);
    } catch (error) {
      console.error("[Tasks] Create error:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  app.post("/api/tasks/:id/accept", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const task = await storage.getTask(req.params.id);
      if (!task) return res.status(404).json({ error: "Task not found" });
      
      // Update task with current user as assignee and mark as accepted
      const updated = await storage.updateTask(req.params.id, { 
        assignedTo: req.user!.id,
        acceptedAt: new Date().toISOString()
      });
      
      // Notify creator that task was accepted
      if (task.createdBy && task.createdBy !== req.user!.id) {
        const creator = await storage.getUser(task.createdBy);
        const acceptor = req.user!;
        
        if (creator && creator.telegramId) {
          const { sendTaskAcceptedNotification } = await import("./telegram-bot");
          sendTaskAcceptedNotification({
            taskId: task.id,
            taskTitle: task.title,
            acceptorName: acceptor.name,
            creatorTelegramId: creator.telegramId,
          }).catch(err => console.error("[Tasks] Accept notification error:", err));
        }
      }
      
      res.json(updated);
    } catch (error) {
      console.error("[Tasks] Accept error:", error);
      res.status(500).json({ error: "Failed to accept task" });
    }
  });

  app.post("/api/tasks/:id/complete", async (req, res) => {
    try {
      const { meta } = req.body || {};
      const updateData: { status: "done"; meta?: any } = { status: "done" };
      
      // If meta data provided (e.g., meter readings), include it
      if (meta) {
        updateData.meta = meta;
      }
      
      const task = await storage.updateTask(req.params.id, updateData);
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
      
      // Check if this is today - apply preparation time filter
      const today = new Date();
      const nowMinsk = new Date(today.getTime() + 3 * 60 * 60 * 1000); // UTC+3 Minsk timezone
      const todayStr = nowMinsk.toISOString().split("T")[0];
      const isToday = date === todayStr;
      
      // Calculate minimum start time for same-day booking (now + PREPARATION_TIMES.bath hours)
      let minStartHour = 0;
      if (isToday) {
        const prepHours = 2; // PREPARATION_TIMES.bath
        const minTime = new Date(nowMinsk.getTime() + prepHours * 60 * 60 * 1000);
        minStartHour = minTime.getHours();
        // Round up to next full hour
        if (minTime.getMinutes() > 0) minStartHour++;
      }
      
      for (const bathCode of ["B1", "B2"]) {
        const bathBookings = existingBookings.filter(b => 
          b.bathCode === bathCode && 
          !["cancelled", "expired"].includes(b.status)
        );
        
        for (let hour = 10; hour <= 19; hour++) {
          const startTime = `${hour.toString().padStart(2, "0")}:00`;
          const endTime = `${(hour + 3).toString().padStart(2, "0")}:00`;
          
          // Skip slots that don't meet preparation time requirement for same-day booking
          const tooEarlyForToday = isToday && hour < minStartHour;
          
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
            available: !isBlocked && !tooEarlyForToday && (hour + 3) <= 22,
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
      
      // Ensure required fields have defaults
      const bookingData = {
        ...req.body,
        payments: req.body.payments || { prepayment: null, eripPaid: 0, cashPaid: 0 },
        status: req.body.status || "pending_call",
      };
      
      const booking = await storage.createBathBooking(bookingData);
      res.json(booking);
    } catch (error) {
      console.error("[Routes] Failed to create bath booking:", error);
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

  // Mark bath booking as arrived - automatically links/creates guest profile
  app.post("/api/admin/bath-bookings/:id/arrive", async (req, res) => {
    try {
      const booking = await storage.markBathBookingArrived(req.params.id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Failed to mark arrival" });
    }
  });

  // Mark bath booking as no-show - updates guest no-show count
  app.post("/api/admin/bath-bookings/:id/no-show", async (req, res) => {
    try {
      const booking = await storage.markBathBookingNoShow(req.params.id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Failed to mark no-show" });
    }
  });

  // ============ GUESTS ============
  app.get("/api/guests", async (req, res) => {
    try {
      const guests = await storage.getGuests();
      res.json(guests);
    } catch (error) {
      res.status(500).json({ error: "Failed to get guests" });
    }
  });

  app.get("/api/guests/:id", async (req, res) => {
    try {
      const guest = await storage.getGuest(req.params.id);
      if (!guest) return res.status(404).json({ error: "Guest not found" });
      res.json(guest);
    } catch (error) {
      res.status(500).json({ error: "Failed to get guest" });
    }
  });

  app.get("/api/guests/by-phone/:phone", async (req, res) => {
    try {
      const phone = req.params.phone.replace(/\D/g, "");
      const guest = await storage.getGuestByPhone(phone);
      if (!guest) return res.status(404).json({ error: "Guest not found" });
      res.json(guest);
    } catch (error) {
      res.status(500).json({ error: "Failed to get guest" });
    }
  });

  const updateGuestSchema = z.object({
    notes: z.string().optional(),
    rating: GuestRating.optional(),
    isBlacklisted: z.boolean().optional(),
  });

  app.patch("/api/guests/:id", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const parsed = updateGuestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request body", details: parsed.error.format() });
      }
      const { notes, rating, isBlacklisted } = parsed.data;
      const guest = await storage.updateGuest(req.params.id, { 
        notes, 
        rating, 
        isBlacklisted 
      });
      if (!guest) return res.status(404).json({ error: "Guest not found" });
      res.json(guest);
    } catch (error) {
      res.status(500).json({ error: "Failed to update guest" });
    }
  });

  // ============ QUADS - GUEST ============
  // Get available slots for a date with route type pricing info
  // Support both /api/guest/quads/availability/:date and /api/guest/quads/availability?date=...
  app.get("/api/guest/quads/availability/:date?", async (req, res) => {
    try {
      const date = req.params.date || (req.query.date as string);
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
      
      // Check if this is today - apply preparation time filter
      const today = new Date();
      const nowMinsk = new Date(today.getTime() + 3 * 60 * 60 * 1000); // UTC+3 Minsk timezone
      const todayStr = nowMinsk.toISOString().split("T")[0];
      const isToday = date === todayStr;
      
      // Calculate minimum start time for same-day booking (now + PREPARATION_TIMES.quad hours)
      let minStartTime = "00:00";
      if (isToday) {
        const prepHours = 2; // PREPARATION_TIMES.quad
        const minTime = new Date(nowMinsk.getTime() + prepHours * 60 * 60 * 1000);
        minStartTime = minTime.toTimeString().slice(0, 5);
      }
      
      // Get all bookings for the date to check for overlaps
      const allBookings = await storage.getQuadBookingsForDate(date);
      const activeBookings = allBookings.filter(b => b.status !== "cancelled");
      
      // Helper to convert time string to minutes
      const timeToMinutes = (time: string) => {
        const [h, m] = time.split(":").map(Number);
        return h * 60 + m;
      };
      
      // Helper to check if a proposed booking overlaps with any existing booking
      // Returns the overlapping booking if found, null otherwise
      const findOverlappingBooking = (startTime: string, duration: number) => {
        const newStart = timeToMinutes(startTime);
        const newEnd = newStart + duration + 15; // 15 min buffer after new booking
        
        return activeBookings.find(booking => {
          const bookingStart = timeToMinutes(booking.startTime);
          const bookingDuration = booking.routeType === "long" ? 60 : 30;
          const bookingEnd = bookingStart + bookingDuration + 15; // 15 min buffer after existing booking
          
          // Check overlap: newStart < bookingEnd AND newEnd > bookingStart
          return newStart < bookingEnd && newEnd > bookingStart;
        });
      };
      
      // Helper to check if there's a booking at EXACTLY this start time
      const findExactTimeBooking = (startTime: string) => {
        return activeBookings.find(b => b.startTime === startTime);
      };
      
      // Generate available time slots (09:00 - 19:00)
      const availableSlots: Array<{
        startTime: string;
        routeType: "short" | "long";
        price: number;
        availableQuads: number;
        hasDiscount: boolean;
        discountPrice?: number;
        joinExisting?: boolean;
        existingRouteType?: "short" | "long";
      }> = [];
      
      for (let hour = 9; hour < 19; hour++) {
        for (let min = 0; min < 60; min += 30) {
          const startTime = `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
          
          // Skip slots that don't meet preparation time requirement for same-day booking
          if (isToday && startTime < minStartTime) continue;
          
          // Check if time is blocked by instructor
          const isBlocked = blockedTimes.some(bt => {
            if (!bt.startTime) return true; // Whole day blocked
            return startTime >= bt.startTime && startTime < (bt.endTime || "23:59");
          });
          
          if (isBlocked) continue;
          
          // Check if this exact start time has an existing booking
          const exactSlotBooking = findExactTimeBooking(startTime);
          
          if (exactSlotBooking) {
            // There's an existing booking at this exact time - only offer join option
            const existingSlot = slots.find(s => s.startTime === startTime && s.routeType === exactSlotBooking.routeType);
            const availableQuads = existingSlot ? 4 - existingSlot.bookedQuads : 4;
            
            if (availableQuads > 0) {
              const price = exactSlotBooking.routeType === "long" ? 80 : 50;
              availableSlots.push({
                startTime,
                routeType: exactSlotBooking.routeType,
                price,
                availableQuads,
                hasDiscount: true, // Always discount for joining
                discountPrice: Math.round(price * 0.95),
                joinExisting: true,
                existingRouteType: exactSlotBooking.routeType,
              });
            }
          } else {
            // No booking at this exact time - check for overlap with ANY existing bookings
            // This handles off-grid bookings (e.g., admin created 10:15 booking)
            
            // Check short route (30 min)
            const shortOverlap = findOverlappingBooking(startTime, 30);
            if (shortOverlap) {
              // Overlapping booking found - check if we can offer join option
              if (shortOverlap.startTime === startTime && shortOverlap.routeType === "short") {
                // Exact match - offer join (shouldn't happen since we checked exactSlotBooking)
                const existingSlot = slots.find(s => s.startTime === startTime && s.routeType === "short");
                const availableQuads = existingSlot ? 4 - existingSlot.bookedQuads : 4;
                if (availableQuads > 0) {
                  availableSlots.push({
                    startTime,
                    routeType: "short",
                    price: 50,
                    availableQuads,
                    hasDiscount: true,
                    discountPrice: Math.round(50 * 0.95),
                    joinExisting: true,
                    existingRouteType: "short",
                  });
                }
              }
              // else: slot is blocked due to overlap with different time/route - don't add
            } else {
              // No overlap - short route is available
              availableSlots.push({
                startTime,
                routeType: "short",
                price: 50,
                availableQuads: 4,
                hasDiscount: false,
              });
            }
            
            // Check long route (60 min) - only if within operating hours
            if (hour < 18 || (hour === 18 && min === 0)) {
              const longOverlap = findOverlappingBooking(startTime, 60);
              if (longOverlap) {
                // Overlapping booking found - check if we can offer join option
                if (longOverlap.startTime === startTime && longOverlap.routeType === "long") {
                  // Exact match - offer join
                  const existingSlot = slots.find(s => s.startTime === startTime && s.routeType === "long");
                  const availableQuads = existingSlot ? 4 - existingSlot.bookedQuads : 4;
                  if (availableQuads > 0) {
                    availableSlots.push({
                      startTime,
                      routeType: "long",
                      price: 80,
                      availableQuads,
                      hasDiscount: true,
                      discountPrice: Math.round(80 * 0.95),
                      joinExisting: true,
                      existingRouteType: "long",
                    });
                  }
                }
                // else: slot is blocked due to overlap - don't add
              } else {
                // No overlap - long route is available
                availableSlots.push({
                  startTime,
                  routeType: "long",
                  price: 80,
                  availableQuads: 4,
                  hasDiscount: false,
                });
              }
            }
          }
        }
      }
      
      // Also add joinable slots for off-grid bookings (e.g., admin-created at 10:15)
      // These aren't on the standard 30-minute grid but guests should be able to join
      for (const booking of activeBookings) {
        // Check if this booking's start time is already in availableSlots
        const alreadyAdded = availableSlots.some(s => 
          s.startTime === booking.startTime && s.routeType === booking.routeType
        );
        
        if (!alreadyAdded) {
          // Check if time is blocked by instructor
          const isBlocked = blockedTimes.some(bt => {
            if (!bt.startTime) return true;
            return booking.startTime >= bt.startTime && booking.startTime < (bt.endTime || "23:59");
          });
          
          if (!isBlocked) {
            // Skip if past prep time for today
            if (isToday && booking.startTime < minStartTime) continue;
            
            const existingSlot = slots.find(s => 
              s.startTime === booking.startTime && s.routeType === booking.routeType
            );
            const availableQuads = existingSlot ? 4 - existingSlot.bookedQuads : 4;
            
            if (availableQuads > 0) {
              const price = booking.routeType === "long" ? 80 : 50;
              availableSlots.push({
                startTime: booking.startTime,
                routeType: booking.routeType,
                price,
                availableQuads,
                hasDiscount: true,
                discountPrice: Math.round(price * 0.95),
                joinExisting: true,
                existingRouteType: booking.routeType,
              });
            }
          }
        }
      }
      
      // Sort slots by time
      availableSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
      
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
      
      // Check availability - instructor is the limiting resource
      const existingBookings = await storage.getQuadBookingsForDate(date);
      const activeBookings = existingBookings.filter(b => b.status !== "cancelled");
      
      // Helper to convert time string to minutes
      const timeToMinutes = (time: string) => {
        const [h, m] = time.split(":").map(Number);
        return h * 60 + m;
      };
      
      const newDuration = routeType === "long" ? 60 : 30;
      const newStart = timeToMinutes(startTime);
      const newEnd = newStart + newDuration + 15; // 15 min buffer
      
      // Check if there's an existing booking at the exact same time
      const sameTimeBookings = activeBookings.filter(b => b.startTime === startTime);
      
      if (sameTimeBookings.length > 0) {
        // There are bookings at this time - must join the existing group
        const existingBooking = sameTimeBookings[0];
        
        // Can only join same route type
        if (existingBooking.routeType !== routeType) {
          return res.status(400).json({ 
            error: `На это время уже есть бронь на ${existingBooking.routeType === "long" ? "большой" : "малый"} маршрут. Вы можете присоединиться к группе.` 
          });
        }
        
        // Check if there are enough quads left
        const bookedQuads = sameTimeBookings.reduce((sum, b) => sum + b.quadsCount, 0);
        if (bookedQuads + quadsCount > 4) {
          return res.status(400).json({ 
            error: `Доступно только ${4 - bookedQuads} квадроцикл(ов) на это время` 
          });
        }
      } else {
        // No booking at this exact time - check for overlaps with other bookings
        const overlappingBooking = activeBookings.find(booking => {
          const bookingStart = timeToMinutes(booking.startTime);
          const bookingDuration = booking.routeType === "long" ? 60 : 30;
          const bookingEnd = bookingStart + bookingDuration + 15; // 15 min buffer
          
          return newStart < bookingEnd && newEnd > bookingStart;
        });
        
        if (overlappingBooking) {
          return res.status(400).json({ 
            error: `Время пересекается с другим бронированием (${overlappingBooking.startTime}, ${overlappingBooking.routeType === "long" ? "большой" : "малый"} маршрут). Инструктор будет занят.` 
          });
        }
      }
      
      // Determine if this is joining an existing group (for discount)
      const isJoiningGroup = sameTimeBookings.length > 0;
      
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
        slotId: isJoiningGroup ? `${startTime}-${routeType}` : undefined,
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

  // ============ INSTRUCTOR EXPENSES ============
  app.get("/api/instructor/expenses", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      let expenses;
      if (startDate && endDate) {
        expenses = await storage.getInstructorExpensesForPeriod(
          startDate as string, 
          endDate as string
        );
      } else {
        expenses = await storage.getInstructorExpenses();
      }
      res.json(expenses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch expenses" });
    }
  });

  app.post("/api/instructor/expenses", async (req, res) => {
    try {
      const { date, category, amount, description, createdBy } = req.body;
      if (!date || !category || !amount || !description || !createdBy) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const expense = await storage.createInstructorExpense({
        date,
        category,
        amount: parseFloat(amount),
        description,
        createdBy,
      });
      res.json(expense);
    } catch (error) {
      res.status(500).json({ error: "Failed to create expense" });
    }
  });

  app.delete("/api/instructor/expenses/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteInstructorExpense(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Expense not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete expense" });
    }
  });

  // Get instructor financial summary (revenue + expenses)
  app.get("/api/instructor/finances", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "Start and end dates are required" });
      }
      
      // Get completed quad bookings for period
      const allBookings = await storage.getQuadBookingsUpcoming();
      const periodBookings = allBookings.filter(b => 
        b.date >= (startDate as string) && 
        b.date <= (endDate as string) &&
        b.status === "completed"
      );
      
      // Calculate revenue
      const revenue = periodBookings.reduce((sum, b) => sum + b.pricing.total, 0);
      const bookingsCount = periodBookings.length;
      const quadsCount = periodBookings.reduce((sum, b) => sum + b.quadsCount, 0);
      
      // Get expenses for period
      const expenses = await storage.getInstructorExpensesForPeriod(
        startDate as string,
        endDate as string
      );
      const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
      
      // Group expenses by category
      const expensesByCategory = expenses.reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
      }, {} as Record<string, number>);
      
      res.json({
        period: { startDate, endDate },
        revenue,
        bookingsCount,
        quadsCount,
        totalExpenses,
        expensesByCategory,
        expenses,
        netProfit: revenue - totalExpenses,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch financial data" });
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
  // Helper to ensure permanent shift exists
  async function ensurePermanentShift(): Promise<import("@shared/schema").CashShift> {
    let currentShift = await storage.getCurrentShift();
    if (!currentShift) {
      currentShift = await storage.createCashShift({
        openedBy: "system",
      });
    }
    return currentShift;
  }

  app.get("/api/cash/shift/current", async (req, res) => {
    try {
      // Auto-create permanent shift if none exists
      const currentShift = await ensurePermanentShift();
      
      // Get transactions since last incasation (storage already excludes incasation cash_outs)
      const transactions = await storage.getCashTransactionsSinceLastIncasation();
      
      // Calculate balance: cash_in adds, expense subtracts
      const balance = transactions.reduce((sum, tx) => {
        if (tx.type === "cash_in") return sum + tx.amount;
        if (tx.type === "expense") return sum - tx.amount;
        return sum;
      }, 0);
      
      res.json({ 
        currentShift, 
        transactions, 
        balance,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch shift" });
    }
  });

  app.post("/api/cash/transactions", async (req, res) => {
    try {
      // Ensure shift exists for transactions
      const shift = await ensurePermanentShift();
      const tx = await storage.createCashTransaction({
        ...req.body,
        shiftId: req.body.shiftId || shift.id,
        createdBy: req.body.createdBy || "admin",
      });
      
      // Send financial notification to SUPER_ADMIN
      if (tx.type === "cash_in" || tx.type === "expense") {
        sendFinancialNotification({
          type: tx.type === "cash_in" ? "income" : "expense",
          amount: tx.amount,
          comment: tx.comment || undefined,
          category: tx.category || undefined,
        }).catch(err => console.error("[Cash] Failed to send notification:", err));
      }
      
      res.json(tx);
    } catch (error) {
      res.status(500).json({ error: "Failed to create transaction" });
    }
  });

  // Incasation - only OWNER/SUPER_ADMIN can perform (resets balance to zero)
  app.post("/api/cash/shift/incasation", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const currentShift = await ensurePermanentShift();
      
      // Get balance since last incasation (storage already excludes incasation cash_outs)
      const transactions = await storage.getCashTransactionsSinceLastIncasation();
      const balance = transactions.reduce((sum, tx) => {
        if (tx.type === "cash_in") return sum + tx.amount;
        if (tx.type === "expense") return sum - tx.amount;
        return sum;
      }, 0);
      
      const user = (req as any).user;
      
      // Record transfer_to_owner transaction for incasation amount (if positive)
      // This is NOT an expense - it's a transfer from admin cash box to owner cash box
      if (balance > 0) {
        await storage.createCashTransaction({
          shiftId: currentShift.id,
          type: "transfer_to_owner",
          amount: balance,
          comment: "Инкассация - перевод собственнику",
          createdBy: user?.id || "owner",
        });
      }
      
      // Shift stays open - no closing
      res.json({ success: true, amount: balance, message: "Инкассация выполнена" });
    } catch (error) {
      res.status(500).json({ error: "Failed to perform incasation" });
    }
  });

  // ============ INCASATION (Owner) ============
  app.get("/api/owner/incasation/preview", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const preview = await storage.getIncasationPreview();
      res.json(preview);
    } catch (error) {
      res.status(500).json({ error: "Failed to get incasation preview" });
    }
  });

  app.post("/api/owner/incasation/perform", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const preview = await storage.getIncasationPreview();
      
      // Ensure permanent shift exists
      const currentShift = await ensurePermanentShift();
      
      // Record transfer_to_owner for incasation (if there's cash to collect)
      // This is NOT an expense - it's a transfer from admin cash box to owner cash box
      if (preview.cashOnHand > 0) {
        await storage.createCashTransaction({
          shiftId: currentShift.id,
          type: "transfer_to_owner",
          amount: preview.cashOnHand,
          comment: "Инкассация - перевод собственнику",
          createdBy: user.id,
        });
      }
      
      // Create incasation record (shift stays open)
      const incasation = await storage.createIncasation({
        performedAt: new Date().toISOString(),
        performedBy: user.id,
        periodStart: preview.periodStart,
        periodEnd: preview.periodEnd,
        summary: {
          totalRevenue: preview.totalRevenue,
          cashRevenue: preview.cashRevenue,
          eripRevenue: preview.eripRevenue,
          totalExpenses: preview.totalExpenses,
          cashOnHand: preview.cashOnHand,
          expensesByCategory: preview.expensesByCategory,
        },
        shiftsIncluded: [currentShift.id],
      });
      
      res.json(incasation);
    } catch (error) {
      res.status(500).json({ error: "Failed to perform incasation" });
    }
  });

  app.get("/api/owner/incasations", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const incasations = await storage.getIncasations();
      res.json(incasations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch incasations" });
    }
  });

  // Owner-to-admin transfer (owner gives money to admin, e.g. for salary payments)
  app.post("/api/owner/transfer-to-admin", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { amount, comment } = req.body;
      const user = (req as any).user;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      
      const currentShift = await ensurePermanentShift();
      
      // Create transfer_to_admin transaction - this adds money to admin cash box
      const transaction = await storage.createCashTransaction({
        shiftId: currentShift.id,
        type: "transfer_to_admin",
        amount,
        comment: comment || "Перевод от собственника",
        createdBy: user.id,
      });
      
      res.json(transaction);
    } catch (error) {
      console.error("Error creating transfer_to_admin:", error);
      res.status(500).json({ error: "Failed to create transfer" });
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
      const period = req.query.period as string || `month:${new Date().toISOString().slice(0, 7)}`;
      const summary = await storage.getAnalyticsSummary(period);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // Get periodic summaries (last completed week + current month)
  app.get("/api/owner/analytics/periodic", async (req, res) => {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Calculate last completed week (Monday 00:00 to Sunday 23:59)
      // Find the Monday of the current week
      const dayOfWeek = today.getDay();
      const daysToCurrentMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const currentMonday = new Date(today);
      currentMonday.setDate(today.getDate() - daysToCurrentMonday);
      
      // Last completed week starts 7 days before current Monday
      const lastMonday = new Date(currentMonday);
      lastMonday.setDate(currentMonday.getDate() - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      
      const lastWeekPeriod = `week:${lastMonday.toISOString().slice(0, 10)}`;
      
      // Current calendar month
      const currentMonthPeriod = `month:${now.toISOString().slice(0, 7)}`;
      
      const [lastWeek, currentMonth] = await Promise.all([
        storage.getAnalyticsSummary(lastWeekPeriod),
        storage.getAnalyticsSummary(currentMonthPeriod),
      ]);
      
      res.json({
        lastWeek: {
          ...lastWeek,
          periodLabel: `${lastMonday.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} - ${lastSunday.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`,
        },
        currentMonth: {
          ...currentMonth,
          periodLabel: now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch periodic analytics" });
    }
  });

  // Get transactions for a period (for analytics)
  app.get("/api/owner/analytics/transactions", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const period = req.query.period as string || `day:${new Date().toISOString().slice(0, 10)}`;
      const transactions = await storage.getCashTransactionsByPeriod(period);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // Get historical weeks for analytics
  app.get("/api/owner/analytics/weeks", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 12;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Find the Monday of the current week
      const dayOfWeek = today.getDay();
      const daysToCurrentMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const currentMonday = new Date(today);
      currentMonday.setDate(today.getDate() - daysToCurrentMonday);
      
      const weeks: Array<{
        periodStart: string;
        periodEnd: string;
        periodLabel: string;
        income: number;
        expenses: number;
        cashTotal: number;
        eripTotal: number;
        cottageRevenue: number;
        bathRevenue: number;
        quadRevenue: number;
      }> = [];
      
      // Go back 'limit' weeks, starting from last completed week
      for (let i = 1; i <= limit; i++) {
        const monday = new Date(currentMonday);
        monday.setDate(currentMonday.getDate() - (i * 7));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        
        const period = `week:${monday.toISOString().slice(0, 10)}`;
        const summary = await storage.getAnalyticsSummary(period);
        
        weeks.push({
          periodStart: monday.toISOString().slice(0, 10),
          periodEnd: sunday.toISOString().slice(0, 10),
          periodLabel: `${monday.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} - ${sunday.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`,
          income: summary.income || 0,
          expenses: summary.expenses || 0,
          cashTotal: summary.cashTotal,
          eripTotal: summary.eripTotal,
          cottageRevenue: summary.cottageRevenue,
          bathRevenue: summary.bathRevenue,
          quadRevenue: summary.quadRevenue,
        });
      }
      
      res.json(weeks);
    } catch (error) {
      console.error("[Analytics] Weeks error:", error);
      res.status(500).json({ error: "Failed to fetch weekly analytics" });
    }
  });

  // Get historical months for analytics
  app.get("/api/owner/analytics/months", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 12;
      const now = new Date();
      
      const months: Array<{
        periodStart: string;
        periodEnd: string;
        periodLabel: string;
        income: number;
        expenses: number;
        cashTotal: number;
        eripTotal: number;
        cottageRevenue: number;
        bathRevenue: number;
        quadRevenue: number;
      }> = [];
      
      // Go back 'limit' months, starting from current month
      for (let i = 0; i < limit; i++) {
        const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
        
        const period = `month:${targetDate.toISOString().slice(0, 7)}`;
        const summary = await storage.getAnalyticsSummary(period);
        
        months.push({
          periodStart: targetDate.toISOString().slice(0, 10),
          periodEnd: monthEnd.toISOString().slice(0, 10),
          periodLabel: targetDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
          income: summary.income || 0,
          expenses: summary.expenses || 0,
          cashTotal: summary.cashTotal,
          eripTotal: summary.eripTotal,
          cottageRevenue: summary.cottageRevenue,
          bathRevenue: summary.bathRevenue,
          quadRevenue: summary.quadRevenue,
        });
      }
      
      res.json(months);
    } catch (error) {
      console.error("[Analytics] Months error:", error);
      res.status(500).json({ error: "Failed to fetch monthly analytics" });
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
        const allBookings = await storage.getSpaBookings();
        const pendingByPhone = allBookings.filter((b: SpaBooking) => 
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
      console.error("[Routes] Failed to create SPA booking:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // ============ SPA BOOKINGS - OPS (with discount support) ============
  app.post("/api/ops/spa-bookings", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { spaResource, bookingType, date, startTime, endTime, durationHours, guestsCount, customer, comment, discountPercent } = req.body;
      
      if (!spaResource || !bookingType || !date || !startTime || !endTime) {
        return res.status(400).json({ error: "Неверные данные бронирования" });
      }

      const insertData = {
        spaResource,
        bookingType,
        date,
        startTime,
        endTime,
        durationHours: durationHours || 3,
        guestsCount: guestsCount || 4,
        customer: customer || { fullName: "", phone: "" },
        comment,
      };
      
      const parsed = insertSpaBookingSchema.safeParse(insertData);
      if (!parsed.success) {
        return res.status(400).json({ error: "Неверные данные бронирования" });
      }
      
      // Create booking with discount applied
      const booking = await storage.createSpaBookingWithDiscount(parsed.data, discountPercent || 0);
      
      console.log(`[NOTIFY] Новая SPA бронь (ops): ${spaResource} на ${date} ${startTime}`);
      
      res.json(booking);
    } catch (error) {
      console.error("[Ops SPA Booking] Error:", error);
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

  // Owner: Apply discount to SPA booking
  app.post("/api/owner/spa-bookings/:id/discount", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { discountPercent } = req.body;
      
      if (typeof discountPercent !== "number" || discountPercent < 0 || discountPercent > 100) {
        return res.status(400).json({ error: "Скидка должна быть от 0 до 100%" });
      }
      
      const existing = await storage.getSpaBooking(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Бронирование не найдено" });
      }
      
      const discountAmount = Math.round(existing.pricing.base * discountPercent / 100);
      const newTotal = existing.pricing.base - discountAmount;
      
      const booking = await storage.updateSpaBooking(req.params.id, {
        pricing: {
          ...existing.pricing,
          discountPercent,
          discountAmount,
          total: newTotal,
        },
      });
      
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Не удалось применить скидку" });
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

  // ============ ELECTRICITY METERS - OWNER ============
  app.get("/api/owner/electricity-meters", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const meters = await storage.getElectricityMeters();
      res.json(meters);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить счетчики" });
    }
  });

  app.post("/api/owner/electricity-meters", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { name, code, description } = req.body;
      if (!name || !code) {
        return res.status(400).json({ error: "Требуется название и код счетчика" });
      }
      const meter = await storage.createElectricityMeter({ name, code, description });
      res.json(meter);
    } catch (error) {
      res.status(500).json({ error: "Не удалось создать счетчик" });
    }
  });

  app.get("/api/owner/electricity-meters/:meterId/readings", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const readings = await storage.getElectricityReadings(req.params.meterId, limit);
      res.json(readings);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить показания" });
    }
  });

  app.post("/api/owner/electricity-meters/:meterId/readings", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { reading, note } = req.body;
      if (typeof reading !== "number") {
        return res.status(400).json({ error: "Требуется показание счетчика" });
      }
      const userId = (req as any).user?.id;
      const created = await storage.createElectricityReading({
        meterId: req.params.meterId,
        reading,
        recordedAt: new Date().toISOString(),
        note,
      }, userId);
      res.json(created);
    } catch (error) {
      res.status(500).json({ error: "Не удалось сохранить показание" });
    }
  });

  app.get("/api/owner/electricity-meters/:meterId/statistics", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const periodDays = req.query.days ? parseInt(req.query.days as string) : 30;
      const stats = await storage.getElectricityStatistics(req.params.meterId, periodDays);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить статистику" });
    }
  });

  // ============ COMPLETED TASKS - OWNER ============
  app.get("/api/owner/tasks/completed", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { fromDate, toDate } = req.query;
      const tasks = await storage.getCompletedTasks(
        fromDate as string | undefined,
        toDate as string | undefined
      );
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить выполненные задачи" });
    }
  });

  // ============ NOTIFICATION CONFIGS - SUPER_ADMIN ============
  app.get("/api/admin/notifications", authMiddleware, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const configs = await storage.getNotificationConfigs();
      res.json(configs);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить настройки уведомлений" });
    }
  });

  app.get("/api/admin/notifications/:id", authMiddleware, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const config = await storage.getNotificationConfig(req.params.id);
      if (!config) {
        return res.status(404).json({ error: "Уведомление не найдено" });
      }
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить настройки уведомления" });
    }
  });

  app.post("/api/admin/notifications", authMiddleware, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { title, description, cadence, cronExpression, actionType, targetChatId, enabled, metadata } = req.body;
      if (!title || !cadence || !cronExpression || !actionType) {
        return res.status(400).json({ error: "Требуются обязательные поля: title, cadence, cronExpression, actionType" });
      }
      const config = await storage.createNotificationConfig({
        title,
        description,
        cadence,
        cronExpression,
        actionType,
        targetChatId,
        enabled: enabled !== false,
        metadata,
      });
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Не удалось создать уведомление" });
    }
  });

  app.patch("/api/admin/notifications/:id", authMiddleware, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { title, description, cadence, cronExpression, actionType, targetChatId, enabled, metadata } = req.body;
      const updates: Record<string, any> = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (cadence !== undefined) updates.cadence = cadence;
      if (cronExpression !== undefined) updates.cronExpression = cronExpression;
      if (actionType !== undefined) updates.actionType = actionType;
      if (targetChatId !== undefined) updates.targetChatId = targetChatId;
      if (enabled !== undefined) updates.enabled = enabled;
      if (metadata !== undefined) updates.metadata = metadata;
      
      const updated = await storage.updateNotificationConfig(req.params.id, updates);
      if (!updated) {
        return res.status(404).json({ error: "Уведомление не найдено" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Не удалось обновить уведомление" });
    }
  });

  app.delete("/api/admin/notifications/:id", authMiddleware, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const deleted = await storage.deleteNotificationConfig(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Уведомление не найдено" });
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Не удалось удалить уведомление" });
    }
  });

  app.post("/api/admin/notifications/:id/toggle", authMiddleware, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "Требуется поле enabled (boolean)" });
      }
      const updated = await storage.toggleNotificationConfig(req.params.id, enabled);
      if (!updated) {
        return res.status(404).json({ error: "Уведомление не найдено" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Не удалось переключить уведомление" });
    }
  });

  app.post("/api/admin/notifications/initialize", authMiddleware, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      await storage.initializeDefaultNotifications();
      const configs = await storage.getNotificationConfigs();
      res.json(configs);
    } catch (error) {
      res.status(500).json({ error: "Не удалось инициализировать уведомления" });
    }
  });

  // Pin admin panel for all staff
  app.post("/api/admin/pin-admin-panel", authMiddleware, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      const result = await pinAdminPanelForAllStaff();
      res.json({
        success: true,
        message: `Закреплено: ${result.pinned}, пропущено: ${result.skipped}, ошибок: ${result.errors}`,
        ...result
      });
    } catch (error) {
      res.status(500).json({ error: "Не удалось закрепить панели" });
    }
  });

  // Manual bot cleanup trigger for testing
  app.post("/api/admin/bot-cleanup", authMiddleware, requireRole("SUPER_ADMIN"), async (req, res) => {
    try {
      await performNightlyCleanup();
      res.json({ success: true, message: "Очистка чатов выполнена" });
    } catch (error) {
      console.error("[Bot Cleanup] Error:", error);
      res.status(500).json({ error: "Не удалось выполнить очистку" });
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

  // ============ QUAD PRICING - INSTRUCTOR ============
  // Get all quad pricing (defaults + date overrides) - instructor only
  app.get("/api/instructor/quads/pricing", authMiddleware, requireRole("INSTRUCTOR", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const pricing = await storage.getQuadPricing();
      res.json(pricing);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить цены" });
    }
  });

  // Get price for specific route type and date - public endpoint for guests
  app.get("/api/quads/price", async (req, res) => {
    try {
      const { routeType, date } = req.query;
      if (!routeType || (routeType !== "short" && routeType !== "long")) {
        return res.status(400).json({ error: "Некорректный тип маршрута" });
      }
      const price = await storage.getQuadPriceForDate(routeType as "short" | "long", date as string | undefined);
      res.json({ routeType, date, price });
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить цену" });
    }
  });

  // Set quad pricing (default or date-specific) - instructor only
  app.post("/api/instructor/quads/pricing", authMiddleware, requireRole("INSTRUCTOR"), async (req, res) => {
    try {
      const { routeType, price, date } = req.body;
      
      if (!routeType || (routeType !== "short" && routeType !== "long")) {
        return res.status(400).json({ error: "Некорректный тип маршрута" });
      }
      
      if (typeof price !== "number" || price < 0) {
        return res.status(400).json({ error: "Некорректная цена" });
      }
      
      // Validate date format if provided
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "Некорректный формат даты (YYYY-MM-DD)" });
      }
      
      const pricing = await storage.setQuadPrice(
        { routeType, price, date: date || undefined },
        (req as any).userId
      );
      
      res.json(pricing);
    } catch (error) {
      res.status(500).json({ error: "Не удалось сохранить цену" });
    }
  });

  // Delete date-specific price override - instructor only
  app.delete("/api/instructor/quads/pricing/:id", authMiddleware, requireRole("INSTRUCTOR"), async (req, res) => {
    try {
      const deleted = await storage.deleteQuadPriceOverride(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Цена не найдена или это базовая цена (удалить нельзя)" });
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Не удалось удалить цену" });
    }
  });

  // ============ INSTRUCTOR QUAD CASH REGISTER ============
  // Get current quad shift
  app.get("/api/instructor/cash/shift/current", authMiddleware, requireRole("INSTRUCTOR"), async (req, res) => {
    try {
      const currentShift = await storage.getCurrentShift("quads");
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
      res.status(500).json({ error: "Failed to fetch quad shift" });
    }
  });

  // Open quad shift
  app.post("/api/instructor/cash/shift/open", authMiddleware, requireRole("INSTRUCTOR"), async (req, res) => {
    try {
      const existingShift = await storage.getCurrentShift("quads");
      if (existingShift) {
        return res.status(400).json({ error: "Смена квадроциклов уже открыта" });
      }
      
      const user = (req as any).user;
      const shift = await storage.createCashShift({
        openedBy: user?.id || "instructor",
      }, "quads");
      res.json(shift);
    } catch (error) {
      res.status(500).json({ error: "Failed to open quad shift" });
    }
  });

  // Add transaction to quad cash
  app.post("/api/instructor/cash/transactions", authMiddleware, requireRole("INSTRUCTOR"), async (req, res) => {
    try {
      const currentShift = await storage.getCurrentShift("quads");
      if (!currentShift) {
        return res.status(400).json({ error: "Нет открытой смены квадроциклов" });
      }
      
      const { type, amount, category, comment, incomeSource } = req.body;
      
      if (!type || !["cash_in", "expense"].includes(type)) {
        return res.status(400).json({ error: "Некорректный тип транзакции" });
      }
      
      if (typeof amount !== "number" || amount <= 0) {
        return res.status(400).json({ error: "Некорректная сумма" });
      }
      
      const user = (req as any).user;
      const tx = await storage.createCashTransaction({
        shiftId: currentShift.id,
        type,
        amount,
        category: category || null,
        comment: comment || null,
        incomeSource: incomeSource || null,
        createdBy: user?.id || "instructor",
        cashBox: "quads",
      });
      res.json(tx);
    } catch (error) {
      res.status(500).json({ error: "Failed to create transaction" });
    }
  });

  // Incasation for quad cash - only INSTRUCTOR can do this
  app.post("/api/instructor/cash/shift/incasation", authMiddleware, requireRole("INSTRUCTOR"), async (req, res) => {
    try {
      const currentShift = await storage.getCurrentShift("quads");
      if (!currentShift) {
        return res.status(400).json({ error: "Нет открытой смены квадроциклов" });
      }
      
      const transactions = await storage.getCashTransactions(currentShift.id);
      const balance = transactions.reduce((sum, tx) => {
        if (tx.type === "cash_in") return sum + tx.amount;
        if (tx.type === "expense" || tx.type === "cash_out") return sum - tx.amount;
        return sum;
      }, 0);
      
      const user = (req as any).user;
      if (balance > 0) {
        await storage.createCashTransaction({
          shiftId: currentShift.id,
          type: "cash_out",
          amount: balance,
          comment: "Инкассация квадроциклов",
          createdBy: user?.id || "instructor",
          cashBox: "quads",
        });
      }
      
      const closedShift = await storage.updateCashShift(currentShift.id, {
        isOpen: false,
        closedAt: new Date().toISOString(),
        visibleToAdmin: false,
        cashBox: "quads",
      });
      
      res.json(closedShift);
    } catch (error) {
      res.status(500).json({ error: "Failed to close quad shift" });
    }
  });

  // ============ INSTRUCTOR MANAGEMENT ============
  app.get("/api/instructors", authMiddleware, requireRole("INSTRUCTOR", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const users = await storage.getUsers();
      const instructors = users.filter(u => u.role === "INSTRUCTOR" && u.isActive);
      res.json(instructors);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить список инструкторов" });
    }
  });

  app.post("/api/instructors", authMiddleware, requireRole("INSTRUCTOR"), async (req, res) => {
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

  app.delete("/api/instructors/:id", authMiddleware, requireRole("INSTRUCTOR"), async (req, res) => {
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

  // ============ QUAD MAINTENANCE (SERVICE BOOK) ============
  
  // Get all quad machines
  app.get("/api/quads/machines", authMiddleware, requireRole("INSTRUCTOR", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const machines = await storage.getQuadMachines();
      res.json(machines);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить список квадроциклов" });
    }
  });

  // Create new quad machine
  app.post("/api/quads/machines", authMiddleware, requireRole("INSTRUCTOR"), async (req, res) => {
    try {
      const { code, name, ownerType, notes, commissioningDate } = req.body;
      
      if (!code || !name) {
        return res.status(400).json({ error: "Код и название обязательны" });
      }
      
      // Check for duplicate code
      const existing = await storage.getQuadMachines();
      if (existing.some(m => m.code === code)) {
        return res.status(400).json({ error: "Квадроцикл с таким кодом уже существует" });
      }
      
      const machine = await storage.createQuadMachine({
        code,
        name,
        ownerType: ownerType || "rental",
        isActive: true,
        currentMileageKm: 0,
        notes,
        commissioningDate,
      });
      
      res.json(machine);
    } catch (error) {
      res.status(500).json({ error: "Не удалось создать квадроцикл" });
    }
  });

  // Get maintenance statuses for all quads
  app.get("/api/quads/maintenance/statuses", authMiddleware, requireRole("INSTRUCTOR", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const statuses = await storage.getQuadMaintenanceStatuses();
      res.json(statuses);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить статусы ТО" });
    }
  });

  // Get maintenance status for a specific quad
  app.get("/api/quads/:quadId/maintenance/status", authMiddleware, requireRole("INSTRUCTOR", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const statuses = await storage.getQuadMaintenanceStatusesForQuad(req.params.quadId);
      res.json(statuses);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить статус ТО" });
    }
  });

  // Get mileage logs
  app.get("/api/quads/mileage", authMiddleware, requireRole("INSTRUCTOR", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const quadId = req.query.quadId as string | undefined;
      const logs = await storage.getQuadMileageLogs(quadId);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить журнал пробега" });
    }
  });

  // Log mileage after a ride
  app.post("/api/quads/mileage", authMiddleware, requireRole("INSTRUCTOR"), async (req, res) => {
    try {
      const { quadId, mileageKm, notes } = req.body;
      const user = (req as any).user;
      
      if (!quadId || typeof mileageKm !== "number" || mileageKm < 0) {
        return res.status(400).json({ error: "Неверные данные пробега" });
      }
      
      const machine = await storage.getQuadMachine(quadId);
      if (!machine) {
        return res.status(404).json({ error: "Квадроцикл не найден" });
      }
      
      if (mileageKm < machine.currentMileageKm) {
        return res.status(400).json({ error: "Новый пробег не может быть меньше текущего" });
      }
      
      const log = await storage.createQuadMileageLog({
        quadId,
        mileageKm,
        notes,
        loggedBy: user.id,
      });
      
      res.json(log);
    } catch (error) {
      res.status(500).json({ error: "Не удалось записать пробег" });
    }
  });

  // Get maintenance rules
  app.get("/api/quads/maintenance/rules", authMiddleware, requireRole("INSTRUCTOR", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const quadId = req.query.quadId as string | undefined;
      const rules = await storage.getQuadMaintenanceRules(quadId);
      res.json(rules);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить правила ТО" });
    }
  });

  // Create maintenance rule
  app.post("/api/quads/maintenance/rules", authMiddleware, requireRole("INSTRUCTOR"), async (req, res) => {
    try {
      const { quadId, title, description, triggerType, intervalKm, intervalDays, warningKm, warningDays } = req.body;
      const user = (req as any).user;
      
      if (!title || !triggerType || !["mileage", "time", "both"].includes(triggerType)) {
        return res.status(400).json({ error: "Неверные данные правила" });
      }
      
      if (triggerType === "mileage" && (!intervalKm || intervalKm <= 0)) {
        return res.status(400).json({ error: "Укажите интервал в км" });
      }
      
      if (triggerType === "time" && (!intervalDays || intervalDays <= 0)) {
        return res.status(400).json({ error: "Укажите интервал в днях" });
      }
      
      if (triggerType === "both" && ((!intervalKm || intervalKm <= 0) || (!intervalDays || intervalDays <= 0))) {
        return res.status(400).json({ error: "Укажите интервалы в км и днях" });
      }
      
      const rule = await storage.createQuadMaintenanceRule({
        quadId: quadId || null,
        title,
        description,
        triggerType,
        intervalKm: intervalKm || null,
        intervalDays: intervalDays || null,
        warningKm: warningKm || null,
        warningDays: warningDays || null,
        createdBy: user.id,
        isActive: true,
      });
      
      res.json(rule);
    } catch (error) {
      res.status(500).json({ error: "Не удалось создать правило ТО" });
    }
  });

  // Update maintenance rule
  app.patch("/api/quads/maintenance/rules/:id", authMiddleware, requireRole("INSTRUCTOR"), async (req, res) => {
    try {
      const rule = await storage.updateQuadMaintenanceRule(req.params.id, req.body);
      if (!rule) {
        return res.status(404).json({ error: "Правило не найдено" });
      }
      res.json(rule);
    } catch (error) {
      res.status(500).json({ error: "Не удалось обновить правило ТО" });
    }
  });

  // Delete maintenance rule
  app.delete("/api/quads/maintenance/rules/:id", authMiddleware, requireRole("INSTRUCTOR"), async (req, res) => {
    try {
      const deleted = await storage.deleteQuadMaintenanceRule(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Правило не найдено" });
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Не удалось удалить правило ТО" });
    }
  });

  // Get maintenance events (service history)
  app.get("/api/quads/maintenance/events", authMiddleware, requireRole("INSTRUCTOR", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const quadId = req.query.quadId as string | undefined;
      const events = await storage.getQuadMaintenanceEvents(quadId);
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Не удалось получить историю ТО" });
    }
  });

  // Record maintenance event
  app.post("/api/quads/maintenance/events", authMiddleware, requireRole("INSTRUCTOR"), async (req, res) => {
    try {
      const { quadId, ruleId, title, description, mileageKm, partsUsed, totalCost, performedAt } = req.body;
      const user = (req as any).user;
      
      if (!quadId || !title || typeof mileageKm !== "number") {
        return res.status(400).json({ error: "Неверные данные ТО" });
      }
      
      const machine = await storage.getQuadMachine(quadId);
      if (!machine) {
        return res.status(404).json({ error: "Квадроцикл не найден" });
      }
      
      const event = await storage.createQuadMaintenanceEvent({
        quadId,
        ruleId: ruleId || null,
        title,
        description,
        mileageKm,
        partsUsed,
        totalCost: totalCost || null,
        performedBy: user.id,
        performedAt: performedAt || new Date().toISOString(),
      });
      
      res.json(event);
    } catch (error) {
      res.status(500).json({ error: "Не удалось записать ТО" });
    }
  });

  // Update quad machine (name, notes, active status)
  app.patch("/api/quads/machines/:id", authMiddleware, requireRole("INSTRUCTOR"), async (req, res) => {
    try {
      const machine = await storage.updateQuadMachine(req.params.id, req.body);
      if (!machine) {
        return res.status(404).json({ error: "Квадроцикл не найден" });
      }
      res.json(machine);
    } catch (error) {
      res.status(500).json({ error: "Не удалось обновить квадроцикл" });
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

  // ============ LAUNDRY BATCHES ============
  // Get all laundry batches (ADMIN, OWNER, SUPER_ADMIN)
  app.get("/api/laundry/batches", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const batches = await storage.getLaundryBatches();
      res.json(batches);
    } catch (error) {
      console.error("[Laundry] Get batches error:", error);
      res.status(500).json({ error: "Ошибка загрузки партий" });
    }
  });

  // Create laundry batch
  app.post("/api/laundry/batches", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { unitCode, items, notes } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Необходимо добавить предметы" });
      }
      const batch = await storage.createLaundryBatch({ unitCode, items, notes }, req.user!.id);
      res.json(batch);
    } catch (error) {
      console.error("[Laundry] Create batch error:", error);
      res.status(500).json({ error: "Ошибка создания партии" });
    }
  });

  // Update laundry batch status
  app.patch("/api/laundry/batches/:id", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      // Add timestamp when status changes
      const now = new Date().toISOString();
      if (updates.status === "washing" && !updates.washStartedAt) {
        updates.washStartedAt = now;
      } else if (updates.status === "drying" && !updates.dryStartedAt) {
        updates.dryStartedAt = now;
      } else if (updates.status === "ready" && !updates.readyAt) {
        updates.readyAt = now;
      } else if (updates.status === "delivered" && !updates.deliveredAt) {
        updates.deliveredAt = now;
      }
      
      const batch = await storage.updateLaundryBatch(id, updates);
      if (!batch) {
        return res.status(404).json({ error: "Партия не найдена" });
      }
      res.json(batch);
    } catch (error) {
      console.error("[Laundry] Update batch error:", error);
      res.status(500).json({ error: "Ошибка обновления партии" });
    }
  });

  // ============ TEXTILE AUDITS ============
  // Get all textile audits (OWNER, SUPER_ADMIN only)
  app.get("/api/textile/audits", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const audits = await storage.getTextileAudits();
      res.json(audits);
    } catch (error) {
      console.error("[Textile] Get audits error:", error);
      res.status(500).json({ error: "Ошибка загрузки аудитов" });
    }
  });

  // Create textile audit (ADMIN, OWNER, SUPER_ADMIN)
  app.post("/api/textile/audits", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { date, location, items, notes } = req.body;
      if (!date || !location || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Необходимо заполнить все поля" });
      }
      const audit = await storage.createTextileAudit({ date, location, items, notes }, req.user!.id);
      res.json(audit);
    } catch (error) {
      console.error("[Textile] Create audit error:", error);
      res.status(500).json({ error: "Ошибка создания аудита" });
    }
  });

  // ============ TEXTILE STOCK INVENTORY ============
  
  // Get all textile stock
  app.get("/api/textile/stock", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const stock = await storage.getTextileStock();
      res.json(stock);
    } catch (error) {
      console.error("[Textile] Get stock error:", error);
      res.status(500).json({ error: "Ошибка загрузки инвентаря" });
    }
  });

  // Get stock summary (grouped by location)
  app.get("/api/textile/stock/summary", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const summary = await storage.getTextileStockSummary();
      res.json(summary);
    } catch (error) {
      console.error("[Textile] Get stock summary error:", error);
      res.status(500).json({ error: "Ошибка загрузки сводки инвентаря" });
    }
  });

  // Initialize warehouse stock (first-time setup)
  app.post("/api/textile/stock/init", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Необходимо указать items" });
      }
      await storage.initWarehouseStock(items, req.user!.id);
      res.json({ ok: true, message: "Склад инициализирован" });
    } catch (error) {
      console.error("[Textile] Init stock error:", error);
      res.status(500).json({ error: "Ошибка инициализации склада" });
    }
  });

  // Manual stock adjustment
  app.post("/api/textile/stock/adjust", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { location, type, color, quantity, notes } = req.body;
      if (!location || !type || !color || quantity === undefined) {
        return res.status(400).json({ error: "Необходимо заполнить все поля" });
      }
      const updated = await storage.upsertTextileStock(location, type, color, quantity, req.user!.id);
      
      // Log adjustment event
      await storage.createTextileEvent({
        eventType: "adjustment",
        toLocation: location,
        items: [{ type, color, quantity }],
        notes: notes || "Ручная корректировка",
      }, req.user!.id);
      
      res.json(updated);
    } catch (error) {
      console.error("[Textile] Adjust stock error:", error);
      res.status(500).json({ error: "Ошибка корректировки остатков" });
    }
  });

  // ============ TEXTILE CHECK-INS (Guest arrivals) ============
  
  // Get all check-ins
  app.get("/api/textile/check-ins", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const checkIns = await storage.getTextileCheckIns();
      res.json(checkIns);
    } catch (error) {
      console.error("[Textile] Get check-ins error:", error);
      res.status(500).json({ error: "Ошибка загрузки заселений" });
    }
  });

  // Create check-in (move textiles from warehouse to unit)
  app.post("/api/textile/check-ins", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { unitCode, beddingSets, towelSets, robes, notes } = req.body;
      if (!unitCode || !beddingSets || !Array.isArray(beddingSets) || towelSets === undefined) {
        return res.status(400).json({ error: "Необходимо заполнить все поля" });
      }
      
      // Validate unit code
      const validUnits = ["D1", "D2", "D3", "D4"];
      if (!validUnits.includes(unitCode)) {
        return res.status(400).json({ error: "Неверный код домика" });
      }
      
      // Validate bedding sets
      const validColors = ["white", "grey_light", "grey_dark"];
      for (const set of beddingSets) {
        if (!set.color || !validColors.includes(set.color) || !set.count || set.count < 1) {
          return res.status(400).json({ error: "Неверный формат комплекта белья" });
        }
      }
      
      // Validate bedding sets count based on unit
      const totalBeddingSets = beddingSets.reduce((sum: number, s: any) => sum + s.count, 0);
      const maxSets = unitCode === "D4" ? 3 : 2;
      if (totalBeddingSets > maxSets) {
        return res.status(400).json({ error: `Максимум ${maxSets} комплектов для ${unitCode}` });
      }
      if (totalBeddingSets < 1) {
        return res.status(400).json({ error: "Нужен минимум 1 комплект белья" });
      }
      
      // Validate towel sets
      if (towelSets < 1 || towelSets > 6) {
        return res.status(400).json({ error: "Количество комплектов полотенец: от 1 до 6" });
      }
      
      // Validate robes
      const robesCount = robes || 0;
      if (robesCount < 0 || robesCount > 6) {
        return res.status(400).json({ error: "Количество халатов: от 0 до 6" });
      }
      
      const checkIn = await storage.createTextileCheckIn({
        unitCode,
        beddingSets,
        towelSets,
        robes: robesCount,
        notes,
      }, req.user!.id);
      
      res.json(checkIn);
    } catch (error: any) {
      console.error("[Textile] Create check-in error:", error);
      // Return error message from storage (e.g., stock shortage)
      if (error.message && error.message.includes("Недостаточно")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Ошибка создания заселения" });
    }
  });

  // Mark textiles as dirty (move from unit to laundry)
  app.post("/api/textile/mark-dirty", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { unitCode, notes } = req.body;
      if (!unitCode) {
        return res.status(400).json({ error: "Необходимо указать unitCode" });
      }
      await storage.markTextileDirty(unitCode, req.user!.id, notes);
      res.json({ ok: true, message: "Бельё отмечено как грязное" });
    } catch (error) {
      console.error("[Textile] Mark dirty error:", error);
      res.status(500).json({ error: "Ошибка отметки грязного белья" });
    }
  });

  // Mark textiles as clean (move from laundry to warehouse)
  app.post("/api/textile/mark-clean", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { items, notes } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Необходимо указать items" });
      }
      await storage.markTextileClean(items, req.user!.id, notes);
      res.json({ ok: true, message: "Бельё возвращено на склад" });
    } catch (error) {
      console.error("[Textile] Mark clean error:", error);
      res.status(500).json({ error: "Ошибка возврата белья на склад" });
    }
  });

  // Get textile events (audit log)
  app.get("/api/textile/events", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const events = await storage.getTextileEvents(limit);
      res.json(events);
    } catch (error) {
      console.error("[Textile] Get events error:", error);
      res.status(500).json({ error: "Ошибка загрузки истории" });
    }
  });

  // ============ SUPPLIES/CONSUMABLES ============
  
  app.get("/api/supplies", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const supplies = await storage.getSupplies();
      res.json(supplies);
    } catch (error) {
      console.error("[Supplies] Get error:", error);
      res.status(500).json({ error: "Ошибка загрузки расходников" });
    }
  });
  
  app.get("/api/supplies/low-stock", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const supplies = await storage.getLowStockSupplies();
      res.json(supplies);
    } catch (error) {
      console.error("[Supplies] Get low stock error:", error);
      res.status(500).json({ error: "Ошибка загрузки расходников с низким запасом" });
    }
  });
  
  app.post("/api/supplies", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const supply = await storage.createSupply(req.body);
      res.status(201).json(supply);
    } catch (error) {
      console.error("[Supplies] Create error:", error);
      res.status(500).json({ error: "Ошибка создания расходника" });
    }
  });
  
  app.patch("/api/supplies/:id", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const supply = await storage.updateSupply(req.params.id, req.body);
      if (!supply) return res.status(404).json({ error: "Расходник не найден" });
      res.json(supply);
    } catch (error) {
      console.error("[Supplies] Update error:", error);
      res.status(500).json({ error: "Ошибка обновления расходника" });
    }
  });
  
  app.delete("/api/supplies/:id", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      await storage.deleteSupply(req.params.id);
      res.json({ ok: true });
    } catch (error) {
      console.error("[Supplies] Delete error:", error);
      res.status(500).json({ error: "Ошибка удаления расходника" });
    }
  });
  
  app.get("/api/supplies/:id/transactions", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const transactions = await storage.getSupplyTransactions(req.params.id);
      res.json(transactions);
    } catch (error) {
      console.error("[Supplies] Get transactions error:", error);
      res.status(500).json({ error: "Ошибка загрузки транзакций" });
    }
  });
  
  app.post("/api/supplies/:id/transactions", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { quantity, type, note } = req.body;
      const transaction = await storage.createSupplyTransaction({
        supplyId: req.params.id,
        quantity,
        type,
        note,
      }, req.user!.id);
      res.status(201).json(transaction);
    } catch (error) {
      console.error("[Supplies] Create transaction error:", error);
      res.status(500).json({ error: "Ошибка создания транзакции" });
    }
  });

  // ============ INCIDENTS/REPAIRS ============
  
  app.get("/api/incidents", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const incidents = await storage.getIncidents();
      res.json(incidents);
    } catch (error) {
      console.error("[Incidents] Get error:", error);
      res.status(500).json({ error: "Ошибка загрузки инцидентов" });
    }
  });
  
  app.get("/api/incidents/unit/:unitCode", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const incidents = await storage.getIncidentsByUnit(req.params.unitCode);
      res.json(incidents);
    } catch (error) {
      console.error("[Incidents] Get by unit error:", error);
      res.status(500).json({ error: "Ошибка загрузки инцидентов" });
    }
  });
  
  app.post("/api/incidents", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const incident = await storage.createIncident(req.body, req.user!.id);
      res.status(201).json(incident);
    } catch (error) {
      console.error("[Incidents] Create error:", error);
      res.status(500).json({ error: "Ошибка создания инцидента" });
    }
  });
  
  app.patch("/api/incidents/:id", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const incident = await storage.updateIncident(req.params.id, req.body);
      if (!incident) return res.status(404).json({ error: "Инцидент не найден" });
      res.json(incident);
    } catch (error) {
      console.error("[Incidents] Update error:", error);
      res.status(500).json({ error: "Ошибка обновления инцидента" });
    }
  });

  // ============ STAFF SHIFTS ============
  
  app.get("/api/staff-shifts", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const { date, userId } = req.query;
      let shifts;
      if (date) {
        shifts = await storage.getStaffShiftsForDate(date as string);
      } else if (userId) {
        shifts = await storage.getStaffShiftsForUser(userId as string);
      } else {
        shifts = await storage.getStaffShifts();
      }
      res.json(shifts);
    } catch (error) {
      console.error("[StaffShifts] Get error:", error);
      res.status(500).json({ error: "Ошибка загрузки смен" });
    }
  });
  
  app.post("/api/staff-shifts", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const shift = await storage.createStaffShift(req.body, req.user!.id);
      res.status(201).json(shift);
    } catch (error) {
      console.error("[StaffShifts] Create error:", error);
      res.status(500).json({ error: "Ошибка создания смены" });
    }
  });
  
  app.delete("/api/staff-shifts/:id", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      await storage.deleteStaffShift(req.params.id);
      res.json({ ok: true });
    } catch (error) {
      console.error("[StaffShifts] Delete error:", error);
      res.status(500).json({ error: "Ошибка удаления смены" });
    }
  });

  // ============ UNIT INFO (QR CODES) ============
  
  app.get("/api/unit-info", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const unitInfos = await storage.getUnitInfos();
      res.json(unitInfos);
    } catch (error) {
      console.error("[UnitInfo] Get error:", error);
      res.status(500).json({ error: "Ошибка загрузки информации о юнитах" });
    }
  });
  
  app.get("/api/unit-info/:unitCode", async (req, res) => {
    try {
      const unitInfo = await storage.getUnitInfo(req.params.unitCode);
      if (!unitInfo) return res.status(404).json({ error: "Информация не найдена" });
      res.json(unitInfo);
    } catch (error) {
      console.error("[UnitInfo] Get by code error:", error);
      res.status(500).json({ error: "Ошибка загрузки информации" });
    }
  });
  
  const updateUnitInfoSchema = z.object({
    wifiName: z.string().optional(),
    wifiPassword: z.string().optional(),
    rules: z.string().max(2000).optional(), // Limit rules length for QR code safety
    contactPhone: z.string().optional(),
    contactTelegram: z.string().optional(),
    checkInTime: z.string().optional(),
    checkOutTime: z.string().optional(),
  });

  app.put("/api/unit-info/:unitCode", authMiddleware, requireRole("OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const parsed = updateUnitInfoSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request body", details: parsed.error.format() });
      }
      const unitInfo = await storage.upsertUnitInfo({
        unitCode: req.params.unitCode,
        ...parsed.data,
      });
      res.json(unitInfo);
    } catch (error) {
      console.error("[UnitInfo] Upsert error:", error);
      res.status(500).json({ error: "Ошибка сохранения информации" });
    }
  });

  // ============ SMART THERMOSTAT ============
  
  const thermostatPlanSchema = z.object({
    houseId: z.number().min(1).max(4),
    planType: z.enum(["CHECKIN_TODAY", "NO_CHECKIN", "GUESTS_STAYING"]),
  });

  app.get("/api/admin/thermostats/houses", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const houses = await storage.getThermostatHouses();
      const today = new Date().toISOString().split("T")[0];
      const plans = await storage.getThermostatDailyPlans(today);
      
      const { refreshThermostatStatus } = await import("./thermostat-provider");
      
      const result = await Promise.all(houses.map(async house => {
        try {
          const status = await refreshThermostatStatus(house.houseId);
          return {
            ...house,
            currentTemp: status?.currentTemp ?? house.currentTemp,
            targetTemp: status?.targetTemp ?? house.targetTemp,
            mode: status?.mode ?? house.mode,
            online: status?.online ?? house.online,
            lastUpdated: status ? new Date().toISOString() : house.lastUpdated,
            todayPlan: plans.find(p => p.houseId === house.houseId) || null,
          };
        } catch {
          return {
            ...house,
            todayPlan: plans.find(p => p.houseId === house.houseId) || null,
          };
        }
      }));
      
      res.json(result);
    } catch (error) {
      console.error("[Thermostat] Get houses error:", error);
      res.status(500).json({ error: "Ошибка загрузки термостатов" });
    }
  });

  app.post("/api/admin/thermostats/plan/today", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const plans = z.array(thermostatPlanSchema).safeParse(req.body);
      if (!plans.success) {
        return res.status(400).json({ error: "Invalid request body", details: plans.error.format() });
      }
      
      const today = new Date().toISOString().split("T")[0];
      const now = new Date().toISOString();
      const userId = (req as any).user?.id;
      
      const results = [];
      for (const plan of plans.data) {
        const result = await storage.upsertThermostatDailyPlan({
          date: today,
          houseId: plan.houseId,
          planType: plan.planType,
          setByAdminUserId: userId,
          setAt: now,
        });
        results.push(result);
      }
      
      res.json(results);
    } catch (error) {
      console.error("[Thermostat] Set plan error:", error);
      res.status(500).json({ error: "Ошибка сохранения плана" });
    }
  });

  app.post("/api/admin/thermostats/houses/:houseId/heat-now", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const houseId = parseInt(req.params.houseId, 10);
      if (isNaN(houseId) || houseId < 1 || houseId > 4) {
        return res.status(400).json({ error: "Invalid houseId (must be 1-4)" });
      }
      
      const { setThermostatTemp } = await import("./thermostat-provider");
      const userId = (req as any).user?.id;
      
      const success = await setThermostatTemp(houseId, 22, "Manual heat-now request", "MANUAL", userId);
      
      if (success) {
        res.json({ ok: true, message: `Домик ${houseId} начинает прогрев до 22°C` });
      } else {
        res.status(500).json({ error: "Не удалось установить температуру" });
      }
    } catch (error) {
      console.error("[Thermostat] Heat-now error:", error);
      res.status(500).json({ error: "Ошибка прогрева" });
    }
  });

  app.post("/api/admin/thermostats/houses/:houseId/set-temp", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const houseId = parseInt(req.params.houseId, 10);
      if (isNaN(houseId) || houseId < 1 || houseId > 4) {
        return res.status(400).json({ error: "Invalid houseId (must be 1-4)" });
      }
      
      const tempSchema = z.object({ temp: z.number().min(5).max(35) });
      const parsed = tempSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid temperature (must be 5-35)" });
      }
      
      const { setThermostatTemp } = await import("./thermostat-provider");
      const userId = (req as any).user?.id;
      
      const success = await setThermostatTemp(houseId, parsed.data.temp, "Manual temp set", "MANUAL", userId);
      
      if (success) {
        res.json({ ok: true, message: `Установлено ${parsed.data.temp}°C для домика ${houseId}` });
      } else {
        res.status(500).json({ error: "Не удалось установить температуру" });
      }
    } catch (error) {
      console.error("[Thermostat] Set-temp error:", error);
      res.status(500).json({ error: "Ошибка установки температуры" });
    }
  });

  app.get("/api/admin/thermostats/logs", authMiddleware, requireRole("ADMIN", "OWNER", "SUPER_ADMIN"), async (req, res) => {
    try {
      const houseId = req.query.houseId && req.query.houseId !== "null" 
        ? parseInt(req.query.houseId as string, 10) 
        : undefined;
      const date = req.query.date as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      
      const logs = await storage.getThermostatActionLogs(
        !isNaN(houseId as number) ? houseId : undefined, 
        date, 
        limit
      );
      res.json(logs);
    } catch (error) {
      console.error("[Thermostat] Get logs error:", error);
      res.status(500).json({ error: "Ошибка загрузки логов" });
    }
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
