// These events used to let any authenticated socket publish arbitrary state
// into another user's room. Database-backed controllers are the only source of
// truth for these changes and publish their own events after authorization.
const SERVER_PUBLISHED_EVENTS = Object.freeze({
  'appointment-update': 'Appointment updates are published by the server after an authorized API action.',
  'dashboard-update': 'Dashboard updates are published by the server after an authorized API action.',
  'resource-update': 'Resource updates are published by the server after an authorized API action.',
  'blood-request': 'Blood requests are published by the server after an authorized API action.',
  'blood-inventory-update': 'Blood inventory updates are published by the server after an authorized API action.',
});

function registerServerPublishedEventGuards(socket) {
  for (const [event, message] of Object.entries(SERVER_PUBLISHED_EVENTS)) {
    socket.on(event, () => socket.emit('socket-error', { message }));
  }
}

module.exports = { SERVER_PUBLISHED_EVENTS, registerServerPublishedEventGuards };
