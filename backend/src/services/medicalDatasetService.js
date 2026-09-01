const { retrieveRelevantChunks } = require('./ragRetrievalService');

// These bounds are the six ranges supplied by medical_dataset_age_aware_600.
// The backend keeps exact years and maps them to the dataset's day-based bands.
const AGE_BANDS = [
  { id: 'newborn', label: 'Newborn', minDays: 0, maxDays: 28 },
  { id: 'infant', label: 'Infant', minDays: 29, maxDays: 365 },
  { id: 'child', label: 'Child', minDays: 366, maxDays: 4744 },
  { id: 'adolescent', label: 'Adolescent', minDays: 4745, maxDays: 6574 },
  { id: 'adult', label: 'Adult', minDays: 6575, maxDays: 23724 },
  { id: 'older_adult', label: 'Older adult', minDays: 23725, maxDays: Infinity },
];

function mapAgeToBand(age, ageInDays = null) {
  const years = Number(age);
  if (!Number.isInteger(years) || years < 0 || years > 130) return null;
  // If a client has an exact day age (for newborns), it takes precedence.
  // The existing age selector sends whole years, so use the dataset's labels
  // at the otherwise ambiguous year boundaries (18 is Adult, not Adolescent).
  const days = ageInDays !== null && ageInDays !== undefined && Number.isInteger(Number(ageInDays)) && Number(ageInDays) >= 0
    ? Number(ageInDays)
    : years === 0 ? 29 : years === 1 ? 366 : years >= 18 ? years * 365 + 5 : years * 365 + 1;
  return AGE_BANDS.find((band) => days >= band.minDays && days <= band.maxDays) || null;
}

function policyFromChunk(chunk) {
  const metadata = chunk.document_metadata || {};
  if (metadata.source_type !== 'medical_dataset' || !metadata.normalized_intent) return null;
  return {
    intent: metadata.normalized_intent,
    symptoms: metadata.normalized_symptoms || '',
    patientAgeRequired: metadata.patient_age_required === true || metadata.patient_age_required === 'true',
    minimumQuestions: String(metadata.minimum_questions || '').split(';').map((value) => value.trim()).filter(Boolean),
    followUpQuestions: ['follow_up_question_1', 'follow_up_question_2', 'follow_up_question_3'].map((key) => metadata[key]).filter(Boolean),
    urgency: metadata.urgency || 'routine',
    redFlags: metadata.red_flags || '',
    relevanceAction: metadata.relevance_action || '',
    candidateDiseasePolicy: metadata.candidate_disease_policy || '',
  };
}

async function findMedicalDatasetPolicy(question, language) {
  const chunks = await retrieveRelevantChunks(question, { topK: 8, similarityThreshold: 0.35, language });
  const match = chunks.map(policyFromChunk).find(Boolean) || null;
  return { policy: match, chunks };
}

module.exports = { AGE_BANDS, mapAgeToBand, findMedicalDatasetPolicy };
