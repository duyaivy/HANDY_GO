-- Additive category; existing notifications and enum values are preserved.
ALTER TYPE "notification_category" ADD VALUE IF NOT EXISTS 'chat';
