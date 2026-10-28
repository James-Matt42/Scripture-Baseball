import { randomUUID } from 'node:crypto';
import { DuplicateEmailError } from './validation.js';

/**
 * Temporary per-process account store for the Service course phase.
 * The methods form a small persistence boundary to replace with MongoDB later.
 * All reads return copies; passwords are never stored, only BCrypt hashes.
 */
export function createInMemoryUserStore() {
  const byEmail = new Map();
  const byId = new Map();

  return {
    findByEmail(email) {
      const record = byEmail.get(email);
      return record ? { ...record } : null;
    },
    findById(id) {
      const record = byId.get(id);
      return record ? { ...record } : null;
    },
    create({ displayName, email, passwordHash }) {
      // The final uniqueness check happens synchronously at insertion time,
      // so concurrent registrations cannot overwrite the same email.
      if (byEmail.has(email)) throw new DuplicateEmailError();
      const record = {
        id: randomUUID(),
        displayName,
        email,
        passwordHash,
        createdAt: new Date().toISOString(),
      };
      byEmail.set(email, record);
      byId.set(record.id, record);
      return { ...record };
    },
  };
}
