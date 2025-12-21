import { createHmac, createHash, randomBytes } from "crypto";
import type { TelegramUser } from "@shared/schema";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

interface InitDataParams {
  query_id?: string;
  user?: string;
  auth_date: string;
  hash: string;
  [key: string]: string | undefined;
}

interface ValidatedInitData {
  telegramUser: TelegramUser;
  authDate: Date;
}

export function parseInitData(initData: string): InitDataParams {
  const params = new URLSearchParams(initData);
  const result: InitDataParams = {
    auth_date: "",
    hash: "",
  };
  
  params.forEach((value, key) => {
    result[key] = value;
  });
  
  return result;
}

export function validateInitData(initData: string): ValidatedInitData | null {
  if (!BOT_TOKEN) {
    console.warn("[Telegram Auth] BOT_TOKEN not set, using dev mode");
    return validateInitDataDevMode(initData);
  }
  
  const params = parseInitData(initData);
  const { hash, ...dataToCheck } = params;
  
  if (!hash) {
    console.error("[Telegram Auth] Missing hash in initData");
    return null;
  }
  
  const dataCheckString = Object.keys(dataToCheck)
    .filter(key => dataToCheck[key] !== undefined)
    .sort()
    .map(key => `${key}=${dataToCheck[key]}`)
    .join("\n");
  
  const secretKey = createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();
  
  const computedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  
  if (computedHash !== hash) {
    console.error("[Telegram Auth] Invalid hash");
    return null;
  }
  
  const authDate = new Date(parseInt(params.auth_date) * 1000);
  const now = new Date();
  const maxAge = 24 * 60 * 60 * 1000;
  
  if (now.getTime() - authDate.getTime() > maxAge) {
    console.error("[Telegram Auth] Auth date too old");
    return null;
  }
  
  if (!params.user) {
    console.error("[Telegram Auth] No user data in initData");
    return null;
  }
  
  try {
    const telegramUser = JSON.parse(params.user) as TelegramUser;
    return { telegramUser, authDate };
  } catch (e) {
    console.error("[Telegram Auth] Failed to parse user data");
    return null;
  }
}

function validateInitDataDevMode(initData: string): ValidatedInitData | null {
  const params = parseInitData(initData);
  
  if (params.user) {
    try {
      const telegramUser = JSON.parse(params.user) as TelegramUser;
      return {
        telegramUser,
        authDate: new Date(),
      };
    } catch {
      return null;
    }
  }
  
  return {
    telegramUser: {
      id: 123456789,
      first_name: "Тест",
      last_name: "Пользователь",
      username: "test_user",
    },
    authDate: new Date(),
  };
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function getSessionExpiresAt(): string {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  return expires.toISOString();
}
