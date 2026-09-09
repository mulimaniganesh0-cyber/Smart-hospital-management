const { pool } = require('../config/database');
const { analyzeUserIntent, normalizeMessage, detectEmergency } = require('./medicalIntentService');
const { OllamaServiceError } = require('./ollamaService');
const { answerWithRAG, answerHospitalWithRAG } = require('./ragService');
const { RagStoreError } = require('./ragVectorStore');
const { EmbeddingServiceError } = require('./embeddingService');
const { mapAgeToBand, findMedicalDatasetPolicy } = require('./medicalDatasetService');
const { language: validLanguage, text: localizedText, empathyPrefixes, localizeDoctor, localizeHospital } = require('./careGuideLocalization');

// Structured clinical guidance. These profiles provide safe triage and
// education; they are intentionally not a diagnostic engine.
const SYMPTOM_PROFILES = [
  { system: 'cardiovascular', specialty: 'Cardiology', terms: ['chest pain', 'chest pressure', 'heart racing', 'palpitation', 'palpitations', 'high blood pressure', 'low blood pressure'], possible: ['heart or circulation-related causes', 'muscle or chest-wall pain', 'acid reflux'], questions: ['Is the pain severe, crushing, or spreading to your arm, jaw, or back?', 'Do you have shortness of breath, sweating, nausea, or fainting?', 'Did it start suddenly or during exertion?'], care: 'Avoid strenuous activity until you have been assessed.' },
  { system: 'respiratory', specialty: 'Pulmonology', terms: ['cough', 'cold', 'wheezing', 'shortness of breath', 'breathless', 'sore throat', 'chest congestion', 'asthma', 'phlegm', 'sputum'], possible: ['a viral respiratory infection', 'allergy or asthma-related irritation', 'another chest infection'], questions: ['How long has this been happening?', 'Do you have fever, wheezing, chest pain, or phlegm/blood?', 'Are you having trouble breathing at rest?'], care: 'Rest, drink fluids, and avoid smoke or other triggers.' },
  { system: 'neurological', specialty: 'Neurology', terms: ['headache', 'migraine', 'dizzy', 'dizziness', 'vertigo', 'numbness', 'tingling', 'weakness', 'seizure', 'confusion', 'speech difficulty', 'tremor'], possible: ['a migraine or tension headache', 'inner-ear or hydration-related dizziness', 'a neurological condition that needs assessment'], questions: ['When did this start, and was it sudden?', 'Any one-sided weakness, numbness, trouble speaking, fainting, or vision change?', 'Is this the worst or a different headache for you?'], care: 'Rest somewhere safe and avoid driving while dizzy or confused.' },
  { system: 'gastrointestinal', specialty: 'Gastroenterology', terms: ['stomach pain', 'tummy hurts', 'abdominal pain', 'vomiting', 'nausea', 'diarrhea', 'constipation', 'heartburn', 'acidity', 'bloating', 'blood in stool', 'jaundice'], possible: ['indigestion or acid reflux', 'gastroenteritis or food-related illness', 'another abdominal condition requiring examination'], questions: ['Where exactly is the pain and how severe is it?', 'When did it start, and is it getting worse?', 'Any vomiting, fever, diarrhea/constipation, or blood in stool?'], care: 'Take small sips of fluid if you can keep them down and avoid heavy foods.' },
  { system: 'kidney stones', specialty: 'Urology', terms: ['kidney stone', 'kidney stones', 'renal stone', 'renal colic'], possible: ['a kidney or ureter stone', 'a urinary tract infection or irritation', 'another kidney or urinary-tract condition'], questions: ['Is there severe side/back pain, nausea, vomiting, fever, or blood in urine?', 'Are you able to pass urine normally?', 'Have you had stones before or a family history of them?'], care: 'Drink fluids if you can and have not been told to restrict them. Do not delay assessment for severe pain, fever, or trouble passing urine.' },
  { system: 'urinary', specialty: 'Urology', terms: ['pain while urinating', 'burning urination', 'burns when i pee', 'pee hurts', 'frequent urination', 'blood in urine', 'flank pain', 'kidney pain', 'unable to urinate', 'urinary urgency'], possible: ['a urinary tract infection', 'urinary irritation', 'a kidney or bladder stone'], questions: ['Do you have fever or chills?', 'Any blood in urine, side/back pain, nausea, or vomiting?', 'Are you urinating more often or unable to urinate?'], care: 'Stay hydrated unless a clinician has told you to limit fluids.' },
  { system: 'endocrine/metabolic', specialty: 'General Medicine', terms: ['diabetes', 'blood sugar', 'excessive thirst', 'very thirsty', 'shaky', 'shakiness', 'heat intolerance', 'cold intolerance', 'thyroid'], possible: ['a blood-sugar change', 'dehydration', 'a thyroid or other metabolic issue'], questions: ['Do you have diabetes or another long-term condition?', 'Can you check your blood sugar if you normally monitor it?', 'Any sweating, confusion, fainting, vomiting, or severe weakness?'], care: 'Follow your existing clinician-approved diabetes or chronic-care plan; do not change prescription medication based on chat advice.' },
  { system: 'musculoskeletal', specialty: 'Orthopedics', terms: ['back pain', 'neck pain', 'knee pain', 'knee swollen', 'joint pain', 'shoulder pain', 'sprain', 'fracture', 'fell', 'hurt my leg', 'muscle pain'], possible: ['a strain or sprain', 'joint inflammation', 'an injury that may need imaging'], questions: ['Was there an injury or fall?', 'Is there swelling, deformity, numbness, weakness, or inability to move/put weight on it?', 'How severe is the pain?'], care: 'Rest the affected area and avoid forcing painful movement.' },
  { system: 'skin/allergy', specialty: 'Dermatology', terms: ['rash', 'itchy', 'itching', 'hives', 'skin problem', 'skin infection', 'hair loss', 'redness', 'blister', 'burn', 'face swollen', 'swelling after eating'], possible: ['an allergy or irritation', 'a skin infection or inflammatory condition', 'another dermatologic condition'], questions: ['Did this start after a food, medicine, bite, or new product?', 'Is it spreading quickly, painful, blistering, or associated with fever?', 'Any lip/tongue swelling or breathing difficulty?'], care: 'Avoid any suspected trigger and avoid scratching the area.' },
  { system: 'eye', specialty: 'Ophthalmology', terms: ['eye pain', 'eyes are red', 'red eye', 'blurred vision', 'cannot see', 'vision loss', 'eye discharge', 'light sensitivity', 'eye injury'], possible: ['an eye allergy or irritation', 'an eye infection', 'an eye condition that requires an examination'], questions: ['Is your vision affected or did it change suddenly?', 'Is the eye painful, red, light-sensitive, or producing discharge?', 'Was there an injury or chemical exposure?'], care: 'Do not rub an injured or painful eye, and avoid using someone else’s eye drops.' },
  { system: 'ear/nose/throat', specialty: 'ENT', terms: ['ear pain', 'hearing problem', 'ringing in ear', 'sore throat', 'difficulty swallowing', 'sinus', 'nasal congestion', 'nosebleed', 'voice problem'], possible: ['a viral illness', 'allergy or sinus irritation', 'an ear, nose, or throat infection'], questions: ['How long have you had symptoms?', 'Do you have fever, drainage, severe pain, or trouble swallowing/breathing?', 'Is hearing suddenly reduced?'], care: 'Drink fluids and avoid inserting anything into the ear.' },
  { system: 'dental', specialty: 'Dentistry', terms: ['tooth pain', 'toothache', 'gum pain', 'gum bleeding', 'dental swelling', 'mouth ulcer', 'jaw pain'], possible: ['tooth decay or gum inflammation', 'a dental infection', 'jaw or mouth irritation'], questions: ['Is there facial swelling, fever, or drainage?', 'Is swallowing or breathing difficult?', 'Did this follow an injury or a broken tooth?'], care: 'Arrange dental assessment; avoid placing aspirin directly on gums.' },
  { system: 'reproductive', specialty: 'Gynecology & Obstetrics', terms: ['pregnant', 'pregnancy', 'menstrual pain', 'irregular period', 'irregular periods', 'abnormal bleeding', 'pelvic pain', 'vaginal', 'menopause'], possible: ['a menstrual or hormonal cause', 'an infection or pelvic condition', 'a pregnancy-related condition that needs assessment'], questions: ['Could you be pregnant, and if so how far along?', 'Is there heavy bleeding, severe one-sided pain, fever, or fainting?', 'When did the symptoms begin?'], care: 'For pregnancy-related symptoms, seek professional advice promptly rather than self-treating.' },
  { system: 'mental health', specialty: 'Psychiatry', terms: ['anxious', 'anxiety', 'panic', 'depressed', 'low mood', 'stressed', 'stress', 'cannot stay safe', 'self harm', 'suicidal'], understanding: 'I understand that you may be feeling anxious or stressed. These feelings can affect thoughts, sleep, concentration, and sometimes cause physical symptoms such as a racing heart or sweating.', possible: ['stress or anxiety', 'a mood-related condition', 'a concern that deserves confidential professional support'], questions: ['Are you safe right now?', 'Are you having thoughts of harming yourself or someone else?', 'How long have you felt this way, and do you have support nearby?'], care: 'Reach out to a trusted person and a qualified mental-health professional; you do not have to manage this alone.' },
  { system: 'infectious/pediatric', specialty: 'Pediatrics', terms: ['my child', 'my baby', 'child has fever', 'child fever', 'fever', 'flu', 'covid', 'dengue', 'malaria', 'typhoid'], understanding: 'I understand that you are reporting fever or infection-like symptoms. The cause depends on the symptom pattern, examination, and sometimes tests.', possible: ['a common viral illness', 'another infection requiring assessment', 'a condition whose cause depends on examination and tests'], questions: ['What is the temperature and how long has it lasted?', 'Any breathing trouble, dehydration, rash, repeated vomiting, or unusual sleepiness?', 'If this is a child, what is their age?'], care: 'Rest, fluids, and monitoring may help mild illness. Children with concerning symptoms should be assessed promptly.' },
];

