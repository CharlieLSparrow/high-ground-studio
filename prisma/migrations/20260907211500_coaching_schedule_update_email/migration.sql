-- Additive rollout: migrate before deploying the notification producer/worker.
-- A rollback leaves this unused enum value and retained delivery history intact.
ALTER TYPE "TransactionalEmailKind" ADD VALUE IF NOT EXISTS 'BOOKING_RESCHEDULED';
