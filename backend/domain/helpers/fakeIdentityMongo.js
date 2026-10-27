// Mongo adapter for identity tests only. Never connects to a server or seeds users.
function fakeIdentityMongo() {
  let documents = {}, counters = {}; let failCollection;
  const writes = [], indexes = [];
  const matches = (document, filter) => Object.entries(filter).every(([key,value]) => value && typeof value === 'object' && '$in' in value ? value.$in.includes(document[key]) : document[key] === value);
  const rows = (name) => documents[name] ||= [];
  const db = { collection(name) {
    return {
      async createIndex(fields, options) { indexes.push({ name, fields, options }); },
      async findOne(filter) { return structuredClone(rows(name).find((item) => matches(item,filter)) || null); },
      find(filter) {
        let values = rows(name).filter((item) => matches(item,filter));
        const cursor = { sort(order) { const [key,direction] = Object.entries(order)[0]; values.sort((a,b) => (a[key] - b[key]) * direction); return cursor; }, limit(limit) { values = values.slice(0,limit); return cursor; }, async toArray() { return structuredClone(values); } };
        return cursor;
      },
      async countDocuments(filter) { return rows(name).filter((item) => matches(item,filter)).length; },
      async insertOne(document,options) {
        writes.push({ name, operation: 'insert', options });
        if (failCollection === name) { failCollection = null; throw new Error('fixture storage failure'); }
        if (name === 'identity_users' && rows(name).some((item) => item.email === document.email)) { const error = new Error('duplicate'); error.code = 11000; throw error; }
        rows(name).push(structuredClone(document)); return { insertedId: rows(name).length };
      },
      async updateOne(filter, update, options) {
        writes.push({ name, operation: 'update', options });
        let target = rows(name).find((item) => matches(item,filter));
        if (!target && options?.upsert) { target = { ...filter, ...structuredClone(update.$setOnInsert || {}) }; rows(name).push(target); }
        if (!target) return { matchedCount: 0 };
        Object.assign(target, structuredClone(update.$set || {}));
        for (const [key,value] of Object.entries(update.$inc || {})) target[key] = (target[key] || 0) + value;
        return { matchedCount: 1, modifiedCount: 1 };
      },
      async updateMany(filter,update,options){writes.push({name,operation:'updateMany',options});let count=0;for(const row of rows(name))if(matches(row,filter)){Object.assign(row,structuredClone(update.$set||{}));count++;}return {modifiedCount:count};},
      async deleteOne(filter,options) { writes.push({ name, operation: 'delete', options }); const index = rows(name).findIndex((item) => matches(item,filter)); if (index >= 0) rows(name).splice(index,1); return { deletedCount: index >= 0 ? 1 : 0 }; },
    };
  } };
  return { getMongoDatabase: async () => db, nextId: async (name) => counters[name] = (counters[name] || 0) + 1,
    withMongoTransaction: async (operation) => { const before = structuredClone({ documents,counters }); try { return await operation(db,{ fixture: true }); } catch (error) { documents = before.documents; counters = before.counters; throw error; } },
    cleanDocument: (document) => { const { _id,...value } = document; return value; },
    failNextInsert: (name) => { failCollection = name; }, documents: (name) => structuredClone(rows(name)), writes, indexes,
  };
}
module.exports = { fakeIdentityMongo };
