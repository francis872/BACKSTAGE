'use strict';

function postgresMajor(version) {
  const value = String(version ?? '').trim();
  if (/^\d{5,}$/.test(value)) return Math.floor(Number(value) / 10000);
  const match = value.match(/^(\d+)(?:\.|$)/);
  return match ? Number(match[1]) : null;
}

function assertPostgres17(version) {
  const major = postgresMajor(version);
  if (major !== 17) {
    throw new Error(`PostgreSQL 17 is required; connected server major is ${major ?? 'unknown'}.`);
  }
  return major;
}

module.exports = { postgresMajor, assertPostgres17 };