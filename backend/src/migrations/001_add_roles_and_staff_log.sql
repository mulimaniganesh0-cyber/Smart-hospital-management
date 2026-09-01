-- src/migrations/001_add_roles_and_staff_log.sql
-- Non-destructive additions for roles and staff_activity_log

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add role, hospital_role, permissions columns to users if missing
ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS role VARCHAR(100);

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS hospital_role VARCHAR(100);

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS permissions JSONB;

-- Staff activity log
CREATE TABLE IF NOT EXISTS staff_activity_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(200) NOT NULL,
  meta JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_staff_activity_user ON staff_activity_log(user_id);
