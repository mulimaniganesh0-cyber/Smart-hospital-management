// test-controllers.js
const bloodBankController = require('./src/controllers/bloodBankController');

console.log('Blood Bank Controller exports:');
console.log('getBloodAvailability:', typeof bloodBankController.getBloodAvailability);
console.log('getAllBloodBanks:', typeof bloodBankController.getAllBloodBanks);
console.log('requestBlood:', typeof bloodBankController.requestBlood);
console.log('updateBloodStock:', typeof bloodBankController.updateBloodStock);

// Should all be 'function'