const EMERGENCY_PATTERN = /severe\s+(chest|abdominal|stomach)\s+pain|chest.*(crushing|tight|pain)|can(?:not|'t)\s+breathe|difficulty\s+breathing|shortness\s+of\s+breath|faint(ed|ing)?|loss\s+of\s+consciousness|seizure|stroke|sudden.*(weak|numb|arm|face|vision|headache)|uncontrolled\s+bleeding|severe\s+(burn|allerg|injury)|(?:throat|tongue|lip|face).{0,25}swelling|swelling.{0,25}(?:throat|tongue|lip)|poison|major\s+trauma|emergency\s+help|\bsos\b|\bneed\s+(an?\s+)?ambulance\b|self.?harm|suicid/i;
const URGENT_PATTERN = /severe\s+eye\s+pain|persistent\s+vomit|high\s+fever|worsening|serious\s+injury|blood\s+in\s+(urine|stool)|unable\s+to\s+urinate|pregnan.*(pain|bleed)|urgent/i;
const NEARBY_PATTERN = /near\s*(me|by|my|here)|nearby|nearest|closest|around\s+me|my\s+location/i;
const SEARCH_PATTERN = /hospital|doctor|specialist|cardiologist|pediatrician|ophthalm|orthopedic|orthopaed|\bent\b|icu|blood\s*bank|ambulance|available\s*beds?|find|show\s+all|compare|cheapest|highest\s+rated/i;
const MULTILINGUAL_NEARBY_PATTERN = /near\s*(me|by|my|here)|nearby|nearest|closest|around\s+me|my\s+location|ನನ್ನ\s*ಹತ್ತಿರ|ಹತ್ತಿರದ\s*ಆಸ್ಪತ್ರ|ಸುತ್ತಮುತ್ತ\s*ಆಸ್ಪತ್ರ|ಆಸ್ಪತ್ರೆ\s*ಬೇಕ|मेरे\s*(पास|नजदीक|आसपास)|नजदीकी\s*अस्पताल|पास\s*के\s*अस्पताल/i;

const SPECIALTY_HINTS = {
  Ophthalmology: ['eye', 'eyes', 'vision', 'ophthalm'],
  ENT: ['ear', 'nose', 'throat', 'ent'],
  Orthopedics: ['bone', 'fracture', 'joint', 'orthopedic', 'orthopaed'],
  Cardiology: ['heart', 'cardio'],
  Pediatrics: ['child', 'children', 'baby', 'pediatric', 'paediatric'],
  'Gynecology & Obstetrics': ['pregnan', 'maternity', 'women', 'gynec', 'obstetric'],
  Neurology: ['brain', 'nerve', 'neurolog'],
  Urology: ['urology', 'urologist', 'urinary', 'kidney stone'],
  Dermatology: ['dermatology', 'dermatologist', 'skin'],
  'General Medicine': ['general medicine', 'physician'],
};

// Real directory data contains descriptive specialization names rather than a
// single controlled vocabulary. These aliases make the database lookup broad
// enough to find genuine equivalent records without ever fabricating one.
const SPECIALTY_DATABASE_TERMS = {
  Orthopedics: ['orthoped', 'ortho', 'trauma'],
  // Do not use the partial term "urolog": it is also contained in
  // "neurological" and would wrongly recommend neurologic-care providers.
  Urology: ['urology', 'urologist', 'genito urinary', 'genito-urinary'],
  Dermatology: ['dermatolog', 'skin'],
  Pediatrics: ['pediatr', 'paediatr', 'child specialist'],
  'Gynecology & Obstetrics': ['gynecolog', 'gynaecolog', 'obstetric', 'obg', 'obgyn'],
  Cardiology: ['cardiolog', 'cardiopulmonary'],
  Neurology: ['neurolog', 'neurosurg', 'neuro surgeon'],
  Pulmonology: ['pulmonolog', 'respiratory'],
  Gastroenterology: ['gastroenterolog', 'digestive'],
  'General Medicine': ['general medicine', 'general practice', 'physician'],
};

const DEFAULT_HOSPITAL_LIMIT = Math.min(Math.max(Number.parseInt(process.env.DEFAULT_HOSPITAL_LIMIT || '5', 10) || 5, 1), 50);
const HOSPITAL_LIMIT_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function asBoolean(value) { return value === true || value === 'true'; }
function hasCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
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
    .replace(/\b(stomachpain|stomach pain|stomch pain|stomac(?:h|k)? pain|tummy hurts?|belly pain|(?:my )?stom(?:a)?ch (?:is )?(?:hurting|hurts|hurt|paining|upset))\b/g, ' abdominal pain ')
    .replace(/\b(eyepain|eyes? (?:are )?(?:blur|not clear)|can(?:not|t) see (?:clearly|properly))\b/g, ' blurred vision ')
    .replace(/\b(backpain|my back is pain|kidney side (?:is )?(?:hurting|pain))\b/g, ' back pain ')
    .replace(/\b(pee pain|urine pain|pee burns?|my pee is burning|pain while peeing|it burns when i pee|hurts when i pee)\b/g, ' burning urination ')
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
    .replace(/\b(sir dard|head pain|(?:my )?head (?:is )?(?:hurting|hurts|hurt|paining))\b|सिर दर्द|डोके दुखणे|ತಲೆನೋವು/gi, ' headache ')
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

function isContextualFollowUp(message) {
  const text = normalise(message);
  // History is useful for references, but must never turn a new topic into an
  // answer about the first symptom in the conversation.
  const hasExplicitTopic = SYMPTOM_PROFILES.some((profile) => profileMatches(profile, text).length > 0);
  return !hasExplicitTopic && text.length <= 45 && /^(yes|no|it|this|that|they|them|what about|and|also|how|why|when|where|which|what symptoms|what should i do|is it|can i|should i)/.test(text);
}

function languageRequestedInMessage(message) {
  const text = String(message || '').toLowerCase();
  if (/ಕನ್ನಡದಲ್ಲಿ|kannada/.test(text)) return 'kn';
  if (/हिंदी|हिन्दी|hindi/.test(text)) return 'hi';
  if (/english|ಇಂಗ್ಲಿಷ್|अंग्रेजी/.test(text)) return 'en';
  return null;
}

function assessSymptoms(message, context = {}, history = []) {
  const currentMessage = clinicalText(message);
  const useContext = isContextualFollowUp(currentMessage);
  const latestUserMessage = Array.isArray(history)
    ? [...history].reverse().find((entry) => entry?.role === 'user')?.content
    : '';
  // Only the immediately preceding user turn can clarify a short reference.
  // Do not aggregate all history: doing so made earlier keywords dominate new
  // questions and caused CareGuide to repeat its first-topic response.
  const relevantContext = useContext ? `${context.symptoms || ''} ${latestUserMessage || ''}` : '';
  const combined = clinicalText(`${relevantContext} ${currentMessage}`);
  const matched = SYMPTOM_PROFILES.map((profile) => ({ profile, hits: profileMatches(profile, combined) }))
    .filter(({ hits }) => hits.length)
    .sort((a, b) => b.hits.length - a.hits.length);
  const primary = matched[0]?.profile || null;
  return { combined, currentMessage, usedContext: useContext, primary, matched };
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
  const specialties = await pool.query(`SELECT DISTINCT specialty FROM hospitals h CROSS JOIN LATERAL unnest(COALESCE(h.specialties, '{}')) specialty WHERE h.is_verified = true OR h.directory_visible = true`);
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
  // Word boundaries prevent the "at" inside "What" from being treated as a
  // location preposition.  Stop before common question clauses as well.
  if (/\b(?:at|in)\s+.+?\s+hospital\b/i.test(String(message || ''))) return null;
  const match = message.match(/\b(?:in|at)\b\s+([a-z][a-z .-]{1,50})(?:\?|$)/i);
  if (!match || NEARBY_PATTERN.test(message)) return null;
  // Trim natural-language clauses after the city, e.g. "in Chikkodi should
  // I go". Keeping those words produced a valid parameter but no DB matches.
  const city = match[1].trim().replace(/\b(hospital|nearby|please|has|have|with|that|which|should|could|would|can|do|does|is|are|where|who)\b.*$/i, '').trim();
  return city || null;
}

async function searchHospitals({ latitude, longitude, specialty, city, hospitalName, emergency, icu, bloodBank, bloodGroup, ambulance, availableBeds, radius, sort = 'distance', limit = 5 }) {
  const nearby = hasCoordinates(latitude, longitude);
  const params = [];
  const add = (value) => { params.push(value); return `$${params.length}`; };
  const lat = nearby ? add(Number(latitude)) : null;
  const lng = nearby ? add(Number(longitude)) : null;
  const distance = nearby ? `(6371 * acos(LEAST(1.0, GREATEST(-1.0, cos(radians(${lat})) * cos(radians(h.latitude)) * cos(radians(h.longitude) - radians(${lng})) + sin(radians(${lat})) * sin(radians(h.latitude))))))` : 'NULL';
  const filters = ['(h.is_verified = true OR h.directory_visible = true)'];
  if (nearby) filters.push('h.latitude IS NOT NULL AND h.longitude IS NOT NULL');
  if (nearby && Number.isFinite(Number(radius)) && Number(radius) > 0) filters.push(`${distance} <= ${add(Number(radius))}`);
  if (specialty) filters.push(`${add(specialty)} = ANY(h.specialties)`);
  if (city) filters.push(`h.city ILIKE ${add(`%${city}%`)}`);
  if (hospitalName) filters.push(`h.name ILIKE ${add(`%${hospitalName}%`)}`);
  if (emergency) filters.push('h.emergency_available = true');
  if (icu) filters.push('COALESCE(hr.icu_beds_available, 0) > 0');
  if (availableBeds) filters.push('COALESCE(hr.general_beds_available, 0) > 0');
  if (bloodBank) filters.push(`EXISTS (SELECT 1 FROM blood_bank bb WHERE bb.hospital_id = h.id AND bb.units_available > 0${bloodGroup ? ` AND bb.blood_group = ${add(bloodGroup)}` : ''})`);
  if (ambulance) filters.push('EXISTS (SELECT 1 FROM ambulances a WHERE a.hospital_id = h.id AND a.is_available = true)');
  const order = bloodGroup ? 'blood_units DESC, distance ASC NULLS LAST' : sort === 'cost' ? 'consultation_cost ASC NULLS LAST, distance ASC NULLS LAST' : sort === 'rating' ? 'h.google_rating DESC NULLS LAST, distance ASC NULLS LAST' : sort === 'beds' ? 'available_beds DESC, distance ASC NULLS LAST' : 'distance ASC NULLS LAST, h.google_rating DESC NULLS LAST';
  const query = `SELECT h.id, h.name, h.address, h.city, h.phone, h.email, h.latitude, h.longitude, h.entrance_latitude, h.entrance_longitude, h.google_rating, h.google_review_count, h.google_place_id, h.google_maps_url, h.rating_verified, h.rating_last_updated, h.specialties, h.emergency_available,
    COALESCE(hr.general_beds_total, 0) total_beds, COALESCE(hr.general_beds_available, 0) available_beds,
    COALESCE(hr.icu_beds_total, 0) total_icu, COALESCE(hr.icu_beds_available, 0) available_icu,
    COALESCE(hr.ventilators_total, 0) total_ventilators, COALESCE(hr.ventilators_available, 0) available_ventilators,
    COALESCE(hr.oxygen_supported_beds_total, 0) oxygen_beds_total, COALESCE(hr.oxygen_supported_beds_available, 0) oxygen_beds_available,
    COALESCE((SELECT SUM(bb.units_available) FROM blood_bank bb WHERE bb.hospital_id=h.id${bloodGroup ? ` AND bb.blood_group = ${add(bloodGroup)}` : ''}), 0) blood_units,
    COALESCE((SELECT COUNT(*) FROM doctors d WHERE d.hospital_id=h.id AND d.availability_status=true), 0) doctor_count,
    (SELECT MIN(d.consultation_fee) FROM doctors d WHERE d.hospital_id=h.id AND d.availability_status=true) consultation_cost,
    EXISTS (SELECT 1 FROM ambulances a WHERE a.hospital_id=h.id AND a.is_available=true) ambulance_available, ${distance} distance
    FROM hospitals h LEFT JOIN hospital_resources hr ON hr.hospital_id=h.id WHERE ${filters.join(' AND ')} ORDER BY ${order} LIMIT ${add(Math.min(Math.max(Number(limit) || 5, 1), 50))}`;
  const result = await pool.query(query, params);
  // `blood_units` is an aggregate only for ordinary hospital cards.  For a
  // blood search expose an explicit, group-scoped object so Flutter never
  // mistakes the number for another blood type.
  if (bloodGroup) {
    result.rows.forEach((row) => {
      const units = Number(row.blood_units || 0);
      row.blood = { group: bloodGroup, unitsAvailable: units, available: units > 0 };
    });
  }
  return result.rows.map((row) => ({ ...row, entrance_latitude: row.entrance_latitude == null ? null : Number(row.entrance_latitude), entrance_longitude: row.entrance_longitude == null ? null : Number(row.entrance_longitude), google_rating: row.rating_verified ? Number(row.google_rating) : null, google_review_count: row.rating_verified ? Number(row.google_review_count) : null, distance: row.distance == null ? null : Number(row.distance), total_beds: Number(row.total_beds), available_beds: Number(row.available_beds), total_icu: Number(row.total_icu), available_icu: Number(row.available_icu), total_ventilators: Number(row.total_ventilators), available_ventilators: Number(row.available_ventilators), oxygen_beds_total: Number(row.oxygen_beds_total), oxygen_beds_available: Number(row.oxygen_beds_available), blood_units: Number(row.blood_units), doctor_count: Number(row.doctor_count), consultation_cost: row.consultation_cost == null ? null : Number(row.consultation_cost) }));
}

function hospitalNameFromMessage(message) {
  const match = String(message || '').match(/\b(?:at|in)\s+(.+?)\s+hospital\b/i);
  return match ? match[1].trim() : null;
}

function extractBloodGroup(message) {
  const match = String(message || '').match(/\b(AB|A|B|O)\s*(\+|-)(?:\s*ve)?(?=\s|$|[.,!?])|\b(AB|A|B|O)\s*(positive|negative|pos|neg)(?=\s|$|[.,!?])/i);
  if (!match) return null;
  const group = match[1] || match[3];
  const marker = match[2] || match[4];
  const sign = /^(\+|positive|pos)$/i.test(marker) ? '+' : '-';
  return `${group.toUpperCase()}${sign}`;
}

async function searchDoctors({ latitude, longitude, specialty, city, hospitalName, limit = 20 }) {
  const nearby = hasCoordinates(latitude, longitude);
  const params = [];
  const add = (value) => { params.push(value); return `$${params.length}`; };
  const lat = nearby ? add(Number(latitude)) : null;
  const lng = nearby ? add(Number(longitude)) : null;
  const distance = nearby ? `(6371 * acos(LEAST(1.0, GREATEST(-1.0, cos(radians(${lat})) * cos(radians(h.latitude)) * cos(radians(h.longitude) - radians(${lng})) + sin(radians(${lat})) * sin(radians(h.latitude))))))` : 'NULL';
  // This is the one database query used by CareGuide and the public doctor
  // directory. Never return an inactive record as a recommendation.
  const filters = ['(h.is_verified = true OR h.directory_visible = true)', 'd.availability_status = true', 'COALESCE(d.is_active, true) = true'];
  if (nearby) filters.push('h.latitude IS NOT NULL AND h.longitude IS NOT NULL');
  if (specialty) {
    const terms = [...new Set([specialty, ...(SPECIALTY_DATABASE_TERMS[specialty] || [])])];
    const doctorMatches = terms.map((term) => `d.specialization ILIKE ${add(`%${term}%`)}`);
    // A hospital may offer a service without having a named doctor supplied
    // for it. Do not turn that into a recommendation for every doctor there.
    filters.push(`(${doctorMatches.join(' OR ')})`);
  }
  if (city) filters.push(`h.city ILIKE ${add(`%${city}%`)}`);
  if (hospitalName) filters.push(`h.name ILIKE ${add(`%${hospitalName}%`)}`);
  const result = await pool.query(`SELECT d.id, d.name, d.specialization, d.designation, d.department, d.qualification, d.experience_years, d.experience_display, d.availability, d.availability_status, d.verification_status, d.consultation_fee, d.phone,
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
    grouped.get(doctor.hospital_id).doctors.push({ id: doctor.id, hospital_id: doctor.hospital_id, name: doctor.name, specialization: doctor.specialization, designation: doctor.designation, qualification: doctor.qualification, experience_years: doctor.experience_years, experience_display: doctor.experience_display, availability: doctor.availability, availability_status: doctor.availability_status, consultation_fee: doctor.consultation_fee, available_slots: doctor.available_slots, phone: doctor.phone });
  }
  return [...grouped.values()];
}

function hospitalSummary(hospitals, { comparison = false } = {}) {
  if (!hospitals.length) return 'I could not find a matching registered hospital with the current filters.';
  const heading = comparison ? 'Nearby hospital comparison:' : 'I found these registered hospitals:';
  return `${heading}\n\n${hospitals.map((h, i) => `${i + 1}. ${h.name}\n📍 ${h.distance == null ? h.city || h.address || 'Location available in directory' : `${h.distance.toFixed(1)} km away`}\n${h.rating_verified ? `⭐ Google ${h.google_rating.toFixed(1)} (${h.google_review_count} reviews)` : 'Google rating unavailable'}\n🛏️ Beds: ${h.available_beds} · ICU: ${h.available_icu}\n🚑 Emergency: ${h.emergency_available ? 'Available' : 'Not listed'} · 🩸 ${h.blood_group || 'Blood'} units: ${h.blood_units}${h.consultation_cost == null ? '' : ` · Consultation from ₹${h.consultation_cost}`}`).join('\n\n')}\n\nGoogle ratings are shown for reference and may change on Google Maps. Availability is shown from the hospital system; please confirm with the hospital.`;
}

function hospitalSearchOptionsFromQuestion(message, routing, latitude, longitude) {
  const text = String(message || '').toLowerCase();
  const limit = extractHospitalLimit(text);
  const bloodGroup = extractBloodGroup(message);
  return {
    latitude,
    longitude,
    specialty: routing.specialty || undefined,
    city: cityFromMessage(message),
    hospitalName: hospitalNameFromMessage(message) || undefined,
    emergency: /emergency/.test(text),
    icu: /\bicu\b/.test(text),
    bloodBank: routing.needsBlood || Boolean(bloodGroup) || /blood\s*bank|blood\s+(?:available|units?)/.test(text),
    bloodGroup: bloodGroup || undefined,
    ambulance: /ambulance/.test(text),
    availableBeds: /available\s*(?:general\s*)?beds?|beds?\s+available/.test(text),
    radius: routing.needsLocation ? 20 : null,
    sort: /lowest\s+(?:cost|price)|cheapest|least\s+expensive/.test(text) ? 'cost' : /(?:most|highest)\s+rated/.test(text) ? 'rating' : /most\s+(?:available\s+)?beds?/.test(text) ? 'beds' : 'distance',
    // This is passed directly to the parameterized PostgreSQL LIMIT clause.
    // Never retrieve a large list and expect Flutter or Ollama to trim it.
    limit: limit ?? (/compare/.test(text) ? 10 : DEFAULT_HOSPITAL_LIMIT),
  };
}

function extractHospitalLimit(message) {
  const text = String(message || '').toLowerCase();
  if (/\b(?:all|every)\s+(?:available\s+)?hospitals?\b|\b(?:show|list)\s+all\b/.test(text)) return 50;
  const number = '(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)';
  const match = new RegExp(`\\b(?:only\\s+|top\\s+|first\\s+|give\\s+(?:me\\s+)?|show\\s+(?:me\\s+)?)?${number}\\s+(?:nearest\\s+|nearby\\s+)?(?:hospitals?|hospital)\\b`).exec(text)
    || new RegExp(`\\b${number}\\s+(?:nearest\\s+|nearby\\s+)?hospitals?\\b`).exec(text);
  if (!match) return null;
  const raw = match[1];
  const value = /^\d+$/.test(raw) ? Number(raw) : HOSPITAL_LIMIT_WORDS[raw];
  return Number.isInteger(value) && value >= 1 && value <= 50 ? value : null;
}

function classifyIntent(text, context = {}, specialty = null) {
  const shortReference = /^(where|which one|who|this one|that one|details|more|there|here|why|how)\??$/i.test(String(text || '').trim());
  if (shortReference) {
    if (['NEARBY_HOSPITALS', 'HOSPITAL_SEARCH', 'HOSPITAL_COMPARISON'].includes(context?.lastIntent)) return 'NEARBY_HOSPITALS';
    if (['NEARBY_DOCTORS', 'DOCTOR_SEARCH', 'DOCTOR_RECOMMENDATION'].includes(context?.lastIntent)) return 'NEARBY_DOCTORS';
    return 'AMBIGUOUS';
  }
  // Questions asking for definitions or general health education are not a
  // request for a real provider merely because they mention a specialty.
  const educational = /^(what\s+(is|are)|what\s+causes?|what\s+symptoms|why\s+does|difference\s+between|how\s+does)/i.test(text);
  const explicitDirectoryRequest = /hospital\s+(near|in|at)|nearby\s+hospital|nearest\s+hospital|show\s+.*hospital|doctors?\s+(at|in|near)|book\s+(an\s+)?appointment/i.test(text);
  if (educational && !explicitDirectoryRequest) return 'GENERAL_HEALTH';
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
  if (MULTILINGUAL_NEARBY_PATTERN.test(text)) return specialty || context?.specialty ? 'NEARBY_DOCTORS' : 'NEARBY_HOSPITALS';
  if (/\b(doctor|doctors|specialist|cardiologist|pediatrician|ophthalmologist|urologist|dermatologist|\bent\b)\b/i.test(text)) return 'DOCTOR_SEARCH';
  if (/\b(?:a|b|ab|o)\s*[+-](?=\s|$)\s*blood\b/i.test(text)) return 'HOSPITAL_SEARCH';
  if (/compare/i.test(text)) return 'HOSPITAL_COMPARISON';
  if (/hospital|nearby|nearest|closest|\bicu\b|blood\s*bank|ambulance|available\s*beds?|find\s+(an?|the)|show\s+all/i.test(text)) return 'HOSPITAL_SEARCH';
  return 'GENERAL_HEALTH';
}

function specialtyFromMessage(message, fallback = null) {
  const text = normalise(message);
  for (const [specialty, hints] of Object.entries(SPECIALTY_HINTS)) {
    if (hints.some((hint) => {
      const phrase = normalise(hint).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|\\s)${phrase}(?=\\s|$)`).test(text);
    })) return specialty;
  }
  return fallback;
}

