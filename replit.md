# Drewno Ops

## Overview

Drewno Ops is a Telegram Mini App for managing cottage and bath booking operations. The system serves both internal staff (admins, owners, instructors) and guests, providing functionality for booking management, task scheduling, cash handling, and quad/ATV session coordination. The application is designed mobile-first for optimal Telegram WebApp integration.

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
- **Quad Sessions**: Instructor-managed ATV booking slots

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
- **Bot**: @Drewnoo_bot with inline keyboard menu
- **WebApp SDK**: Telegram WebApp SDK for mini-app functionality
- **Authentication**: HMAC-SHA256 initData verification with 24h expiry
- **Sessions**: 7-day session tokens stored in localStorage
- **Webhook**: `/api/telegram/webhook` for bot updates
- **Commands**: /start, /menu, /help

### Telegram Bot Features
- Guest menu: Book bath, book quads, SPA, website link
- Staff menu: Role-based buttons (panel, bookings, cash, tasks, analytics)
- Auto-detection of user role from database

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