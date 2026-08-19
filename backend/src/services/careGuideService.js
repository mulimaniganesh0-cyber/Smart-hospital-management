const { pool } = require('../config/database');

// Structured clinical guidance. These profiles provide safe triage and
// education; they are intentionally not a diagnostic engine.
const SYMPTOM_PROFILES = [
  { system: 'cardiovascular', specialty: 'Cardiology', terms: ['chest pain', 'chest pressure', 'heart racing', 'palpitation', 'palpitations', 'high blood pressure', 'low blood pressure'], possible: ['heart or circulation-related causes', 'muscle or chest-wall pain', 'acid reflux'], questions: ['Is the pain severe, crushing, or spreading to your arm, jaw, or back?', 'Do you have shortness of breath, sweating, nausea, or fainting?', 'Did it start suddenly or during exertion?'], care: 'Avoid strenuous activity until you have been assessed.' },
  { system: 'respiratory', specialty: 'Pulmonology', terms: ['cough', 'cold', 'wheezing', 'shortness of breath', 'breathless', 'sore throat', 'chest congestion', 'asthma', 'phlegm', 'sputum'], possible: ['a viral respiratory infection', 'allergy or asthma-related irritation', 'another chest infection'], questions: ['How long has this been happening?', 'Do you have fever, wheezing, chest pain, or phlegm/blood?', 'Are you having trouble breathing at rest?'], care: 'Rest, drink fluids, and avoid smoke or other triggers.' },
  { system: 'neurological', specialty: 'Neurology', terms: ['headache', 'migraine', 'dizzy', 'dizziness', 'vertigo', 'numbness', 'tingling', 'weakness', 'seizure', 'confusion', 'speech difficulty', 'tremor'], possible: ['a migraine or tension headache', 'inner-ear or hydration-related dizziness', 'a neurological condition that needs assessment'], questions: ['When did this start, and was it sudden?', 'Any one-sided weakness, numbness, trouble speaking, fainting, or vision change?', 'Is this the worst or a different headache for you?'], care: 'Rest somewhere safe and avoid driving while dizzy or confused.' },
  { system: 'gastrointestinal', specialty: 'Gastroenterology', terms: ['stomach pain', 'tummy hurts', 'abdominal pain', 'vomiting', 'nausea', 'diarrhea', 'constipation', 'heartburn', 'acidity', 'bloating', 'blood in stool', 'jaundice'], possible: ['indigestion or acid reflux', 'gastroenteritis or food-related illness', 'another abdominal condition requiring examination'], questions: ['Where exactly is the pain and how severe is it?', 'When did it start, and is it getting worse?', 'Any vomiting, fever, diarrhea/constipation, or blood in stool?'], care: 'Take small sips of fluid if you can keep them down and avoid heavy foods.' },
  { system: 'urinary', specialty: 'Urology', terms: ['pain while urinating', 'burning urination', 'burns when i pee', 'pee hurts', 'frequent urination', 'blood in urine', 'flank pain', 'kidney pain', 'unable to urinate', 'urinary urgency'], possible: ['a urinary tract infection', 'urinary irritation', 'a kidney or bladder stone'], questions: ['Do you have fever or chills?', 'Any blood in urine, side/back pain, nausea, or vomiting?', 'Are you urinating more often or unable to urinate?'], care: 'Stay hydrated unless a clinician has told you to limit fluids.' },
  { system: 'endocrine/metabolic', specialty: 'General Medicine', terms: ['diabetes', 'blood sugar', 'excessive thirst', 'very thirsty', 'shaky', 'shakiness', 'heat intolerance', 'cold intolerance', 'thyroid'], possible: ['a blood-sugar change', 'dehydration', 'a thyroid or other metabolic issue'], questions: ['Do you have diabetes or another long-term condition?', 'Can you check your blood sugar if you normally monitor it?', 'Any sweating, confusion, fainting, vomiting, or severe weakness?'], care: 'Follow your existing clinician-approved diabetes or chronic-care plan; do not change prescription medication based on chat advice.' },
  { system: 'musculoskeletal', specialty: 'Orthopedics', terms: ['back pain', 'neck pain', 'knee pain', 'knee swollen', 'joint pain', 'shoulder pain', 'sprain', 'fracture', 'fell', 'hurt my leg', 'muscle pain'], possible: ['a strain or sprain', 'joint inflammation', 'an injury that may need imaging'], questions: ['Was there an injury or fall?', 'Is there swelling, deformity, numbness, weakness, or inability to move/put weight on it?', 'How severe is the pain?'], care: 'Rest the affected area and avoid forcing painful movement.' },
  { system: 'skin/allergy', specialty: 'Dermatology', terms: ['rash', 'itchy', 'itching', 'hives', 'skin infection', 'redness', 'blister', 'burn', 'face swollen', 'swelling after eating'], possible: ['an allergy or irritation', 'a skin infection or inflammatory condition', 'another dermatologic condition'], questions: ['Did this start after a food, medicine, bite, or new product?', 'Is it spreading quickly, painful, blistering, or associated with fever?', 'Any lip/tongue swelling or breathing difficulty?'], care: 'Avoid any suspected trigger and avoid scratching the area.' },
  { system: 'eye', specialty: 'Ophthalmology', terms: ['eye pain', 'eyes are red', 'red eye', 'blurred vision', 'cannot see', 'vision loss', 'eye discharge', 'light sensitivity', 'eye injury'], possible: ['an eye allergy or irritation', 'an eye infection', 'an eye condition that requires an examination'], questions: ['Is your vision affected or did it change suddenly?', 'Is the eye painful, red, light-sensitive, or producing discharge?', 'Was there an injury or chemical exposure?'], care: 'Do not rub an injured or painful eye, and avoid using someone else’s eye drops.' },
  { system: 'ear/nose/throat', specialty: 'ENT', terms: ['ear pain', 'hearing problem', 'ringing in ear', 'sore throat', 'difficulty swallowing', 'sinus', 'nasal congestion', 'nosebleed', 'voice problem'], possible: ['a viral illness', 'allergy or sinus irritation', 'an ear, nose, or throat infection'], questions: ['How long have you had symptoms?', 'Do you have fever, drainage, severe pain, or trouble swallowing/breathing?', 'Is hearing suddenly reduced?'], care: 'Drink fluids and avoid inserting anything into the ear.' },
  { system: 'dental', specialty: 'Dentistry', terms: ['tooth pain', 'toothache', 'gum pain', 'gum bleeding', 'dental swelling', 'mouth ulcer', 'jaw pain'], possible: ['tooth decay or gum inflammation', 'a dental infection', 'jaw or mouth irritation'], questions: ['Is there facial swelling, fever, or drainage?', 'Is swallowing or breathing difficult?', 'Did this follow an injury or a broken tooth?'], care: 'Arrange dental assessment; avoid placing aspirin directly on gums.' },
  { system: 'reproductive', specialty: 'Gynecology & Obstetrics', terms: ['pregnant', 'pregnancy', 'menstrual pain', 'abnormal bleeding', 'pelvic pain', 'vaginal', 'menopause'], possible: ['a menstrual or hormonal cause', 'an infection or pelvic condition', 'a pregnancy-related condition that needs assessment'], questions: ['Could you be pregnant, and if so how far along?', 'Is there heavy bleeding, severe one-sided pain, fever, or fainting?', 'When did the symptoms begin?'], care: 'For pregnancy-related symptoms, seek professional advice promptly rather than self-treating.' },
  { system: 'mental health', specialty: 'Psychiatry', terms: ['anxious', 'anxiety', 'panic', 'depressed', 'low mood', 'stressed', 'stress', 'cannot stay safe', 'self harm', 'suicidal'], understanding: 'I understand that you may be feeling anxious or stressed. These feelings can affect thoughts, sleep, concentration, and sometimes cause physical symptoms such as a racing heart or sweating.', possible: ['stress or anxiety', 'a mood-related condition', 'a concern that deserves confidential professional support'], questions: ['Are you safe right now?', 'Are you having thoughts of harming yourself or someone else?', 'How long have you felt this way, and do you have support nearby?'], care: 'Reach out to a trusted person and a qualified mental-health professional; you do not have to manage this alone.' },
  { system: 'infectious/pediatric', specialty: 'Pediatrics', terms: ['my child', 'my baby', 'child has fever', 'child fever', 'fever', 'flu', 'covid', 'dengue', 'malaria', 'typhoid'], understanding: 'I understand that you are reporting fever or infection-like symptoms. The cause depends on the symptom pattern, examination, and sometimes tests.', possible: ['a common viral illness', 'another infection requiring assessment', 'a condition whose cause depends on examination and tests'], questions: ['What is the temperature and how long has it lasted?', 'Any breathing trouble, dehydration, rash, repeated vomiting, or unusual sleepiness?', 'If this is a child, what is their age?'], care: 'Rest, fluids, and monitoring may help mild illness. Children with concerning symptoms should be assessed promptly.' },
];

