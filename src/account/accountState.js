/** Only preferences live locally; the account identity is always server verified. */
export const VOLUME_OPTIONS = [
  { value: '', label: 'No preference' },
  { value: 'ot', label: 'Old Testament' },
  { value: 'nt', label: 'New Testament' },
  { value: 'bom', label: 'Book of Mormon' },
  { value: 'dc', label: 'Doctrine and Covenants' },
  { value: 'pgp', label: 'Pearl of Great Price' },
];
const allowedVolumes = new Set(VOLUME_OPTIONS.map(({ value }) => value));
export const DEFAULT_PREFERENCES = Object.freeze({
  answerDifficulty: 'book-chapter', preferredVolume: '',
  practiceReminders: false, gameNotifications: true,
});
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export function normalizePreferences(value, fallback = DEFAULT_PREFERENCES) {
  const input = isObject(value) ? value : {};
  return {
    answerDifficulty: ['book-chapter', 'exact-verse'].includes(input.answerDifficulty)
      ? input.answerDifficulty : fallback.answerDifficulty,
    preferredVolume: allowedVolumes.has(input.preferredVolume) ? input.preferredVolume : fallback.preferredVolume,
    practiceReminders: typeof input.practiceReminders === 'boolean'
      ? input.practiceReminders : fallback.practiceReminders,
    gameNotifications: typeof input.gameNotifications === 'boolean'
      ? input.gameNotifications : fallback.gameNotifications,
  };
}