function databaseReply({ intent, response, hospitals = [], doctors = [], specialty, language, context = {}, requiresLocation = false }) {
  const actions = [];
  if (hospitals.length) actions.push({ type: 'VIEW_HOSPITALS', label: localizedText[language].hospitals });
  if (doctors.length) actions.push({ type: 'BOOK_APPOINTMENT', label: localizedText[language].book });
  return {
    intent,
    type: doctors.length ? 'doctor_recommendation' : hospitals.length ? 'hospital_results' : 'database',
    severity: 'mild',
    specialty: specialty || null,
    requiresLocation,
    doctors: doctors.map((doctor) => localizeDoctor(doctor, language)),
    hospitals: hospitals.map((hospital) => localizeHospital(hospital, language)),
    actions,
    response,
    context: { ...context, specialty: specialty || null, language, lastIntent: intent },
  };
}

function detectPatientEmotion(text) {
  const t = String(text || '').toLowerCase();
  if (/scared|terrified|worried|nervous|panicking|afraid|frightened|anxious|anxiety|panic|stress|scare|horrified|डर|घबराहट|ಭಯ|ಆತಂಕ/i.test(t)) {
    return 'ANXIOUS_SCARED';
  }
  if (/pain|hurts|hurting|unbearable|terrible pain|severe pain|killing me|agony|suffering|दर्द|तकलीफ|ನೋವು/i.test(t)) {
    return 'IN_PAIN';
  }
  if (/confused|don't know|dont know|overwhelmed|lost|helpless|what should i do|what to do|गंभीर|समझ नहीं|ಗೊಂದಲ/i.test(t)) {
    return 'CONFUSED_OVERWHELMED';
  }
  if (/sad|depressed|crying|hopeless|feeling down|upset|low mood|उदासीन|उदास|ಬೇಸರ/i.test(t)) {
    return 'SAD_DISTRESSED';
  }
  if (/thank|thanks|relieved|better|appreciate|धन्यवाद|ಧನ್ಯವಾದ/i.test(t)) {
    return 'GRATEFUL_RELIEVED';
  }
  return 'NEUTRAL_CALM';
}

