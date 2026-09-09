const test = require('node:test');
const assert = require('node:assert/strict');
const { weekdayForDate, generateSlots } = require('../src/services/appointmentAvailabilityService');

test('calendar weekday is stable for canonical API dates', () => {
  // 2026-09-12 is Saturday. The calculation never uses the host timezone.
  assert.equal(weekdayForDate('2026-09-12'), 6);
});

test('schedule slots exclude breaks and the end boundary', () => {
  const slots = generateSlots([{ start_time: '09:00:00', end_time: '12:00:00', slot_duration_minutes: 30, break_start_time: '10:00:00', break_end_time: '10:30:00' }]);
  assert.deepEqual(slots, ['09:00:00', '09:30:00', '10:30:00', '11:00:00', '11:30:00']);
});

test('multiple configured intervals are combined in chronological order', () => {
  const slots = generateSlots([
    { start_time: '14:00:00', end_time: '15:00:00', slot_duration_minutes: 30 },
    { start_time: '09:00:00', end_time: '10:00:00', slot_duration_minutes: 30 },
  ]);
  assert.deepEqual(slots, ['09:00:00', '09:30:00', '14:00:00', '14:30:00']);
});
