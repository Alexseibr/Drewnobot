import type { TravelLineBooking, InsertTravelLineBooking } from "@shared/schema";

const TRAVELLINE_AUTH_URL = "https://partner.tlintegration.com/auth/token";
const TRAVELLINE_API_URL = "https://partner.tlintegration.com";

interface TravelLineConfig {
  clientId: string;
  clientSecret: string;
  propertyId: string;
}

interface TravelLineToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expiresAt: number;
}

let cachedToken: TravelLineToken | null = null;

function getConfig(): TravelLineConfig | null {
  const clientId = process.env.TRAVELLINE_CLIENT_ID;
  const clientSecret = process.env.TRAVELLINE_CLIENT_SECRET;
  const propertyId = process.env.TRAVELLINE_PROPERTY_ID;

  if (!clientId || !clientSecret || !propertyId) {
    console.log("[TravelLine] Missing configuration - client_id, client_secret, or property_id");
    return null;
  }

  return { clientId, clientSecret, propertyId };
}

async function getAccessToken(): Promise<string | null> {
  const config = getConfig();
  if (!config) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    console.log("[TravelLine] Using cached token");
    return cachedToken.access_token;
  }

  console.log(`[TravelLine] Requesting new token for client: ${config.clientId.substring(0, 20)}...`);
  
  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    
    const response = await fetch(TRAVELLINE_AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TravelLine] Auth failed: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    
    cachedToken = {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };

    console.log("[TravelLine] Token obtained successfully");
    return cachedToken.access_token;
  } catch (error) {
    console.error("[TravelLine] Auth error:", error);
    return null;
  }
}

interface TLReservation {
  id: string;
  propertyId: string;
  roomStays: Array<{
    roomCategory: {
      name: string;
      code?: string;
    };
    checkIn: string;
    checkOut: string;
    guests: Array<{
      givenName?: string;
      surname?: string;
      phone?: string;
      email?: string;
    }>;
    adultsCount: number;
    childrenCount?: number;
    totalAmount?: {
      amount: number;
      currency: string;
    };
    services?: Array<{
      name: string;
      code?: string;
    }>;
  }>;
  status: string;
  notes?: string;
}

function mapRoomCategoryToUnitCode(roomCategoryName: string): string | undefined {
  const mapping: Record<string, string> = {
    "Домик 1": "D1",
    "Домик 2": "D2",
    "Домик 3": "D3",
    "Домик 4": "D4",
    "Cottage 1": "D1",
    "Cottage 2": "D2",
    "Cottage 3": "D3",
    "Cottage 4": "D4",
    "Дом 1": "D1",
    "Дом 2": "D2",
    "Дом 3": "D3",
    "Дом 4": "D4",
  };

  for (const [key, value] of Object.entries(mapping)) {
    if (roomCategoryName.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }

  const match = roomCategoryName.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1]);
    if (num >= 1 && num <= 4) {
      return `D${num}`;
    }
  }

  return undefined;
}

function mapTLStatus(status: string): TravelLineBooking["status"] {
  const statusMap: Record<string, TravelLineBooking["status"]> = {
    "New": "new",
    "Confirmed": "confirmed",
    "CheckedIn": "checked_in",
    "CheckedOut": "checked_out",
    "Cancelled": "cancelled",
    "NoShow": "no_show",
  };
  return statusMap[status] || "new";
}

function transformReservation(reservation: TLReservation): InsertTravelLineBooking | null {
  const roomStay = reservation.roomStays?.[0];
  if (!roomStay) return null;

  const guest = roomStay.guests?.[0] || {};
  const guestName = [guest.givenName, guest.surname].filter(Boolean).join(" ") || "Гость";

  return {
    id: reservation.id,
    propertyId: reservation.propertyId,
    roomCategoryName: roomStay.roomCategory?.name || "Unknown",
    unitCode: mapRoomCategoryToUnitCode(roomStay.roomCategory?.name || ""),
    checkInDate: roomStay.checkIn,
    checkOutDate: roomStay.checkOut,
    guestName,
    guestPhone: guest.phone,
    guestEmail: guest.email,
    adultsCount: roomStay.adultsCount || 1,
    childrenCount: roomStay.childrenCount || 0,
    totalAmount: roomStay.totalAmount?.amount,
    currency: roomStay.totalAmount?.currency || "BYN",
    additionalServices: roomStay.services?.map(s => s.name) || [],
    status: mapTLStatus(reservation.status),
    notes: reservation.notes,
  };
}

