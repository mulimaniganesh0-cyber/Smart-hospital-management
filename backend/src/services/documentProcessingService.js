const fs = require('fs/promises');
const path = require('path');
const { normalizeWhitespace } = require('./chunkingService');

const supportedExtensions = new Set(['.json', '.jsonl']);

function documentFromRecord(record, source, index) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`${source}: record ${index + 1} must be an object.`);
  const title = String(record.title || record.condition || record.name || record.id || `Document ${index + 1}`).trim();
  const content = normalizeWhitespace(record.content || record.text || Object.entries(record)
    .filter(([key, value]) => !['id', 'title', 'name', 'condition', 'metadata', 'language', 'source'].includes(key) && value != null)
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${Array.isArray(value) ? value.join('; ') : typeof value === 'object' ? JSON.stringify(value) : value}`).join('\n'));
  if (!content) throw new Error(`${source}: record ${index + 1} has no usable content.`);
  const policyFields = ['normalized_intent', 'normalized_symptoms', 'normalized_condition_id', 'patient_age_required', 'minimum_questions', 'follow_up_question_1', 'follow_up_question_2', 'follow_up_question_3', 'urgency', 'red_flags', 'relevance_action', 'candidate_disease_policy', 'answer_scope', 'doctor_like_style', 'age_routing', 'show_sos', 'show_nearby_hospital'];
  const policyMetadata = Object.fromEntries(policyFields.filter((field) => record[field] !== undefined).map((field) => [field, record[field]]));
  return {
    // Preserve the established external-id format so previously ingested
    // records are updated in place rather than duplicated.
    externalId: String(record.id || `${path.basename(source)}:${index + 1}`),
    title,
    content,
    language: String(record.language || 'und'),
    source,
    metadata: {
      ...(record.metadata && typeof record.metadata === 'object' ? record.metadata : {}),
      ...policyMetadata,
      originalId: record.id || record.conversation_id || null,
      conversationId: record.conversation_id || null,
      source_type: 'medical_dataset',
    },
  };
}

function ageAwareDocuments(record, source, index) {
  const baseId = String(record.id || `${path.basename(source)}:${index + 1}`);
  const fields = {
    en: [['Condition', record.disease_en], ['Category', record.category], ['Age group', record.age_label_en || record.age_group], ['Description', record.description_en], ['Symptoms', record.symptoms_en], ['Warning signs', record.red_flags_en], ['General management', record.management_en], ['Prevention', record.prevention_en], ['When to seek care', record.seek_care_en], ['Age-specific guidance', record.age_guidance_en]],
    hi: [['स्थिति', record.disease_hi], ['श्रेणी', record.category], ['आयु समूह', record.age_label_hi || record.age_group], ['विवरण', record.description_hi], ['लक्षण', record.symptoms_hi], ['खतरे के संकेत', record.red_flags_hi], ['सामान्य देखभाल', record.management_hi], ['बचाव', record.prevention_hi], ['चिकित्सकीय सहायता कब लें', record.seek_care_hi], ['आयु-विशिष्ट मार्गदर्शन', record.age_guidance_hi]],
    kn: [['ಸ್ಥಿತಿ', record.disease_kn], ['ವರ್ಗ', record.category], ['ವಯಸ್ಸಿನ ಗುಂಪು', record.age_label_kn || record.age_group], ['ವಿವರಣೆ', record.description_kn], ['ಲಕ್ಷಣಗಳು', record.symptoms_kn], ['ಎಚ್ಚರಿಕೆ ಲಕ್ಷಣಗಳು', record.red_flags_kn], ['ಸಾಮಾನ್ಯ ಆರೈಕೆ', record.management_kn], ['ತಡೆಗಟ್ಟುವಿಕೆ', record.prevention_kn], ['ಯಾವಾಗ ವೈದ್ಯಕೀಯ ಸಹಾಯ ಪಡೆಯಬೇಕು', record.seek_care_kn], ['ವಯಸ್ಸು-ನಿರ್ದಿಷ್ಟ ಮಾರ್ಗದರ್ಶನ', record.age_guidance_kn]],
  };
  return Object.entries(fields).map(([language, pairs]) => {
    const title = String(record[`disease_${language}`] || record.disease_en || `Medical record ${baseId}`).trim();
    const content = normalizeWhitespace(pairs.filter(([, value]) => value != null && String(value).trim()).map(([label, value]) => `${label}: ${value}`).join('\n'));
    return { externalId: `${baseId}:${language}`, title, content, language, source, metadata: { originalId: record.id || null, category: record.category || null, ageGroup: record.age_group || null, ageRange: record.age_range || null, ageMinDays: record.age_min_days ?? null, ageMaxDays: record.age_max_days ?? null, sourcePortal: record.source_portal || null, source_type: 'medical_dataset' } };
  }).filter((document) => document.content);
}

function documentsFromRecord(record, source, index) {
  if (record && typeof record === 'object' && ('disease_en' in record || 'disease_hi' in record || 'disease_kn' in record)) return ageAwareDocuments(record, source, index);
  return [documentFromRecord(record, source, index)];
}

async function loadJson(filePath) {
  const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const records = Array.isArray(parsed) ? parsed : Array.isArray(parsed.documents) ? parsed.documents : [parsed];
  return records.flatMap((record, index) => documentsFromRecord(record, filePath, index));
}

async function loadJsonl(filePath) {
  const lines = (await fs.readFile(filePath, 'utf8')).split(/\r?\n/).filter((line) => line.trim());
  return lines.flatMap((line, index) => documentsFromRecord(JSON.parse(line), filePath, index));
}

async function loadDocumentsFromDirectory(directory) {
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const documents = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile()) continue;
    const filePath = path.join(directory, entry.name);
    const extension = path.extname(entry.name).toLowerCase();
    if (!supportedExtensions.has(extension)) continue;
    documents.push(...(extension === '.json' ? await loadJson(filePath) : await loadJsonl(filePath)));
  }
  return documents;
}

module.exports = { loadDocumentsFromDirectory, loadJson, loadJsonl, documentFromRecord, documentsFromRecord, supportedExtensions };
