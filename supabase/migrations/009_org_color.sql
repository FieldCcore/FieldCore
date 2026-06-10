-- Adds color column to organizations for entity switcher dots (Decision-051)
-- Safe to run even if color already exists (from 001_auth_schema.sql on fresh installs)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#D6B58A';
UPDATE organizations SET color = '#D6B58A' WHERE color IS NULL OR color = '';
