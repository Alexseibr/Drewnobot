import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { storage } from "./storage";

import EWeLink from "ewelink-api-next";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// eWeLink client initialization
let ewelinkClient: any = null;
async function getEwelinkClient() {
  if (ewelinkClient) return ewelinkClient;
  
  const email = process.env.EWELINK_EMAIL;
  const password = process.env.EWELINK_PASSWORD;
  const region = process.env.EWELINK_REGION || "eu";
  
  if (!email || !password) {
    console.error("[eWeLink] Missing credentials");
    return null;
  }
  
  try {
    // Definitive approach for ewelink-api-next
    // The library exports a default object containing WebAPI
    const ewelink = (EWeLink as any).default || EWeLink;
    const WebAPI = ewelink.WebAPI || ewelink;
    
    if (typeof WebAPI !== 'function') {
      console.error("[eWeLink] WebAPI constructor not found", { 
        type: typeof WebAPI,
        keys: Object.keys(ewelink)
      });
      return null;
    }

    // Pass region, email, and password to constructor
    ewelinkClient = new WebAPI({
      region,
      email,
      password,
    });
    
    console.log("[eWeLink] Client instance created");
    
    // Attempt explicit login to get the token
    if (typeof ewelinkClient.login === 'function') {
      console.log("[eWeLink] Attempting explicit login...");
      const loginRes = await ewelinkClient.login();
      console.log("[eWeLink] Login response:", JSON.stringify(loginRes));
      
      // CRITICAL: Manually extract and set the token if the library failed to do so
      if (loginRes?.data?.at) {
        console.log("[eWeLink] Manually setting access token from login response");
        ewelinkClient.at = loginRes.data.at;
      }
    }
    
    return ewelinkClient;
  } catch (error) {
    console.error("[eWeLink] Login failed:", error);
    ewelinkClient = null;
    return null;
  }
}

export async function openGate(): Promise<{ success: boolean; error?: string }> {
  // Try to get from process.env first (for production)
  let deviceId = process.env.EWELINK_GATE_DEVICE_ID;
  
  // LOG THE ACTUAL VALUE (MASKED) TO DEBUG
  console.log("[eWeLink] Device ID length:", deviceId ? deviceId.length : 0);
  console.log("[eWeLink] Device ID prefix:", deviceId ? deviceId.substring(0, 3) : "NONE");

  if (!deviceId || deviceId === "id_вашего_устройства_из_ewelink") {
    return { success: false, error: "Device ID not configured" };
  }
  
  try {
    const client = await getEwelinkClient();
    if (!client) return { success: false, error: "Failed to connect to eWeLink" };
    
    // Standard switch toggle format for ewelink-api-next
    console.log("[eWeLink] Sending switch ON command...");
    
    // Force the token if we have it to ensure Authorization header is built correctly
    const params: any = { switch: "on" };
    
    const response = await client.device.setThingStatus({
      type: 1, // device
      id: deviceId.trim(),
      params
    });
    
    console.log("[eWeLink] Response from API:", JSON.stringify(response));
    
    // Check for success or the specific msg "OK"
    const isSuccess = response?.error === 0 || response?.status === 200 || response?.msg === "OK" || !response?.error;
    
    if (isSuccess) {
      console.log("[eWeLink] Gate open command sent successfully");
      return { success: true };
    } else {
      console.error("[eWeLink] API returned error:", response?.error, response?.msg);
      return { success: false, error: `API Error: ${response?.error} - ${response?.msg}` };
    }
  } catch (error) {
    console.error("[eWeLink] Failed to open gate:", error);
    return { success: false, error: String(error) };
  }
}

// Store pending contact requests with booking data
const pendingContactRequests = new Map<string, {
  date: string;
  time: string;
  resource: string;
  service: string;
  duration: number;
  guests: number;
}>();

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
    contact?: {
      phone_number: string;
      first_name: string;
      last_name?: string;
      user_id?: number;
    };
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
  // Use explicit WEBAPP_URL if set
  if (process.env.WEBAPP_URL) {
    return process.env.WEBAPP_URL;
  }
  
  // Always use production URL in production
  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_URL;
  }
  
  // Use Replit dev domain for development
  const replitDevDomain = process.env.REPLIT_DEV_DOMAIN;
  if (replitDevDomain) {
    return `https://${replitDevDomain}`;
  }
  
  // Fallback to production URL
  return PRODUCTION_URL;
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

