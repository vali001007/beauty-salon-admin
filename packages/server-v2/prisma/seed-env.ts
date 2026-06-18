export function isProductionEnv() {
  return process.env.NODE_ENV === 'production';
}

export function readSeedPassword(envName: string, localFallback = '11111111') {
  const value = process.env[envName]?.trim();
  if (value) return value;
  if (isProductionEnv()) {
    throw new Error(`${envName} must be configured before running seed scripts in production.`);
  }
  return localFallback;
}
