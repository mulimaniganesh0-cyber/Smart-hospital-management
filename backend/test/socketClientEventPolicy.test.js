const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SERVER_PUBLISHED_EVENTS,
  registerServerPublishedEventGuards,
} = require('../src/services/socketClientEventPolicy');

test('client sockets cannot spoof server-published business updates', () => {
  const handlers = new Map();
  const emitted = [];
  const socket = {
    on(event, handler) { handlers.set(event, handler); },
    emit(event, data) { emitted.push({ event, data }); },
  };
  registerServerPublishedEventGuards(socket);

  for (const event of Object.keys(SERVER_PUBLISHED_EVENTS)) {
    assert.equal(typeof handlers.get(event), 'function', `${event} has a guard`);
    handlers.get(event)({ hospitalId: 999, patientId: 999, units: 100000 });
  }

  assert.equal(emitted.length, Object.keys(SERVER_PUBLISHED_EVENTS).length);
  assert.ok(emitted.every((item) => item.event === 'socket-error'));
});