async function sendMessageWithContactButton(chatId: number, text: string) {
  const result = await telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: {
      keyboard: [
        [{ text: "📱 Поделиться номером", request_contact: true }],
        [{ text: "❌ Отмена" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
  
  if (result?.ok && result.result?.message_id) {
    try {
      await storage.trackBotMessage(chatId.toString(), result.result.message_id, false);
    } catch (e) {
      console.error(`[Telegram Bot] Failed to track message:`, e);
    }
  }
  
  return result;
}

// Exported function for API to request contact from user
export async function sendContactRequest(
  userId: string | number, 
  bookingData: { date: string; time: string; resource: string; service: string; duration: number; guests: number }
): Promise<{ success: boolean; error?: string }> {
  try {
    const chatId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    
    // Store booking data for this user
    pendingContactRequests.set(chatId.toString(), bookingData);
    
    console.log("[Telegram Bot] Sending contact request to user", chatId);
    
    const result = await sendMessageWithContactButton(
      chatId,
      "Для бронирования необходимо подтвердить ваш номер телефона.\n\nНажмите кнопку ниже, чтобы поделиться контактом:"
    );
    
    if (result?.ok) {
      console.log("[Telegram Bot] Contact request sent successfully to", chatId);
      return { success: true };
    } else {
      console.error("[Telegram Bot] Failed to send contact request:", result);
      return { success: false, error: "Failed to send message" };
    }
  } catch (error) {
    console.error("[Telegram Bot] Error sending contact request:", error);
    return { success: false, error: String(error) };
  }
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
        text: "🔓 Открыть ворота",
        callback_data: "admin_open_gate"
      }
    ]);
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

async function handleSpaBookingDeepLink(
  chatId: number, 
  from: { id: number; first_name: string; last_name?: string; username?: string },
  date: string | null
) {
  // Use WEBAPP_URL env var, or detect from Replit, or fallback to production domain
  const webAppUrl = process.env.WEBAPP_URL 
    || (process.env.REPLIT_DEPLOYMENT_URL ? `https://${process.env.REPLIT_DEPLOYMENT_URL}` : null)
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
    || "https://d.drewno.by";
  
  const bookingUrl = date 
    ? `${webAppUrl}/guest/spa?date=${date}`
    : `${webAppUrl}/guest/spa`;
  
  const dateText = date 
    ? `на ${date.split('-').reverse().join('.')}`
    : "";
  
  await sendMessage(
    chatId,
    `<b>Бронирование SPA ${dateText}</b>\n\n` +
    `Нажмите кнопку ниже, чтобы выбрать время и забронировать:`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: "Забронировать SPA", web_app: { url: bookingUrl } }
        ]]
      }
    }
  );
}

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
      } else if (text.startsWith("/start book_spa_")) {
        // Deep link for SPA booking with date: /start book_spa_YYYY-MM-DD
        const dateMatch = text.match(/book_spa_(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          await handleSpaBookingDeepLink(chat.id, from, dateMatch[1]);
        } else {
          await handleStart(chat.id, from);
        }
      } else if (text.startsWith("/start book_spa")) {
        // Generic SPA booking deep link without date
        await handleSpaBookingDeepLink(chat.id, from, null);
      } else if (text.startsWith("/start share_contact_")) {
        // Deep link for contact sharing from WebApp
        console.log("[Telegram Bot] Received share_contact deep link from user", from.id);
        const dataMatch = text.match(/share_contact_(.+)/);
        if (dataMatch) {
          try {
            const bookingData = JSON.parse(atob(dataMatch[1]));
            console.log("[Telegram Bot] Parsed booking data:", JSON.stringify(bookingData));
            // Store booking data temporarily for this user
            pendingContactRequests.set(from.id.toString(), bookingData);
            
            // Send message with contact request button
            console.log("[Telegram Bot] Sending contact request button to chat", chat.id);
            const result = await sendMessageWithContactButton(
              chat.id,
              "Для бронирования необходимо подтвердить ваш номер телефона.\n\nНажмите кнопку ниже, чтобы поделиться контактом:"
            );
            console.log("[Telegram Bot] sendMessageWithContactButton result:", JSON.stringify(result));
          } catch (e) {
            console.error("[Telegram Bot] Failed to parse booking data:", e);
            await handleStart(chat.id, from);
          }
        } else {
          console.log("[Telegram Bot] No match for share_contact data");
          await handleStart(chat.id, from);
        }
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
      } else if (text === "❌ Отмена") {
        // User cancelled contact sharing
        pendingContactRequests.delete(from.id.toString());
        await sendMessage(
          chat.id,
          "Бронирование отменено.",
          { reply_markup: { remove_keyboard: true } }
        );
        await handleStart(chat.id, from);
      }
    }
    
    // Handle contact sharing
    if (update.message?.contact) {
      const { chat, from, contact } = update.message;
      const userId = from.id.toString();
      const bookingData = pendingContactRequests.get(userId);
      
      if (bookingData && contact.phone_number) {
        // Remove pending request
        pendingContactRequests.delete(userId);
        
        // Format phone number
        let phone = contact.phone_number;
        if (!phone.startsWith("+")) {
          phone = "+" + phone;
        }
        
        // Create URL with booking data and phone
        const webAppUrl = getWebAppUrl();
        const params = new URLSearchParams({
          date: bookingData.date,
          time: bookingData.time,
          resource: bookingData.resource,
          service: bookingData.service,
          duration: bookingData.duration.toString(),
          guests: bookingData.guests.toString(),
          phone: phone,
          name: [contact.first_name, contact.last_name].filter(Boolean).join(" "),
        });
        
        const bookingUrl = `${webAppUrl}/guest/spa-booking?${params.toString()}`;
        
        // Send confirmation with button to continue booking
        await sendMessage(
          chat.id,
          `✅ Номер подтвержден: <b>${phone}</b>\n\nНажмите кнопку ниже, чтобы вернуться и завершить бронирование:`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔙 Завершить бронирование", web_app: { url: bookingUrl } }]
              ],
              remove_keyboard: true,
            },
          }
        );
      } else {
        await sendMessage(
          chat.id,
          "Не удалось получить номер телефона. Попробуйте ещё раз.",
          { reply_markup: { remove_keyboard: true } }
        );
      }
    }
    
    if (update.callback_query) {
      const { data, from, message } = update.callback_query;
      
      // Handle check-in action callbacks
      if (data?.startsWith("checkin_")) {
        await handleCheckInCallback(data, from, message.chat.id);
      }
      
      // Handle SPA temperature selection
      if (data?.startsWith("spa_temp:")) {
        await handleSpaTemperatureCallback(data, from, message.chat.id);
      }
      
      // Handle Gate Opening
      if (data?.startsWith("gate_open:")) {
        await handleGateOpenCallback(data, from, message.chat.id);
      }
      
      // Handle Admin Manual Gate Open
      if (data === "admin_open_gate") {
        await handleAdminGateOpenCallback(from, message.chat.id);
      }
      
      await answerCallbackQuery(update.callback_query.id);
    }
  } catch (error) {
    console.error("[Telegram Bot] Error handling update:", error);
  }
}

