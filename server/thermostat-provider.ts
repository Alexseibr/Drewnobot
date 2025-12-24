import { storage } from "./storage";
import type { ThermostatHouse, ThermostatActionLog, ThermostatActionTrigger } from "@shared/schema";

export interface ThermostatStatus {
  currentTemp: number;
  targetTemp: number;
  mode: string;
  online: boolean;
}

export interface IThermostatProvider {
  getStatus(houseId: number): Promise<ThermostatStatus>;
  setTargetTemp(houseId: number, tempC: number, reason: string): Promise<boolean>;
}

function generateCorrelationId(): string {
  return `thermo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export class MockThermostatProvider implements IThermostatProvider {
  private statusMap: Map<number, ThermostatStatus> = new Map();

  constructor() {
    for (let i = 1; i <= 4; i++) {
      this.statusMap.set(i, {
        currentTemp: 18 + Math.random() * 4,
        targetTemp: 20,
        mode: "heat",
        online: true,
      });
    }
    console.log("[ThermostatProvider] Mock provider initialized for houses 1-4");
  }

  async getStatus(houseId: number): Promise<ThermostatStatus> {
    const status = this.statusMap.get(houseId);
    if (!status) {
      throw new Error(`House ${houseId} not found in mock provider`);
    }
    const currentTemp = status.currentTemp + (Math.random() - 0.5) * 0.5;
    return { ...status, currentTemp: Math.round(currentTemp * 10) / 10 };
  }

  async setTargetTemp(houseId: number, tempC: number, reason: string): Promise<boolean> {
    console.log(`[ThermostatProvider] Mock: Setting house ${houseId} to ${tempC}°C (${reason})`);
    
    const status = this.statusMap.get(houseId);
    if (!status) {
      throw new Error(`House ${houseId} not found`);
    }

    status.targetTemp = tempC;
    if (tempC > status.currentTemp) {
      status.mode = "heat";
    } else if (tempC < status.currentTemp) {
      status.mode = "cool";
    } else {
      status.mode = "idle";
    }

    this.statusMap.set(houseId, status);
    return true;
  }
}

export class TuyaThermostatProvider implements IThermostatProvider {
  constructor() {
    console.log("[ThermostatProvider] Tuya provider created (NOT IMPLEMENTED - placeholder)");
  }

  async getStatus(houseId: number): Promise<ThermostatStatus> {
    throw new Error("Tuya provider not implemented. Please configure THERMOSTAT_PROVIDER=mock or implement Tuya IoT integration.");
  }

  async setTargetTemp(houseId: number, tempC: number, reason: string): Promise<boolean> {
    throw new Error("Tuya provider not implemented. Please configure THERMOSTAT_PROVIDER=mock or implement Tuya IoT integration.");
  }
}

let providerInstance: IThermostatProvider | null = null;

export function getThermostatProvider(): IThermostatProvider {
  if (!providerInstance) {
    const providerType = process.env.THERMOSTAT_PROVIDER || "mock";
    console.log(`[ThermostatProvider] Initializing provider: ${providerType}`);
    
    switch (providerType) {
      case "tuya":
        providerInstance = new TuyaThermostatProvider();
        break;
      case "mock":
      default:
        providerInstance = new MockThermostatProvider();
        break;
    }
  }
  return providerInstance;
}

export async function logThermostatAction(
  houseId: number,
  actionType: string,
  targetTemp: number | undefined,
  result: string,
  triggeredBy: ThermostatActionTrigger,
  error?: string,
  userId?: string
): Promise<void> {
  const correlationId = generateCorrelationId();
  await storage.createThermostatActionLog({
    ts: new Date().toISOString(),
    houseId,
    actionType,
    targetTemp,
    result,
    error,
    correlationId,
    triggeredBy,
    userId,
  });
}

export async function setThermostatTemp(
  houseId: number,
  tempC: number,
  reason: string,
  triggeredBy: ThermostatActionTrigger,
  userId?: string
): Promise<boolean> {
  if (tempC < 5 || tempC > 35) {
    console.error(`[ThermostatProvider] Invalid temp ${tempC}°C (must be 5-35)`);
    await logThermostatAction(houseId, "set_temp", tempC, "failure", triggeredBy, "Invalid temperature range", userId);
    return false;
  }

  const provider = getThermostatProvider();
  
  try {
    const success = await provider.setTargetTemp(houseId, tempC, reason);
    await logThermostatAction(
      houseId,
      "set_temp",
      tempC,
      success ? "success" : "failure",
      triggeredBy,
      undefined,
      userId
    );

    if (success) {
      await storage.updateThermostatHouseStatus(houseId, { targetTemp: tempC, lastUpdated: new Date().toISOString() });
    }

    return success;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[ThermostatProvider] Error setting temp for house ${houseId}:`, errorMsg);
    await logThermostatAction(houseId, "set_temp", tempC, "failure", triggeredBy, errorMsg, userId);
    return false;
  }
}

export async function refreshThermostatStatus(houseId: number): Promise<ThermostatStatus | null> {
  const provider = getThermostatProvider();
  
  try {
    const status = await provider.getStatus(houseId);
    await storage.updateThermostatHouseStatus(houseId, {
      currentTemp: status.currentTemp,
      targetTemp: status.targetTemp,
      mode: status.mode,
      online: status.online,
      lastUpdated: new Date().toISOString(),
    });
    await logThermostatAction(houseId, "get_status", undefined, "success", "SYSTEM");
    return status;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[ThermostatProvider] Error getting status for house ${houseId}:`, errorMsg);
    await storage.updateThermostatHouseStatus(houseId, { online: false, lastUpdated: new Date().toISOString() });
    await logThermostatAction(houseId, "get_status", undefined, "failure", "SYSTEM", errorMsg);
    return null;
  }
}
