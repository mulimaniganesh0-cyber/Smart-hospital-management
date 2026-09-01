const SPECIALTIES = [
  ['Orthopedics', /\b(?:knee|joint|fracture|bone|back(?:\s+|-)pain|shoulder|sprain|orthop)/i],
  ['Urology', /\b(?:urin|kidney stone|flank pain|urolog)/i],
  ['Gynecology & Obstetrics', /\b(?:pregnan|period|menstrual|gyn|obstetric)/i],
  ['Pediatrics', /\b(?:my child|my baby|child.*(?:fever|sick)|pediatric|paediatric)/i],
  ['Dermatology', /\b(?:rash|itch|skin|hair loss|dermat)/i],
  ['Cardiology', /\b(?:heart|chest pain|palpitation|cardio)/i],
  ['Neurology', /\b(?:seizure|one[ -]side weakness|numbness|migraine|neurolog)/i],
];

const EMERGENCY = /\b(?:severe chest pain|can(?:not|'t) breathe|difficulty breathing|loss of consciousness|severe bleeding|major accident|sudden.*(?:weak|numb)|seizure)\b/i;
const GENERAL = /^(?:hello|hi|hey|thanks?|thank you|good morning|good afternoon|good evening|who are you|what can you do)[!. ]*$/i;
const BLOOD_GROUP = '\\b(?:ab|a|b|o)\\s*(?:(?:\\+|-)\\s*(?:ve)?|positive|negative|pos|neg)(?=\\s|$|[.,!?])';
// A blood group followed by "units" is also a live blood-inventory query;
// users do not always repeat the word "blood" in their question.
const BLOOD_AVAILABILITY = new RegExp(`${BLOOD_GROUP}.{0,30}\\b(?:blood|units?)\\b|\\b(?:blood|units?)\\b.{0,30}${BLOOD_GROUP}|\\b(?:need|find|get|available|where|which)\\b.{0,20}${BLOOD_GROUP}`, 'i');
const BLOOD_REQUEST = /\b(?:need|want|find|get|where|which|do you have)\b.{0,40}\bblood\b(?!\s*pressure)|\bblood\s*bank\b/i;
const RESOURCE_AVAILABILITY = /\b(?:icu(?:\s+beds?)?|ventilators?|oxygen(?:\s*(?:bed|support))?|(?:an?\s+|general\s+)?beds?|available\s*beds?|beds?\s+available|(?:how many|number of)\s+(?:icu\s+)?beds?|blood\s*bank)\b/i;
const PROVIDER = /\b(?:doctor|specialist|hospital|near me|nearby|closest|nearest|which.*(?:visit|doctor|hospital)|show\s+(?:me\s+)?(?:doctors?|hospitals?))\b/i;
const APPOINTMENT = /\b(?:book|schedule|make|cancel|reschedule)\s+(?:an?\s+)?appointment\b|\bappointment\b/i;
const DOCTOR = /\b(?:doctor|doctors|specialist|cardiologist|pediatrician|ophthalmologist|urologist|dermatologist|neurologist|orthopedist|\bent\b)\b/i;
const MEDICAL = /\b(?:fever|headache|migraine|cough|cold|sore throat|joint(?:\s+|-)pain|body(?:\s+|-)pain|back(?:\s+|-)pain|stomach(?:\s+|-)pain|abdominal pain|chest pain|nausea|vomit(?:ing)?|diarrh(?:ea|oea)|constipation|dizz(?:y|iness)|weak(?:ness)?|fatigue|rash|itch(?:ing)?|allerg(?:y|ies)|breath(?:ing)? difficulty|shortness of breath|swelling|infection|dehydration|temperature|diabetes|hypertension|blood pressure|asthma|flu|malaria|dengue|typhoid|disease|condition|symptom|treatment|remedy|medicine|medication|tablet(?:s)?|syrup|capsule|dose|dosage|what should i take|what medicine should i take|can i take|which medicine|medicine for|medication for|i (?:have|feel|am having)|my .* (?:hurt|hurts|pain))\b/i;

function normalizeMessage(value) {
  return String(value || '')
    .toLowerCase().trim().replace(/[‐‑‒–—]/g, '-')
    .replace(/\b(?:medecine|medicin)\b/g, 'medicine')
    .replace(/\bhead ache\b/g, 'headache').replace(/\bbody ache\b/g, 'body pain')
    .replace(/\b([abo]{1,2})\s*(?:positive|pos|\+ve)\b/g, '$1+')
    .replace(/\b([abo]{1,2})\s*(?:negative|neg|-ve)\b/g, '$1-')
    .replace(/[^a-z0-9+\-\s]/g, ' ').replace(/\s+/g, ' ');
}

function specialtyFrom(message, context) {
  const text = `${message} ${context?.specialty || ''}`;
  return SPECIALTIES.find(([, pattern]) => pattern.test(text))?.[0] || context?.specialty || null;
}

async function analyzeUserIntent({ message, context = {} }) {
  const normalizedMessage = normalizeMessage(message);
  const specialty = specialtyFrom(normalizedMessage, context);
  const bloodQuery = BLOOD_AVAILABILITY.test(normalizedMessage) || BLOOD_REQUEST.test(normalizedMessage);
  const resourceQuery = !bloodQuery && RESOURCE_AVAILABILITY.test(normalizedMessage);
  const appointmentQuery = APPOINTMENT.test(normalizedMessage);
  const needsDoctor = DOCTOR.test(normalizedMessage);
  const wantsProvider = PROVIDER.test(normalizedMessage) || resourceQuery || bloodQuery || appointmentQuery;
  const needsHospital = wantsProvider && !needsDoctor;
  const emergency = EMERGENCY.test(normalizedMessage);
  // A short reply in an active medical conversation is a continuation unless
  // it clearly starts a resource, provider, appointment, or emergency task.
  const contextualMedical = !GENERAL.test(normalizedMessage) &&
    Boolean(context?.lastIntent === 'MEDICAL_QUERY' || context?.medicalConversation) &&
    !bloodQuery && !resourceQuery && !appointmentQuery && !needsDoctor && !PROVIDER.test(normalizedMessage) && !emergency;
  const medical = MEDICAL.test(normalizedMessage) || contextualMedical;
  const needsRag = medical && !needsHospital && !needsDoctor && !appointmentQuery;
  const resourceType = resourceQuery ? (/\bicu\b/i.test(normalizedMessage) ? 'icu_beds' : /ventilator/i.test(normalizedMessage) ? 'ventilators' : /oxygen/i.test(normalizedMessage) ? 'oxygen_beds' : /beds?/i.test(normalizedMessage) ? 'beds' : null) : null;
  let intent = 'GENERAL_QUERY';
  if (emergency) intent = 'EMERGENCY_QUERY';
  else if (bloodQuery) intent = 'BLOOD_QUERY';
  else if (resourceQuery) intent = 'BED_QUERY';
  else if (appointmentQuery) intent = 'APPOINTMENT_QUERY';
  else if (needsDoctor) intent = 'DOCTOR_QUERY';
  else if (needsHospital) intent = 'HOSPITAL_QUERY';
  else if (medical) intent = 'MEDICAL_QUERY';
  const result = { intent, normalizedMessage, symptoms: specialty ? [specialty] : [], specialty, needsRag, needsOllama: needsRag, needsOllamaRouting: false, needsHospital, needsDoctor, needsBlood: bloodQuery, needsResource: resourceQuery, needsAppointment: appointmentQuery, resourceType, needsLocation: /\b(?:near me|nearby|closest|nearest)\b/i.test(normalizedMessage), emergency, isGeneral: GENERAL.test(normalizedMessage) };
  console.info(`[CHATBOT ROUTER] messageLength=${normalizedMessage.length}; intent=${intent}; bloodGroup=${bloodQuery ? (normalizedMessage.match(BLOOD_GROUP)?.[0] || 'unspecified') : 'none'}; bedType=${resourceType || 'none'}; medical=${medical}; rag=${needsRag}; hospitalDB=${needsHospital}; bloodDB=${bloodQuery}; resourceDB=${resourceQuery}; doctorDB=${needsDoctor}`);
  return result;
}

module.exports = { analyzeUserIntent, specialtyFrom, normalizeMessage };
