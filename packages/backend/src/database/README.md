# Database Setup Instructions

This directory contains the database schema and migration files for the EcBot SaaS platform.

## Quick Setup

1. **Create a Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Wait for the project to be fully initialized

2. **Execute the Database Migration**
   - Open your Supabase project dashboard
   - Navigate to the SQL Editor (left sidebar)
   - Copy the contents of `combined_migration.sql`
   - Paste and execute the SQL

3. **Configure Environment Variables**
   - Copy your project URL and service role key from Supabase settings
   - Update your `.env` file with the credentials:
     ```
     SUPABASE_URL=your_project_url
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
     ```

## Migration Files

The database schema is split into three migration files:

### 001_initial_schema.sql
Creates all the core tables:
- `users` - User profiles from Discord OAuth
- `servers` - Discord server configurations
- `categories` - Product categories per server
- `products` - Products for sale in each server
- `wallets` - User wallet information for OKX integration
- `transactions` - Payment and withdrawal records
- `orders` - Purchase orders and delivery tracking
- `order_items` - Individual items within orders
- `setup_templates` - Pre-built configuration templates
- `onboarding_progress` - User onboarding state tracking

### 002_row_level_security.sql
Implements Row Level Security (RLS) policies for multi-tenant data isolation:
- Users can only access their own data
- Server owners can manage their server's data
- Service role has full access for backend operations
- Public read access for active templates and products

### 003_indexes.sql
Creates database indexes for optimal query performance:
- Primary key indexes on frequently queried columns
- Composite indexes for common query patterns
- Partial indexes for filtered queries
- GIN indexes for JSONB column searches
- Full-text search indexes for product names and descriptions

## Database Schema Overview

```
users (Discord OAuth profiles)
├── servers (Discord server configs)
│   ├── categories (Product categories)
│   │   └── products (Items for sale)
│   ├── orders (Purchase records)
│   │   └── order_items (Individual purchases)
│   └── onboarding_progress (Setup state)
├── wallets (OKX payment integration)
└── transactions (Payment history)

setup_templates (Pre-built configurations)
```

## Key Features

- **Multi-tenant Architecture**: Each Discord server has isolated data
- **Row Level Security**: Automatic data access control
- **Audit Trail**: Created/updated timestamps on all records
- **Data Integrity**: Foreign key constraints and check constraints
- **Performance Optimized**: Comprehensive indexing strategy
- **JSONB Support**: Flexible configuration storage
- **Full-text Search**: Product search capabilities

## Testing the Setup

After running the migration, you can test the database connection:

```bash
cd packages/backend
npm run dev
```

The application should start without database connection errors.

## Troubleshooting

### Common Issues

1. **UUID Extension Error**
   - The migration automatically enables the `uuid-ossp` extension
   - If you get permission errors, ensure you're using the service role key

2. **RLS Policy Errors**
   - Make sure all tables are created before running the RLS migration
   - Policies reference the `auth.uid()` function which requires Supabase Auth

3. **Index Creation Errors**
   - Some indexes may fail if the referenced columns don't exist
   - Run migrations in order: schema → RLS → indexes

### Manual Migration

If you prefer to run migrations individually:

1. Execute `001_initial_schema.sql`
2. Execute `002_row_level_security.sql`
3. Execute `003_indexes.sql`

Each file can be run independently in the Supabase SQL Editor.