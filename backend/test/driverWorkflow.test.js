const test = require('node:test');
const assert = require('node:assert/strict');
const { NEXT_DRIVER_STATUS, canTransitionDriverStatus, nextDriverStatus, canAccessAssignment } = require('../src/services/driverWorkflowService');

test('driver emergency workflow exposes only the ordered next action', () => {
  const sequence = [
    ['assigned', 'driver_accepted'],
    ['driver_accepted', 'en_route_to_patient'],
    ['en_route_to_patient', 'arrived_at_patient'],
    ['arrived_at_patient', 'patient_picked_up'],
    ['patient_picked_up', 'en_route_to_hospital'],
    ['en_route_to_hospital', 'arrived_at_hospital'],
    ['arrived_at_hospital', 'completed'],
  ];
  for (const [current, next] of sequence) {
    assert.equal(nextDriverStatus(current), next);
    assert.equal(canTransitionDriverStatus(current, next), true);
  }
});

test('driver workflow rejects skipped, repeated, terminal, and unknown transitions', () => {
  assert.equal(nextDriverStatus('assigned'), 'driver_accepted');
  assert.equal(canTransitionDriverStatus('assigned', 'arrived_at_patient'), false);
  assert.equal(canTransitionDriverStatus('en_route_to_patient', 'en_route_to_patient'), false);
  assert.equal(canTransitionDriverStatus('completed', 'driver_accepted'), false);
  assert.equal(canTransitionDriverStatus('cancelled', 'completed'), false);
  assert.equal(nextDriverStatus('unexpected'), null);
});

test('assignment subscription access is limited to the patient, assigned active driver, or assigned hospital',()=>{
  const assignment={assigned_driver_user_id:41,driver_user_id:41,patient_id:14,hospital_id:8};
  assert.equal(canAccessAssignment({id:41,role:'ambulance_driver',driver_type:'hospital_driver',driver_status:'active',account_status:'ACTIVE'},assignment),true);
  assert.equal(canAccessAssignment({id:41,role:'ambulance_driver',driver_type:'private_driver',driver_status:'suspended',account_status:'SUSPENDED'},assignment),false);
  assert.equal(canAccessAssignment({id:22,role:'patient',patient_id:14},assignment),true);
  assert.equal(canAccessAssignment({id:23,role:'hospital_admin',hospital_id:8},assignment),true);
  assert.equal(canAccessAssignment({id:99,role:'patient',patient_id:99},assignment),false);
  assert.equal(canAccessAssignment({id:42,role:'ambulance_driver',driver_type:'hospital_driver',driver_status:'active',account_status:'ACTIVE'},assignment),false);
});
