const { timezone } = require('../controllers/dailyQrController');

const ACTIVE_RESERVATION_STATUSES = ['pending', 'confirmed', 'rescheduled', 'accepted'];

function weekdayForDate(date) {
  // Noon UTC avoids converting a calendar date into the previous/next day.
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function seconds(value) {
  const [hour, minute, second = '0'] = String(value).slice(0, 8).split(':').map(Number);
  return hour * 3600 + minute * 60 + second;
}

function timeForSeconds(value) {
  const hour = Math.floor(value / 3600);
  const minute = Math.floor((value % 3600) / 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function generateSlots(schedules) {
  const slots = new Set();
  for (const schedule of schedules) {
    const start = seconds(schedule.start_time);
    const end = seconds(schedule.end_time);
    const duration = Number(schedule.slot_duration_minutes);
    const breakStart = schedule.break_start_time ? seconds(schedule.break_start_time) : null;
    const breakEnd = schedule.break_end_time ? seconds(schedule.break_end_time) : null;
    for (let current = start; current + duration * 60 <= end; current += duration * 60) {
      // A slot may not overlap a configured break, including a break that
      // begins in the middle of the slot.
      if (breakStart !== null && current < breakEnd && current + duration * 60 > breakStart) continue;
      slots.add(timeForSeconds(current));
    }
  }
  return [...slots].sort();
}

async function localClock(db) {
  const result = await db.query(`SELECT
    (CURRENT_TIMESTAMP AT TIME ZONE $1)::date::text AS today,
    (CURRENT_TIMESTAMP AT TIME ZONE $1)::time AS now`, [timezone]);
  return result.rows[0];
}

async function getAvailability(db, { hospitalId, doctorId, date }) {
  const clock = await localClock(db);
  if (date < clock.today) return { available: false, slots: [], reason: 'INVALID_DATE' };

  const doctor = await db.query(`SELECT d.id, d.name FROM doctors d
    JOIN hospitals h ON h.id=d.hospital_id
    WHERE d.id=$1 AND d.hospital_id=$2
      AND COALESCE(d.is_active, true) AND COALESCE(d.availability_status, true)
      AND (h.is_verified=true OR h.directory_visible=true)`, [doctorId, hospitalId]);
  if (!doctor.rowCount) return { available: false, slots: [], reason: 'DOCTOR_NOT_ASSOCIATED_WITH_HOSPITAL' };

  const leave = await db.query(`SELECT 1 FROM doctor_leaves
    WHERE doctor_id=$1 AND hospital_id=$2 AND $3::date BETWEEN leave_start_date AND leave_end_date
      AND status='approved' LIMIT 1`, [doctorId, hospitalId, date]);
  if (leave.rowCount) return { available: false, slots: [], reason: 'DOCTOR_ON_LEAVE', doctor: doctor.rows[0] };

  const weekday = weekdayForDate(date);
  const schedules = await db.query(`SELECT start_time, end_time, slot_duration_minutes, break_start_time, break_end_time
    FROM doctor_schedules WHERE doctor_id=$1 AND hospital_id=$2 AND weekday=$3 AND is_active=true
    ORDER BY start_time`, [doctorId, hospitalId, weekday]);
  if (!schedules.rowCount) return { available: false, slots: [], reason: 'NO_SCHEDULE_CONFIGURED', weekday, doctor: doctor.rows[0] };

  let generated = generateSlots(schedules.rows);
  // Only today's slots are compared with the India-local clock. Future dates
  // deliberately retain morning slots regardless of the current time.
  if (date === clock.today) generated = generated.filter((time) => time > String(clock.now).slice(0, 8));
  if (!generated.length) return { available: false, slots: [], reason: 'NO_FUTURE_SLOTS', weekday, doctor: doctor.rows[0] };

  const booked = await db.query(`SELECT appointment_time FROM appointments
    WHERE doctor_id=$1 AND hospital_id=$2 AND appointment_date=$3
      AND LOWER(COALESCE(status,'')) = ANY($4::text[])`,
  [doctorId, hospitalId, date, ACTIVE_RESERVATION_STATUSES]);
  const bookedTimes = new Set(booked.rows.map((row) => String(row.appointment_time).slice(0, 8)));
  const slots = generated.map((time) => ({ time, available: !bookedTimes.has(time) }));
  const available = slots.some((slot) => slot.available);
  return { available, slots, reason: available ? null : 'ALL_SLOTS_BOOKED', weekday, doctor: doctor.rows[0] };
}

module.exports = { ACTIVE_RESERVATION_STATUSES, weekdayForDate, generateSlots, getAvailability };