// Handle Admin Manual Gate Open
async function handleAdminGateOpenCallback(
  from: { id: number; first_name: string },
  chatId: number
) {
  const telegramId = from.id.toString();
  try {
    const user = await storage.getUserByTelegramId(telegramId);
    if (!user || !user.isActive || !["ADMIN", "OWNER", "SUPER_ADMIN"].includes(user.role)) {
      await sendMessage(chatId, "У вас нет прав для этого действия.");
      return;
    }

    await sendMessage(chatId, "Открываю ворота по команде администратора...");
    const result = await openGate();
    
    if (result.success) {
      await sendMessage(chatId, "✅ Ворота открыты.");
      await notifyAdmins(`Администратор ${user.name || from.first_name} открыл ворота вручную через бота.`);
    } else {
      await sendMessage(chatId, `❌ Ошибка: ${result.error}`);
    }
  } catch (error) {
    console.error("[Telegram Bot] Admin gate callback error:", error);
  }
}

// Handle Gate Open callback
async function handleGateOpenCallback(
  data: string,
  from: { id: number; first_name: string },
  chatId: number
) {
  const bookingId = data.split(":")[1];
  try {
    const booking = await storage.getSpaBooking(bookingId);
    if (!booking) {
      await sendMessage(chatId, "Бронирование не найдено.");
      return;
    }

    // Verify it's within 30 mins of start time or during booking
    const now = new Date();
    const [startH, startM] = booking.startTime.split(":").map(Number);
    const bookingStart = new Date(now);
    bookingStart.setHours(startH, startM, 0, 0);
    
    const thirtyMinsBefore = new Date(bookingStart.getTime() - 30 * 60 * 1000);
    const bookingEnd = new Date(now);
    const [endH, endM] = booking.endTime.split(":").map(Number);
    bookingEnd.setHours(endH, endM, 0, 0);

    if (now < thirtyMinsBefore || now > bookingEnd) {
      await sendMessage(chatId, "Кнопка открытия ворот станет активна за 30 минут до начала вашего времени.");
      return;
    }

    await sendMessage(chatId, "Открываю ворота...");
    const result = await openGate();
    
    if (result.success) {
      await sendMessage(chatId, "✅ Ворота открыты! Добро пожаловать.");
      // Notify admins
      await notifyAdmins(`Гость ${booking.customer.fullName} открыл ворота (бронь ${booking.spaResource} ${booking.startTime})`);
    } else {
      await sendMessage(chatId, "❌ Не удалось открыть ворота автоматически. Пожалуйста, позвоните администратору.");
    }
  } catch (error) {
    console.error("[Telegram Bot] Gate callback error:", error);
  }
}

