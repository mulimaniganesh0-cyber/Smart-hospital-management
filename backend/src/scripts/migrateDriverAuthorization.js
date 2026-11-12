const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function main() {
  try {
    const identity = await pool.query(
      'SELECT current_database() AS database, current_schema() AS schema, inet_server_addr()::text AS server, inet_server_port() AS port'
    );
    const target = identity.rows[0];
    console.log(`Driver authorization migration target: database=${target.database}; schema=${target.schema}; server=${target.server || 'local socket'}; port=${target.port || 'n/a'}`);

    const schemaCheck = await pool.query(
      `SELECT to_regclass('public.users') AS users_table,
              to_regclass('public.ambulances') AS ambulances_table,
              to_regclass('public.emergency_requests') AS emergency_requests_table,
              to_regclass('public.ambulance_bookings') AS ambulance_bookings_table,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='driver_type') AS has_driver_type,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='driver_status') AS has_driver_status,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ambulances' AND column_name='driver_user_id') AS has_ambulance_driver_user_id,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='emergency_requests' AND column_name='assigned_driver_user_id') AS has_assigned_driver_user_id,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ambulances' AND column_name='driver_location_lat') AS has_driver_location_lat,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ambulances' AND column_name='driver_location_lng') AS has_driver_location_lng,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ambulances' AND column_name='driver_location_timestamp') AS has_driver_location_timestamp,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='emergency_requests' AND column_name='updated_at') AS has_emergency_updated_at,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='emergency_requests' AND column_name='location_timestamp') AS has_emergency_location_timestamp,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ambulance_bookings' AND column_name='ambulance_id') AS has_booking_ambulance_id,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ambulance_bookings' AND column_name='updated_at') AS has_booking_updated_at,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ambulance_bookings' AND column_name='status') AS has_booking_status,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='id') AS has_user_id,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='role') AS has_user_role,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='hospital_id') AS has_user_hospital_id,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='account_status') AS has_user_account_status,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='created_at') AS has_user_created_at,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ambulances' AND column_name='id') AS has_ambulance_id,
              EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_emergency_driver_active') AS has_driver_index`
    );
    const state = schemaCheck.rows[0];
    const prerequisites = [
      ['public.users', state.users_table],
      ['public.ambulances', state.ambulances_table],
      ['public.emergency_requests', state.emergency_requests_table],
      ['public.ambulance_bookings', state.ambulance_bookings_table],
      ['public.users.id', state.has_user_id],
      ['public.users.role', state.has_user_role],
      ['public.users.hospital_id', state.has_user_hospital_id],
      ['public.users.account_status', state.has_user_account_status],
      ['public.users.created_at', state.has_user_created_at],
      ['public.ambulances.id', state.has_ambulance_id],
      ['public.emergency_requests.updated_at', state.has_emergency_updated_at],
      ['public.emergency_requests.location_timestamp', state.has_emergency_location_timestamp],
      ['public.ambulance_bookings.ambulance_id', state.has_booking_ambulance_id],
      ['public.ambulance_bookings.updated_at', state.has_booking_updated_at],
      ['public.ambulance_bookings.status', state.has_booking_status],
    ];
    const missingPrerequisites = prerequisites.filter(([, present]) => !present).map(([name]) => name);
    const migration016Items = [
      ['ambulances.driver_user_id', state.has_ambulance_driver_user_id],
      ['emergency_requests.assigned_driver_user_id', state.has_assigned_driver_user_id],
      ['ambulances.driver_location_lat', state.has_driver_location_lat],
      ['ambulances.driver_location_lng', state.has_driver_location_lng],
      ['ambulances.driver_location_timestamp', state.has_driver_location_timestamp],
      ['idx_emergency_driver_active', state.has_driver_index],
    ];
    const missing016Items = migration016Items.filter(([, present]) => !present).map(([name]) => name);
    console.log(`Schema status: driver_type=${state.has_driver_type}; driver_status=${state.has_driver_status}; missing migration 016 objects=${missing016Items.length ? missing016Items.join(', ') : 'none'}`);
    if (!process.argv.includes('--apply')) {
      console.log('Status only. Migration 017 copies ambulances.driver_user_id into ambulance_bookings.driver_user_id; that source column is created by migration 016. Add --apply to apply any missing 016 objects and then migration 017.');
      return;
    }
    if (missingPrerequisites.length) {
      throw new Error(`Required base schema is incomplete (${missingPrerequisites.join(', ')}); refusing to apply driver migrations.`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (missing016Items.length) {
        const sql016 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '016_ambulance_driver_assignments.sql'), 'utf8');
        await client.query(sql016);
        console.log('Applied missing prerequisites from migration 016_ambulance_driver_assignments.sql.');
      }
      const sql017 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '017_driver_authorization_and_patient_tracking.sql'), 'utf8');
      await client.query(sql017);
      await client.query('COMMIT');
      console.log('Driver authorization migrations 016 and 017 applied successfully.');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // PostgreSQL can return socket errors with an empty message on some Windows
  // setups. Report safe diagnostic fields without printing connection options.
  const reason = error.message || error.code || error.name || 'Unknown database error';
  console.error(`Driver authorization migration failed: ${reason}`);
  process.exitCode = 1;
});
