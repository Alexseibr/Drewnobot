import cron from "node-cron";
import { storage } from "./storage";
import { log } from "./index";

const SHIFT_CLOSURE_CRON = "0 23 * * *";
const CLOSURE_HOUR = 23;

async function closeAllOpenShifts(): Promise<void> {
  try {
    const allShifts = await storage.getCashShifts();
    const openShifts = allShifts.filter(s => s.isOpen);
    
    if (openShifts.length === 0) {
      log("No open shifts to close", "scheduler");
      return;
    }

    const closedAt = new Date().toISOString();
    
    for (const shift of openShifts) {
      await storage.updateCashShift(shift.id, {
        isOpen: false,
        closedAt,
      });
      log(`Closed shift ${shift.id}`, "scheduler");
    }

    log(`Automatically closed ${openShifts.length} shift(s)`, "scheduler");
  } catch (error) {
    console.error("[Scheduler] Failed to close shifts:", error);
  }
}

async function checkMissedClosure(): Promise<void> {
  const now = new Date();
  const currentHour = now.getHours();
  
  try {
    const allShifts = await storage.getCashShifts();
    const openShifts = allShifts.filter(s => s.isOpen);
    
    if (openShifts.length === 0) return;
    
    for (const shift of openShifts) {
      const openedAt = new Date(shift.openedAt);
      const hoursSinceOpened = (now.getTime() - openedAt.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceOpened > 24) {
        log(`Shift ${shift.id} has been open for over 24 hours, closing now`, "scheduler");
        await storage.updateCashShift(shift.id, {
          isOpen: false,
          closedAt: now.toISOString(),
        });
        continue;
      }
      
      const openedDate = new Date(openedAt);
      openedDate.setHours(0, 0, 0, 0);
      
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      
      const todayClosure = new Date(now);
      todayClosure.setHours(CLOSURE_HOUR, 0, 0, 0);
      
      const yesterdayClosure = new Date(todayClosure);
      yesterdayClosure.setDate(yesterdayClosure.getDate() - 1);
      
      if (openedAt < yesterdayClosure) {
        log(`Shift ${shift.id} was opened before yesterday's 23:00, closing now`, "scheduler");
        await storage.updateCashShift(shift.id, {
          isOpen: false,
          closedAt: now.toISOString(),
        });
      } else if (currentHour >= CLOSURE_HOUR && openedAt < todayClosure) {
        log(`Shift ${shift.id} missed today's 23:00 closure, closing now`, "scheduler");
        await storage.updateCashShift(shift.id, {
          isOpen: false,
          closedAt: now.toISOString(),
        });
      } else if (currentHour < CLOSURE_HOUR && openedDate < todayStart) {
        log(`Shift ${shift.id} was opened yesterday and missed 23:00 closure, closing now`, "scheduler");
        await storage.updateCashShift(shift.id, {
          isOpen: false,
          closedAt: now.toISOString(),
        });
      }
    }
  } catch (error) {
    console.error("[Scheduler] Failed to check for missed closures:", error);
  }
}

export function initScheduler(): void {
  checkMissedClosure().then(() => {
    log("Checked for missed shift closures on startup", "scheduler");
  });

  cron.schedule(SHIFT_CLOSURE_CRON, async () => {
    log("Running scheduled shift closure at 23:00", "scheduler");
    await closeAllOpenShifts();
  }, {
    timezone: "Europe/Minsk"
  });

  log("Shift auto-closure scheduler initialized (23:00 Europe/Minsk daily)", "scheduler");
}