const EMERGENCY_PATTERN = /severe\s+(chest|abdominal|stomach)\s+pain|chest.*(crushing|tight|pain)|can(?:not|'t)\s+breathe|difficulty\s+breathing|shortness\s+of\s+breath|faint(ed|ing)?|loss\s+of\s+consciousness|seizure|stroke|sudden.*(weak|numb|arm|face|vision|headache)|uncontrolled\s+bleeding|severe\s+(burn|allerg|injury)|(?:throat|tongue|lip|face).{0,25}swelling|swelling.{0,25}(?:throat|tongue|lip)|poison|major\s+trauma|emergency\s+help|\bsos\b|\bneed\s+(an?\s+)?ambulance\b|self.?harm|suicid/i;
const URGENT_PATTERN = /severe\s+eye\s+pain|persistent\s+vomit|high\s+fever|worsening|serious\s+injury|blood\s+in\s+(urine|stool)|unable\s+to\s+urinate|pregnan.*(pain|bleed)|urgent/i;
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

// Compact multilingual clinical aliases used before the structured matcher.
// The system still asks follow-up questions rather than treating a translation
// as a diagnosis.
function clinicalText(value) {
  const phraseNormalised = String(value || '')
    .toLowerCase()
    // Common missing-space and everyday-language forms are resolved before
    // word-level fuzzy matching, which keeps the correction context-aware.
    .replace(/\b(chestpain|chest paining|heart pain)\b/g, ' chest pain ')
    .replace(/\b(stomachpain|stomac(?:h|k)? pain|tummy hurts?|belly pain|stomach (?:is )?(?:hurting|hurts|upset))\b/g, ' abdominal pain ')
    .replace(/\b(eyepain|eyes? (?:are )?(?:blur|not clear)|can(?:not|t) see (?:clearly|properly))\b/g, ' blurred vision ')
    .replace(/\b(backpain|my back is pain|kidney side (?:is )?(?:hurting|pain))\b/g, ' back pain ')
    .replace(/\b(pee pain|pee burns?|my pee is burning|pain while peeing|it burns when i pee|hurts when i pee)\b/g, ' burning urination ')
    .replace(/\b(feel like throwing up|keep throwing up)\b/g, ' vomiting ')
    .replace(/\b(head (?:is )?spinning|head is spining)\b/g, ' dizziness ')
    .replace(/\b(heart (?:is )?(?:racing|beating fast|beating too much))\b/g, ' palpitations ')
    .replace(/\b(loose motions)\b/g, ' diarrhea ')
    .replace(/\b(eye doc|eye doctor)\b/g, ' ophthalmologist ')
    .replace(/\b(heart doctor)\b/g, ' cardiologist ')
    .replace(/\b(bp)\b/g, ' blood pressure ')
    .replace(/\b(sob)\b/g, ' shortness of breath ')
    .replace(/\b(uti)\b/g, ' urinary tract infection ')
    .replace(/\b(cant|cannot)\s+(?:breath|breathe|brethe|brething|breathng)\b/g, ' difficulty breathing ')
    .replace(/\b(breathing not coming properly|brethng problem|breathing problem)\b/g, ' difficulty breathing ')
    // Repeated letters are usually a typing emphasis, not a different symptom.
    .replace(/([a-z])\1{2,}/g, '$1$1');
  const corrected = fuzzyCorrectClinicalWords(phraseNormalised);
  return corrected
    .replace(/\b(bukhar|feverish)\b|बुखार|ज्वर/gi, ' fever ')
    .replace(/\b(sir dard|head pain)\b|सिर दर्द|डोके दुखणे|ತಲೆನೋವು/gi, ' headache ')
    .replace(/\b(pet dard|tummy pain)\b|पेट दर्द|पोट दुखणे|ಹೊಟ್ಟೆ ನೋವು/gi, ' abdominal pain ')
    .replace(/\b(saans|breath problem)\b|सांस.*(?:दिक्कत|तकलीफ)|श्वास.*त्रास|ಉಸಿರಾಟ.*ತೊಂದರೆ/gi, ' shortness of breath ')
    .replace(/\b(seene mein dard|chest mein dard)\b|सीने में दर्द|छातीत दुखणे|ಎದೆ ನೋವು/gi, ' chest pain ')
    .replace(/\b(peshab.*jalan|pee.*burn)\b|पेशाब.*जलन|लघवी.*जळजळ|ಮೂತ್ರ.*ಉರಿ/gi, ' burning urination ');
}

// A small medical vocabulary plus edit-distance matching catches ordinary
// misspellings without treating every unknown word as a medical symptom.
const CLINICAL_WORDS = ['anxious', 'anxiety', 'fever', 'headache', 'stomach', 'abdominal', 'breath', 'breathing', 'dizziness', 'vomiting', 'diarrhea', 'cough', 'throat', 'urine', 'urinating', 'urination', 'kidney', 'allergy', 'diabetes', 'pressure', 'chest', 'severe', 'pain', 'palpitations', 'cardiologist', 'ophthalmologist', 'hospital', 'doctor', 'vision', 'blurred', 'fainting', 'speech', 'swelling', 'tooth', 'heart'];

function editDistance(left, right) {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => index);
  for (let column = 1; column <= right.length; column += 1) {
    let previous = rows[0];
    rows[0] = column;
    for (let row = 1; row <= left.length; row += 1) {
      const current = rows[row];
      rows[row] = Math.min(rows[row] + 1, rows[row - 1] + 1, previous + (left[row - 1] === right[column - 1] ? 0 : 1));
      previous = current;
    }
  }
  return rows[left.length];
}

