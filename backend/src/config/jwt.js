const DEVELOPMENT_SECRET = 'smart-hospital-development-secret-change-me';
const MIN_PRODUCTION_SECRET_LENGTH = 32;

function getJwtSecret(env = process.env) {
  const secret = String(env.JWT_SECRET || '').trim();
  if (secret) {
    if (env.NODE_ENV === 'production' && (secret.length < MIN_PRODUCTION_SECRET_LENGTH || secret === DEVELOPMENT_SECRET)) {
      throw new Error(`JWT_SECRET must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production`);
    }
    return secret;
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production');
  }
  return DEVELOPMENT_SECRET;
}

function assertJwtSecretConfigured(env = process.env) {
  getJwtSecret(env);
}

module.exports = { getJwtSecret, assertJwtSecretConfigured, MIN_PRODUCTION_SECRET_LENGTH };
