-- Migration: unit_status_vacant
-- Normalizes unit status vocabulary: AVAILABLE → VACANT
--
-- This migration aligns the local development schema (public."Unit") with
-- the property_service.units normalization in migration 002_unit_status_normalization.sql.
--
-- Preserved: OCCUPIED, MAINTENANCE, OFFLINE
-- Idempotent: UPDATE with WHERE guard is safe to re-run.

-- ── 1. Rename existing AVAILABLE rows to VACANT ──────────────────────────────

UPDATE "Unit"
SET "status" = 'VACANT', "updatedAt" = NOW()
WHERE "status" = 'AVAILABLE';

-- ── 2. Update column default ──────────────────────────────────────────────────

ALTER TABLE "Unit"
  ALTER COLUMN "status" SET DEFAULT 'VACANT';
