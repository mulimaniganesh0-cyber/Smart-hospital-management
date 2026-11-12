const NEXT_DRIVER_STATUS = Object.freeze({
  assigned: 'driver_accepted',
  dispatched: 'driver_accepted',
  driver_accepted: 'en_route_to_patient',
  en_route_to_patient: 'arrived_at_patient',
  arrived_at_patient: 'patient_picked_up',
  patient_picked_up: 'en_route_to_hospital',
  en_route_to_hospital: 'arrived_at_hospital',
  arrived_at_hospital: 'completed',
});

function nextDriverStatus(currentStatus) {
  return NEXT_DRIVER_STATUS[String(currentStatus || '').toLowerCase()] || null;
}

function canTransitionDriverStatus(currentStatus, requestedStatus) {
  return nextDriverStatus(currentStatus) === String(requestedStatus || '').toLowerCase();
}

function canAccessAssignment(user, assignment) {
  if (!user || !assignment) return false;
  const isActiveDriver = user.role === 'ambulance_driver' && user.driver_status === 'active' && user.account_status === 'ACTIVE' && ['hospital_driver','private_driver'].includes(user.driver_type);
  return Boolean((isActiveDriver && (assignment.assigned_driver_user_id === user.id || assignment.driver_user_id === user.id)) ||
    (user.patient_id != null && assignment.patient_id === user.patient_id) ||
    (user.hospital_id != null && assignment.hospital_id === user.hospital_id));
}

module.exports = { NEXT_DRIVER_STATUS, nextDriverStatus, canTransitionDriverStatus, canAccessAssignment };