function symptomRecommendationText(language, specialty, emotion = 'NEUTRAL_CALM') {
  const prefix = (empathyPrefixes[emotion] && empathyPrefixes[emotion][language]) || '';
  const labels = {
    en: `${prefix}Based on your symptoms, a ${specialty || 'relevant'} specialist may be appropriate. Here are matching doctors and hospitals from the directory.`,
    kn: `${prefix}ನಿಮ್ಮ ಲಕ್ಷಣಗಳ ಆಧಾರದಲ್ಲಿ ${specialty || 'ಸೂಕ್ತ'} ತಜ್ಞರು ಸೂಕ್ತರಾಗಿರಬಹುದು. ಡೈರೆಕ್ಟರಿಯಲ್ಲಿರುವ ಹೊಂದಾಣಿಕೆಯ ವೈದ್ಯರು ಮತ್ತು ಆಸ್ಪತ್ರೆಗಳು ಇಲ್ಲಿವೆ.`,
    hi: `${prefix}आपके लक्षणों के आधार पर ${specialty || 'उपयुक्त'} विशेषज्ञ उचित हो सकते हैं। निर्देशिका में मिलते-जुलते डॉक्टर और अस्पताल यहां हैं।`,
  };
  return labels[language] || labels.en;
}

async function getAppointments(userId) {
  if (!userId) return [];
  const result = await pool.query(`SELECT a.id, a.appointment_date, a.appointment_time, a.status, h.name hospital_name, d.name doctor_name, d.specialization
    FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN hospitals h ON h.id=a.hospital_id
    LEFT JOIN doctors d ON d.id=a.doctor_id WHERE p.user_id=$1 AND a.status NOT IN ('cancelled', 'rejected')
    ORDER BY a.appointment_date ASC, a.appointment_time ASC LIMIT 10`, [userId]);
  return result.rows;
}

