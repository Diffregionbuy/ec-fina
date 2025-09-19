# EcBot SaaS Platform

A comprehensive Discord bot platform for Minecraft server owners, providing server monitoring, player tracking, and economy integration.

## Project Structure

This is a monorepo containing:

- `packages/frontend` - Next.js web application
- `packages/backend` - Express.js API server
- `packages/bot` - Discord bot application
- `packages/shared` - Shared types and utilities

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm 9+
- Redis server
- Supabase account

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment files:
   ```bash
   cp .env.example .env
   cp packages/frontend/.env.local.example packages/frontend/.env.local
   cp packages/backend/.env.example packages/backend/.env
   cp packages/bot/.env.example packages/bot/.env
   ```

4. Configure your environment variables in the copied files

5. Build shared package:
   ```bash
   npm run build --workspace=shared
   ```

### Development

Start all services in development mode:
```bash
npm run dev
```

Or start individual services:
```bash
npm run dev:frontend  # Frontend on http://localhost:3000
npm run dev:backend   # Backend on http://localhost:3001
npm run dev:bot       # Discord bot
```

### Building

Build all packages:
```bash
npm run build
```

### Testing

Run tests for all packages:
```bash
npm run test
```

### Code Quality

Format code:
```bash
npm run format
```

Lint code:
```bash
npm run lint
```

## Features

- Discord OAuth authentication
- Bot instance management
- Minecraft server monitoring
- Subscription management
- Real-time updates
- Economy integration with OKX API

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Express.js, TypeScript, Supabase
- **Bot**: Discord.js v14
- **Database**: Supabase (PostgreSQL)
- **Cache**: Redis
- **Authentication**: NextAuth.js
- **Deployment**: Docker, Vercel/Railway

## License

MIT