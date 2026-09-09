-- Actual doctor schedules are the source of appointment availability.  No
-- schedule rows are seeded here because working hours must be configured by
-- the hospital, not guessed from a doctor's directory record.
CREATE TABLE IF NOT EXISTS doctor_schedules (
  id SERIAL PRIMARY KEY,
  doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = Sunday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration_minutes INTEGER NOT NULL CHECK (slot_duration_minutes > 0 AND slot_duration_minutes <= 480),
  break_start_time TIME,
  break_end_time TIME,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (start_time < end_time),
  CHECK ((break_start_time IS NULL AND break_end_time IS NULL) OR
         (break_start_time IS NOT NULL AND break_end_time IS NOT NULL AND break_start_time < break_end_time AND break_start_time >= start_time AND break_end_time <= end_time)),
  UNIQUE (doctor_id, hospital_id, weekday, start_time)
);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_lookup ON doctor_schedules(doctor_id, hospital_id, weekday) WHERE is_active;

CREATE TABLE IF NOT EXISTS doctor_leaves (
  id SERIAL PRIMARY KEY,
  doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  leave_start_date DATE NOT NULL,
  leave_end_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'approved',
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (leave_end_date >= leave_start_date)
);
CREATE INDEX IF NOT EXISTS idx_doctor_leaves_lookup ON doctor_leaves(doctor_id, hospital_id, leave_start_date, leave_end_date) WHERE status='approved';
