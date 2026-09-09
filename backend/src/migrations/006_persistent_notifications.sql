-- Extends the existing notifications table; user_id remains the authenticated recipient.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'normal';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_type VARCHAR(50);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_id INTEGER;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS ambulance_id INTEGER REFERENCES ambulances(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS emergency_id INTEGER REFERENCES emergency_requests(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_hospital_unread ON notifications(hospital_id, is_read, created_at DESC);