function medicalStateReply({ text, requestedLanguage, context, flow, patientAge, ageBand, followUpQuestion, requiresAge = false }) {
  return {
    intent: flow.policy.intent,
    // Keep the API response type explicit so Flutter can render the exact
    // interaction requested without inferring it from optional flags.
    type: requiresAge ? 'age_required' : followUpQuestion ? 'followup_required' : 'medical',
    severity: flow.policy.urgency || 'needs_details',
    response: text,
    requiresAge,
    showAgeSelector: requiresAge,
    patientAge: patientAge ?? null,
    ageBand: ageBand?.id || null,
    showSos: false,
    source: 'medical_dataset_rag',
    doctors: [], hospitals: [], actions: [],
    context: { ...context, language: requestedLanguage, symptoms: flow.policy.symptoms, specialty: null, lastIntent: flow.policy.intent, medicalConversation: { ...flow, patientAge: patientAge ?? flow.patientAge ?? null, ageBand: ageBand?.id || flow.ageBand || null, followUpIndex: followUpQuestion ? flow.followUpIndex + 1 : flow.followUpIndex } },
  };
}

function chatbotHospital(hospital, language) {
  const localized = localizeHospital(hospital, language);
  return {
    ...localized,
    hospitalId: Number(hospital.id),
    bloodGroup: hospital.blood?.group || null,
    bloodUnits: hospital.blood?.unitsAvailable ?? Number(hospital.blood_units || 0),
  };
}

