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

  const today = new Date().toISOString().split("T")[0];

  try {
    // Use Read Reservation API v1 endpoint with arrivalDate filter
    const url = `${TRAVELLINE_API_URL}/api/read-reservation/v1/properties/${config.propertyId}/bookings?arrivalDate=${today}`;
    
    console.log(`[TravelLine] Fetching bookings for today (${today}) from: ${url}`);
    
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
    
    // Filter only Active/Confirmed/New bookings (API already filtered by arrivalDate)
    const activeBookings = bookingSummaries.filter((s: { status: string }) => 
      s.status === "Active" || s.status === "Confirmed" || s.status === "New"
    );
    
    console.log(`[TravelLine] Received ${bookingSummaries.length} booking summaries for ${today}, ${activeBookings.length} active`);
    
    // Fetch details for all today's bookings (with rate limit protection)
    const detailedBookings: TLReservation[] = [];
    const maxRequests = 20; // Enough for daily check-ins
    
    for (let i = 0; i < Math.min(activeBookings.length, maxRequests); i++) {
      const summary = activeBookings[i];
      console.log(`[TravelLine] Fetching details for booking: ${summary.number}`);
      const details = await fetchBookingDetails(config.propertyId, summary.number, token);
      if (details) {
        detailedBookings.push(details);
        const b = details.booking;
        const rs = b?.roomStays?.[0];
        console.log(`[TravelLine] Booking ${summary.number}: checkIn=${rs?.stayDates?.arrivalDateTime}, guest=${rs?.guests?.[0]?.lastName || b?.customer?.lastName || 'N/A'}, room=${rs?.roomType?.name}`);
      }
      // Delay to respect rate limit
      if (i < activeBookings.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    }

    // Filter for today's check-ins (API arrivalDate filter not working, so filter locally)
    const todayCheckIns = detailedBookings.filter(d => {
      const checkInDate = d.booking?.roomStays?.[0]?.stayDates?.arrivalDateTime?.split("T")[0];
      return checkInDate === today;
    });

    console.log(`[TravelLine] Found ${todayCheckIns.length} check-ins for today (of ${detailedBookings.length} fetched)`);

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
