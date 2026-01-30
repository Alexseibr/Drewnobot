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

// TravelLine API response structure (wrapped in "booking" object)
interface TLReservation {
  booking: {
    number: string;
    propertyId: number;
    status: string;
    roomStays: Array<{
      roomType: {
        id: string;
        name: string;
      };
      stayDates: {
        arrivalDateTime: string;
        departureDateTime: string;
      };
      guestCount: {
        adultCount: number;
        childAges?: number[];
      };
      guests: Array<{
        firstName?: string;
        lastName?: string;
        phone?: string;
        email?: string;
      }>;
      total: {
        priceBeforeTax: number;
        priceAfterTax: number;
      };
      services?: Array<{
        name: string;
        code?: string;
      }>;
    }>;
    customer?: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
    };
  };
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

function transformReservation(data: TLReservation): InsertTravelLineBooking | null {
  const booking = data.booking;
  if (!booking) return null;
  
  const roomStay = booking.roomStays?.[0];
  if (!roomStay) return null;

  // Get guest from roomStay or customer
  const guest = roomStay.guests?.[0] || booking.customer || {};
  const guestName = [guest.firstName, guest.lastName].filter(Boolean).join(" ") || "Гость";

  // Extract dates from stayDates
  const checkInDate = roomStay.stayDates?.arrivalDateTime?.split("T")[0] || "";
  const checkOutDate = roomStay.stayDates?.departureDateTime?.split("T")[0] || "";

  return {
    id: booking.number,
    propertyId: String(booking.propertyId),
    roomCategoryName: roomStay.roomType?.name || "Unknown",
    unitCode: mapRoomCategoryToUnitCode(roomStay.roomType?.name || ""),
    checkInDate,
    checkOutDate,
    guestName,
    guestPhone: guest.phone,
    guestEmail: guest.email,
    adultsCount: roomStay.guestCount?.adultCount || 1,
    childrenCount: roomStay.guestCount?.childAges?.length || 0,
    totalAmount: roomStay.total?.priceAfterTax,
    currency: "BYN",
    additionalServices: roomStay.services?.map(s => s.name) || [],
    status: mapTLStatus(booking.status),
    notes: undefined,
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
      const errorText = await response.text();
      console.error(`[TravelLine] Failed to fetch booking ${bookingNumber}: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    // Log first booking structure for debugging
    if (bookingNumber.includes("20231208")) {
      console.log(`[TravelLine] Sample booking response:`, JSON.stringify(data, null, 2).substring(0, 2000));
    }
    return data;
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

  // Use Minsk timezone for today's date
  const minskDate = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Minsk" }).split(" ")[0];
  const today = minskDate;
  console.log(`[TravelLine] Today's date (Minsk): ${today}`);

  try {
    // Use Read Reservation API v1 endpoint
    // API returns oldest first, so we need pagination. First get count, then fetch from end.
    const baseUrl = `${TRAVELLINE_API_URL}/api/read-reservation/v1/properties/${config.propertyId}/bookings`;
    
    // First request to get total count
    console.log(`[TravelLine] Fetching total booking count...`);
    const countResponse = await fetch(`${baseUrl}?limit=1`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    
    if (!countResponse.ok) {
      console.error(`[TravelLine] Count API error: ${countResponse.status}`);
      return [];
    }
    
    const countData = await countResponse.json();
    const totalCount = countData.totalCount || 0;
    console.log(`[TravelLine] Total bookings in system: ${totalCount}`);
    
    // Fetch recent bookings (last 200 to cover recent activity)
    const offset = Math.max(0, totalCount - 200);
    const url = `${baseUrl}?offset=${offset}&limit=200`;
    console.log(`[TravelLine] Fetching recent bookings (offset=${offset}) from: ${url}`);
    
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
    
    // Debug: show first 3 booking numbers to understand format
    if (bookingSummaries.length > 0) {
      console.log(`[TravelLine] Sample booking numbers:`);
      bookingSummaries.slice(0, 3).forEach((s: { number: string; status: string }) => {
        console.log(`[TravelLine]   - ${s.number} (status: ${s.status})`);
      });
    }
    
    // Booking number format: YYYYMMDD-propertyId-bookingId (e.g., 20260130-39140-123456)
    // Filter by today's date prefix FIRST to reduce dataset
    const todayPrefix = today.replace(/-/g, ""); // "2026-01-30" -> "20260130"
    
    // Debug: show all bookings for today with their statuses
    const allTodaysBookings = bookingSummaries.filter((s: { number: string }) => 
      s.number.startsWith(todayPrefix)
    );
    console.log(`[TravelLine] All bookings for today (${todayPrefix}): ${allTodaysBookings.length}`);
    if (allTodaysBookings.length > 0) {
      allTodaysBookings.forEach((s: { number: string; status: string }) => {
        console.log(`[TravelLine]   - ${s.number}: status=${s.status}`);
      });
    }
    
    // Filter pending statuses (New, Confirmed, Active - not CheckedIn/CheckedOut/Cancelled)
    const todaysBookings = allTodaysBookings.filter((s: { status: string }) => {
      return s.status === "New" || s.status === "Confirmed" || s.status === "Active";
    });
    
    console.log(`[TravelLine] Received ${bookingSummaries.length} summaries, ${todaysBookings.length} pending for today`);
    
    // Fetch details only for today's bookings
    const detailedBookings: TLReservation[] = [];
    const maxRequests = 20; // Enough for daily check-ins
    
    for (let i = 0; i < Math.min(todaysBookings.length, maxRequests); i++) {
      const summary = todaysBookings[i];
      console.log(`[TravelLine] Fetching details for booking: ${summary.number}`);
      const details = await fetchBookingDetails(config.propertyId, summary.number, token);
      if (details) {
        detailedBookings.push(details);
        const b = details.booking;
        const rs = b?.roomStays?.[0];
        console.log(`[TravelLine] Booking ${summary.number}: checkIn=${rs?.stayDates?.arrivalDateTime}, guest=${rs?.guests?.[0]?.lastName || b?.customer?.lastName || 'N/A'}, room=${rs?.roomType?.name}`);
      }
      // Delay to respect rate limit
      if (i < todaysBookings.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    }

    // All fetched bookings should be today's (already pre-filtered by booking number prefix)
    console.log(`[TravelLine] Fetched ${detailedBookings.length} booking details for today`);

    const bookings: InsertTravelLineBooking[] = [];
    for (const reservation of detailedBookings) {
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
