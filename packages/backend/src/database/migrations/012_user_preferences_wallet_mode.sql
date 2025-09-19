-- Add preferences JSONB column to users for storing UI/user settings
-- Migration: 012_user_preferences_wallet_mode.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

-- Optional: ensure updated_at is touched by app logic; no trigger added here.

