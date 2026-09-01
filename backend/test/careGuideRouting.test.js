const test = require('node:test');
const assert = require('node:assert/strict');

const { analyzeUserIntent } = require('../src/services/medicalIntentService');
const { extractBloodGroup, hospitalSearchOptionsFromQuestion } = require('../src/services/careGuideService');

test('hospital entity extraction applies explicit and default database limits', () => {
  const routing = { needsLocation: true, specialty: null };
  assert.equal(hospitalSearchOptionsFromQuestion('I need only 5 hospitals near me', routing, 16.4, 74.6).limit, 5);
  assert.equal(hospitalSearchOptionsFromQuestion('give me three nearby hospitals', routing, 16.4, 74.6).limit, 3);
  assert.equal(hospitalSearchOptionsFromQuestion('Find nearby hospitals', routing, 16.4, 74.6).limit, 5);
  assert.equal(hospitalSearchOptionsFromQuestion('show all hospitals in Chikkodi', routing).limit, 50);
  assert.equal(hospitalSearchOptionsFromQuestion('My fever started 2 days ago', routing).limit, 5);
});
test('general fever question routes to local RAG and not the directory', async () => {
  const result = await analyzeUserIntent({ message: 'I have fever.', context: {} });
  assert.equal(result.intent, 'MEDICAL_QUERY');
  assert.equal(result.needsRag, true);
  assert.equal(result.needsOllama, true);
  assert.equal(result.needsHospital, false);
});

test('hospital request is routed to PostgreSQL without Ollama', async () => {
  const result = await analyzeUserIntent({ message: 'I have fever and want to know which nearby hospital I should visit.', context: {} });
  assert.equal(result.intent, 'HOSPITAL_QUERY');
  assert.equal(result.needsRag, false);
  assert.equal(result.needsOllama, false);
  assert.equal(result.needsHospital, true);
});

test('bed searches are direct PostgreSQL routing', async () => {
  const result = await analyzeUserIntent({ message: 'Show hospitals with ICU availability.', context: {} });
  assert.equal(result.intent, 'BED_QUERY');
  assert.equal(result.needsRag, false);
  assert.equal(result.needsHospital, true);
  assert.equal(result.resourceType, 'icu_beds');
  const generalBed = await analyzeUserIntent({ message: 'I need a bed', context: {} });
  assert.equal(generalBed.intent, 'BED_QUERY');
  assert.equal(generalBed.resourceType, 'beds');
});

test('blood-group aliases and combined resource filters remain database queries', async () => {
  assert.equal(extractBloodGroup('I need O+ blood'), 'O+');
  assert.equal(extractBloodGroup('Need AB positive blood'), 'AB+');
  assert.equal(extractBloodGroup('B negative blood bank'), 'B-');
  const routing = await analyzeUserIntent({ message: 'Find nearby hospitals with O positive blood and ICU beds', context: {} });
  const options = hospitalSearchOptionsFromQuestion('Find nearby hospitals with O positive blood and ICU beds', routing, 16.4, 74.6);
  assert.equal(routing.needsHospital, true);
  assert.equal(routing.needsRag, false);
  assert.equal(options.bloodGroup, 'O+');
  assert.equal(options.bloodBank, true);
  assert.equal(options.icu, true);
});

test('O positive and O+ve are deterministic blood inventory queries', async () => {
  for (const [message, group] of [
    ['i need o+ve blood', 'O+'],
    ['i urgently need o+ve blood near me', 'O+'],
    ['I need AB negative', 'AB-'],
    ['How many O+ units are available?', 'O+'],
  ]) {
    const routing = await analyzeUserIntent({ message, context: {} });
    assert.equal(routing.intent, 'BLOOD_QUERY');
    assert.equal(routing.needsHospital, true);
    assert.equal(routing.needsRag, false);
    assert.equal(extractBloodGroup(message), group);
  }
});

test('blood requests without a stated group remain blood queries', async () => {
  for (const message of ['need blood near me', 'blood bank near me']) {
    const routing = await analyzeUserIntent({ message, context: {} });
    assert.equal(routing.intent, 'BLOOD_QUERY');
    assert.equal(routing.needsBlood, true);
    assert.equal(routing.needsRag, false);
  }
});

test('symptom and medication wording always uses the medical RAG path', async () => {
  for (const message of [
    'I have pain in joints', 'I need medicine for fever',
    'What medicine can I take for headache?', 'I have cough',
    'my stomach hurts', 'what should I take for my symptoms?',
  ]) {
    const routing = await analyzeUserIntent({ message, context: {} });
    assert.equal(routing.intent, 'MEDICAL_QUERY', message);
    assert.equal(routing.needsRag, true, message);
  }
});

test('only conversational messages are general queries', async () => {
  const routing = await analyzeUserIntent({ message: 'hello', context: {} });
  assert.equal(routing.intent, 'GENERAL_QUERY');
  assert.equal(routing.needsRag, false);
});

test('medical follow-ups retain the RAG route until the user changes topic', async () => {
  const context = { lastIntent: 'MEDICAL_QUERY', medicalConversation: { originalQuestion: 'I have fever' } };
  const followUp = await analyzeUserIntent({ message: "it is nothing serious and i don't know temperature can you give me some medications", context });
  assert.equal(followUp.intent, 'MEDICAL_QUERY');
  assert.equal(followUp.needsRag, true);
  const switchedTopic = await analyzeUserIntent({ message: 'find a hospital near me', context });
  assert.equal(switchedTopic.intent, 'HOSPITAL_QUERY');
});
