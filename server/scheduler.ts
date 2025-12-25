import cron from "node-cron";
import { storage } from "./storage";
import { log } from "./index";
import { 
  sendShiftReminder, 
  sendBathBookingsSummary, 
  sendClimateControlReminder,
  sendWeatherAlert,
  sendLaundryCheckInReminder,
  sendTaskNotification,
  sendThermostatPrompt,
  sendThermostatAlert
} from "./telegram-bot";
import { setThermostatTemp, refreshThermostatStatus } from "./thermostat-provider";
import type { ThermostatPlanType } from "@shared/schema";

const DAILY_TASKS_CRON = "0 6 * * *";
const WEEKLY_TASKS_CRON = "0 6 * * 1";
const MONTHLY_TASKS_CRON = "0 6 1 * *";

// Notification schedules (Minsk time)
const SHIFT_REMINDER_CRON = "30 8 * * *";       // 08:30 - Shift reminder
const BATH_SUMMARY_CRON = "0 9 * * *";          // 09:00 - Bath bookings
const CLIMATE_ON_CRON = "0 12 * * *";           // 12:00 - Climate control ON
const CLIMATE_OFF_CRON = "0 14 * * *";          // 14:00 - Climate control OFF
const LAUNDRY_REMINDER_CRON = "0 15 * * *";     // 15:00 - Laundry check-in reminder
const WEATHER_CHECK_CRON = "0 18 * * *";        // 18:00 - Weather forecast check
const SCHEDULED_TASK_CHECK_CRON = "* * * * *";  // Every minute - Check for scheduled task notifications

// Thermostat schedules (Minsk time)
const THERMOSTAT_PROMPT_CRON = "0 12 * * *";    // 12:00 - Daily prompt for thermostat plans
const THERMOSTAT_BASE_TEMP_CRON = "5 12 * * *"; // 12:05 - Apply base temperatures
const THERMOSTAT_HEAT_CRON = "30 14 * * *";     // 14:30 - Start heating for check-ins

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
        priority: "normal",
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

async function checkScheduledTaskNotifications(): Promise<void> {
  try {
    // Get current time in Minsk timezone
    const now = new Date();
    const minskTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Minsk",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    const minskDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Minsk",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    
    const [hourStr, minuteStr] = minskTime.split(":");
    const currentHour = parseInt(hourStr, 10);
    
    // Quiet hours: 23:00 - 08:00 (no notifications) in Minsk time
    if (currentHour >= 23 || currentHour < 8) {
      return;
    }
    
    const today = minskDate;
    const currentTime = minskTime;
    
    const tasks = await storage.getTasks();
    const tasksToNotify = tasks.filter(t => 
      t.date === today &&
      t.status === "open" &&
      t.notifyAt &&
      !t.notified &&
      t.notifyAt <= currentTime
    );
    
    if (tasksToNotify.length === 0) return;
    
    for (const task of tasksToNotify) {
      await sendTaskNotification({
        id: task.id,
        title: task.title,
        type: task.type,
        date: task.date,
        unitCode: task.unitCode,
        priority: task.priority,
        assignedTo: task.assignedTo,
      });
      
      await storage.updateTask(task.id, { notified: true });
      log(`Sent scheduled notification for task: ${task.title}`, "scheduler");
    }
  } catch (error) {
    console.error("[Scheduler] Failed to check scheduled task notifications:", error);
  }
}

// ============ THERMOSTAT SCHEDULER JOBS ============

function getTodayDateMinsk(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Minsk",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function initThermostatHouses(): Promise<void> {
  const houses = await storage.getThermostatHouses();
  if (houses.length === 0) {
    log("[ThermostatScheduler] Initializing houses 1-4 in database", "scheduler");
    for (let i = 1; i <= 4; i++) {
      await storage.createThermostatHouse({
        houseId: i,
        name: `Домик ${i}`,
        online: false,
      });
    }
  }
}

async function thermostatSendDailyPrompt(): Promise<void> {
  const today = getTodayDateMinsk();
  log(`[ThermostatScheduler] Sending daily prompt for ${today}`, "scheduler");
  
  const plans = await storage.getThermostatDailyPlans(today);
  const housesWithPlans = new Set(plans.map(p => p.houseId));
  const housesWithoutPlans: number[] = [];
  
  for (let houseId = 1; houseId <= 4; houseId++) {
    if (!housesWithPlans.has(houseId)) {
      housesWithoutPlans.push(houseId);
    }
  }
  
  if (housesWithoutPlans.length > 0) {
    await sendThermostatPrompt(housesWithoutPlans);
    log(`[ThermostatScheduler] Sent prompt for houses: ${housesWithoutPlans.join(", ")}`, "scheduler");
  } else {
    log("[ThermostatScheduler] All houses have plans for today", "scheduler");
  }
}

