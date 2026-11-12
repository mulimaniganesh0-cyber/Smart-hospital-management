const RESOURCE_FIELDS = Object.freeze({
  generalBeds_total: 'general_beds_total',
  generalBeds_available: 'general_beds_available',
  icuBeds_total: 'icu_beds_total',
  icuBeds_available: 'icu_beds_available',
  ventilators_total: 'ventilators_total',
  ventilators_available: 'ventilators_available',
  oxygenBeds_total: 'oxygen_supported_beds_total',
  oxygenBeds_available: 'oxygen_supported_beds_available',
});

const RESOURCE_PAIRS = Object.freeze([
  ['generalBeds_total', 'generalBeds_available', 'general_beds_total', 'general_beds_available'],
  ['icuBeds_total', 'icuBeds_available', 'icu_beds_total', 'icu_beds_available'],
  ['ventilators_total', 'ventilators_available', 'ventilators_total', 'ventilators_available'],
  ['oxygenBeds_total', 'oxygenBeds_available', 'oxygen_supported_beds_total', 'oxygen_supported_beds_available'],
]);

function validateResourceUpdate(resources, current = {}) {
  if (!resources || typeof resources !== 'object' || Array.isArray(resources)) {
    return { error: 'Provide resource counts as an object.' };
  }
  const entries = Object.entries(resources).filter(([key]) => RESOURCE_FIELDS[key]);
  if (!entries.length) return { error: 'No valid fields to update.' };

  for (const [key, value] of entries) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) {
      return { error: `${key} must be a non-negative whole number.` };
    }
  }

  for (const [totalKey, availableKey, totalColumn, availableColumn] of RESOURCE_PAIRS) {
    if (!(totalKey in resources) && !(availableKey in resources)) continue;
    const total = totalKey in resources ? resources[totalKey] : Number(current[totalColumn] || 0);
    const available = availableKey in resources ? resources[availableKey] : Number(current[availableColumn] || 0);
    if (available > total) {
      return { error: `${availableKey} cannot exceed ${totalKey}.` };
    }
  }

  return { entries };
}

module.exports = { RESOURCE_FIELDS, validateResourceUpdate };
