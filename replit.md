# BetPro - Sports Betting Application

## Overview

BetPro is a sports betting web application that displays live odds from various sports events and allows users to create bet slips. The application fetches data from two sources:
- **The Odds API** - Current games and odds (h2h, spreads, totals) from 40+ soccer leagues worldwide
- **API-Football** - Extra betting markets (329 different markets) for additional betting options

The UI features a modal interface showing available betting markets. All odds are boosted by 20% with original values shown crossed out.

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
- Proxying requests to The Odds API for current games and basic odds (h2h, spreads, totals)
- Proxying requests to API-Football for extra betting markets (329 markets)
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

3. **API Proxy Pattern**: Backend proxies external API calls to The Odds API and API-Football, keeping API keys secure on the server.

4. **Dark Mode First**: The application defaults to dark mode, suitable for a betting platform interface.

5. **Portuguese Localization**: UI text and date formatting use Brazilian Portuguese (pt-BR).

## External Dependencies

### Third-Party APIs
- **The Odds API**: Primary data source for current games and basic odds
  - Requires `ODDS_API_KEY` environment variable
  - Base URL: `https://api.the-odds-api.com/v4`
  - Endpoints used: `/sports`, `/sports/{sport}/odds`
  - Rate limit: 500 requests/month (free tier)
  - Caching: 10 minutes
  - Markets: h2h (1X2), spreads, totals

- **API-Football**: Additional betting markets
  - Requires `API_FOOTBALL_KEY` environment variable
  - Base URL: `https://v3.football.api-sports.io`
  - Endpoints used: `/fixtures`, `/odds`, `/odds/bets`
  - Rate limit: 100 requests/day (free tier)
  - Caching: 15 minutes
  - Markets: 329 different markets including BTTS, HT/FT, Corners, Cards, and more

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