function fuzzyCorrectClinicalWords(text) {
  return text.replace(/[a-z]{3,}/g, (word) => {
    if (CLINICAL_WORDS.includes(word)) return word;
    const allowedDistance = word.length >= 7 ? 2 : 1;
    const candidates = CLINICAL_WORDS
      .map((candidate) => ({ candidate, distance: editDistance(word, candidate) }))
      .filter(({ distance }) => distance <= allowedDistance)
      .sort((a, b) => a.distance - b.distance || a.candidate.length - b.candidate.length);
    // Only replace an unambiguous close match. Ambiguous normal words remain
    // untouched so CareGuide can ask for clarification rather than guessing.
    return candidates.length === 1 || (candidates[0] && candidates[0].distance < candidates[1]?.distance)
      ? candidates[0].candidate
      : word;
  });
}

function profileMatches(profile, text) {
  const normalised = normalise(text);
  return profile.terms.filter((term) => normalised.includes(normalise(term)));
}

function assessSymptoms(message, context = {}, history = []) {
  // Previous user turns are used only for the active conversation, allowing
  // answers such as “yes, and my back hurts” to refine earlier symptoms.
  const historyText = Array.isArray(history)
    ? history.filter((entry) => entry?.role === 'user').map((entry) => entry.content).join(' ')
    : '';
  const combined = clinicalText(`${context.symptoms || ''} ${historyText} ${message}`);
  const matched = SYMPTOM_PROFILES.map((profile) => ({ profile, hits: profileMatches(profile, combined) }))
    .filter(({ hits }) => hits.length)
    .sort((a, b) => b.hits.length - a.hits.length);
  const primary = matched[0]?.profile || null;
  return { combined, primary, matched };
}

