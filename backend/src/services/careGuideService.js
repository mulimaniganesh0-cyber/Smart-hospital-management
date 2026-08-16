const { pool } = require('../config/database');

const EMERGENCY_PATTERN = /severe\s+(chest|abdominal|stomach)\s+pain|chest.*(crushing|tight|pain)|can(?:not|'t)\s+breathe|difficulty\s+breathing|shortness\s+of\s+breath|faint(ed|ing)?|loss\s+of\s+consciousness|seizure|stroke|sudden.*(weak|numb|arm|face)|uncontrolled\s+bleeding|severe\s+(burn|allerg|injury)|poison|major\s+trauma|emergency\s+help|\bsos\b|\bneed\s+(an?\s+)?ambulance\b/i;
const URGENT_PATTERN = /severe\s+eye\s+pain|persistent\s+vomit|high\s+fever|worsening|serious\s+injury|urgent/i;
const NEARBY_PATTERN = /near\s*(me|by|my|here)|nearby|nearest|closest|around\s+me|my\s+location/i;
const SEARCH_PATTERN = /hospital|doctor|specialist|cardiologist|pediatrician|ophthalm|orthopedic|orthopaed|\bent\b|icu|blood\s*bank|ambulance|available\s*beds?|find|show\s+all|compare|cheapest|highest\s+rated/i;

const SPECIALTY_HINTS = {
  Ophthalmology: ['eye', 'eyes', 'vision', 'ophthalm'],
  ENT: ['ear', 'nose', 'throat', 'ent'],
  Orthopedics: ['bone', 'fracture', 'joint', 'orthopedic', 'orthopaed'],
  Cardiology: ['heart', 'cardio'],
  Pediatrics: ['child', 'children', 'baby', 'pediatric', 'paediatric'],
  'Gynecology & Obstetrics': ['pregnan', 'maternity', 'women', 'gynec', 'obstetric'],
  Neurology: ['brain', 'nerve', 'neurolog'],
};

function asBoolean(value) { return value === true || value === 'true'; }
function hasCoordinates(latitude, longitude) { return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && !(Number(latitude) === 0 && Number(longitude) === 0); }
function normalise(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

async function resolveSpecialty(message) {
  const specialties = await pool.query(`SELECT DISTINCT specialty FROM hospitals h CROSS JOIN LATERAL unnest(COALESCE(h.specialties, '{}')) specialty WHERE h.is_verified = true`);
  const available = specialties.rows.map((row) => row.specialty).filter(Boolean);
  const text = normalise(message);
  // Prefer unambiguous clinical language over substring matches.  In
  // particular, short entries such as "ENT" must not accidentally match text
  // across ordinary words.
  for (const [canonical, hints] of Object.entries(SPECIALTY_HINTS)) {
    if (!hints.some((hint) => new RegExp(`\\b${hint}`).test(text))) continue;
    const expected = normalise(canonical);
    const match = available.find((specialty) => {
      const candidate = normalise(specialty);
      return candidate.includes(expected) || expected.includes(candidate) || hints.some((hint) => candidate.includes(hint));
    });
    if (match) return match;
  }
  const direct = available.find((item) => {
    const candidate = normalise(item);
    return candidate.length > 2 && new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`).test(text);
  });
  if (direct) return direct;
  return null;
}

function cityFromMessage(message) {
  const match = message.match(/(?:in|at)\s+([a-z][a-z .-]{1,50})(?:\?|$)/i);
  if (!match || NEARBY_PATTERN.test(message)) return null;
  const city = match[1].trim().replace(/\b(hospital|nearby|please)\b.*$/i, '').trim();
  return city || null;
}

function buildHealthResponse(message, severity) {
  const text = normalise(message);
  let care = 'Rest, drink fluids regularly, eat light foods as tolerated, and monitor how you feel.';
  if (text.includes('cold') || text.includes('cough')) care = 'Rest, drink fluids or warm soothing drinks, and use humidified air if it helps. Monitor your symptoms.';
  if (text.includes('sore throat')) care = 'Drink warm fluids, stay hydrated, rest your voice, and consider warm salt-water gargles if they are comfortable for you.';
  if (text.includes('fever')) care = 'Rest, drink plenty of fluids, wear comfortable light clothing, and monitor your temperature.';
  if (text.includes('headache')) care = 'Rest in a calm, dim room if helpful, drink fluids, and avoid triggers you recognise.';
  if (severity === 'urgent') return 'Your symptoms may need same-day medical assessment. Please seek urgent care, especially if they are worsening. I can also find an appropriate nearby hospital.';
  return `For a mild symptom, general self-care can include: ${care}\n\nSeek urgent care if you develop difficulty breathing, severe chest pain, confusion, fainting, severe weakness, persistent vomiting, severe pain, or symptoms that are rapidly worsening. I can provide general information, but I cannot diagnose or prescribe medicine.`;
}

async function searchHospitals({ latitude, longitude, specialty, city, emergency, icu, bloodBank, bloodGroup, ambulance, availableBeds, sort = 'distance', limit = 5 }) {
  const nearby = hasCoordinates(latitude, longitude);
  const params = [];
  const add = (value) => { params.push(value); return `$${params.length}`; };
  const lat = nearby ? add(Number(latitude)) : null;
  const lng = nearby ? add(Number(longitude)) : null;
  const distance = nearby ? `(6371 * acos(LEAST(1.0, GREATEST(-1.0, cos(radians(${lat})) * cos(radians(h.latitude)) * cos(radians(h.longitude) - radians(${lng})) + sin(radians(${lat})) * sin(radians(h.latitude))))))` : 'NULL';
  const filters = ['h.is_verified = true'];
  if (nearby) filters.push('h.latitude IS NOT NULL AND h.longitude IS NOT NULL');
  if (specialty) filters.push(`${add(specialty)} = ANY(h.specialties)`);
  if (city) filters.push(`h.city ILIKE ${add(`%${city}%`)}`);
  if (emergency) filters.push('h.emergency_available = true');
  if (icu) filters.push('COALESCE(hr.icu_beds_available, 0) > 0');
  if (availableBeds) filters.push('COALESCE(hr.general_beds_available, 0) > 0');
  if (bloodBank) filters.push(`EXISTS (SELECT 1 FROM blood_bank bb WHERE bb.hospital_id = h.id AND bb.units_available > 0${bloodGroup ? ` AND bb.blood_group = ${add(bloodGroup)}` : ''})`);
  if (ambulance) filters.push('EXISTS (SELECT 1 FROM ambulances a WHERE a.hospital_id = h.id AND a.is_available = true)');
  const order = sort === 'cost' ? 'consultation_cost ASC NULLS LAST, distance ASC NULLS LAST' : sort === 'rating' ? 'h.google_rating DESC NULLS LAST, distance ASC NULLS LAST' : sort === 'beds' ? 'available_beds DESC, distance ASC NULLS LAST' : 'distance ASC NULLS LAST, h.google_rating DESC NULLS LAST';
  const query = `SELECT h.id, h.name, h.address, h.city, h.phone, h.latitude, h.longitude, h.google_rating, h.google_review_count, h.google_place_id, h.google_maps_url, h.rating_verified, h.rating_last_updated, h.specialties, h.emergency_available,
    COALESCE(hr.general_beds_available, 0) available_beds, COALESCE(hr.icu_beds_available, 0) available_icu,
    COALESCE(hr.ventilators_available, 0) available_ventilators, COALESCE((SELECT SUM(bb.units_available) FROM blood_bank bb WHERE bb.hospital_id=h.id${bloodGroup ? ` AND bb.blood_group = ${add(bloodGroup)}` : ''}), 0) blood_units,
    COALESCE((SELECT COUNT(*) FROM doctors d WHERE d.hospital_id=h.id AND d.availability_status=true), 0) doctor_count,
    (SELECT MIN(d.consultation_fee) FROM doctors d WHERE d.hospital_id=h.id AND d.availability_status=true) consultation_cost,
    EXISTS (SELECT 1 FROM ambulances a WHERE a.hospital_id=h.id AND a.is_available=true) ambulance_available, ${distance} distance
    FROM hospitals h LEFT JOIN hospital_resources hr ON hr.hospital_id=h.id WHERE ${filters.join(' AND ')} ORDER BY ${order} LIMIT ${add(Math.min(Math.max(Number(limit) || 5, 1), 20))}`;
  const result = await pool.query(query, params);
  return result.rows.map((row) => ({ ...row, google_rating: row.rating_verified ? Number(row.google_rating) : null, google_review_count: row.rating_verified ? Number(row.google_review_count) : null, distance: row.distance == null ? null : Number(row.distance), available_beds: Number(row.available_beds), available_icu: Number(row.available_icu), available_ventilators: Number(row.available_ventilators), blood_units: Number(row.blood_units), doctor_count: Number(row.doctor_count), consultation_cost: row.consultation_cost == null ? null : Number(row.consultation_cost) }));
}

async function searchDoctors({ latitude, longitude, specialty, limit = 20 }) {
  const nearby = hasCoordinates(latitude, longitude);
  const params = [];
  const add = (value) => { params.push(value); return `$${params.length}`; };
  const lat = nearby ? add(Number(latitude)) : null;
  const lng = nearby ? add(Number(longitude)) : null;
  const distance = nearby ? `(6371 * acos(LEAST(1.0, GREATEST(-1.0, cos(radians(${lat})) * cos(radians(h.latitude)) * cos(radians(h.longitude) - radians(${lng})) + sin(radians(${lat})) * sin(radians(h.latitude))))))` : 'NULL';
  const filters = ['h.is_verified = true', 'd.availability_status = true'];
  if (nearby) filters.push('h.latitude IS NOT NULL AND h.longitude IS NOT NULL');
  if (specialty) filters.push(`(d.specialization ILIKE ${add(`%${specialty}%`)} OR ${add(specialty)} = ANY(h.specialties))`);
  const result = await pool.query(`SELECT d.id, d.name, d.specialization, d.qualification, d.experience_years, d.consultation_fee, d.phone,
    h.id hospital_id, h.name hospital_name, h.address, h.city, h.latitude, h.longitude, h.emergency_available, h.google_rating, h.google_review_count, h.rating_verified, ${distance} distance,
    (SELECT COUNT(*) FROM doctor_available_slots s WHERE s.doctor_id=d.id AND s.is_available=true AND s.slot_date >= CURRENT_DATE
      AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.doctor_id=s.doctor_id AND a.appointment_date=s.slot_date AND a.appointment_time=s.slot_time AND a.status NOT IN ('cancelled','rejected','completed'))) available_slots
    FROM doctors d JOIN hospitals h ON h.id=d.hospital_id WHERE ${filters.join(' AND ')}
    ORDER BY distance ASC NULLS LAST, d.name ASC LIMIT ${add(Math.min(Math.max(Number(limit) || 20, 1), 50))}`, params);
  return result.rows.map((row) => ({ ...row, id: Number(row.id), hospital_id: Number(row.hospital_id), distance: row.distance == null ? null : Number(row.distance), experience_years: Number(row.experience_years || 0), consultation_fee: row.consultation_fee == null ? null : Number(row.consultation_fee), available_slots: Number(row.available_slots || 0) }));
}

function groupDoctorsByHospital(doctors) {
  const grouped = new Map();
  for (const doctor of doctors) {
    if (!grouped.has(doctor.hospital_id)) grouped.set(doctor.hospital_id, { id: doctor.hospital_id, name: doctor.hospital_name, address: doctor.address, city: doctor.city, latitude: doctor.latitude == null ? null : Number(doctor.latitude), longitude: doctor.longitude == null ? null : Number(doctor.longitude), emergency_available: doctor.emergency_available, rating_verified: doctor.rating_verified, google_rating: doctor.rating_verified ? Number(doctor.google_rating) : null, google_review_count: doctor.rating_verified ? Number(doctor.google_review_count) : null, distance: doctor.distance, doctors: [] });
    grouped.get(doctor.hospital_id).doctors.push({ id: doctor.id, name: doctor.name, specialization: doctor.specialization, qualification: doctor.qualification, experience_years: doctor.experience_years, consultation_fee: doctor.consultation_fee, available_slots: doctor.available_slots, phone: doctor.phone });
  }
  return [...grouped.values()];
}

function hospitalSummary(hospitals, { comparison = false } = {}) {
  if (!hospitals.length) return 'I could not find a matching registered hospital with the current filters.';
  const heading = comparison ? 'Nearby hospital comparison:' : 'I found these registered hospitals:';
  return `${heading}\n\n${hospitals.map((h, i) => `${i + 1}. ${h.name}\n📍 ${h.distance == null ? h.city || h.address || 'Location available in directory' : `${h.distance.toFixed(1)} km away`}\n${h.rating_verified ? `⭐ Google ${h.google_rating.toFixed(1)} (${h.google_review_count} reviews)` : 'Google rating unavailable'}\n🛏️ Beds: ${h.available_beds} · ICU: ${h.available_icu}\n🚑 Emergency: ${h.emergency_available ? 'Available' : 'Not listed'} · 🩸 ${h.blood_group || 'Blood'} units: ${h.blood_units}${h.consultation_cost == null ? '' : ` · Consultation from ₹${h.consultation_cost}`}`).join('\n\n')}\n\nGoogle ratings are shown for reference and may change on Google Maps. Availability is shown from the hospital system; please confirm with the hospital.`;
}

function classifyIntent(text, context = {}, specialty = null) {
  // Emergency is intentionally handled before this router.
  if (/\b(reschedule|change).*(appointment|visit)|appointment.*\b(reschedule|change)/i.test(text)) return 'APPOINTMENT_RESCHEDULE';
  if (/\b(cancel|delete).*(appointment|visit)|appointment.*\bcancel/i.test(text)) return 'APPOINTMENT_CANCEL';
  if (/\b(my|show|when|today|upcoming).*(appointments?|visits?)|appointments?\s+(status|today)/i.test(text)) return 'APPOINTMENT_STATUS';
  if (/how\s+(do|can)\s+i\s+(book|make|schedule)|how\s+to\s+(book|make|schedule)|steps?.*(appointment|booking)/i.test(text)) return 'APPOINTMENT_HOW_TO';
  if (/\b(book|make|schedule|need|want).*(appointment|visit|consultation)|can\s+i\s+(see|book).*(doctor|appointment)|meet\s+a\s+doctor/i.test(text)) return 'APPOINTMENT_BOOK';
  if (/\b(upload|add).*(lab\s*report|report)|lab\s*report/i.test(text)) return 'LAB_REPORT';
  if (/medical\s*(history|record)|health\s*record|blood\s*group/i.test(text)) return 'HEALTH_RECORD';
  if (/insurance|invoice|payment|bill/i.test(text)) return 'PAYMENT';
  if (/\b(hello|hi|hey|namaste)\b/i.test(text)) return 'GREETING';
  if (/\b(help|what can you do)\b/i.test(text)) return 'HELP';
  // Continue an appointment workflow for a specialty, hospital preference, or
  // short confirmation, unless one of the explicit topic intents above won.
  if (context?.workflow === 'appointment' && (specialty || /^(it|that one|yes|nearest|closest|tomorrow|today|\d{1,2}(:\d{2})?\s*(am|pm)?)\b/i.test(text))) return 'APPOINTMENT_BOOK';
  if (/\b(doctor|doctors|specialist|cardiologist|pediatrician|ophthalmologist|\bent\b)\b/i.test(text)) return 'DOCTOR_SEARCH';
  if (/\b(?:a|b|ab|o)\s*[+-](?=\s|$)\s*blood\b/i.test(text)) return 'HOSPITAL_SEARCH';
  if (/compare/i.test(text)) return 'HOSPITAL_COMPARISON';
  if (/hospital|nearby|nearest|closest|\bicu\b|blood\s*bank|ambulance|available\s*beds?|find\s+(an?|the)|show\s+all/i.test(text)) return 'HOSPITAL_SEARCH';
  if (specialty) return 'DOCTOR_SEARCH';
  return 'GENERAL_HEALTH';
}

async function getAppointments(userId) {
  if (!userId) return [];
  const result = await pool.query(`SELECT a.id, a.appointment_date, a.appointment_time, a.status, h.name hospital_name, d.name doctor_name, d.specialization
    FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN hospitals h ON h.id=a.hospital_id
    LEFT JOIN doctors d ON d.id=a.doctor_id WHERE p.user_id=$1 AND a.status NOT IN ('cancelled', 'rejected')
    ORDER BY a.appointment_date ASC, a.appointment_time ASC LIMIT 10`, [userId]);
  return result.rows;
}

async function respond({ message, latitude, longitude, userId, context = {} }) {
  const text = String(message || '').trim();
  const specialty = await resolveSpecialty(text);
  const severity = EMERGENCY_PATTERN.test(text) ? 'emergency' : URGENT_PATTERN.test(text) ? 'urgent' : 'mild';
  const intent = classifyIntent(text, context, specialty);
  const wantsNearby = NEARBY_PATTERN.test(text);
  const wantsAll = /show\s+all\s+hospitals?/i.test(text);
  const comparison = /compare/i.test(text);
  const wantsIcu = /\bicu\b|critical care/i.test(text);
  const wantsBlood = /blood\s*bank/i.test(text);
  const bloodGroup = text.match(/\b(?:a|b|ab|o)\s*[+-](?=\s|$)/i)?.[0]?.replace(/\s/g, '').toUpperCase();
  const wantsAmbulance = /ambulance/i.test(text);
  const wantsBeds = /available\s*beds?|beds?\s+available/i.test(text);
  const wantsEmergency = /emergency|urgent|\bsos\b/i.test(text);
  const wantsDoctor = /doctor|cardiologist|pediatrician|ophthalmologist|specialist/i.test(text);
  const hospitalRequest = SEARCH_PATTERN.test(text) || wantsAll || wantsNearby || specialty !== null || bloodGroup != null;
  const locationRequired = severity === 'emergency' || (hospitalRequest && wantsNearby);

  if (locationRequired && !hasCoordinates(latitude, longitude)) {
    const locationPrompt = bloodGroup
      ? `I need your current location to find nearby hospitals with ${bloodGroup} blood availability. Please allow location access.`
      : `I’d be happy to find${specialty ? ` a ${specialty}` : ''} hospital near you. I need your current location to calculate the distance. Please allow location access.`;
    return { type: severity === 'emergency' ? 'emergency' : 'location_required', severity, requiresLocation: true, showSos: severity === 'emergency', response: severity === 'emergency' ? 'This could be an emergency. Please call 108 or 112 now if you are seriously unwell, and avoid driving yourself. I need your current location to find the nearest registered emergency hospital.' : locationPrompt };
  }

  if (severity === 'emergency') {
    // Ambulance inventory is shown on each result when present, but a request
    // for an ambulance must not hide nearby emergency hospitals just because
    // their ambulance registry has not been updated.
    const hospitals = await searchHospitals({ latitude, longitude, specialty, emergency: true, icu: /chest|breathe|unconscious|stroke/i.test(text), availableBeds: false, limit: 3 });
    return { intent: 'EMERGENCY', type: 'emergency', severity, showSos: true, actions: [{ type: 'EMERGENCY_SOS', label: 'Emergency SOS' }], hospitals, response: `This could be an emergency. Please seek emergency care immediately and call 108 or 112 if you are severely unwell.\n\n${hospitalSummary(hospitals)}`, context: {} };
  }

  if (intent === 'APPOINTMENT_HOW_TO') return {
    intent, type: 'appointment', severity, actions: [{ type: 'BOOK_APPOINTMENT', label: 'Book Appointment' }, { type: 'VIEW_APPOINTMENTS', label: 'My Appointments' }],
    response: 'You can book an appointment through the app:\n\n1. Choose a medical specialty.\n2. Select a hospital.\n3. Select a doctor.\n4. Choose an available date and time.\n5. Confirm the appointment.\n\nYou can start booking now.', context: { workflow: 'appointment' },
  };
  if (intent === 'APPOINTMENT_STATUS') {
    const appointments = await getAppointments(userId);
    const summary = appointments.length ? `You have ${appointments.length} upcoming appointment${appointments.length === 1 ? '' : 's'}:\n\n${appointments.map((a, index) => `${index + 1}. ${a.doctor_name || 'Doctor'} · ${a.specialization || 'General care'}\n${a.hospital_name}\n${String(a.appointment_date).slice(0, 10)} at ${String(a.appointment_time).slice(0, 5)} (${a.status})`).join('\n\n')}` : 'You do not have any upcoming appointments in the system.';
    return { intent, type: 'appointment_status', severity, appointments, actions: [{ type: 'VIEW_APPOINTMENTS', label: 'My Appointments' }], response: summary, context: {} };
  }
  if (intent === 'APPOINTMENT_RESCHEDULE' || intent === 'APPOINTMENT_CANCEL') return {
    intent, type: 'appointment_manage', severity, actions: [{ type: 'VIEW_APPOINTMENTS', label: 'My Appointments' }],
    response: intent === 'APPOINTMENT_CANCEL' ? 'Open My Appointments, select the appointment you want to cancel, and confirm the cancellation.' : 'Open My Appointments, select the appointment you want to change, then choose a new available date and time.', context: { workflow: 'appointment' },
  };
  if (intent === 'APPOINTMENT_BOOK') {
    if (!specialty && !context.specialty) return { intent, type: 'appointment', severity, actions: [{ type: 'BOOK_APPOINTMENT', label: 'Book Appointment' }], response: 'Sure. Which type of doctor would you like to see? For example: General Medicine, Cardiology, Orthopedics, Pediatrics, ENT, or Ophthalmology.', context: { workflow: 'appointment' } };
    const selectedSpecialty = specialty || context.specialty;
    const doctors = await searchDoctors({ latitude, longitude, specialty: selectedSpecialty });
    const hospitals = groupDoctorsByHospital(doctors);
    return { intent, type: 'appointment', severity, specialty: selectedSpecialty, hospitals, actions: [{ type: 'BOOK_APPOINTMENT', label: 'Book Appointment' }], response: doctors.length ? `I found ${doctors.length} available ${selectedSpecialty} doctor${doctors.length === 1 ? '' : 's'}. Select a doctor below to continue booking.` : `I could not find an available ${selectedSpecialty} doctor right now.`, context: { workflow: 'appointment', specialty: selectedSpecialty } };
  }
  if (intent === 'LAB_REPORT') return { intent, type: 'medical_record', severity, actions: [{ type: 'VIEW_HEALTH_RECORD', label: 'Health Records' }], response: 'You can add or upload a lab report from Health Records. Select the report type, enter its date and details, and save it. Only your authorized care team can access records under the app’s permission controls.', context: {} };
  if (intent === 'HEALTH_RECORD') return { intent, type: 'medical_record', severity, actions: [{ type: 'VIEW_HEALTH_RECORD', label: 'Health Records' }], response: 'Your health records, medical history, allergies, medications, and profile details are managed in Health Records. You can review or update your own information there.', context: {} };
  if (intent === 'PAYMENT') return { intent, type: 'payment', severity, response: 'For invoices, payment, or insurance questions, please check the relevant hospital or contact its billing desk. Coverage and charges are hospital- and policy-specific.', context: {} };
  if (intent === 'GREETING') return { intent, type: 'greeting', severity, response: 'Hello — I’m CareGuide. I can help with hospitals, doctors, appointments, health information, emergency assistance, blood banks, and health records.', context: {} };
  if (intent === 'HELP') return { intent, type: 'help', severity, response: 'I can help you find hospitals or doctors, book and manage appointments, check hospital resources, provide general health information, and start emergency SOS assistance. What would you like help with?', context: {} };

  if (hospitalRequest && ['HOSPITAL_SEARCH', 'HOSPITAL_COMPARISON', 'DOCTOR_SEARCH'].includes(intent)) {
    const city = wantsNearby ? null : cityFromMessage(text);
    const sort = /cheap|lowest\s*cost/i.test(text) ? 'cost' : /highest\s*rated|best\s*rated/i.test(text) ? 'rating' : wantsBeds ? 'beds' : 'distance';
    const hospitals = await searchHospitals({ latitude, longitude, specialty, city, emergency: wantsEmergency, icu: wantsIcu, bloodBank: wantsBlood || bloodGroup != null, bloodGroup, ambulance: wantsAmbulance, availableBeds: wantsBeds, sort, limit: comparison ? 4 : 5 });
    if (intent === 'DOCTOR_SEARCH') {
      const doctors = await searchDoctors({ latitude, longitude, specialty });
      const doctorHospitals = groupDoctorsByHospital(doctors);
      const label = specialty ? `${specialty} care` : 'available doctors';
      const response = doctors.length ? `I found ${label} at ${doctorHospitals.length} hospital${doctorHospitals.length === 1 ? '' : 's'}. Each result below is live hospital and doctor data.` : `I could not find an available ${label} in the registered hospital directory.`;
      return { intent, type: 'doctor_search', severity, hospitals: doctorHospitals, doctors, specialty, actions: [{ type: 'VIEW_HOSPITALS', label: 'View Hospitals' }], response, context: {} };
    }
    return { intent, type: comparison ? 'comparison' : 'hospital_search', severity, hospitals, specialty, actions: [{ type: 'VIEW_HOSPITALS', label: 'View Hospitals' }], response: hospitalSummary(hospitals, { comparison }), context: {} };
  }

  return { intent: 'GENERAL_HEALTH', type: 'health', severity, response: buildHealthResponse(text, severity), specialty, context: {} };
}

module.exports = { respond, searchHospitals, searchDoctors };