// Handle SPA temperature selection callback
async function handleSpaTemperatureCallback(
  data: string,
  from: { id: number; first_name: string; last_name?: string },
  chatId: number
) {
  // Format: spa_temp:BOOKINGID:TEMP
  const parts = data.split(":");
  if (parts.length < 3) return;
  
  const bookingId = parts[1];
  const temperature = parseInt(parts[2], 10);
  
  if (isNaN(temperature)) return;
  
  try {
    const booking = await storage.getSpaBooking(bookingId);
    if (!booking) {
      await sendMessage(chatId, "Бронирование не найдено.");
      return;
    }
    
    // Update booking with temperature preference
    await storage.updateSpaBooking(bookingId, {
      comment: `${booking.comment || ""}\nПредпочтительная температура: ${temperature}°C`.trim()
    });
    
    // Confirm to guest
    let confirmMessage = `Отлично! Мы нагреем баню до <b>${temperature}°C</b>.\n\n`;
    confirmMessage += `За час до приезда мы пришлём вам код для входа и контакты администратора.\n\n`;
    confirmMessage += `До встречи!`;
    
    await sendMessage(chatId, confirmMessage);
    
    // Notify admins about temperature preference
    await notifyAdminAboutSpaTemperature(bookingId, temperature);
    
    console.log(`[Telegram Bot] Guest selected ${temperature}°C for SPA booking ${bookingId}`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to handle SPA temperature selection:", error);
    await sendMessage(chatId, "Произошла ошибка. Попробуйте ещё раз или свяжитесь с администратором.");
  }
}

// Handle check-in action callbacks (contact/accept)
async function handleCheckInCallback(
  data: string, 
  from: { id: number; first_name: string; last_name?: string; username?: string },
  chatId: number
) {
  // Format: checkin_contact_BOOKINGID or checkin_accept_BOOKINGID
  const parts = data.split("_");
  if (parts.length < 3) return;

  const action = parts[1]; // "contact" or "accept"
  const bookingId = parts.slice(2).join("_"); // booking ID may contain underscores

  const telegramId = from.id.toString();

  try {
    // SECURITY: Verify user is an active admin/owner/super_admin
    const user = await storage.getUserByTelegramId(telegramId);
    if (!user || !user.isActive) {
      console.log(`[Telegram Bot] Check-in callback rejected: user not found or inactive (${telegramId})`);
      return;
    }
    
    const allowedRoles = ["ADMIN", "OWNER", "SUPER_ADMIN"];
    if (!allowedRoles.includes(user.role)) {
      console.log(`[Telegram Bot] Check-in callback rejected: insufficient role (${user.role})`);
      await sendMessage(chatId, "У вас нет прав для выполнения этого действия.");
      return;
    }

    const adminName = user.name || [from.first_name, from.last_name].filter(Boolean).join(" ");

    const actionText = action === "contact" 
      ? `связался с гостем` 
      : `принял заселение`;
    
    const confirmMessage = `Вы ${actionText}: ${bookingId}`;

    await sendMessage(chatId, confirmMessage);
    console.log(`[Telegram Bot] Check-in ${action} for ${bookingId} by ${adminName}`);
  } catch (error) {
    console.error(`[Telegram Bot] Failed to log check-in action:`, error);
    await sendMessage(chatId, "Ошибка при записи действия. Попробуйте ещё раз.");
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
    
    let message = `<b>Бани на сегодня</b>\n\n`;
    
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
      const servicesStr = services.length > 0 ? ` + ${services.join(", ")}` : "";
      
      // Build tasks list for this booking
      const tasks: string[] = [];
      tasks.push("Протопить баню");
      if (booking.options?.tub) {
        tasks.push("Нагреть купель");
      }
      if (booking.options?.terrace) {
        tasks.push("Подготовить террасу");
      }
      if (booking.options?.grill) {
        tasks.push("Подготовить мангал");
        if (booking.options?.charcoal) {
          tasks.push("Выдать уголь");
        }
      }
      tasks.push("Проверить полотенца/веники");
      
      message += `${statusIcon} <b>${booking.bathCode}</b> ${booking.startTime}-${booking.endTime}${servicesStr}\n`;
      message += `   Гости: ${booking.customer?.fullName || "Не указано"}\n`;
      message += `   Тел: ${booking.customer?.phone || "Нет"}\n`;
      message += `   Задачи:\n`;
      for (const task of tasks) {
        message += `   • ${task}\n`;
      }
      message += `\n`;
    }
    
    // Send to ADMIN and OWNER only, not SUPER_ADMIN
    await notifyOpsAdmins(message, { deepLink: "/ops/spa" });
    
    console.log("[Telegram Bot] Sent bath bookings summary with tasks");
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

// Stub for backward compatibility - no longer used
export async function sendCheckInNotifications(): Promise<void> {
  console.log("[Telegram Bot] Check-in notifications disabled (TravelLine removed)");
}

// Send spa booking reminder to guest on the day of booking with temperature selection
export async function sendSpaGuestReminders(): Promise<void> {
  console.log("[Telegram Bot] Sending SPA guest reminders...");
  
  try {
    const today = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Minsk" }).split(" ")[0];
    const spaBookings = await storage.getSpaBookingsForDate(today);
    const activeBookings = spaBookings.filter(b => 
      b.status !== "cancelled" && 
      b.status !== "expired" &&
      b.customer?.telegramId
    );
    
    if (activeBookings.length === 0) {
      console.log("[Telegram Bot] No SPA bookings with Telegram ID for today");
      return;
    }
    
    for (const booking of activeBookings) {
      const telegramId = booking.customer?.telegramId;
      if (!telegramId) continue;
      
      const bookingTypeLabels: Record<string, string> = {
        bath_only: "Баня",
        tub_only: "Купель",
        terrace_only: "Терраса",
        bath_with_tub: "Баня + Купель",
      };
      
      const serviceType = bookingTypeLabels[booking.bookingType] || "СПА";
      
      let message = `<b>Напоминание о бронировании</b>\n\n`;
      message += `Сегодня у вас забронировано:\n`;
      message += `<b>${serviceType}</b>\n`;
      message += `Время: <b>${booking.startTime} - ${booking.endTime}</b>\n`;
      message += `Гости: <b>${booking.guestsCount} чел.</b>\n\n`;
      
      message += `<b>Что взять с собой:</b>\n`;
      message += `• Полотенца (есть в комплекте)\n`;
      message += `• Тапочки (есть в комплекте)\n`;
      message += `• Купальник/плавки\n\n`;
      
      message += `<b>Что есть на месте:</b>\n`;
      message += `• Чай, кофе\n`;
      message += `• Шампунь, гель для душа\n`;
      message += `• Веники (берёзовые, дубовые)\n`;
      message += `• Шапки для бани\n\n`;
      
      if (booking.bookingType === "bath_only" || booking.bookingType === "bath_with_tub") {
        message += `<b>Выберите температуру бани:</b>\n`;
        message += `(Мы начнём топить за 2 часа до вашего приезда)`;
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: "80°C (мягкая)", callback_data: `spa_temp:${booking.id}:80` },
              { text: "90°C (средняя)", callback_data: `spa_temp:${booking.id}:90` },
            ],
            [
              { text: "100°C (жаркая)", callback_data: `spa_temp:${booking.id}:100` },
              { text: "110°C (очень жаркая)", callback_data: `spa_temp:${booking.id}:110` },
            ],
          ],
        };
        
        await sendMessage(parseInt(telegramId, 10), message, {
          reply_markup: keyboard,
        });
      } else {
        await sendMessage(parseInt(telegramId, 10), message);
      }
      
      // Add info about tub temperature
      if (booking.bookingType === "tub_only" || booking.bookingType === "bath_with_tub") {
        await sendMessage(
          parseInt(telegramId, 10),
          `<b>Купель</b>\nМы греем её до 38-40°C. Если хотите другую температуру, напишите администратору.`
        );
      }
      
      console.log(`[Telegram Bot] Sent SPA reminder to guest ${telegramId}`);
      
      // Delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`[Telegram Bot] Sent ${activeBookings.length} SPA guest reminders`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to send SPA guest reminders:", error);
  }
}

