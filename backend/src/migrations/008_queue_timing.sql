ALTER TABLE queue_tokens ADD COLUMN IF NOT EXISTS estimated_turn_at TIMESTAMPTZ;
ALTER TABLE queue_tokens ADD COLUMN IF NOT EXISTS consultation_duration_seconds INTEGER;
ALTER TABLE queue_tokens ADD COLUMN IF NOT EXISTS held_at TIMESTAMPTZ;
ALTER TABLE queue_tokens ADD COLUMN IF NOT EXISTS resumed_at TIMESTAMPTZ;

-- One durable event per token/type.  A restarted server can safely retry the
-- due-notification worker without sending duplicate patient alerts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_token_type_once
  ON notifications (related_id, type)
  WHERE related_type = 'queue_token'
    AND type IN ('token_approaching_3', 'token_next', 'token_eta_reached');

CREATE INDEX IF NOT EXISTS idx_queue_tokens_eta_due
  ON queue_tokens (estimated_turn_at)
  WHERE status IN ('BOOKED','CHECKED_IN','WAITING','HELD');
