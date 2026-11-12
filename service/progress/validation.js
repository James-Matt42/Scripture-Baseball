export class ProgressError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ProgressError';
    this.status = status;
  }
}

export const DEFAULT_PREFERENCES = Object.freeze({
  answerDifficulty: 'book-chapter',
  preferredVolume: '',
  practiceReminders: false,
  gameNotifications: true,
});
export const MAX_FAVORITES = 100;
const VOLUMES = new Set(['', 'ot', 'nt', 'bom', 'dc', 'pgp']);

export function validatePreferencesPatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ProgressError('preferences must be a JSON object');
  }
  const allowed = Object.keys(DEFAULT_PREFERENCES);
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.includes(key)) throw new ProgressError(`Unknown preference: ${key}`);
    if (key === 'answerDifficulty' && !['book-chapter', 'exact-verse'].includes(value)) {
      throw new ProgressError('Invalid answerDifficulty');
    }
    if (key === 'preferredVolume' && !VOLUMES.has(value)) {
      throw new ProgressError('Invalid preferredVolume');
    }
    if (['practiceReminders', 'gameNotifications'].includes(key) && typeof value !== 'boolean') {
      throw new ProgressError(`Invalid ${key}`);
    }
  }
  return { ...input };
}
