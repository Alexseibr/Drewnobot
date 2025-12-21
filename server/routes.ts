import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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
  app.get("/api/guest/quads/availability", async (req, res) => {
    try {
      const date = req.query.date as string;
      if (!date) return res.status(400).json({ error: "Date is required" });
      
      const sessions = await storage.getQuadSessionsForDate(date);
      res.json(sessions.filter(s => s.status !== "blocked"));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  app.post("/api/guest/quad-bookings", async (req, res) => {
    try {
      const { sessionId, quadsCount } = req.body;
      
      const session = await storage.getQuadSession(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });
      
      const remaining = session.totalQuads - session.bookedQuads;
      if (quadsCount > remaining) {
        return res.status(400).json({ error: `Only ${remaining} quads available` });
      }
      
      const booking = await storage.createQuadBooking(req.body);
      res.json(booking);
    } catch (error) {
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // ============ QUADS - INSTRUCTOR ============
  app.get("/api/instructor/quad-schedule", async (req, res) => {
    try {
      const date = req.query.date as string || new Date().toISOString().split("T")[0];
      const sessions = await storage.getQuadSessionsForDate(date);
      
      const sessionsWithBookings = await Promise.all(
        sessions.map(async (session) => {
          const bookings = await storage.getQuadBookingsForSession(session.id);
          return { ...session, bookings };
        })
      );
      
      res.json({ sessions: sessionsWithBookings });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch schedule" });
    }
  });

  app.post("/api/instructor/quad-sessions", async (req, res) => {
    try {
      const session = await storage.createQuadSession({
        ...req.body,
        createdBy: req.body.createdBy || "instructor",
      });
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to create session" });
    }
  });

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

  app.post("/api/instructor/quad-bookings/:id/cancel", async (req, res) => {
    try {
      const booking = await storage.getQuadBooking(req.params.id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      
      const session = await storage.getQuadSession(booking.sessionId);
      if (session) {
        await storage.updateQuadSession(session.id, {
          bookedQuads: Math.max(0, session.bookedQuads - booking.quadsCount),
          status: "open",
        });
      }
      
      const updated = await storage.updateQuadBooking(req.params.id, { 
        status: "cancelled" 
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to cancel booking" });
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

  return httpServer;
}