// Send access instructions to guest 1 hour before booking
export async function sendSpaAccessInstructions(): Promise<void> {
  console.log("[Telegram Bot] Checking for SPA access instructions to send...");
  
  try {
    const now = new Date();
    const minskTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Minsk",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    
    const [currentHour, currentMinute] = minskTime.split(":").map(Number);
    const today = now.toLocaleString("sv-SE", { timeZone: "Europe/Minsk" }).split(" ")[0];
    
    const spaBookings = await storage.getSpaBookingsForDate(today);
    const activeBookings = spaBookings.filter(b => 
      b.status !== "cancelled" && 
      b.status !== "expired" &&
      b.customer?.telegramId
    );
    
    for (const booking of activeBookings) {
      const [bookingHour] = booking.startTime.split(":").map(Number);
      
      // Send 1 hour before (with 5 min window)
      const targetHour = bookingHour - 1;
      if (currentHour === targetHour && currentMinute >= 0 && currentMinute <= 5) {
        const telegramId = booking.customer?.telegramId;
        if (!telegramId) continue;
        
        let message = `<b>Скоро ваша баня!</b>\n\n`;
        message += `Начало: <b>${booking.startTime}</b>\n\n`;
        message += `<b>Как попасть:</b>\n`;
        message += `Когда будете у ворот, нажмите кнопку ниже, чтобы они открылись автоматически.\n\n`;
        message += `<b>Местоположение:</b>\n`;
        message += `<a href="https://yandex.by/maps/-/CHAbU-Yk">Яндекс Карты (Открыть)</a>\n\n`;
        message += `<b>Контакты администратора:</b>\n`;
        message += `Телефон: +375 29 123-45-67\n`;
        message += `Telegram: @village_drewno_admin\n\n`;
        message += `Приятного отдыха!`;
        
        await sendMessage(parseInt(telegramId, 10), message, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔓 Я на месте — Открыть ворота", callback_data: `gate_open:${booking.id}` }]
            ]
          }
        });
        console.log(`[Telegram Bot] Sent access instructions to guest ${telegramId}`);
      }
    }
  } catch (error) {
    console.error("[Telegram Bot] Failed to send access instructions:", error);
  }
}

