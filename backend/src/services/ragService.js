const { retrieveRelevantChunks, buildRetrievedContext } = require('./ragRetrievalService');
const { generateMedicalResponse } = require('./ollamaService');
const { isDevelopment } = require('../config/ragConfig');

const HOSPITAL_DATABASE_NOT_FOUND = "I couldn't find this information in the hospital database.";

function hospitalDatabaseContext(hospitals) {
  // Use an allow-list so the prompt contains only public directory and live
  // availability fields, never patient data or internal provider credentials.
  return hospitals.map((hospital) => ({
    name: hospital.name,
    address: hospital.address || null,
    city: hospital.city || null,
    specialties: hospital.specialties || [],
    emergency_available: Boolean(hospital.emergency_available),
    available_beds: hospital.available_beds,
    available_icu: hospital.available_icu,
    available_ventilators: hospital.available_ventilators,
    ambulance_available: Boolean(hospital.ambulance_available),
    blood_units: hospital.blood_units,
    consultation_cost: hospital.consultation_cost,
    distance_km: hospital.distance,
    rating: hospital.rating_verified ? hospital.google_rating : null,
  }));
}

async function answerWithRAG({ question, conversationHistory = [], language = 'en', additionalSafeContext = '', ageBand, patientAge, medicalIntent, patientEmotion = 'NEUTRAL_CALM' }) {
  const startedAt = Date.now();
  const chunks = await retrieveRelevantChunks(question, { language, ageBand: ageBand?.id || ageBand });
  if (!chunks.length) {
    console.warn('[RAG] no relevant medical chunks retrieved');
    return { type: 'medical', answer: 'The available medical knowledge does not contain enough relevant information to answer that safely. Please consult a qualified healthcare professional for guidance.', sources: [], retrievedChunks: 0, insufficientContext: true };
  }
  // Generation does not need every candidate.  Three high-ranking chunks keep
  // the prompt small enough for a local llama3.2 instance to respond promptly.
  const selectedChunks = chunks.slice(0, 3);
  console.info(`[RAG] Selected context chunks: ${selectedChunks.length}`);
  const retrievedContext = buildRetrievedContext(selectedChunks);
  console.info(`[RAG] Context length: ${retrievedContext.length}`);
  console.info('[RAG] Sending grounded prompt to Ollama: yes');
  let answer;
  let generationFallback = false;
  try {
    answer = await generateMedicalResponse({ question, retrievedContext, conversationHistory, language, additionalSafeContext, patientAge, ageBand: ageBand?.label || ageBand, medicalIntent, patientEmotion });
  } catch (error) {
    // Retrieval succeeded, so preserve the verified information instead of
    // reporting the whole assistant as unavailable because generation failed.
    if (error?.code !== 'OLLAMA_UNAVAILABLE') throw error;
    generationFallback = true;
    answer = `Based on the available medical information:\n\n${buildRetrievedContext(selectedChunks)}\n\nPlease consult a qualified healthcare professional for personalised guidance.`;
    console.warn(`[RAG] Ollama fallback used: ${error.message}`);
  }
  if (isDevelopment) console.info(`[RAG] answer generated in ${Date.now() - startedAt}ms; chunks=${chunks.length}`);
  return {
    type: 'medical', answer,
    sources: selectedChunks.map((chunk) => ({ documentId: chunk.document_id, title: chunk.title, source: chunk.source, score: Number(chunk.score.toFixed(4)) })),
    retrievedChunks: chunks.length,
    insufficientContext: false,
    generationFallback,
  };
}

async function answerHospitalWithRAG({ question, hospitals = [], loadHospitals, conversationHistory = [], language = 'en', patientEmotion = 'NEUTRAL_CALM' }) {
  const chunks = await retrieveRelevantChunks(question, { language });
  // Retrieval deliberately happens before the exact live-data lookup so every
  // hospital question follows the RAG path even when it has database filters.
  const liveHospitals = typeof loadHospitals === 'function' ? await loadHospitals() : hospitals;
  const selectedChunks = chunks.slice(0, 3);
  const retrievedContext = buildRetrievedContext(selectedChunks);
  const structuredContext = hospitalDatabaseContext(liveHospitals);
  const groundedContext = [
    'LIVE POSTGRESQL HOSPITAL RECORDS (authoritative):',
    JSON.stringify(structuredContext),
    '\nRETRIEVED HOSPITAL DOCUMENTS:',
    retrievedContext || '(No relevant hospital document was retrieved.)',
  ].join('\n');
  console.info(`[RAG] Context length: ${groundedContext.length}`);

  // No evidence means there is nothing the model is allowed to answer from.
  if (!structuredContext.length && !selectedChunks.length) {
    console.warn('[RAG] No hospital evidence available for this request');
    return { type: 'hospital', answer: HOSPITAL_DATABASE_NOT_FOUND, hospitals: liveHospitals, sources: [], retrievedChunks: 0, insufficientContext: true };
  }

  const { generateHospitalResponse } = require('./ollamaService');
  console.info('[RAG] Sending grounded prompt to Ollama: yes');
  const answer = await generateHospitalResponse({ question, retrievedContext: groundedContext, conversationHistory, language, patientEmotion });
  return {
    type: 'hospital', answer,
    hospitals: liveHospitals,
    sources: selectedChunks.map((chunk) => ({ documentId: chunk.document_id, title: chunk.title, source: chunk.source, score: Number(chunk.score.toFixed(4)) })),
    retrievedChunks: chunks.length,
    insufficientContext: false,
  };
}

module.exports = { answerWithRAG, answerHospitalWithRAG, HOSPITAL_DATABASE_NOT_FOUND };
