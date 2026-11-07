import assert from 'node:assert/strict';

// In-memory Mongo collection stand-in with unique per-user document keys and
// snapshot rollback. Only for the course test suite: production uses Atlas.
export function fakeMongoProgressDatabase() {
  const rows = {
    attempts: new Map(),
    favorites: new Map(),
    preferences: new Map(),
    guestImports: new Map(),
  };
  const calls = [];
  const collectionCache = new Map();
  const failure = { read: null, nextInsert: null };
  let nextId = 1;
  let transactionQueue = Promise.resolve();

  const copy = (value) => value === undefined ? undefined : structuredClone(value);
  const matches = (document, query) => Object.entries(query)
    .every(([key, value]) => document[key] === value);
  const rowKey = (name, record) => name === 'attempts'
    ? JSON.stringify([record.userId, record.id])
    : name === 'guestImports' ? JSON.stringify([record.userId, record.importId])
      : record.userId;

  function project(document, options) {
    if (!document) return null;
    const result = copy(document);
    const projection = options?.projection;
    if (!projection) return result;
    const allowed = Object.entries(projection).filter(([k, v]) => k !== '_id' && v === 1)
      .map(([key]) => key);
    if (allowed.length) {
      const selected = Object.fromEntries(allowed.filter((key) => key in result)
        .map((key) => [key, result[key]]));
      if (projection._id !== 0 && '_id' in result) selected._id = result._id;
      return selected;
    }
    for (const [key, enabled] of Object.entries(projection)) {
      if (enabled === 0) delete result[key];
    }
    return result;
  }

  function ensureReadable() {
    if (failure.read) throw failure.read;
  }
  function ensureWritable(name, method) {
    if (failure.nextInsert && (failure.nextInsert.name === name || failure.nextInsert.name === '*') &&
        (failure.nextInsert.method === method || failure.nextInsert.method === '*')) {
      const error = failure.nextInsert.error;
      failure.nextInsert = null;
      throw error;
    }
  }
  function duplicate() {
    const error = new Error('E11000 duplicate key');
    error.code = 11000;
    return error;
  }
  function collection(name) {
    assert.ok(rows[name], `Unknown test collection: ${name}`);
    if (collectionCache.has(name)) return collectionCache.get(name);
    const map = rows[name];
    const handle = {
      async findOne(query, options) {
        calls.push(['findOne', name, copy(query)]);
        ensureReadable();
        return project([...map.values()].find((doc) => matches(doc, query)), options);
      },
      find(query, options) {
        calls.push(['find', name, copy(query)]);
        return {
          sort(sortBy) {
            assert.deepEqual(sortBy, { recordedAt: 1, _id: 1 });
            return {
              async toArray() {
                ensureReadable();
                return [...map.values()].filter((doc) => matches(doc, query))
                  .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a._id - b._id)
                  .map((doc) => project(doc, options));
              },
            };
          },
        };
      },
      async countDocuments(query) {
        calls.push(['countDocuments', name, copy(query)]);
        ensureReadable();
        return [...map.values()].filter((doc) => matches(doc, query)).length;
      },
      async insertOne(document) {
        calls.push(['insertOne', name, copy(document)]);
        ensureWritable(name, 'insertOne');
        const key = rowKey(name, document);
        if (map.has(key)) throw duplicate();
        const id = nextId++;
        map.set(key, { ...copy(document), _id: id });
        return { insertedId: id };
      },
      async insertMany(documents) {
        calls.push(['insertMany', name, copy(documents)]);
        const ids = [];
        for (const document of documents) {
          // The transaction wrapper restores all rows if any insert fails.
          const result = await this.insertOne(document);
          ids.push(result.insertedId);
        }
        return { insertedCount: ids.length };
      },
      async replaceOne(filter, document, options = {}) {
        calls.push(['replaceOne', name, copy(document)]);
        ensureWritable(name, 'replaceOne');
        const key = rowKey(name, filter);
        if (!map.has(key) && !options.upsert) return { matchedCount: 0 };
        const original = map.get(key);
        map.set(key, { ...copy(document), _id: original?._id ?? nextId++ });
        return { matchedCount: original ? 1 : 0 };
      },
      async updateOne(filter, update, options = {}) {
        calls.push(['updateOne', name, copy(update)]);
        ensureWritable(name, 'updateOne');
        const key = rowKey(name, filter);
        if (!map.has(key) && !options.upsert) return { matchedCount: 0 };
        const document = copy(map.get(key) ?? { ...filter, _id: nextId++ });
        for (const [path, value] of Object.entries(update.$set ?? {})) {
          const segments = path.split('.');
          let current = document;
          for (const segment of segments.slice(0, -1)) current = current[segment] ??= {};
          current[segments.at(-1)] = value;
        }
        map.set(key, document);
        return { matchedCount: 1 };
      },
    };
    collectionCache.set(name, handle);
    return handle;
  }

  const client = {
    startSession() {
      return {
        async withTransaction(action, options) {
          assert.equal(options.readConcern.level, 'snapshot');
          assert.equal(options.writeConcern.w, 'majority');
          // Serialize test transactions and roll back writes if any operation
          // fails. This models the relevant guarantees, not Mongo's internals.
          let unlock;
          const previous = transactionQueue;
          transactionQueue = new Promise((resolve) => { unlock = resolve; });
          await previous;
          const snapshot = Object.fromEntries(Object.entries(rows).map(([key, map]) =>
            [key, new Map([...map].map(([id, item]) => [id, copy(item)]))]));
          try {
            return await action();
          } catch (error) {
            for (const [name, map] of Object.entries(rows)) {
              map.clear();
              for (const [key, value] of snapshot[name]) map.set(key, value);
            }
            throw error;
          } finally {
            unlock();
          }
        },
        async endSession() {},
      };
    },
  };
  return {
    collection, client, rows, calls,
    // Compatibility with the DB-04 attempt tests.
    get attemptRows() { return rows.attempts; },
    failInsertOnce(error, name = 'attempts', method = 'insertOne') {
      failure.nextInsert = { error, name, method };
    },
    failReads(error) { failure.read = error; },
  };
}
