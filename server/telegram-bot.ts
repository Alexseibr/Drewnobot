import { storage } from "./storage";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    message: {
      chat: {
        id: number;
      };
    };
    data: string;
  };
}

async function telegramApi(method: string, body: object = {}) {
  if (!BOT_TOKEN) {
    console.error("[Telegram Bot] No bot token configured");
    return null;
  }
  
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  
  const result = await response.json();
  if (!result.ok) {
    console.error(`[Telegram Bot] API error: ${method}`, result);
  }
  return result;
}

// Production domain for Village Drewno
const PRODUCTION_URL = "https://d.drewno.by";

function getWebAppUrl(): string {
  // Always use production URL if set
  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_URL;
  }
  
  // Use REPL_SLUG and REPL_OWNER for Replit deployment
  const replSlug = process.env.REPL_SLUG;
  const replOwner = process.env.REPL_OWNER;
  
  if (replSlug && replOwner) {
    return `https://${replSlug}.${replOwner}.repl.co`;
  }
  
  // Fallback for local development - use Replit dev URL
  return process.env.WEBAPP_URL || `https://${process.env.REPL_ID}.id.repl.co`;
}

async function sendMessage(chatId: number, text: string, options: object = {}) {
  const result = await telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...options,
  });
  
  // Track message for nightly cleanup
  if (result?.ok && result.result?.message_id) {
    try {
      await storage.trackBotMessage(chatId.toString(), result.result.message_id, false);
      console.log(`[Telegram Bot] Tracked message ${result.result.message_id} for chat ${chatId}`);
    } catch (e) {
      console.error(`[Telegram Bot] Failed to track message for chat ${chatId}:`, e);
    }
  }
  
  return result;
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

function getGuestKeyboard() {
  const webAppUrl = getWebAppUrl();
  
  return {
    inline_keyboard: [
      [
        {
          text: "Забронировать баню / СПА",
          web_app: { url: `${webAppUrl}/guest/spa` }
        }
      ],
      [
        {
          text: "Забронировать квадроциклы",
          web_app: { url: `${webAppUrl}/guest/quads` }
        }
      ],
      [
        {
          text: "Наш сайт",
          web_app: { url: webAppUrl }
        }
      ],
      [
        {
          text: "Я сотрудник",
          web_app: { url: `${webAppUrl}/staff-login` }
        }
      ]
    ]
  };
}

function getStaffKeyboard(role: string) {
  const webAppUrl = getWebAppUrl();
  const keyboard: Array<Array<{ text: string; web_app?: { url: string }; callback_data?: string }>> = [];
  
  if (role === "INSTRUCTOR") {
    keyboard.push([
      {
        text: "Мои сеансы",
        web_app: { url: `${webAppUrl}/instructor` }
      }
    ]);
    keyboard.push([
      {
        text: "Расписание",
        web_app: { url: `${webAppUrl}/instructor/schedule` }
      }
    ]);
    keyboard.push([
      {
        text: "Цены на квадроциклы",
        web_app: { url: `${webAppUrl}/instructor/pricing` }
      }
    ]);
    keyboard.push([
      {
        text: "Сервисная книга",
        web_app: { url: `${webAppUrl}/instructor/maintenance` }
      }
    ]);
    keyboard.push([
      {
        text: "Финансы",
        web_app: { url: `${webAppUrl}/instructor/finances` }
      }
    ]);
    keyboard.push([
      {
        text: "Управление инструкторами",
        web_app: { url: `${webAppUrl}/instructor/manage` }
      }
    ]);
  }
  
  if (role === "ADMIN" || role === "OWNER" || role === "SUPER_ADMIN") {
    keyboard.push([
      {
        text: "Панель управления",
        web_app: { url: `${webAppUrl}/ops` }
      }
    ]);
    keyboard.push([
      {
        text: "Бронирования",
        web_app: { url: `${webAppUrl}/ops/bookings` }
      }
    ]);
    keyboard.push([
      {
        text: "Касса",
        web_app: { url: `${webAppUrl}/ops/cash` }
      }
    ]);
    keyboard.push([
      {
        text: "Задачи",
        web_app: { url: `${webAppUrl}/ops/tasks` }
      }
    ]);
  }
  
  if (role === "OWNER" || role === "SUPER_ADMIN") {
    keyboard.push([
      {
        text: "Аналитика",
        web_app: { url: `${webAppUrl}/owner/analytics` }
      }
    ]);
    keyboard.push([
      {
        text: "Управление сотрудниками",
        web_app: { url: `${webAppUrl}/owner/staff` }
      }
    ]);
  }
  
  
  // Add guest options for staff too
  keyboard.push([
    {
      text: "Главная",
      web_app: { url: webAppUrl }
    }
  ]);
  
  return { inline_keyboard: keyboard };
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Супер-администратор",
  OWNER: "Владелец",
  ADMIN: "Администратор",
  INSTRUCTOR: "Инструктор",
  GUEST: "Гость",
};

