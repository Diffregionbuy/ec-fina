-- Migration: Replace emoji with image_url in categories table
-- Date: 2024-01-01
-- Description: Update categories table to use image_url instead of emoji for better visual representation

BEGIN;

-- Add image_url column
ALTER TABLE categories 
ADD COLUMN image_url TEXT;

-- Add constraint for image_url (optional URL validation)
ALTER TABLE categories 
ADD CONSTRAINT categories_image_url_check 
CHECK (image_url IS NULL OR image_url ~ '^https?://.*');

-- Remove emoji column (after data migration if needed)
-- Note: If you have existing data with emojis, you might want to migrate them first
ALTER TABLE categories 
DROP COLUMN IF EXISTS emoji;

-- Update any existing records to have NULL image_url (since we removed emoji)
-- This is safe since we're starting fresh or migrating

COMMIT;

-- Example of how to run this migration:
-- psql -d your_database -f 006_categories_image_url.sql