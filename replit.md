# BetPro - Sports Betting Application

## Overview

BetPro is a sports betting web application that displays live odds from various sports events and allows users to create bet slips. The application fetches real-time odds data from The Odds API and presents them in a user-friendly interface with support for multiple sports, betting markets (moneyline, spreads, totals), and a bet slip system for tracking selections.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack React Query for server state, React useState for local state
- **Styling**: Tailwind CSS with custom theme configuration
- **Component Library**: shadcn/ui (Radix UI primitives with custom styling)
- **Build Tool**: Vite with custom plugins for Replit integration

The frontend follows a component-based architecture with:
- Page components in `client/src/pages/`
- Reusable UI components in `client/src/components/ui/` (shadcn/ui)
- Feature-specific components in `client/src/components/`
- Custom hooks in `client/src/hooks/`
- Utility functions and configurations in `client/src/lib/`

### Backend Architecture
- **Framework**: Express.js 5.x with TypeScript
- **HTTP Server**: Node.js native HTTP server
- **API Pattern**: RESTful endpoints under `/api/` prefix
- **Storage**: In-memory storage (MemStorage class) for bet slips

The server handles:
- Proxying requests to The Odds API for sports and odds data
- CRUD operations for bet slips
- Static file serving in production
- Vite dev server middleware in development

### Data Layer
- **Schema Validation**: Zod for runtime type validation
- **ORM**: Drizzle ORM configured for PostgreSQL (schema defined but database may not be provisioned)
- **Shared Types**: Common schemas in `shared/schema.ts` shared between frontend and backend

### Key Design Decisions

1. **Monorepo Structure**: Client and server code coexist with shared types in `shared/` directory, enabling type safety across the stack.

2. **In-Memory Storage**: Currently uses MemStorage for simplicity. The Drizzle configuration is ready for PostgreSQL when database is provisioned.

3. **API Proxy Pattern**: Backend proxies external API calls to The Odds API, keeping API keys secure on the server.

4. **Dark Mode First**: The application defaults to dark mode, suitable for a betting platform interface.

5. **Portuguese Localization**: UI text and date formatting use Brazilian Portuguese (pt-BR).

## External Dependencies

### Third-Party APIs
- **The Odds API**: Primary data source for sports and betting odds
  - Requires `ODDS_API_KEY` environment variable
  - Base URL: `https://api.the-odds-api.com/v4`
  - Endpoints used: `/sports`, `/odds/{sportKey}`

### Database
- **PostgreSQL**: Configured via Drizzle ORM
  - Requires `DATABASE_URL` environment variable
  - Schema migrations in `./migrations/`
  - Currently optional (app functions with in-memory storage)

### Key NPM Packages
- `@tanstack/react-query`: Data fetching and caching
- `drizzle-orm` / `drizzle-zod`: Database ORM and schema validation
- `express`: Web server framework
- `zod`: Schema validation
- `date-fns`: Date formatting with locale support
- `wouter`: Client-side routing
- Full shadcn/ui component suite (Radix UI primitives)