// Notify admin about guest's temperature preference
async function notifyAdminAboutSpaTemperature(bookingId: string, temperature: number): Promise<void> {
  try {
    const booking = await storage.getSpaBooking(bookingId);
    if (!booking) return;
    
    const admins = await storage.getStaffUsers();
    const activeAdmins = admins.filter(a => 
      (a.role === "ADMIN" || a.role === "OWNER" || a.role === "SUPER_ADMIN") && 
      a.isActive && 
      a.telegramId
    );
    
    const message = `<b>Гость выбрал температуру бани</b>\n\n` +
      `Бронирование: ${booking.spaResource}\n` +
      `Время: ${booking.startTime} - ${booking.endTime}\n` +
      `Гость: ${booking.customer?.fullName || "Не указано"}\n` +
      `Телефон: ${booking.customer?.phone || "Нет"}\n\n` +
      `<b>Температура: ${temperature}°C</b>\n\n` +
      `Начинайте топить за 2 часа до заезда!`;
    
    for (const admin of activeAdmins) {
      await sendMessage(parseInt(admin.telegramId!, 10), message);
    }
  } catch (error) {
    console.error("[Telegram Bot] Failed to notify admin about temperature:", error);
  }
}

// Notify admins about new SPA booking (only if it's confirmed or pending)
export async function notifySpaBookingCreated(bookingId: string): Promise<void> {
  try {
    const booking = await storage.getSpaBooking(bookingId);
    if (!booking) return;

    const typeLabels: Record<string, string> = {
      bath_only: "Баня",
      tub_only: "Купель",
      bath_with_tub: "Баня + Купель",
      terrace_only: "Терраса",
    };
    const type = typeLabels[booking.bookingType] || "СПА";
    
    await notifyAdmins(
      `<b>Новое бронирование SPA</b>\n\n` +
      `Услуга: <b>${type}</b>\n` +
      `Ресурс: ${booking.spaResource}\n` +
      `Дата: ${booking.date}\n` +
      `Время: ${booking.startTime} - ${booking.endTime}\n` +
      `Гость: ${booking.customer.fullName}\n` +
      `Телефон: ${booking.customer.phone}`,
      { deepLink: `/ops/bookings` }
    );
  } catch (error) {
    console.error("[Telegram Bot] Failed to notify admins about new SPA booking:", error);
  }
}

