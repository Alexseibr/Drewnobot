import dotenv from "dotenv";
import EWeLink from "ewelink-api-next";

dotenv.config();

async function openGate() {
  const email = process.env.EWELINK_EMAIL;
  const password = process.env.EWELINK_PASSWORD;
  const region = process.env.EWELINK_REGION || "eu";
  const deviceId = process.env.EWELINK_GATE_DEVICE_ID;

  if (!email || !password || !deviceId) {
    console.error("Missing EWELINK_EMAIL, EWELINK_PASSWORD, or EWELINK_GATE_DEVICE_ID in .env");
    process.exit(1);
  }

  try {
    const WebAPI = (EWeLink as any).WebAPI || (EWeLink as any).default?.WebAPI || EWeLink;
    const client = new WebAPI({ region, email, password });
    
    await client.user.get();
    console.log("Authenticated successfully");

    await client.device.setThingStatus({
      type: 1,
      id: deviceId.trim(),
      params: { switch: "on" }
    });

    console.log("Gate open command sent successfully");
    process.exit(0);
  } catch (error) {
    console.error("Failed to open gate:", error);
    process.exit(1);
  }
}

openGate();