async function handleStart(chatId: number, from: { id: number; first_name: string; last_name?: string; username?: string }) {
  const telegramId = from.id.toString();
  const user = await storage.getUserByTelegramId(telegramId);
  
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ");
  
  if (user && user.isActive && user.role !== "GUEST") {
    // Staff user - check if admin panel is pinned
    const pinnedMessage = await storage.getPinnedBotMessage(telegramId);
    
    if (!pinnedMessage) {
      // Pin admin panel for staff
      const pinResult = await sendAndPinAdminPanel(chatId);
      if (pinResult) {
        console.log(`[Telegram Bot] Pinned admin panel for ${user.name || telegramId} on /start`);
      }
    }
    
    const roleLabel = ROLE_LABELS[user.role] || user.role;
    await sendMessage(
      chatId,
      `Добро пожаловать, <b>${user.name || name}</b>!\n\n` +
      `Ваша роль: <b>${roleLabel}</b>\n\n` +
      `Выберите действие:`,
      { reply_markup: getStaffKeyboard(user.role) }
    );
  } else {
    // Guest user
    await sendMessage(
      chatId,
      `Добро пожаловать в <b>Усадьбу Дрэўна</b>!\n\n` +
      `Мы рады приветствовать вас в нашем уютном лесном курорте.\n\n` +
      `Выберите что вас интересует:`,
      { reply_markup: getGuestKeyboard() }
    );
  }
}

async function handleMenu(chatId: number, telegramId: string) {
  const user = await storage.getUserByTelegramId(telegramId);
  
  if (user && user.isActive && user.role !== "GUEST") {
    await sendMessage(
      chatId,
      "Выберите действие:",
      { reply_markup: getStaffKeyboard(user.role) }
    );
  } else {
    await sendMessage(
      chatId,
      "Выберите что вас интересует:",
      { reply_markup: getGuestKeyboard() }
    );
  }
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  try {
    if (update.message?.text) {
      const { chat, from, text } = update.message;
      
      if (text === "/start") {
        await handleStart(chat.id, from);
      } else if (text === "/menu") {
        await handleMenu(chat.id, from.id.toString());
      } else if (text === "/help") {
        await sendMessage(
          chat.id,
          "<b>Усадьба Дрэўна - Помощь</b>\n\n" +
          "/start - Начать\n" +
          "/menu - Показать меню\n" +
          "/help - Показать справку\n\n" +
          "Для бронирования используйте кнопки меню."
        );
      }
    }
    
    if (update.callback_query) {
      await answerCallbackQuery(update.callback_query.id);
    }
  } catch (error) {
    console.error("[Telegram Bot] Error handling update:", error);
  }
}

export async function setupTelegramWebhook(webhookUrl: string) {
  if (!BOT_TOKEN) {
    console.log("[Telegram Bot] No bot token, skipping webhook setup");
    return;
  }
  
  const result = await telegramApi("setWebhook", {
    url: `${webhookUrl}/api/telegram/webhook`,
    allowed_updates: ["message", "callback_query"],
  });
  
  if (result?.ok) {
    console.log("[Telegram Bot] Webhook set successfully");
  }
  
  // Set bot commands
  await telegramApi("setMyCommands", {
    commands: [
      { command: "start", description: "Начать" },
      { command: "menu", description: "Показать меню" },
      { command: "help", description: "Помощь" },
    ]
  });
}

export async function removeTelegramWebhook() {
  if (!BOT_TOKEN) return;
  await telegramApi("deleteWebhook");
  console.log("[Telegram Bot] Webhook removed");
}

// ============ QUIET HOURS ============
// No notifications before 08:00 Minsk time

const QUIET_HOURS_START = 23; // 23:00
const QUIET_HOURS_END = 8;   // 08:00

function isQuietHours(): boolean {
  const now = new Date();
  // Convert to Minsk time (UTC+3)
  const minskOffset = 3 * 60; // minutes
  const localOffset = now.getTimezoneOffset();
  const minskTime = new Date(now.getTime() + (minskOffset + localOffset) * 60 * 1000);
  const hour = minskTime.getHours();
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}

// ============ NOTIFICATION FUNCTIONS ============

