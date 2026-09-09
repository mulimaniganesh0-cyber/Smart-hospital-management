// Run this from a scheduler (for example every 10 seconds). It is safe to run
// concurrently: expired dispatches are locked in PostgreSQL before escalation.
const { processExpiredDispatches } = require('../services/emergencyDispatchService');
const { pool } = require('../config/database');

processExpiredDispatches()
  .then((transitions) => console.log(`Processed ${transitions.length} expired SOS dispatch(es).`))
  .catch((error) => { console.error('SOS dispatch worker failed:', error.message); process.exitCode = 1; })
  .finally(() => pool.end());