async function fetchBookingDetails(propertyId: string, bookingNumber: string, token: string): Promise<TLReservation | null> {
  try {
    const url = `${TRAVELLINE_API_URL}/api/read-reservation/v1/properties/${propertyId}/bookings/${bookingNumber}`;
    
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`[TravelLine] Failed to fetch booking ${bookingNumber}: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`[TravelLine] Error fetching booking ${bookingNumber}:`, error);
    return null;
  }
}

export async function fetchTodayCheckIns(): Promise<InsertTravelLineBooking[]> {
  const config = getConfig();
  if (!config) {
    console.log("[TravelLine] No config, skipping fetch");
    return [];
  }

  const token = await getAccessToken();
  if (!token) return [];

  const today = new Date().toISOString().split("T")[0];

  try {
    // Use Read Reservation API v1 endpoint with modifiedFrom filter to get recent bookings only
    // Get bookings modified in the last 30 days to avoid fetching old data
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const modifiedFrom = thirtyDaysAgo.toISOString();
    
    const url = `${TRAVELLINE_API_URL}/api/read-reservation/v1/properties/${config.propertyId}/bookings?modifiedFrom=${encodeURIComponent(modifiedFrom)}`;
    
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TravelLine] API error: ${response.status} - ${errorText}`);
      return [];
    }

    const data = await response.json();
    const bookingSummaries = data.bookingSummaries || [];
    
    // Filter only Active bookings
    const activeBookings = bookingSummaries.filter((s: { status: string }) => 
      s.status === "Active" || s.status === "Confirmed" || s.status === "New"
    );
    
    console.log(`[TravelLine] Received ${bookingSummaries.length} booking summaries, ${activeBookings.length} active`);
    
    // Fetch details only for active bookings (with rate limit protection)
    const detailedBookings: TLReservation[] = [];
    let requestCount = 0;
    const maxRequests = 15; // Stay under rate limit
    
    for (const summary of activeBookings) {
      if (requestCount >= maxRequests) {
        console.log(`[TravelLine] Rate limit protection: stopped after ${maxRequests} detail requests`);
        break;
      }
      
      const details = await fetchBookingDetails(config.propertyId, summary.number, token);
      if (details) {
        detailedBookings.push(details);
      }
      requestCount++;
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Filter for today's check-ins
    const todayCheckIns = detailedBookings.filter(r => {
      const checkIn = r.roomStays?.[0]?.checkIn;
      return checkIn && checkIn.startsWith(today);
    });

    console.log(`[TravelLine] Found ${todayCheckIns.length} check-ins for today (of ${detailedBookings.length} fetched bookings)`);

    const bookings: InsertTravelLineBooking[] = [];
    for (const reservation of todayCheckIns) {
      const booking = transformReservation(reservation);
      if (booking) {
        bookings.push(booking);
      }
    }

    return bookings;
  } catch (error) {
    console.error("[TravelLine] Fetch error:", error);
    return [];
  }
}

export async function fetchReservationById(reservationId: string): Promise<InsertTravelLineBooking | null> {
  const config = getConfig();
  if (!config) return null;

  const token = await getAccessToken();
  if (!token) return null;

  try {
    // Use Read Reservation API v1 endpoint
    const url = `${TRAVELLINE_API_URL}/api/read-reservation/v1/properties/${config.propertyId}/bookings/${reservationId}`;
    
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`[TravelLine] Reservation fetch error: ${response.status}`);
      return null;
    }

    const reservation: TLReservation = await response.json();
    return transformReservation(reservation);
  } catch (error) {
    console.error("[TravelLine] Fetch reservation error:", error);
    return null;
  }
}

export async function syncTodayBookings(storage: any): Promise<TravelLineBooking[]> {
  const bookings = await fetchTodayCheckIns();
  const synced: TravelLineBooking[] = [];

  for (const booking of bookings) {
    try {
      const existing = await storage.getTravelLineBooking(booking.id);
      if (existing) {
        const updated = await storage.updateTravelLineBooking(booking.id, booking);
        if (updated) synced.push(updated);
      } else {
        const created = await storage.createTravelLineBooking(booking);
        synced.push(created);
      }
    } catch (error) {
      console.error(`[TravelLine] Error syncing booking ${booking.id}:`, error);
    }
  }

  console.log(`[TravelLine] Synced ${synced.length} bookings`);
  return synced;
}

export function isTravelLineConfigured(): boolean {
  return getConfig() !== null;
}