// Actions carry all navigation data.  Clients must never infer a request from
// the text printed on a button, because that loses the selected hospital and
// (for blood) the requested group.
function hospitalActions(hospitals, routing, language, bloodGroup) {
  return hospitals.flatMap((hospital) => {
    const common = { hospitalId: Number(hospital.id), hospitalName: hospital.name };
    const actions = [{ type: 'VIEW_HOSPITAL', label: 'View Hospital', ...common }, { type: 'DIRECTIONS', label: 'Directions', ...common }];
    if (routing.needsBlood && bloodGroup) {
      actions.splice(1, 0, { type: 'REQUEST_BLOOD', label: 'Request Blood', ...common, bloodGroup, availableUnits: Number(hospital.blood?.unitsAvailable ?? hospital.blood_units ?? 0) });
    } else if (routing.needsResource) {
      const resourceType = routing.resourceType || 'beds';
      const availableByType = { icu_beds: hospital.available_icu, oxygen_beds: hospital.oxygen_beds_available, ventilators: hospital.available_ventilators, beds: hospital.available_beds };
      actions.splice(1, 0, { type: 'REQUEST_BED', label: 'Request Bed', ...common, resourceType, available: Number(availableByType[resourceType] ?? hospital.available_beds ?? 0) });
    }
    return actions;
  });
}