// Notify guest about booking updates
export async function notifySpaBookingUpdated(bookingId: string): Promise<void> {
  try {
    const booking = await storage.getSpaBooking(bookingId);
    if (!booking || !booking.customer?.telegramId) return;

    const bookingTypeLabels: Record<string, string> = {
      bath_only: "Баня",
      tub_only: "Купель",
      bath_with_tub: "Баня + Купель",
      terrace_only: "Терраса",
    };

    const serviceType = bookingTypeLabels[booking.bookingType] || "СПА";
    const formattedDate = format(parseISO(booking.date), "d MMMM yyyy", { locale: ru });

    let message = `<b>Обновление бронирования</b>\n\n`;
    message += `Администратор внёс изменения в ваше бронирование:\n\n`;
    message += `Услуга: <b>${serviceType}</b>\n`;
    message += `Дата: <b>${formattedDate}</b>\n`;
    message += `Время: <b>${booking.startTime} - ${booking.endTime}</b>\n`;
    message += `Гости: <b>${booking.guestsCount} чел.</b>\n`;
    message += `Итого к оплате: <b>${booking.pricing.total} BYN</b>\n`;
    
    if (booking.pricing.discountPercent > 0) {
      message += `Скидка: <b>${booking.pricing.discountPercent}%</b>\n`;
    }

    message += `\nЖдём вас! Если возникли вопросы, напишите администратору.`;

    await sendMessage(parseInt(booking.customer.telegramId, 10), message);
    console.log(`[Telegram Bot] Sent SPA update notification to guest ${booking.customer.telegramId}`);
  } catch (error) {
    console.error("[Telegram Bot] Failed to send SPA update notification:", error);
  }
}

