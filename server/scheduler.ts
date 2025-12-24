import cron from "node-cron";
import { storage } from "./storage";
import { log } from "./index";
import { 
  sendShiftReminder, 
  sendBathBookingsSummary, 
  sendClimateControlReminder,
  sendWeatherAlert,
  sendLaundryCheckInReminder
} from "./telegram-bot";

const SHIFT_CLOSURE_CRON = "0 23 * * *";
const DAILY_TASKS_CRON = "0 6 * * *";
const WEEKLY_TASKS_CRON = "0 6 * * 1";
const MONTHLY_TASKS_CRON = "0 6 1 * *";
const CLOSURE_HOUR = 23;

// Notification schedules (Minsk time)
const SHIFT_REMINDER_CRON = "30 8 * * *";       // 08:30 - Shift reminder
const BATH_SUMMARY_CRON = "0 9 * * *";          // 09:00 - Bath bookings
const CLIMATE_ON_CRON = "0 12 * * *";           // 12:00 - Climate control ON
const CLIMATE_OFF_CRON = "0 14 * * *";          // 14:00 - Climate control OFF
const LAUNDRY_REMINDER_CRON = "0 15 * * *";     // 15:00 - Laundry check-in reminder
const WEATHER_CHECK_CRON = "0 18 * * *";        // 18:00 - Weather forecast check

// Village Drewno coordinates (Polesie region)
const LOCATION_LAT = 51.87728;
const LOCATION_LON = 24.0249;
const FROST_THRESHOLD = 2; // Alert when min temp is below this (Celsius)

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

interface WeatherForecast {
  daily: {
    time: string[];
    temperature_2m_min: number[];
    temperature_2m_max: number[];
    precipitation_sum: number[];
  };
}

async function checkWeatherAndAlert(): Promise<void> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LOCATION_LAT}&longitude=${LOCATION_LON}&daily=temperature_2m_min,temperature_2m_max,precipitation_sum&timezone=Europe%2FMinsk&forecast_days=3`;
    
    const response = await fetch(url);
    if (!response.ok) {
      log(`Weather API error: ${response.status}`, "scheduler");
      return;
    }
    
    const data: WeatherForecast = await response.json();
    
    if (!data.daily || !data.daily.temperature_2m_min) {
      log("Invalid weather data received", "scheduler");
      return;
    }
    
    // Check for frost in next 3 days
    const frostAlerts: string[] = [];
    for (let i = 0; i < data.daily.time.length; i++) {
      const minTemp = data.daily.temperature_2m_min[i];
      const maxTemp = data.daily.temperature_2m_max[i];
      const date = data.daily.time[i];
      
      if (minTemp < FROST_THRESHOLD) {
        frostAlerts.push(`${date}: мин ${minTemp}°C, макс ${maxTemp}°C`);
      }
    }
    
    if (frostAlerts.length > 0) {
      log(`Frost warning detected! Sending alert.`, "scheduler");
      await sendWeatherAlert("frost", frostAlerts);
    } else {
      log("No frost warning needed", "scheduler");
    }
  } catch (error) {
    console.error("[Scheduler] Weather check failed:", error);
  }
}

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

  // ============ STAFF NOTIFICATIONS ============
  
  cron.schedule(SHIFT_REMINDER_CRON, async () => {
    log("Sending shift reminder (08:30)", "scheduler");
    await sendShiftReminder();
  }, {
    timezone: "Europe/Minsk"
  });

  cron.schedule(BATH_SUMMARY_CRON, async () => {
    log("Sending bath bookings summary (09:00)", "scheduler");
    await sendBathBookingsSummary();
  }, {
    timezone: "Europe/Minsk"
  });

  cron.schedule(CLIMATE_ON_CRON, async () => {
    log("Sending climate control reminder - ON (12:00)", "scheduler");
    await sendClimateControlReminder("on");
  }, {
    timezone: "Europe/Minsk"
  });

  cron.schedule(CLIMATE_OFF_CRON, async () => {
    log("Sending climate control reminder - OFF (14:00)", "scheduler");
    await sendClimateControlReminder("off");
  }, {
    timezone: "Europe/Minsk"
  });

  cron.schedule(LAUNDRY_REMINDER_CRON, async () => {
    log("Sending laundry check-in reminder (15:00)", "scheduler");
    await sendLaundryCheckInReminder();
  }, {
    timezone: "Europe/Minsk"
  });

  cron.schedule(WEATHER_CHECK_CRON, async () => {
    log("Checking weather forecast (18:00)", "scheduler");
    await checkWeatherAndAlert();
  }, {
    timezone: "Europe/Minsk"
  });

  log("Scheduler initialized:", "scheduler");
  log("  - Shift auto-closure: 23:00 daily", "scheduler");
  log("  - Daily tasks: 06:00 daily", "scheduler");
  log("  - Weekly tasks: 06:00 Monday", "scheduler");
  log("  - Monthly tasks: 06:00 1st of month", "scheduler");
  log("  - Weather check: 18:00 daily", "scheduler");
  log("  - Notifications:", "scheduler");
  log("    - Shift reminder: 08:30 daily", "scheduler");
  log("    - Bath summary: 09:00 daily", "scheduler");
  log("    - Climate ON: 12:00 daily", "scheduler");
  log("    - Climate OFF: 14:00 daily", "scheduler");
  log("    - Laundry check-in: 15:00 daily", "scheduler");
}

export { createDailyTasks, createWeeklyTasks, createMonthlyTasks };
