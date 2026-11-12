/**
 * MongoDB bootstrap for the Database course phase.
 *
 * Connection settings come exclusively from the process environment; do not
 * read a credentials file from the repository or expose a MongoDB URI in logs.
 * The existing Service-phase stores remain in use until DB-02 through DB-05.
 */
export const DEFAULT_MONGO_DATABASE = 'scripture_baseball';
export const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = 5000;

export function mongoConfigFromEnv(env = process.env) {
  const requiredValue = env.MONGODB_REQUIRED ?? '';
  if (!['', '0', '1', 'false', 'true'].includes(requiredValue)) {
    throw new Error('MONGODB_REQUIRED must be true, false, 1, or 0');
  }

  return {
    uri: env.MONGODB_URI ?? '',
    databaseName: env.MONGODB_DB_NAME || DEFAULT_MONGO_DATABASE,
    required: requiredValue === '1' || requiredValue === 'true',
  };
}

// These indexes declare the storage contracts for subsequent DB commits.
// User emails are already normalized in the current authentication API.
// Session expiry will be written as a BSON Date for MongoDB's TTL monitor.
export const MONGO_INDEXES = Object.freeze([
  { collection: 'users', keys: { email: 1 }, options: { name: 'users_email_unique', unique: true } },
  { collection: 'sessions', keys: { tokenDigest: 1 }, options: { name: 'sessions_token_unique', unique: true } },
  { collection: 'sessions', keys: { expiresAt: 1 }, options: { name: 'sessions_expiry_ttl', expireAfterSeconds: 0 } },
  { collection: 'attempts', keys: { userId: 1, id: 1 }, options: { name: 'attempts_user_id_unique', unique: true } },
  { collection: 'attempts', keys: { userId: 1, recordedAt: -1 }, options: { name: 'attempts_user_recent' } },
  { collection: 'favorites', keys: { userId: 1 }, options: { name: 'favorites_user_unique', unique: true } },
  { collection: 'preferences', keys: { userId: 1 }, options: { name: 'preferences_user_unique', unique: true } },
  { collection: 'guestPitches', keys: { pitchId: 1 }, options: { name: 'guest_pitches_token_unique', unique: true } },
  { collection: 'guestPitches', keys: { expiresAt: 1 }, options: { name: 'guest_pitches_expiry_ttl', expireAfterSeconds: 0 } },
]);

export async function ensureMongoIndexes(database) {
  for (const { collection, keys, options } of MONGO_INDEXES) {
    await database.collection(collection).createIndex(keys, options);
  }
}

async function defaultClientFactory(uri, options) {
  // Keep test imports and unconfigured Service-phase deployments independent
  // of a live database. Once configured, the official MongoDB driver is used.
  const { MongoClient } = await import('mongodb');
  return new MongoClient(uri, options);
}

export function createMongoConnection({
  uri = '',
  databaseName = DEFAULT_MONGO_DATABASE,
  required = false,
  serverSelectionTimeoutMS = DEFAULT_SERVER_SELECTION_TIMEOUT_MS,
  clientFactory = defaultClientFactory,
} = {}) {
  // Never include the URI (which may contain a username/password) in errors.
  if (typeof uri !== 'string') throw new TypeError('MONGODB_URI must be a string');
  if (!/^[a-zA-Z0-9_-]+$/u.test(databaseName)) {
    throw new Error('MONGODB_DB_NAME must contain only letters, numbers, underscores, or hyphens');
  }
  if (!Number.isInteger(serverSelectionTimeoutMS) || serverSelectionTimeoutMS < 1) {
    throw new RangeError('MongoDB server selection timeout must be a positive integer');
  }

  let active = null;
  let connecting = null;

  async function connect() {
    if (active) return active.database;
    if (connecting) return connecting;
    if (!uri) {
      if (required) throw new Error('MongoDB is required; configure MONGODB_URI');
      return null;
    }
    if (!/^mongodb(?:\+srv)?:\/\//u.test(uri)) {
      throw new Error('MONGODB_URI must use mongodb:// or mongodb+srv://');
    }

    connecting = (async () => {
      let client;
      try {
        client = await clientFactory(uri, { serverSelectionTimeoutMS });
        await client.connect();
        const database = client.db(databaseName);
        await database.command({ ping: 1 });
        await ensureMongoIndexes(database);
        active = { client, database };
        return database;
      } catch {
        if (client) await client.close().catch(() => {});
        // The underlying driver error can contain connection details.
        throw new Error('MongoDB connection or index initialization failed');
      } finally {
        connecting = null;
      }
    })();
    return connecting;
  }

  async function close() {
    // A shutdown during startup must also close a just-connected client.
    if (connecting) await connecting.catch(() => {});
    if (active) {
      const { client } = active;
      active = null;
      await client.close();
    }
  }

  return {
    connect,
    close,
    getDb() {
      if (!active) throw new Error('MongoDB connection is not ready');
      return active.database;
    },
  };
}
