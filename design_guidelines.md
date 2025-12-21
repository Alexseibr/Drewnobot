# Drewno Ops Design Guidelines

## Design Approach
**System-Based Approach** using Material Design principles adapted for Telegram Mini App context. This operational tool prioritizes clarity, efficiency, and mobile-first interaction patterns over visual experimentation.

Reference: Google Material Design 3 + Telegram Design Guidelines for native integration

---

## Core Design Principles

1. **Mobile-First Hierarchy** - All interfaces optimized for Telegram WebApp viewport
2. **Role-Based Visual Clarity** - Distinct layouts for Guest, Admin, Owner contexts
3. **Data Transparency** - Clear status indicators and validation feedback
4. **Thumb-Zone Optimization** - Primary actions within comfortable reach

---

## Typography

**Font Family**: System fonts via Telegram WebApp SDK
- Primary: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica
- Monospace: "SF Mono", Monaco, Consolas (for numbers, dates, times)

**Scale**:
- Page Titles: 24px/600 (bold)
- Section Headers: 18px/600
- Card Titles: 16px/500 (medium)
- Body Text: 14px/400
- Labels/Meta: 12px/400
- Data/Numbers: 16px/500 (medium, monospace)

---

## Layout System

**Spacing Units**: Tailwind scale using **4, 8, 12, 16, 24** as primary increments
- Component padding: p-4 (16px)
- Section spacing: space-y-6 (24px)
- Card gaps: gap-4
- Tight groupings: gap-2
- Page margins: px-4 (mobile), max-w-7xl mx-auto (desktop)

**Container Strategy**:
- Full-width cards with rounded-lg
- Bottom-sheet modals for actions (Telegram-native feel)
- Sticky headers for context retention during scroll

---

## Component Library

### Navigation
- **Bottom Tab Bar** (Guest/Admin): Fixed position, 4-5 primary sections max
- **Top Header Bar**: Page title + role indicator + optional action button
- **Hamburger Menu** (Owner): Access to analytics, settings, all sections

### Forms & Input
- **Text Inputs**: Outlined style, floating labels, 48px min-height for touch
- **Date/Time Pickers**: Native Telegram/browser pickers
- **Number Inputs**: Large stepper controls (+/-) for quantities
- **Toggle Switches**: Material-style for boolean options (tub yes/no)
- **Radio Groups**: Pill-style buttons for tub type selection (none/small/large)

### Data Display
- **Booking Cards**: 
  - Left accent bar indicating status (pending/confirmed/completed)
  - Header row: Unit code + date
  - Body: Customer name, time, key details
  - Footer: Payment status badges + action buttons
  
- **Task Lists**:
  - Checkbox + task title + unit code badge
  - Time-based grouping (overdue, today, upcoming)
  - Swipe-to-complete gesture support

- **Cash Transactions**:
  - Icon + category + amount (aligned right)
  - Running balance visible
  - Expense items in red/negative styling

- **Session Availability** (Quads):
  - Timeline view with remaining capacity indicators
  - Green fill bars showing % booked
  - Tap to book with immediate feedback

### Buttons & Actions
- **Primary CTA**: Full-width, 48px height, rounded corners (rounded-lg)
- **Secondary**: Outlined style, same dimensions
- **Destructive**: Red/error variant for cancel/delete
- **Icon Buttons**: 40px tap target minimum
- **FAB** (Admin ops): Fixed bottom-right for "New Booking" quick access

### Status Indicators
- **Badges**: Pill-shaped, color-coded
  - Pending: Yellow/Amber
  - Confirmed: Green
  - Completed: Gray
  - Cancelled: Red
  - Awaiting Payment: Blue
- **Progress Indicators**: Linear bar for session capacity, checklist completion

### Overlays
- **Bottom Sheets**: Slide-up modals for forms (booking creation, payment entry)
- **Toast Notifications**: Top-center, 3s auto-dismiss
- **Confirmation Dialogs**: Centered modal for destructive actions

---

## Role-Specific Layouts

### Guest Booking Interface
- Simplified 2-step flow: Select availability → Enter details → Confirm
- Large calendar picker for date selection
- Visual availability grid (green/yellow/red slots)
- Minimal form fields with smart defaults

### Admin Operations Panel
- Dashboard view: Today's tasks + upcoming check-ins + active shift
- Tab navigation: Tasks | Bookings | Cash | Logs
- Quick actions sticky at bottom
- Geolocation capture indicator when required (small icon in input footer)

### Owner Analytics
- KPI cards grid (2-column on mobile)
- Line charts for revenue trends (use Chart.js)
- Filterable date range selector
- Detailed tables with export action

---

## Mobile Considerations

**Gestures**:
- Swipe task cards to mark complete
- Pull-to-refresh on list views
- Long-press for contextual menus

**Safe Areas**:
- Respect Telegram WebApp safe area insets
- Bottom navigation 16px above viewport edge
- No critical content behind status bar

**Performance**:
- Virtualized lists for >20 items (react-window)
- Optimistic UI updates for actions
- Skeleton loaders during data fetch (avoid spinners)

---

## Images

**No hero images** - This is an operational tool, not marketing site.

**Functional Images**:
- Unit/cottage thumbnails: 80x80px rounded squares in booking cards
- Bath photos: 120x90px in availability selection
- Quad bikes: Small icon representation in session cards

---

## Critical UX Patterns

1. **Confirmation Flows**: Always show summary before final submit (booking details, payment amounts)
2. **Error States**: Inline validation with specific guidance (e.g., "End time must be before 22:00")
3. **Empty States**: Friendly messages with suggested actions, not blank screens
4. **Loading States**: Skeleton UI matching final layout structure
5. **Success Feedback**: Green checkmark animation + brief toast notification

---

## Accessibility

- Minimum 14px font size throughout
- 48px minimum touch targets
- Clear focus indicators (2px outline)
- High contrast for status badges (WCAG AA minimum)
- Descriptive labels for screen readers on all form inputs