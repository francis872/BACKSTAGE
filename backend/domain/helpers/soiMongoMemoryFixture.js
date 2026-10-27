// TEST DOUBLE ONLY. This fixture never backs production services.
const { isDeepStrictEqual } = require('node:util');
function fixture(seed = {}) {
  let data = structuredClone(seed), sequence = 100, rolledBack = 0;
  const match = (row, filter) => Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some((condition) => match(row,condition));
    const actual = key.split('.').reduce((value, field) => value?.[field], row);
    if (expected && typeof expected === 'object' && !(expected instanceof Date) && !Array.isArray(expected)) return Object.entries(expected).every(([operator, value]) => {
      if (operator === '$gt') return actual > value;
      if (operator === '$gte') return actual >= value;
      if (operator === '$lt') return actual < value;
      if (operator === '$lte') return actual <= value;
      if (operator === '$in') return value.includes(actual);
      if (operator === '$nin') return !value.includes(actual);
      if (operator === '$ne') return !isDeepStrictEqual(actual,value);
      if (operator === '$exists') return (actual!==undefined)===value;
      throw new Error(`Unsupported test operator ${operator}`);
    });
    return expected===null ? actual==null : isDeepStrictEqual(actual, expected);
  });
  const set=(row,key,value)=>{const keys=key.split('.');const last=keys.pop();for(const k of keys)row=row[k] ||= {};row[last]=value;};
  const unset=(row,key)=>{const keys=key.split('.');const last=keys.pop();for(const k of keys){row=row[k];if(!row)return;}delete row[last];};
  const get=(row,key)=>key.split('.').reduce((v,k)=>v?.[k],row);
  const apply=(row,update)=>{for(const [key,value] of Object.entries(update.$set||{}))set(row,key,value);for(const key of Object.keys(update.$unset||{}))unset(row,key);for(const [key,value] of Object.entries(update.$inc||{}))set(row,key,(get(row,key)||0)+value);for(const [key,value] of Object.entries(update.$addToSet||{})){const values=get(row,key)||[];if(!values.some(v=>isDeepStrictEqual(v,value)))values.push(structuredClone(value));set(row,key,values);}};
  const sort = (rows, order) => rows.sort((a, b) => { for (const [key, direction] of Object.entries(order || {})) { if (a[key] > b[key]) return direction; if (a[key] < b[key]) return -direction; } return 0; });
  const database = { collection(name) {
    if (!data[name]) data[name] = [];
    const rows = () => data[name];
    return {
      async findOne(filter, options = {}) { return structuredClone(sort(rows().filter((row) => match(row, filter)), options.sort)[0] || null); },
      find(filter) { let result = rows().filter((row) => match(row, filter)); const cursor = { sort(order) { result = sort(result, order); return cursor; }, skip(count) { result=result.slice(count); return cursor; }, limit(count) { result = result.slice(0, count); return cursor; }, async toArray() { return structuredClone(result); } }; return cursor; },
      async countDocuments(filter) { return rows().filter(row=>match(row,filter)).length; },
      async insertOne(row) { const duplicate=name==='soi_assets'&&typeof row.external_id==='string'?rows().some(r=>r.organization_id===row.organization_id&&r.external_id===row.external_id):name==='soi_imports'?rows().some(r=>r.organization_id===row.organization_id&&r.preview_hash===row.preview_hash):false; if(duplicate){const error=new Error('isolated unique fixture');error.code=11000;throw error;} rows().push(structuredClone(row)); return { insertedId: sequence }; },
      async insertMany(batch) { rows().push(...structuredClone(batch)); return { insertedCount: batch.length }; },
      async updateOne(filter, update, options={}) { let row = rows().find((r) => match(r, filter)); if(!row&&options.upsert){row={...filter,...update.$setOnInsert};rows().push(row);} if (row) apply(row, update); return { matchedCount: row ? 1 : 0, modifiedCount: row ? 1 : 0 }; },
      async updateMany(filter, update) { let count = 0; for (const row of rows()) if (match(row, filter)) { apply(row, update); count++; } return { matchedCount: count }; },
      async findOneAndUpdate(filter, update,options={}) { let row = rows().find((r) => match(r, filter)); if(!row&&options.upsert){row={...filter,...update.$setOnInsert};rows().push(row);} if (!row) return null; apply(row, update); return structuredClone(row); },
      async findOneAndDelete(filter) { const row=rows().find(r=>match(r,filter));if(!row)return null;data[name]=rows().filter(r=>r!==row);return structuredClone(row); },
      async deleteMany(filter) { const before = rows().length; data[name] = rows().filter((row) => !match(row, filter)); return { deletedCount: before - data[name].length }; },
    };
  } };
  const options = { database, nextId: async () => ++sequence, transaction: async (work) => { const before = structuredClone(data); try { return await work(database, { testSession: true }); } catch (error) { data = before; rolledBack++; throw error; } } };
  return { options, data: () => data, rolledBack: () => rolledBack };
}
module.exports = { fixture };