// Morning reminder to guests
export async function sendSpaMorningReminders(): Promise<void> {
  console.log("[Telegram Bot] Sending morning reminders to guests...");
  try {
    const now = new Date();
    const today = now.toLocaleString("sv-SE", { timeZone: "Europe/Minsk" }).split(" ")[0];
    const bookings = await storage.getSpaBookingsForDate(today);
    const active = bookings.filter(b => b.status !== "cancelled" && b.status !== "expired" && b.customer?.telegramId);

    const bookingTypeLabels: Record<string, string> = {
      bath_only: "Баня",
      tub_only: "Купель",
      bath_with_tub: "Баня + Купель",
      terrace_only: "Терраса",
    };

    for (const booking of active) {
      const serviceType = bookingTypeLabels[booking.bookingType] || "СПА";
      let message = `<b>Доброе утро! Напоминаем о вашем бронировании сегодня</b>\n\n`;
      message += `Услуга: <b>${serviceType}</b>\n`;
      message += `Время: <b>${booking.startTime} - ${booking.endTime}</b>\n`;
      message += `Гости: <b>${booking.guestsCount} чел.</b>\n\n`;
      message += `За час до начала мы пришлём кнопку для открытия ворот и инструкцию.\n\n`;
      message += `Ждём вас!`;

      await sendMessage(parseInt(booking.customer.telegramId!, 10), message);
    }
  } catch (error) {
    console.error("[Telegram Bot] Failed to send guest morning reminders:", error);
  }
}

// Evening summary for admins for tomorrow
export async function sendAdminSpaScheduleSummary(forTomorrow: boolean = true): Promise<void> {
  try {
    const targetDate = new Date();
    if (forTomorrow) targetDate.setDate(targetDate.getDate() + 1);
    const dateStr = targetDate.toLocaleString("sv-SE", { timeZone: "Europe/Minsk" }).split(" ")[0];
    
    const bookings = await storage.getSpaBookingsForDate(dateStr);
    const active = bookings.filter(b => b.status !== "cancelled" && b.status !== "expired");
    
    // Check if there are any bath/tub bookings specifically
    const bathBookings = active.filter(b => 
      b.bookingType === "bath_only" || 
      b.bookingType === "tub_only" || 
      b.bookingType === "bath_with_tub"
    );

    if (bathBookings.length === 0) return;

    const title = forTomorrow ? "<b>Бани и купели на завтра:</b>" : "<b>Бани и купели на сегодня:</b>";
    let message = `${title}\n\n`;

    const bookingTypeLabels: Record<string, string> = {
      bath_only: "Баня",
      tub_only: "Купель",
      bath_with_tub: "Баня + Купель",
      terrace_only: "Терраса",
    };

    bathBookings.sort((a, b) => a.startTime.localeCompare(b.startTime));

    for (const b of bathBookings) {
      const type = bookingTypeLabels[b.bookingType] || "СПА";
      message += `• ${b.startTime}-${b.endTime} | ${b.spaResource} | <b>${type}</b> | ${b.guestsCount} чел.\n`;
    }

    const admins = await storage.getStaffUsers();
    const activeAdmins = admins.filter(a => 
      (a.role === "ADMIN" || a.role === "OWNER" || a.role === "SUPER_ADMIN") && 
      a.isActive && a.telegramId
    );

    for (const admin of activeAdmins) {
      await sendMessage(parseInt(admin.telegramId!, 10), message);
    }
  } catch (error) {
    console.error("[Telegram Bot] Failed to send admin schedule summary:", error);
  }
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
