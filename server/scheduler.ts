import cron from "node-cron";
import { storage } from "./storage";
import { log } from "./index";

const SHIFT_CLOSURE_CRON = "0 23 * * *";
const DAILY_TASKS_CRON = "0 6 * * *";
const WEEKLY_TASKS_CRON = "0 6 * * 1";
const MONTHLY_TASKS_CRON = "0 6 1 * *";
const CLOSURE_HOUR = 23;

interface ScheduledTask {
  title: string;
  type: "cleaning" | "climate_off" | "climate_on" | "trash_prep" | "meters" | "call_guest" | "other";
  unitCode?: string;
  checklist?: string[];
}

const DAILY_TASKS: ScheduledTask[] = [
  { title: "Утренний обход территории", type: "other", checklist: ["Проверка входа", "Осмотр парковки", "Проверка освещения"] },
  { title: "Подготовка дров", type: "other" },
  { title: "Вынос мусора", type: "trash_prep" },
];

const WEEKLY_TASKS: ScheduledTask[] = [
  { title: "Генеральная уборка домика 1", type: "cleaning", unitCode: "Д1" },
  { title: "Генеральная уборка домика 2", type: "cleaning", unitCode: "Д2" },
  { title: "Генеральная уборка домика 3", type: "cleaning", unitCode: "Д3" },
  { title: "Генеральная уборка домика 4", type: "cleaning", unitCode: "Д4" },
  { title: "Проверка инвентаря бань", type: "other", checklist: ["Веники", "Полотенца", "Шапки", "Ароматы"] },
  { title: "Осмотр квадроциклов", type: "other", checklist: ["Уровень масла", "Давление шин", "Тормоза"] },
];

const MONTHLY_TASKS: ScheduledTask[] = [
  { title: "Снятие показаний счетчиков", type: "meters", checklist: ["Электричество Д1-Д4", "Вода Д1-Д4", "Газ"] },
  { title: "Инвентаризация расходников", type: "other", checklist: ["Дрова", "Уголь", "Моющие средства", "Бумага"] },
  { title: "Профилактика оборудования", type: "other", checklist: ["Насосы", "Фильтры", "Котлы"] },
];

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

async function createScheduledTasks(tasks: ScheduledTask[], period: string): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  
  try {
    for (const task of tasks) {
      await storage.createTask({
        title: task.title,
        type: task.type,
        date: today,
        unitCode: task.unitCode,
        checklist: task.checklist,
        status: "open",
        createdBySystem: true,
      });
    }
    log(`Created ${tasks.length} ${period} task(s) for ${today}`, "scheduler");
  } catch (error) {
    console.error(`[Scheduler] Failed to create ${period} tasks:`, error);
  }
}

async function createDailyTasks(): Promise<void> {
  await createScheduledTasks(DAILY_TASKS, "daily");
}

async function createWeeklyTasks(): Promise<void> {
  await createScheduledTasks(WEEKLY_TASKS, "weekly");
}

async function createMonthlyTasks(): Promise<void> {
  await createScheduledTasks(MONTHLY_TASKS, "monthly");
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

  cron.schedule(DAILY_TASKS_CRON, async () => {
    log("Creating daily tasks at 06:00", "scheduler");
    await createDailyTasks();
  }, {
    timezone: "Europe/Minsk"
  });

  cron.schedule(WEEKLY_TASKS_CRON, async () => {
    log("Creating weekly tasks (Monday 06:00)", "scheduler");
    await createWeeklyTasks();
  }, {
    timezone: "Europe/Minsk"
  });

  cron.schedule(MONTHLY_TASKS_CRON, async () => {
    log("Creating monthly tasks (1st of month 06:00)", "scheduler");
    await createMonthlyTasks();
  }, {
    timezone: "Europe/Minsk"
  });

  log("Scheduler initialized:", "scheduler");
  log("  - Shift auto-closure: 23:00 daily", "scheduler");
  log("  - Daily tasks: 06:00 daily", "scheduler");
  log("  - Weekly tasks: 06:00 Monday", "scheduler");
  log("  - Monthly tasks: 06:00 1st of month", "scheduler");
}

export { createDailyTasks, createWeeklyTasks, createMonthlyTasks };