async function respond({ message, latitude, longitude, language, patientAge, conversationId, context = {}, history = [] }) {
  const startedAt = Date.now();
  const requestedLanguage = languageRequestedInMessage(message) || validLanguage(language || context.language);
  const text = String(message || '').trim();
  const normalisedText = clinicalText(text);
  // This is a request-path probe and a real user-facing greeting. It must not
  // depend on PostgreSQL, RAG, embeddings, or Ollama.
  if (/^(?:h+i+|hello|hey|namaste)\b[!. ]*$/i.test(text)) {
    return {
      intent: 'GREETING', type: 'greeting', severity: 'mild', source: 'local',
      response: 'Hello! I am CareGuide. I can help you with hospitals, doctors, medical information, appointments, and emergency resources.',
      doctors: [], hospitals: [], actions: [],
      context: { language: requestedLanguage, lastIntent: 'GREETING' },
    };
  }
  const assessment = assessSymptoms(normalisedText, context, history);
  const patientEmotion = detectPatientEmotion(text);
  const suicidal = /self.?harm|suicid|kill myself|end my life|want to die/i.test(text);
  // Deterministic safety routing is evaluated before RAG/Ollama and before
  // any conversational context can turn a new emergency message stale.
  const emergency = suicidal || detectEmergency(normalizeMessage(text)) || EMERGENCY_PATTERN.test(normalisedText);
  console.info(`[CareGuide] User message: ${text.slice(0, 300)} (Detected Emotion: ${patientEmotion})`);

  let routing;
  try { routing = await analyzeUserIntent({ message: text, context }); }
  catch (error) { throw error; }

  // Emergency care remains the safety priority, but it must not hide an
  // explicit request for a hospital or doctor.  These directory calls never
  // depend on Ollama or the medical RAG service.
  if (emergency && (routing.needsHospital || routing.needsDoctor)) {
    const response = suicidal
      ? 'I’m really sorry you’re going through this. Your safety matters right now. Please call 112 or 108, go to the nearest emergency department, or contact a trusted person who can stay with you. If you might act on these thoughts, move away from anything you could use to hurt yourself and do not stay alone. Are you in immediate danger right now?'
      : localizedText[requestedLanguage].emergency;
    try {
      const city = cityFromMessage(text);
      const doctors = routing.needsDoctor ? await searchDoctors({ latitude, longitude, specialty: routing.specialty, city, hospitalName: hospitalNameFromMessage(text), limit: 20 }) : [];
      const hospitals = routing.needsDoctor ? groupDoctorsByHospital(doctors) : await searchHospitals({ ...hospitalSearchOptionsFromQuestion(text, routing, latitude, longitude), city, emergency: true, limit: 20 });
      console.info(`[CHATBOT] emergency directory response: ${Date.now() - startedAt}ms`);
      return { intent: routing.needsDoctor ? 'EMERGENCY_DOCTOR_QUERY' : 'EMERGENCY_HOSPITAL_QUERY', type: routing.needsDoctor ? 'doctor_results' : 'hospital_results', severity: 'emergency', showSos: true, actions: [{ type: 'EMERGENCY_SOS', label: localizedText[requestedLanguage].sos }], response: `${response}\n\nI can also show the matching ${routing.needsDoctor ? 'doctors' : 'emergency hospitals'} below.`, doctors, hospitals: hospitals.map((hospital) => chatbotHospital(hospital, requestedLanguage)), source: 'postgresql', context: { language: requestedLanguage, lastIntent: routing.intent, emergencyDetected: true } };
    } catch (error) {
      console.error(`[Emergency] directory lookup failed: ${error.message}`);
      return { intent: 'EMERGENCY_QUERY', type: 'emergency', severity: 'emergency', showSos: true, actions: [{ type: 'EMERGENCY_SOS', label: localizedText[requestedLanguage].sos }], response, hospitals: [], source: 'emergency_rules', errorCode: 'DATABASE_ERROR', context: { language: requestedLanguage, lastIntent: 'EMERGENCY_QUERY', emergencyDetected: true } };
    }
  }
  if (emergency || routing.emergency) return { intent: 'EMERGENCY_QUERY', type: 'emergency', severity: 'emergency', showSos: true, requiresImmediateAttention: true, emergency: true, doctors: [], hospitals: [], actions: [{ type: 'EMERGENCY_SOS', label: localizedText[requestedLanguage].sos }, { type: 'REQUEST_AMBULANCE', label: 'Request Ambulance' }, { type: 'VIEW_HOSPITALS', label: 'Find Nearby Hospitals' }], response: localizedText[requestedLanguage].emergency, source: 'emergency_rules', context: { language: requestedLanguage, lastIntent: 'EMERGENCY_QUERY', emergencyDetected: true } };
  // Location improves result ordering, but an unavailable indoor/browser fix
  // must not turn a live blood or bed search into an empty response.
  const locationUnavailable = routing.needsLocation && !hasCoordinates(latitude, longitude);
  if (routing.needsBlood && !extractBloodGroup(text)) {
    return {
      intent: 'BLOOD_QUERY', type: 'blood_results', bloodGroup: null,
      severity: 'mild', source: 'local', doctors: [], hospitals: [], actions: [],
      response: 'Please tell me the blood group you need (for example, O+ or AB negative) so I can check live availability.',
      context: { ...context, language: requestedLanguage, lastIntent: 'BLOOD_QUERY' },
    };
  }

  // Dataset-guided conversation continues from the compact client context;
  // no patient data is persisted in the RAG corpus or server logs.
  let flow = context.medicalConversation;
  if (flow && !routing.needsHospital && !routing.needsDoctor && !routing.needsAppointment) {
    const exactAge = patientAge ?? flow.patientAge;
    const ageBand = mapAgeToBand(exactAge);
    if (flow.policy.patientAgeRequired && !ageBand) {
      console.info('[MEDICAL RAG] Patient age required: yes');
      return medicalStateReply({ text: "To give safer information, I need to know the patient's age.", requestedLanguage, context, flow, requiresAge: true });
    }
    const followUps = flow.policy.followUpQuestions || [];
    let index = Number(flow.followUpIndex || 0);
    const answers = Array.isArray(flow.answers) ? flow.answers : [];
    if (index > 0 && text !== flow.originalQuestion) answers.push(text.slice(0, 500));
    // Some dataset policies include age as a later follow-up even after the
    // selector supplied it. Never ask the same age question twice.
    while (ageBand && index < followUps.length && /\bage\b|how old|patient.?s age/i.test(String(followUps[index]))) {
      index += 1;
    }
    if (index < followUps.length) {
      flow = { ...flow, answers, followUpIndex: index };
      console.info(`[MEDICAL RAG] Follow-up required: yes (${index + 1}/${followUps.length})`);
      return medicalStateReply({ text: followUps[index], requestedLanguage, context, flow, patientAge: exactAge, ageBand, followUpQuestion: true });
    }
    console.info(`[MEDICAL RAG] Patient age: ${exactAge}; Age band: ${ageBand.id}; Follow-up required: no`);
    const medicalResponse = await answerWithRAG({ question: flow.originalQuestion, conversationHistory: history, language: requestedLanguage, patientAge: exactAge, ageBand, medicalIntent: flow.policy.intent, patientEmotion, additionalSafeContext: `Dataset policy: ${JSON.stringify(flow.policy)}\nFollow-up answers: ${answers.join(' | ')}` });
    return { intent: flow.policy.intent, type: 'medical', severity: flow.policy.urgency || 'routine', response: medicalResponse.answer, source: 'medical_dataset_rag', requiresAge: false, patientAge: exactAge, ageBand: ageBand.id, showSos: false, doctors: [], hospitals: [], actions: [], sources: medicalResponse.sources, retrievedDocuments: medicalResponse.retrievedChunks, context: { language: requestedLanguage, lastIntent: 'MEDICAL_QUERY', patientAge: exactAge, ageBand: ageBand.id, medicalConversation: { ...flow, patientAge: exactAge, ageBand: ageBand.id, followUpIndex: followUps.length, answers } } };
  }

  if (routing.needsRag && !routing.needsHospital) {
    console.info(`[MEDICAL RAG] User question: [redacted; characters=${text.length}]`);
    const { policy } = await findMedicalDatasetPolicy(text, requestedLanguage);
    console.info(`[MEDICAL RAG] Intent: ${policy?.intent || routing.intent}; Patient age required: ${policy?.patientAgeRequired === true ? 'yes' : 'no'}`);
    if (policy && (policy.patientAgeRequired || policy.relevanceAction === 'ask_followups_before_disease_retrieval')) {
      flow = { originalQuestion: text, policy, patientAge: patientAge ?? null, ageBand: null, followUpIndex: 0, answers: [], conversationId: conversationId || null };
      const ageBand = mapAgeToBand(patientAge);
      if (policy.patientAgeRequired && !ageBand) return medicalStateReply({ text: "To give safer information, I need to know the patient's age.", requestedLanguage, context, flow, requiresAge: true });
      return medicalStateReply({ text: policy.followUpQuestions[0] || 'Please share any relevant details so I can guide you safely.', requestedLanguage, context, flow, patientAge, ageBand, followUpQuestion: true });
    }
  }

  let medicalResponse = null;
  let doctors = [], hospitals = [], hospitalOptions = null;
  if (routing.needsRag) {
    try {
      console.info('[RAG] CareGuide medical query received');
      medicalResponse = await answerWithRAG({ question: text, conversationHistory: history, language: requestedLanguage, patientEmotion });
    } catch (error) {
      if (error instanceof RagStoreError || error instanceof EmbeddingServiceError || error instanceof OllamaServiceError) {
        console.error(`[RAG] CareGuide medical request unavailable: ${error.message}`);
        const unavailableMessage = error instanceof OllamaServiceError
          ? 'The local medical-answer service is unavailable right now. Please try again shortly, or seek professional medical care if this is urgent.'
          : 'The medical knowledge service is temporarily unavailable. Please try again later or seek professional medical care if this is urgent.';
        return { intent: routing.intent, type: 'error', severity: 'mild', source: 'rag', available: false, doctors: [], hospitals: [], actions: [], response: unavailableMessage, medical_response: { source: 'rag', available: false, error: error.code }, context: { ...context, language: requestedLanguage, specialty: routing.specialty, lastIntent: routing.intent } };
      }
      throw error;
    }
  }

  if (routing.needsDoctor) {
    console.info(`[DoctorDB] query: ${routing.specialty || 'none'}`);
    doctors = await searchDoctors({ latitude, longitude, specialty: routing.specialty, city: cityFromMessage(text), hospitalName: hospitalNameFromMessage(text), limit: 20 });
    hospitals = groupDoctorsByHospital(doctors);
    console.info(`[DoctorDB] results: ${doctors.length}`);
  } else if (routing.needsHospital) {
    console.info(`[${routing.needsBlood ? 'BloodDB' : routing.needsResource ? 'ResourceDB' : 'HospitalDB'}] query: ${routing.specialty || 'all'}`);
    hospitalOptions = hospitalSearchOptionsFromQuestion(text, routing, latitude, longitude);
    hospitals = await searchHospitals(hospitalOptions);
    console.info(`[${routing.needsBlood ? 'BloodDB' : routing.needsResource ? 'ResourceDB' : 'HospitalDB'}] bloodGroup=${hospitalOptions.bloodGroup || 'none'}; limit=${hospitalOptions.limit}; results=${hospitals.length}`);
  }
  const safetyPrefix = context.emergencyDetected && (routing.needsHospital || routing.needsDoctor) ? `${localizedText[requestedLanguage].emergency}\n\n` : '';
  const response = safetyPrefix + (medicalResponse?.answer || (routing.needsDoctor
    ? (doctors.length ? symptomRecommendationText(requestedLanguage, routing.specialty, patientEmotion) : 'No matching doctors were found in the hospital database.')
    : routing.needsHospital ? (hospitals.length ? (hospitalOptions?.latitude != null && hospitalOptions?.longitude != null
      ? `Here are the ${hospitals.length} nearest hospitals to your current location.`
      : `${locationUnavailable ? 'Location is unavailable, so ' : ''}Here are ${hospitals.length} matching hospitals from the hospital directory.`)
      : 'No matching hospitals were found in the hospital database.') : localizedText[requestedLanguage].clarification));
  console.info(`[CHATBOT] Total response time: ${Date.now() - startedAt}ms`);
  return {
    intent: routing.intent, type: routing.needsRag && routing.needsHospital ? 'mixed' : routing.needsDoctor ? 'doctor_results' : routing.needsBlood ? 'blood_results' : routing.needsResource ? 'bed_results' : routing.needsHospital ? 'hospital_results' : routing.needsRag ? 'medical' : 'general', severity: assessment.primary ? 'moderate' : 'mild', specialty: routing.specialty,
    response, source: medicalResponse ? 'rag' : (routing.needsHospital || routing.needsDoctor) ? 'postgresql' : 'local', medical_response: medicalResponse, sources: medicalResponse?.sources || [], retrievedDocuments: medicalResponse?.retrievedChunks || 0, recommendations: { source: 'postgresql', specialty: routing.specialty, doctors, hospitals }, doctors, hospitals: hospitals.map((hospital) => chatbotHospital(hospital, requestedLanguage)),
    bloodGroup: routing.needsBlood ? hospitalOptions?.bloodGroup || null : null, resourceType: routing.needsResource ? routing.resourceType : null, limit: routing.needsHospital ? hospitalOptions?.limit : null,
    nearby: routing.needsHospital ? routing.needsLocation : false, locationUnavailable,
    actions: doctors.length ? [{ type: 'BOOK_APPOINTMENT', label: localizedText[requestedLanguage].book }] : hospitalActions(hospitals, routing, requestedLanguage, hospitalOptions?.bloodGroup), context: { symptoms: routing.symptoms, specialty: routing.specialty, language: requestedLanguage, lastIntent: routing.needsRag ? 'MEDICAL_QUERY' : routing.intent, ...(routing.needsRag ? { medicalConversation: { originalQuestion: text, policy: { intent: 'MEDICAL_QUERY', patientAgeRequired: false, followUpQuestions: [] }, patientAge: patientAge ?? null, followUpIndex: 0, answers: [] } } : {}) },
  };
}

module.exports = { respond, searchHospitals, searchDoctors, classifyIntent, extractHospitalLimit, extractBloodGroup, hospitalSearchOptionsFromQuestion, normalizePatientMessage: clinicalText, assessSymptoms };
