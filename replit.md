# Village Drewno

## Overview

Village Drewno - загородный комплекс. Аренда домиков. Баня. Горячая купель.

This is a Telegram Mini App for managing cottage and bath booking operations. The system serves both internal staff (admins, owners, instructors) and guests, providing functionality for booking management, task scheduling, cash handling, and quad/ATV session coordination. The application is designed mobile-first for optimal Telegram WebApp integration.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, built using Vite
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, React Context for auth/theme
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom theme variables for light/dark modes
- **Telegram Integration**: Telegram WebApp SDK loaded via script tag for native mini-app features

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Pattern**: REST endpoints under `/api/*` prefix
- **Build**: esbuild for server bundling, Vite for client bundling

### Data Layer
- **Storage**: In-memory storage (MemStorage class) for MVP - no database required
- **Schema**: Drizzle-style schema with Zod integration in `/shared/schema.ts`
- **Type Safety**: Full TypeScript/Zod type safety for all entities

### Role-Based Access Control
Five user roles with hierarchical permissions:
- **SUPER_ADMIN**: Full access + staff management (role assignment)
- **OWNER**: Full access to all features, analytics, and historical data
- **ADMIN**: Current shift operations, today's bookings, no historical access after shift closure
- **INSTRUCTOR**: Quad sessions management only
- **GUEST**: Booking interfaces for baths and quads

### Key Domain Entities
- **Units**: Cottages (1-4) and Baths (1-2) with cleaning tariffs (A, B, C)
- **Bookings**: Cottage check-ins/outs and bath reservations with status workflows
- **Tasks**: Scheduled reminders (climate control, trash, meters) and manual tasks
- **Cash Management**: Shift-based cash tracking with transactions and incasation
- **Quad Bookings**: Dynamic slot-based ATV booking system with:
  - Short route (30 min) and Long route (60 min)
  - Dynamic pricing managed by instructors (base prices + date-specific overrides for holidays/events)
  - 4 quads available, operating hours 09:00-19:00
  - 15 min buffer between rides
  - 5% discount when joining existing slot (group booking incentive)
  - Phone-based rate limiting (max 3 pending per phone)
  - Instructor blocked times with overlap validation
  - Telegram notifications for instructors (new bookings, morning summary, evening reminder)
- **Quad Pricing**: Instructor-managed pricing system
  - Base prices for short/long routes (default: 50/80 BYN)
  - Date-specific price overrides for holidays/special events
  - Public API: `/api/quads/price` for guests
  - Instructor API: `/api/instructor/quads/pricing` (authenticated)
  - Instructor UI: `/instructor/pricing` for managing all pricing

### Administrative Features (New)
- **Guest Rating System** (`/ops/guests`)
  - 5-level rating: excellent, good, neutral, problematic, blacklisted
  - Searchable guest list with filtering by status
  - Edit dialog for rating guests and adding notes
- **Supplies/Consumables Tracking** (`/ops/supplies`)
  - Categorized inventory: fuel, cleaning, food, equipment, other
  - Stock transactions history with add/remove operations
  - Low stock alerts when current stock <= minimum stock
- **Incidents/Repairs Journal** (`/ops/incidents`)
  - Track issues by unit with priority levels (low/medium/high/critical)
  - Status workflow: open -> in_progress -> resolved/cancelled
  - History of all incidents per unit
- **Staff Shifts Scheduling** (`/owner/shifts`)
  - Weekly calendar view with shift types (morning/evening/full_day/night)
  - Assign staff to shifts, delete shifts
- **Work Hours Logging** (`/ops/worklogs`)
  - Log hours worked with hourly rate calculation
  - Monthly salary estimation
- **Unit Info / QR Codes** (`/owner/unit-info`)
  - Set WiFi credentials, house rules, contact info per unit
  - Generate QR codes for guests to scan
- **Smart Thermostat Control** (`/owner/thermostats`)
  - 4 cottages with IoT thermostats (Tuya/SmartLife compatible)
  - Daily plan types: CHECKIN_TODAY (16°C base), NO_CHECKIN (15°C base), GUESTS_STAYING (no auto changes)
  - Scheduler: 12:00 daily prompt, 12:05 apply base temps, 14:30 start heating to 22°C for check-ins
  - Manual overrides: heat-now (22°C) and custom temperature setting (5-35°C)
  - Action logs with correlation IDs and trigger types (SCHEDULED, MANUAL)
  - Provider interface: Mock (dev) and Tuya (production, placeholder)
  - API: `/api/admin/thermostats/houses`, `/api/admin/thermostats/plan/today`, `/api/admin/thermostats/houses/:id/heat-now`, `/api/admin/thermostats/houses/:id/set-temp`, `/api/admin/thermostats/logs`

### Project Structure
```
/client          - React frontend application
  /src
    /components  - UI components (shadcn/ui + custom)
    /pages       - Route pages (guest, ops, instructor, owner)
    /lib         - Utilities, auth context, theme provider
    /hooks       - Custom React hooks
/server          - Express backend
/shared          - Shared types and Zod schemas
/migrations      - Drizzle database migrations
```

## External Dependencies

### Database
- PostgreSQL database connection via `DATABASE_URL` environment variable
- Drizzle ORM for database operations
- connect-pg-simple for session storage

### Telegram Integration
- **Bot**: @Drewno_bot with inline keyboard menu
- **WebApp SDK**: Telegram WebApp SDK for mini-app functionality
- **Authentication**: HMAC-SHA256 initData verification with 24h expiry
- **Sessions**: 7-day session tokens stored in localStorage
- **Webhook**: `/api/telegram/webhook` for bot updates
- **Commands**: /start, /menu, /help

### Telegram Bot Features
- Guest menu: Book bath, book quads, SPA, website link
- Staff menu: Role-based buttons (panel, bookings, cash, tasks, analytics)
- Auto-detection of user role from database

### Staff Authorization System
- **Telegram ID-based authorizations**: Owner can pre-assign roles using Telegram user IDs
  - Staff authorizations table: `staff_authorizations` with telegramId, role, note, isActive
  - API: `/api/admin/authorizations` (GET, POST, PATCH, DELETE)
  - UI: `/owner/staff` for managing authorizations
- **Phone-based invitations (legacy)**: Still supported as fallback
  - Staff invitations table: `staff_invitations` with phone, role, note
  - API: `/api/admin/invitations` (GET, POST, DELETE)
- **Auth flow priority**: Telegram ID authorization checked first, then phone invitation
- **Role upgrade**: Existing GUEST users automatically upgrade when matching authorization found

### UI Framework Dependencies
- Radix UI primitives for accessible components
- Tailwind CSS for styling
- class-variance-authority for component variants
- date-fns for date manipulation
- react-day-picker for calendar components
- embla-carousel-react for carousels
- recharts for analytics charts
- vaul for drawer components

### Development Tools
- Vite dev server with HMR
- Replit-specific plugins for development (cartographer, dev-banner, error overlay)