export async function notifyAdmins(message: string, options: { deepLink?: string } = {}) {
  try {
    const users = await storage.getUsers();
    const admins = users.filter(u => 
      (u.role === "ADMIN" || u.role === "OWNER" || u.role === "SUPER_ADMIN") && 
      u.isActive && 
      u.telegramId
    );
    
    let finalMessage = message;
    const keyboard = options.deepLink ? {
      inline_keyboard: [[{
        text: "Открыть",
        web_app: { url: `${getWebAppUrl()}${options.deepLink}` }
      }]]
    } : undefined;
    
    for (const admin of admins) {
      await sendMessage(parseInt(admin.telegramId!), finalMessage, keyboard ? { reply_markup: keyboard } : {});
    }
    
    console.log(`[Telegram Bot] Notified ${admins.length} admins`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to notify admins:", error);
  }
}

// Operational notifications - for ADMIN and OWNER only, NOT super admin
// Used for: weather alerts, check-in reminders, climate control, laundry, etc.
export async function notifyOpsAdmins(message: string, options: { deepLink?: string } = {}) {
  try {
    const users = await storage.getUsers();
    const admins = users.filter(u => 
      (u.role === "ADMIN" || u.role === "OWNER") && 
      u.isActive && 
      u.telegramId
    );
    
    const keyboard = options.deepLink ? {
      inline_keyboard: [[{
        text: "Открыть",
        web_app: { url: `${getWebAppUrl()}${options.deepLink}` }
      }]]
    } : undefined;
    
    for (const admin of admins) {
      await sendMessage(parseInt(admin.telegramId!), message, keyboard ? { reply_markup: keyboard } : {});
    }
    
    console.log(`[Telegram Bot] Notified ${admins.length} ops admins (ADMIN/OWNER only)`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to notify ops admins:", error);
  }
}

// Financial notifications - for SUPER_ADMIN only
// Used for: cash in/out transactions
export async function notifySuperAdmin(message: string, options: { deepLink?: string } = {}) {
  try {
    const users = await storage.getUsers();
    const superAdmins = users.filter(u => 
      u.role === "SUPER_ADMIN" && 
      u.isActive && 
      u.telegramId
    );
    
    const keyboard = options.deepLink ? {
      inline_keyboard: [[{
        text: "Открыть",
        web_app: { url: `${getWebAppUrl()}${options.deepLink}` }
      }]]
    } : undefined;
    
    for (const admin of superAdmins) {
      await sendMessage(parseInt(admin.telegramId!), message, keyboard ? { reply_markup: keyboard } : {});
    }
    
    console.log(`[Telegram Bot] Notified ${superAdmins.length} super admins`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to notify super admins:", error);
  }
}

export async function sendShiftReminder() {
  try {
    // Check if shift is already open
    const currentShift = await storage.getCurrentShift("main");
    if (currentShift) {
      return; // Shift already open
    }
    
    const message = `<b>Напоминание: Открытие смены</b>\n\nСмена ещё не открыта. Не забудьте открыть кассу!`;
    // Send to ADMIN and OWNER only, not SUPER_ADMIN
    await notifyOpsAdmins(message, { deepLink: "/ops/cash" });
    
    console.log("[Telegram Bot] Sent shift reminder");
  } catch (error) {
    console.error("[Telegram Bot] Failed to send shift reminder:", error);
  }
}

export async function sendBathBookingsSummary() {
  try {
    const today = new Date().toISOString().split("T")[0];
    const bookings = await storage.getBathBookingsForDate(today);
    const activeBookings = bookings.filter(b => b.status !== "cancelled");
    
    if (activeBookings.length === 0) {
      return; // No bookings
    }
    
    let message = `<b>Бани на сегодня (${today})</b>\n\n`;
    message += `Всего бронирований: ${activeBookings.length}\n\n`;
    
    const sortedBookings = activeBookings.sort((a, b) => a.startTime.localeCompare(b.startTime));
    
    for (const booking of sortedBookings) {
      const statusIcon = booking.status === "confirmed" ? "[OK]" : "[?]";
      
      // Build service details string
      const services: string[] = [];
      if (booking.options) {
        if (booking.options.tub === "small") services.push("Купель М");
        if (booking.options.tub === "large") services.push("Купель Б");
        if (booking.options.terrace) services.push("Терраса");
        if (booking.options.grill) services.push("Мангал");
        if (booking.options.charcoal) services.push("+уголь");
      }
      const servicesStr = services.length > 0 ? ` (${services.join(", ")})` : "";
      
      message += `${statusIcon} ${booking.startTime}-${booking.endTime} ${booking.bathCode}${servicesStr}\n`;
    }
    
    // Send to ADMIN and OWNER only, not SUPER_ADMIN
    await notifyOpsAdmins(message, { deepLink: "/ops/spa" });
    
    console.log("[Telegram Bot] Sent bath bookings summary");
  } catch (error) {
    console.error("[Telegram Bot] Failed to send bath summary:", error);
  }
}

export async function sendClimateControlReminder(action: "on" | "off") {
  try {
    const today = new Date().toISOString().split("T")[0];
    const bookings = await storage.getBathBookingsForDate(today);
    const activeBookings = bookings.filter(b => b.status !== "cancelled");
    
    if (activeBookings.length === 0) {
      return; // No need for climate reminders
    }
    
    const actionText = action === "on" ? "Включить отопление" : "Выключить отопление";
    const actionEmoji = action === "on" ? "[+]" : "[-]";
    
    let message = `<b>${actionEmoji} ${actionText}</b>\n\n`;
    message += `Сегодня есть бронирования бань.\nПроверьте климат-контроль!`;
    
    // Send to ADMIN and OWNER only, not SUPER_ADMIN
    await notifyOpsAdmins(message, { deepLink: "/ops/tasks" });
    
    console.log(`[Telegram Bot] Sent climate control reminder (${action})`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to send climate reminder:", error);
  }
}

export async function sendWeatherAlert(alertType: "frost" | "storm", details: string[]) {
  try {
    let message = "";
    
    if (alertType === "frost") {
      message = `<b>[!] ВНИМАНИЕ: Заморозки!</b>\n\n`;
      message += `В ближайшие дни ожидаются низкие температуры:\n\n`;
      message += details.join("\n");
      message += `\n\nПроверьте отопление во всех домиках!`;
    } else if (alertType === "storm") {
      message = `<b>[!] ВНИМАНИЕ: Штормовое предупреждение!</b>\n\n`;
      message += details.join("\n");
    }
    
    // Send to ADMIN and OWNER only, not SUPER_ADMIN
    await notifyOpsAdmins(message, { deepLink: "/ops/tasks" });
    
    console.log(`[Telegram Bot] Sent weather alert (${alertType})`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to send weather alert:", error);
  }
}

export async function sendLaundryCheckInReminder() {
  try {
    const today = new Date().toISOString().split("T")[0];
    
    let message = `<b>[*] Напоминание: Заселения</b>\n\n`;
    message += `Не забудьте внести данные о выданном белье для сегодняшних заселений.\n\n`;
    message += `Откройте раздел "Прачечная" -> "Заселить"`;
    
    // Send to ADMIN and OWNER only, not SUPER_ADMIN
    await notifyOpsAdmins(message, { deepLink: "/ops/laundry" });
    
    console.log("[Telegram Bot] Sent laundry check-in reminder");
  } catch (error) {
    console.error("[Telegram Bot] Failed to send laundry reminder:", error);
  }
}

export async function sendThermostatPrompt(housesWithoutPlans: number[]) {
  try {
    if (housesWithoutPlans.length === 0) {
      return;
    }
    
    const houseList = housesWithoutPlans.map(h => `Д${h}`).join(", ");
    
    let message = `<b>[!] Термостаты: Заполните план</b>\n\n`;
    message += `Ещё не выбран план на сегодня:\n${houseList}\n\n`;
    message += `В 12:05 начнётся автоматическая установка базовых температур.\n`;
    message += `Откройте раздел "Термостаты" для настройки.`;
    
    // Send to ADMIN and OWNER only, not SUPER_ADMIN
    await notifyOpsAdmins(message, { deepLink: "/owner/thermostats" });
    
    console.log("[Telegram Bot] Sent thermostat prompt for houses:", housesWithoutPlans);
  } catch (error) {
    console.error("[Telegram Bot] Failed to send thermostat prompt:", error);
  }
}

export async function sendThermostatAlert(houseId: number, failureType: "base_temp" | "heating") {
  try {
    const actionText = failureType === "base_temp" 
      ? "установить базовую температуру" 
      : "начать прогрев";
    
    let message = `<b>[!] ВНИМАНИЕ: Ошибка термостата</b>\n\n`;
    message += `Не удалось ${actionText} для домика ${houseId}.\n`;
    message += `Проверьте устройство и интернет-соединение.\n\n`;
    message += `Возможно, потребуется ручная настройка.`;
    
    // Send to ADMIN and OWNER only, not SUPER_ADMIN
    await notifyOpsAdmins(message, { deepLink: "/owner/thermostats" });
    
    console.log(`[Telegram Bot] Sent thermostat failure alert for house ${houseId}`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to send thermostat alert:", error);
  }
}

// Financial transaction notification - for SUPER_ADMIN only
export async function sendFinancialNotification(transaction: {
  type: "income" | "expense";
  amount: number;
  comment?: string;
  category?: string;
}) {
  try {
    const typeLabel = transaction.type === "income" ? "ПРИХОД" : "РАСХОД";
    const sign = transaction.type === "income" ? "+" : "-";
    
    let message = `<b>Касса: ${typeLabel}</b>\n\n`;
    message += `Сумма: ${sign}${transaction.amount.toFixed(2)} BYN\n`;
    if (transaction.category) {
      message += `Категория: ${transaction.category}\n`;
    }
    if (transaction.comment) {
      message += `Комментарий: ${transaction.comment}`;
    }
    
    await notifySuperAdmin(message, { deepLink: "/ops/cash" });
    
    console.log(`[Telegram Bot] Sent financial notification: ${typeLabel} ${transaction.amount}`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to send financial notification:", error);
  }
}

export async function notifyNewQuadBooking(booking: {
  date: string;
  startTime: string;
  endTime: string;
  routeType: "short" | "long";
  quadsCount: number;
  customer: { fullName?: string; phone?: string };
  pricing: { total: number; discountApplied?: boolean };
}) {
  try {
    // Get all instructors
    const users = await storage.getUsers();
    const instructors = users.filter(u => u.role === "INSTRUCTOR" && u.isActive);
    
    const routeName = booking.routeType === "short" ? "Малый маршрут (30мин)" : "Большой маршрут (60мин)";
    const discountText = booking.pricing.discountApplied ? " (со скидкой 5%)" : "";
    
    const message = 
      `<b>Новая заявка на квадроциклы</b>\n\n` +
      `Дата: ${booking.date}\n` +
      `Время: ${booking.startTime} - ${booking.endTime}\n` +
      `Маршрут: ${routeName}\n` +
      `Квадроциклов: ${booking.quadsCount}\n` +
      `Сумма: ${booking.pricing.total} BYN${discountText}\n\n` +
      `Клиент: ${booking.customer.fullName || "Гость"}\n` +
      `Телефон: ${booking.customer.phone || "-"}`;
    
    for (const instructor of instructors) {
      if (instructor.telegramId) {
        await sendMessage(parseInt(instructor.telegramId), message);
      }
    }
    
    console.log(`[Telegram Bot] Notified ${instructors.length} instructors about new quad booking`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to notify instructors:", error);
  }
}

export async function sendMorningSummary() {
  try {
    const today = new Date().toISOString().split("T")[0];
    const bookings = await storage.getQuadBookingsForDate(today);
    const activeBookings = bookings.filter(b => b.status !== "cancelled");
    
    if (activeBookings.length === 0) {
      return; // No bookings today, no need to send summary
    }
    
    const users = await storage.getUsers();
    const instructors = users.filter(u => u.role === "INSTRUCTOR" && u.isActive);
    
    let message = `<b>Расписание квадроциклов на сегодня</b>\n\n`;
    message += `Всего заявок: ${activeBookings.length}\n\n`;
    
    const sortedBookings = activeBookings.sort((a, b) => a.startTime.localeCompare(b.startTime));
    
    for (const booking of sortedBookings) {
      const routeName = booking.routeType === "short" ? "30мин" : "60мин";
      const statusEmoji = booking.status === "confirmed" ? "[OK]" : "[?]";
      message += `${statusEmoji} ${booking.startTime} - ${routeName} x${booking.quadsCount} - ${booking.customer.fullName || "Гость"}\n`;
    }
    
    for (const instructor of instructors) {
      if (instructor.telegramId) {
        await sendMessage(parseInt(instructor.telegramId), message);
      }
    }
    
    console.log(`[Telegram Bot] Sent morning summary to ${instructors.length} instructors`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to send morning summary:", error);
  }
}

export async function sendEveningReminder() {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
    
    const bookings = await storage.getQuadBookingsForDate(tomorrowStr);
    const activeBookings = bookings.filter(b => b.status !== "cancelled");
    
    if (activeBookings.length === 0) {
      return;
    }
    
    const users = await storage.getUsers();
    const instructors = users.filter(u => u.role === "INSTRUCTOR" && u.isActive);
    
    let message = `<b>Напоминание: завтрашние поездки</b>\n\n`;
    message += `Заявок на завтра: ${activeBookings.length}\n\n`;
    
    const sortedBookings = activeBookings.sort((a, b) => a.startTime.localeCompare(b.startTime));
    
    for (const booking of sortedBookings) {
      const routeName = booking.routeType === "short" ? "30мин" : "60мин";
      message += `${booking.startTime} - ${routeName} x${booking.quadsCount} - ${booking.customer.fullName || "Гость"}\n`;
    }
    
    for (const instructor of instructors) {
      if (instructor.telegramId) {
        await sendMessage(parseInt(instructor.telegramId), message);
      }
    }
    
    console.log(`[Telegram Bot] Sent evening reminder to ${instructors.length} instructors`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to send evening reminder:", error);
  }
}

// ============ MAINTENANCE ALERTS ============

export async function sendMaintenanceAlerts() {
  try {
    const statuses = await storage.getQuadMaintenanceStatuses();
    const machines = await storage.getQuadMachines();
    const rules = await storage.getQuadMaintenanceRules();
    
    // Filter to only items that are due, overdue, or have warnings
    const alertItems = statuses.filter(s => s.status === "due" || s.status === "overdue" || s.status === "warning");
    
    if (alertItems.length === 0) {
      return; // No maintenance alerts needed
    }
    
    const users = await storage.getUsers();
    const instructors = users.filter(u => u.role === "INSTRUCTOR" && u.isActive);
    
    let message = `<b>Напоминание: техобслуживание квадроциклов</b>\n\n`;
    
    // Group by machine
    const groupedByMachine: Record<string, typeof alertItems> = {};
    for (const item of alertItems) {
      if (!groupedByMachine[item.quadId]) {
        groupedByMachine[item.quadId] = [];
      }
      groupedByMachine[item.quadId].push(item);
    }
    
    for (const quadId of Object.keys(groupedByMachine)) {
      const items = groupedByMachine[quadId];
      const machine = machines.find(m => m.id === quadId);
      if (!machine) continue;
      
      message += `<b>${machine.name}</b> (${machine.currentMileageKm} км)\n`;
      
      for (const item of items) {
        const rule = rules.find(r => r.id === item.ruleId);
        if (!rule) continue;
        
        const statusLabels: Record<string, string> = {
          overdue: "[ПРОСРОЧЕНО]",
          due: "[ТРЕБУЕТСЯ]",
          warning: "[СКОРО]",
        };
        const statusText = statusLabels[item.status] || "[СКОРО]";
        message += `  ${statusText} ${rule.title}`;
        
        if (item.remainingKm !== undefined) {
          if (item.remainingKm <= 0) {
            message += ` (превышено на ${Math.abs(item.remainingKm)} км)`;
          } else {
            message += ` (осталось ${item.remainingKm} км)`;
          }
        }
        
        if (item.remainingDays !== undefined) {
          if (item.remainingDays <= 0) {
            message += ` (просрочено на ${Math.abs(item.remainingDays)} дн.)`;
          } else {
            message += ` (${item.remainingDays} дн.)`;
          }
        }
        
        message += "\n";
      }
      message += "\n";
    }
    
    for (const instructor of instructors) {
      if (instructor.telegramId) {
        await sendMessage(parseInt(instructor.telegramId), message);
      }
    }
    
    console.log(`[Telegram Bot] Sent maintenance alerts to ${instructors.length} instructors (${alertItems.length} items)`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to send maintenance alerts:", error);
  }
}

// ============ TASK NOTIFICATIONS ============

export async function sendTaskNotification(task: { 
  id: string; 
  title: string; 
  type: string; 
  date: string; 
  unitCode?: string;
  priority?: string;
  assignedTo?: string;
}) {
  try {
    const users = await storage.getUsers();
    const admins = users.filter(u => 
      (u.role === "ADMIN" || u.role === "OWNER" || u.role === "SUPER_ADMIN") && u.isActive
    );
    
    if (admins.length === 0) {
      console.log("[Telegram Bot] No active admins to notify about task");
      return;
    }
    
    const webAppUrl = getWebAppUrl();
    const taskUrl = `${webAppUrl}/ops/tasks?taskId=${task.id}`;
    
    const typeLabels: Record<string, string> = {
      cleaning: "Уборка",
      climate_on: "Вкл. климат",
      climate_off: "Выкл. климат",
      trash_prep: "Мусор",
      meters: "Счетчики",
      call_guest: "Звонок гостю",
      other: "Другое",
    };
    
    const typeLabel = typeLabels[task.type] || task.type;
    const unitInfo = task.unitCode ? ` (${task.unitCode})` : "";
    const isUrgent = task.priority === "urgent";
    const urgentPrefix = isUrgent ? "СРОЧНО! " : "";
    
    const message = `<b>${urgentPrefix}Новая задача</b>\n\n` +
      `${task.title}${unitInfo}\n` +
      `Тип: ${typeLabel}\n` +
      `Дата: ${task.date}` +
      (isUrgent ? "\n\n<b>Требует срочного выполнения!</b>" : "");
    
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "Открыть задачу",
            web_app: { url: taskUrl }
          }
        ]
      ]
    };
    
    for (const admin of admins) {
      if (admin.telegramId) {
        await sendMessage(parseInt(admin.telegramId), message, { reply_markup: keyboard });
      }
    }
    
    console.log(`[Telegram Bot] Sent task notification to ${admins.length} admins${isUrgent ? " (URGENT)" : ""}`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to send task notification:", error);
  }
}

// ============ TASK ACCEPTED NOTIFICATION ============

export async function sendTaskAcceptedNotification(params: {
  taskId: string;
  taskTitle: string;
  acceptorName: string;
  creatorTelegramId: string;
}) {
  try {
    const webAppUrl = getWebAppUrl();
    const taskUrl = `${webAppUrl}/ops/tasks?taskId=${params.taskId}`;
    
    const message = `<b>Задача принята к исполнению</b>\n\n` +
      `Задача: ${params.taskTitle}\n` +
      `Исполнитель: ${params.acceptorName}`;
    
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "Открыть задачу",
            web_app: { url: taskUrl }
          }
        ]
      ]
    };
    
    await sendMessage(parseInt(params.creatorTelegramId), message, { reply_markup: keyboard });
    console.log(`[Telegram Bot] Sent task accepted notification to creator ${params.creatorTelegramId}`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to send task accepted notification:", error);
  }
}

// ============ AUTO-INITIALIZATION ============

export async function initTelegramBot() {
  if (!BOT_TOKEN) {
    console.log("[Telegram Bot] No bot token configured, skipping initialization");
    return;
  }
  
  // Only set up webhook in production (d.drewno.by)
  // In development, Telegram can't reach the dev server
  if (process.env.NODE_ENV === "production") {
    console.log(`[Telegram Bot] Setting up webhook for production: ${PRODUCTION_URL}`);
    await setupTelegramWebhook(PRODUCTION_URL);
  } else {
    console.log("[Telegram Bot] Development mode - webhook will be set when deployed to production");
    console.log("[Telegram Bot] Web App URL for development:", getWebAppUrl());
  }
  
  // Schedule daily notifications (only in production to avoid duplicate notifications)
  if (process.env.NODE_ENV === "production") {
    scheduleNotifications();
  }
}

function scheduleNotifications() {
  // Schedule morning summary at 08:00 Minsk time (UTC+3)
  const now = new Date();
  const morningTime = new Date();
  morningTime.setHours(8, 0, 0, 0);
  
  // If it's already past 8am, schedule for tomorrow
  if (now > morningTime) {
    morningTime.setDate(morningTime.getDate() + 1);
  }
  
  const msUntilMorning = morningTime.getTime() - now.getTime();
  
  setTimeout(() => {
    sendMorningSummary();
    sendMaintenanceAlerts();
    // Then schedule daily at 24h intervals
    setInterval(() => {
      sendMorningSummary();
      sendMaintenanceAlerts();
    }, 24 * 60 * 60 * 1000);
  }, msUntilMorning);
  
  // Schedule evening reminder at 20:00 Minsk time (UTC+3)
  const eveningTime = new Date();
  eveningTime.setHours(20, 0, 0, 0);
  
  // If it's already past 8pm, schedule for tomorrow
  if (now > eveningTime) {
    eveningTime.setDate(eveningTime.getDate() + 1);
  }
  
  const msUntilEvening = eveningTime.getTime() - now.getTime();
  
  setTimeout(() => {
    sendEveningReminder();
    // Then schedule daily at 24h intervals
    setInterval(sendEveningReminder, 24 * 60 * 60 * 1000);
  }, msUntilEvening);
  
  console.log("[Telegram Bot] Notifications scheduled");
}

// ============ NIGHTLY CHAT CLEANUP ============

// Get admin panel keyboard for pinned message
function getAdminPanelKeyboard() {
  const webAppUrl = getWebAppUrl();
  
  return {
    inline_keyboard: [
      [
        { text: "Панель", web_app: { url: `${webAppUrl}/ops` } },
        { text: "Касса", web_app: { url: `${webAppUrl}/ops/cash` } },
      ],
      [
        { text: "Брони", web_app: { url: `${webAppUrl}/ops/bookings` } },
        { text: "Задачи", web_app: { url: `${webAppUrl}/ops/tasks` } },
      ],
      [
        { text: "Аналитика", web_app: { url: `${webAppUrl}/owner/analytics` } },
        { text: "Настройки", web_app: { url: `${webAppUrl}/owner` } },
      ],
    ],
  };
}

// Send and pin admin panel message
async function sendAndPinAdminPanel(chatId: number): Promise<number | null> {
  const result = await telegramApi("sendMessage", {
    chat_id: chatId,
    text: "<b>Усадьба Дрэўна - Панель управления</b>\n\nБыстрый доступ к основным разделам:",
    parse_mode: "HTML",
    reply_markup: getAdminPanelKeyboard(),
  });
  
  if (!result?.ok || !result.result?.message_id) {
    return null;
  }
  
  const messageId = result.result.message_id;
  
  // Pin the message (silently)
  await telegramApi("pinChatMessage", {
    chat_id: chatId,
    message_id: messageId,
    disable_notification: true,
  });
  
  // Track as pinned message
  try {
    await storage.setPinnedBotMessage(chatId.toString(), messageId);
  } catch (e) {
    console.error("[Telegram Bot] Failed to track pinned message:", e);
  }
  
  return messageId;
}

// Perform nightly cleanup for a single chat
async function cleanupChatMessages(chatId: string): Promise<{ deleted: number; errors: number }> {
  let deleted = 0;
  let errors = 0;
  
  try {
    const messages = await storage.getBotMessagesForChat(chatId);
    const pinnedMessage = await storage.getPinnedBotMessage(chatId);
    
    for (const msg of messages) {
      // Skip pinned message
      if (pinnedMessage && msg.messageId === pinnedMessage.messageId) {
        continue;
      }
      
      // Try to delete the message
      const result = await telegramApi("deleteMessage", {
        chat_id: parseInt(chatId, 10),
        message_id: msg.messageId,
      });
      
      if (result?.ok) {
        deleted++;
      } else {
        errors++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Clean up database records (except pinned)
    await storage.deleteBotMessagesForChat(chatId, true);
    
  } catch (error) {
    console.error(`[Telegram Bot] Error cleaning chat ${chatId}:`, error);
  }
  
  return { deleted, errors };
}

// Pin admin panel for all staff users (can be called manually)
export async function pinAdminPanelForAllStaff(): Promise<{ pinned: number; skipped: number; errors: number }> {
  console.log("[Telegram Bot] Pinning admin panel for all staff...");
  
  let pinned = 0;
  let skipped = 0;
  let errors = 0;
  
  try {
    const users = await storage.getUsers();
    const staffUsers = users.filter(u => 
      u.role !== "GUEST" && 
      u.isActive && 
      u.telegramId
    );
    
    for (const user of staffUsers) {
      const chatId = user.telegramId!;
      
      // Check if already pinned
      const pinnedMessage = await storage.getPinnedBotMessage(chatId);
      if (pinnedMessage) {
        skipped++;
        continue;
      }
      
      // Pin admin panel
      const result = await sendAndPinAdminPanel(parseInt(chatId, 10));
      if (result) {
        pinned++;
        console.log(`[Telegram Bot] Pinned admin panel for ${user.name || chatId}`);
      } else {
        errors++;
      }
      
      // Delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`[Telegram Bot] Pinning complete: ${pinned} pinned, ${skipped} skipped, ${errors} errors`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to pin admin panels:", error);
  }
  
  return { pinned, skipped, errors };
}

// Perform nightly cleanup for all staff chats
export async function performNightlyCleanup(): Promise<void> {
  console.log("[Telegram Bot] Starting nightly chat cleanup...");
  
  try {
    // Get all active staff users
    const users = await storage.getUsers();
    const staffUsers = users.filter(u => 
      u.role !== "GUEST" && 
      u.isActive && 
      u.telegramId
    );
    
    let totalDeleted = 0;
    let totalErrors = 0;
    let chatsProcessed = 0;
    
    for (const user of staffUsers) {
      const chatId = user.telegramId!;
      
      // Check if there's a pinned message already
      const pinnedMessage = await storage.getPinnedBotMessage(chatId);
      
      // Cleanup old messages
      const { deleted, errors } = await cleanupChatMessages(chatId);
      totalDeleted += deleted;
      totalErrors += errors;
      
      // Send and pin fresh admin panel if no pinned message exists
      if (!pinnedMessage) {
        const result = await sendAndPinAdminPanel(parseInt(chatId, 10));
        if (result) {
          console.log(`[Telegram Bot] Pinned admin panel for user ${user.name || chatId}`);
        }
      }
      
      chatsProcessed++;
      
      // Delay between users to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`[Telegram Bot] Nightly cleanup complete: ${chatsProcessed} chats, ${totalDeleted} deleted, ${totalErrors} errors`);
    
  } catch (error) {
    console.error("[Telegram Bot] Nightly cleanup failed:", error);
  }
}