function buildSymptomResponse(assessment, severity) {
  const { primary, matched } = assessment;
  if (!primary) {
    return 'I can help you think through your symptoms, but I need a little more detail. What are you feeling, where is it, when did it start, and how severe is it? I can provide general information and help you find appropriate care, but I cannot diagnose or prescribe medicine.';
  }
  const combinedSystems = matched.slice(0, 2).map(({ profile }) => profile.system).join(' and ');
  const possible = primary.possible.map((item) => `• ${item}`).join('\n');
  const questions = primary.questions.map((item) => `• ${item}`).join('\n');
  const urgency = severity === 'urgent'
    ? `Because of the symptoms you mentioned, please arrange prompt medical evaluation. ${primary.specialty} or an appropriate emergency department can assess you.`
    : `Seek urgent care now if symptoms become severe, rapidly worsen, or you develop breathing difficulty, fainting, confusion, uncontrolled bleeding, or other new red flags.`;
  const understanding = primary.understanding || `I understand you may be describing a ${combinedSystems} concern. These symptoms can occur with several conditions; an examination may be needed to determine the cause.`;
  return `${understanding}\n\nPossible causes include:\n${possible}\n\nTo understand this better:\n${questions}\n\nWhat you can do now:\n${primary.care}\n\nWhen to seek care:\n${urgency}\n\nI can also find a nearby hospital with ${primary.specialty} or appropriate general/emergency care.`;
}

