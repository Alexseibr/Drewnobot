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
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...options,
  });
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
          text: "Забронировать баню",
          web_app: { url: `${webAppUrl}/guest/bath` }
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
          text: "СПА-комплекс",
          web_app: { url: `${webAppUrl}/guest/spa` }
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
  }
  
  if (role === "SUPER_ADMIN") {
    keyboard.push([
      {
        text: "Управление сотрудниками",
        web_app: { url: `${webAppUrl}/admin/staff` }
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
    // Staff user
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

// ============ NOTIFICATION FUNCTIONS ============

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
    // Then schedule daily at 24h intervals
    setInterval(sendMorningSummary, 24 * 60 * 60 * 1000);
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