async function thermostatApplyBaseTemps(): Promise<void> {
  const today = getTodayDateMinsk();
  log(`[ThermostatScheduler] Applying base temperatures for ${today}`, "scheduler");
  
  const plans = await storage.getThermostatDailyPlans(today);
  
  for (let houseId = 1; houseId <= 4; houseId++) {
    const plan = plans.find(p => p.houseId === houseId);
    
    if (!plan) {
      log(`[ThermostatScheduler] No plan for house ${houseId} - skipping`, "scheduler");
      continue;
    }
    
    if (plan.appliedAt) {
      log(`[ThermostatScheduler] Base temp already applied for house ${houseId} - skipping`, "scheduler");
      continue;
    }
    
    let targetTemp: number | null = null;
    
    switch (plan.planType as ThermostatPlanType) {
      case "CHECKIN_TODAY":
        targetTemp = 16;
        break;
      case "NO_CHECKIN":
        targetTemp = 15;
        break;
      case "GUESTS_STAYING":
        log(`[ThermostatScheduler] House ${houseId} has guests staying - no changes`, "scheduler");
        break;
    }
    
    if (targetTemp !== null) {
      let success = false;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (!success && attempts < maxAttempts) {
        attempts++;
        try {
          success = await setThermostatTemp(houseId, targetTemp, `Base temp for ${plan.planType}`, "SCHEDULED");
          if (!success && attempts < maxAttempts) {
            log(`[ThermostatScheduler] Retry ${attempts}/${maxAttempts} for house ${houseId}`, "scheduler");
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error) {
          log(`[ThermostatScheduler] Error attempt ${attempts} for house ${houseId}: ${error}`, "scheduler");
        }
      }
      
      if (success) {
        await storage.markThermostatPlanApplied(today, houseId);
        log(`[ThermostatScheduler] Set house ${houseId} to ${targetTemp}°C (${plan.planType})`, "scheduler");
      } else {
        log(`[ThermostatScheduler] FAILED to set house ${houseId} after ${maxAttempts} attempts`, "scheduler");
        await sendThermostatAlert(houseId, "base_temp");
      }
    }
  }
}

async function thermostatStartHeating(): Promise<void> {
  const today = getTodayDateMinsk();
  log(`[ThermostatScheduler] Starting heating for check-ins (14:30) - ${today}`, "scheduler");
  
  const plans = await storage.getThermostatDailyPlans(today);
  
  for (const plan of plans) {
    if (plan.planType !== "CHECKIN_TODAY") continue;
    if (plan.heatStartedAt) {
      log(`[ThermostatScheduler] Heating already started for house ${plan.houseId} - skipping`, "scheduler");
      continue;
    }
    
    let success = false;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!success && attempts < maxAttempts) {
      attempts++;
      try {
        success = await setThermostatTemp(plan.houseId, 22, "Check-in heating at 14:30", "SCHEDULED");
        if (!success && attempts < maxAttempts) {
          log(`[ThermostatScheduler] Heating retry ${attempts}/${maxAttempts} for house ${plan.houseId}`, "scheduler");
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        log(`[ThermostatScheduler] Heating error attempt ${attempts} for house ${plan.houseId}: ${error}`, "scheduler");
      }
    }
    
    if (success) {
      await storage.markThermostatHeatStarted(today, plan.houseId);
      log(`[ThermostatScheduler] Started heating house ${plan.houseId} to 22°C for check-in`, "scheduler");
    } else {
      log(`[ThermostatScheduler] FAILED to start heating for house ${plan.houseId} after ${maxAttempts} attempts`, "scheduler");
      await sendThermostatAlert(plan.houseId, "heating");
    }
  }
}

async function thermostatRefreshAllStatuses(): Promise<void> {
  const houses = await storage.getThermostatHouses();
  for (const house of houses) {
    await refreshThermostatStatus(house.houseId);
  }
}

export function initScheduler(): void {
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

  cron.schedule(SCHEDULED_TASK_CHECK_CRON, async () => {
    await checkScheduledTaskNotifications();
  }, {
    timezone: "Europe/Minsk"
  });

  // ============ THERMOSTAT SCHEDULER ============
  
  initThermostatHouses().then(() => {
    log("[ThermostatScheduler] Houses initialized", "scheduler");
  }).catch((error) => {
    console.error("[ThermostatScheduler] Failed to initialize houses (table may not exist yet):", error.message);
  });

  cron.schedule(THERMOSTAT_PROMPT_CRON, async () => {
    try {
      log("[ThermostatScheduler] Daily prompt (12:00)", "scheduler");
      await thermostatRefreshAllStatuses();
      await thermostatSendDailyPrompt();
    } catch (error: any) {
      console.error("[ThermostatScheduler] Error in daily prompt:", error.message);
    }
  }, {
    timezone: "Europe/Minsk"
  });

  cron.schedule(THERMOSTAT_BASE_TEMP_CRON, async () => {
    try {
      log("[ThermostatScheduler] Applying base temperatures (12:05)", "scheduler");
      await thermostatApplyBaseTemps();
    } catch (error: any) {
      console.error("[ThermostatScheduler] Error applying base temps:", error.message);
    }
  }, {
    timezone: "Europe/Minsk"
  });

  cron.schedule(THERMOSTAT_HEAT_CRON, async () => {
    try {
      log("[ThermostatScheduler] Starting check-in heating (14:30)", "scheduler");
      await thermostatStartHeating();
    } catch (error: any) {
      console.error("[ThermostatScheduler] Error starting heating:", error.message);
    }
  }, {
    timezone: "Europe/Minsk"
  });

  log("Scheduler initialized:", "scheduler");
  log("  - Daily tasks: 06:00 daily", "scheduler");
  log("  - Weekly tasks: 06:00 Monday", "scheduler");
  log("  - Monthly tasks: 06:00 1st of month", "scheduler");
  log("  - Weather check: 18:00 daily", "scheduler");
  log("  - Scheduled task notifications: every minute", "scheduler");
  log("  - Notifications:", "scheduler");
  log("    - Shift reminder: 08:30 daily", "scheduler");
  log("    - Bath summary: 09:00 daily", "scheduler");
  log("    - Climate ON: 12:00 daily", "scheduler");
  log("    - Climate OFF: 14:00 daily", "scheduler");
  log("    - Laundry check-in: 15:00 daily", "scheduler");
  log("  - Thermostat:", "scheduler");
  log("    - Prompt: 12:00 daily", "scheduler");
  log("    - Base temps: 12:05 daily", "scheduler");
  log("    - Heating: 14:30 daily", "scheduler");
}

export { createDailyTasks, createWeeklyTasks, createMonthlyTasks };