function hasUrgentCombination(assessment) {
  const text = normalise(assessment.combined);
  const has = (value) => text.includes(value);
  const urinaryWithSystemicSymptoms = assessment.matched.some(({ profile }) => profile.system === 'urinary')
    && has('fever') && (has('flank pain') || has('kidney pain') || has('back pain') || has('vomiting'));
  const abdominalWithSystemicSymptoms = assessment.matched.some(({ profile }) => profile.system === 'gastrointestinal')
    && has('fever') && has('vomiting');
  return urinaryWithSystemicSymptoms || abdominalWithSystemicSymptoms;
}

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

async function respond({ message, latitude, longitude, userId, context = {}, history = [] }) {
  const text = String(message || '').trim();
  const normalisedText = clinicalText(text);
  const assessment = assessSymptoms(normalisedText, context, history);
  const directSpecialty = await resolveSpecialty(normalisedText);
  const specialty = directSpecialty || (assessment.primary ? await resolveSpecialty(assessment.primary.specialty) : null);
  const severity = EMERGENCY_PATTERN.test(assessment.combined) ? 'emergency' : (URGENT_PATTERN.test(assessment.combined) || hasUrgentCombination(assessment)) ? 'urgent' : assessment.primary ? 'moderate' : 'mild';
  const intent = classifyIntent(normalisedText, context, specialty);
  const wantsNearby = NEARBY_PATTERN.test(normalisedText);
  const wantsAll = /show\s+all\s+hospitals?/i.test(normalisedText);
  const comparison = /compare/i.test(normalisedText);
  const wantsIcu = /\bicu\b|critical care/i.test(normalisedText);
  const wantsBlood = /blood\s*bank/i.test(normalisedText);
  const bloodGroup = normalisedText.match(/\b(?:a|b|ab|o)\s*[+-](?=\s|$)/i)?.[0]?.replace(/\s/g, '').toUpperCase();
  const wantsAmbulance = /ambulance/i.test(normalisedText);
  const wantsBeds = /available\s*beds?|beds?\s+available/i.test(normalisedText);
  const wantsEmergency = /emergency|urgent|\bsos\b/i.test(normalisedText);
  const wantsDoctor = /doctor|cardiologist|pediatrician|ophthalmologist|specialist/i.test(normalisedText);
  const symptomHospitalRequest = severity === 'urgent' && assessment.primary !== null;
  const hospitalRequest = SEARCH_PATTERN.test(normalisedText) || wantsAll || wantsNearby || specialty !== null || bloodGroup != null || symptomHospitalRequest;
  const locationRequired = severity === 'emergency' || symptomHospitalRequest || (hospitalRequest && wantsNearby);

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
    const hospitals = await searchHospitals({ latitude, longitude, specialty, emergency: true, icu: /chest|breathe|unconscious|stroke/i.test(assessment.combined), availableBeds: false, limit: 3 });
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

  if (hospitalRequest && ['HOSPITAL_SEARCH', 'HOSPITAL_COMPARISON', 'DOCTOR_SEARCH', 'GENERAL_HEALTH'].includes(intent)) {
    const city = wantsNearby ? null : cityFromMessage(normalisedText);
    const sort = /cheap|lowest\s*cost/i.test(normalisedText) ? 'cost' : /highest\s*rated|best\s*rated/i.test(normalisedText) ? 'rating' : wantsBeds ? 'beds' : 'distance';
    const hospitals = await searchHospitals({ latitude, longitude, specialty, city, emergency: wantsEmergency, icu: wantsIcu, bloodBank: wantsBlood || bloodGroup != null, bloodGroup, ambulance: wantsAmbulance, availableBeds: wantsBeds, sort, limit: comparison ? 4 : 5 });
    if (intent === 'DOCTOR_SEARCH') {
      const doctors = await searchDoctors({ latitude, longitude, specialty });
      const doctorHospitals = groupDoctorsByHospital(doctors);
      const label = specialty ? `${specialty} care` : 'available doctors';
      const response = doctors.length ? `I found ${label} at ${doctorHospitals.length} hospital${doctorHospitals.length === 1 ? '' : 's'}. Each result below is live hospital and doctor data.` : `I could not find an available ${label} in the registered hospital directory.`;
      return { intent, type: 'doctor_search', severity, hospitals: doctorHospitals, doctors, specialty, actions: [{ type: 'VIEW_HOSPITALS', label: 'View Hospitals' }], response, context: {} };
    }
    if (intent === 'GENERAL_HEALTH' && symptomHospitalRequest) {
      return {
        intent, type: 'urgent_symptom', severity, hospitals, specialty,
        showSos: false,
        actions: [{ type: 'VIEW_HOSPITALS', label: 'View Hospitals' }],
        response: `${buildSymptomResponse(assessment, severity)}\n\nNearby suitable care:\n${hospitalSummary(hospitals)}`,
        context: { symptoms: assessment.combined.slice(-800), specialty: specialty || assessment.primary?.specialty || null, system: assessment.primary?.system || null },
      };
    }
    return { intent, type: comparison ? 'comparison' : 'hospital_search', severity, hospitals, specialty, actions: [{ type: 'VIEW_HOSPITALS', label: 'View Hospitals' }], response: hospitalSummary(hospitals, { comparison }), context: {} };
  }

  return {
    intent: 'GENERAL_HEALTH', type: 'health', severity, specialty,
    response: buildSymptomResponse(assessment, severity),
    actions: assessment.primary ? [{ type: 'VIEW_HOSPITALS', label: 'Find suitable hospitals' }] : [],
    context: { symptoms: assessment.combined.slice(-800), specialty: specialty || assessment.primary?.specialty || null, system: assessment.primary?.system || null },
  };
}

module.exports = { respond, searchHospitals, searchDoctors, normalizePatientMessage: clinicalText };
