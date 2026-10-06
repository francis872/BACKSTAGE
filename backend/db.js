const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

// In-memory fallback store for when database is unavailable
const MEMORY_DB = {
  users: [
    {
      user_id: 1,
      email: 'admin@backstage.local',
      name: 'Administrador Backstage',
      password_hash: 'pbkdf2_sha512$100000$f4996c9e04e39623c291e6041f6bdca9$2d5be71704f84be96fba53d6af456b340ed75f44b96edd780b71a424fa5b3b7119ef95c0c10d30da95e69aa35332fd9087be7a156b140e846b2ad81360257d03',
      role: 'admin',
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    },
    {
      user_id: 2,
      email: 'analyst@backstage.local',
      name: 'Analista Backstage',
      password_hash: 'pbkdf2_sha512$100000$e1a026181cfbade7a52c3e4fe0a08348$60c2f72eb38fdd32f101cc8c7a0b9ae3a75621eb66162c86a1a8e25816c610c4c4cb43674356027728a08fa1d68584fbe689263daa124470ea993bffc8fbd81b',
      role: 'analyst',
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    },
    {
      user_id: 3,
      email: 'viewer@backstage.local',
      name: 'Viewer Backstage',
      password_hash: 'pbkdf2_sha512$100000$daaedb8037943d341002fb4f03975b17$9a410725e17e31667a29f2f42a2c1c70df331a6bea04ae0e48b399715418d591fb9def5430a81ed802ca0e1d31375214147f42daaf3644d835b03ad30100c2f1',
      role: 'viewer',
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    },
  ],
  organizations: [
    { organization_id: 1, slug: 'default', name: 'Default Organization', status: 'active', created_at: new Date('2024-01-01'), updated_at: new Date('2024-01-01') },
    { organization_id: 2, slug: 'demo', name: 'Demo Organization', status: 'active', created_at: new Date('2024-01-01'), updated_at: new Date('2024-01-01') },
  ],
  user_roles: [
    { user_id: 1, organization_id: 1, role_id: 1 }, // admin in default
    { user_id: 1, organization_id: 2, role_id: 1 }, // admin in demo
    { user_id: 2, organization_id: 1, role_id: 2 }, // analyst in default
    { user_id: 3, organization_id: 1, role_id: 3 }, // viewer in default
  ],
};

let pool = null;
let usingMemory = false;

// Try to connect to real database, fall back to in-memory if not available
try {
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    console.log('[DB] Using PostgreSQL database');
  } else {
    console.log('[DB] DATABASE_URL not set, using in-memory fallback');
    usingMemory = true;
  }
} catch (error) {
  console.warn('[DB] Failed to initialize PostgreSQL, falling back to in-memory:', error.message);
  usingMemory = true;
}

// In-memory query function
async function queryMemory(text, params) {
  console.log(`[MEMORY-DB] Query: ${text}`);
  
  // Simple query parser for common auth queries
  if (text.includes('SELECT * FROM users WHERE email')) {
    const email = params[0];
    const user = MEMORY_DB.users.find(u => u.email === email);
    return {
      rows: user ? [user] : [],
      rowCount: user ? 1 : 0,
    };
  }
  
  if (text.includes('SELECT * FROM users WHERE user_id')) {
    const userId = params[0];
    const user = MEMORY_DB.users.find(u => u.user_id === userId);
    return {
      rows: user ? [user] : [],
      rowCount: user ? 1 : 0,
    };
  }
  
  if (text.includes('INSERT INTO users')) {
    // Mock insert - just return success
    return { rows: [], rowCount: 1 };
  }
  
  if (text.includes('SELECT organization_id, slug AS organization_slug, name AS organization_name')) {
    // listActiveOrganizations query
    return {
      rows: MEMORY_DB.organizations.filter(o => o.status === 'active').map(o => ({
        organization_id: o.organization_id,
        organization_slug: o.slug,
        organization_name: o.name,
      })),
      rowCount: MEMORY_DB.organizations.filter(o => o.status === 'active').length,
    };
  }
  
  if (text.includes('SELECT') && text.includes('FROM user_roles ur')) {
    // getUserMemberships query - complex join
    // For testing, return admin has all organizations with admin role
    const userId = params[0];
    const rows = MEMORY_DB.user_roles
      .filter(ur => ur.user_id === userId)
      .map(ur => {
        const org = MEMORY_DB.organizations.find(o => o.organization_id === ur.organization_id);
        return {
          organization_id: ur.organization_id,
          organization_slug: org.slug,
          organization_name: org.name,
          role: userId === 1 ? 'admin' : userId === 2 ? 'analyst' : 'viewer', // Mock role
        };
      });
    return { rows, rowCount: rows.length };
  }
  
  // Default: return empty
  return { rows: [], rowCount: 0 };
}

// Query function wrapper
const query = async (text, params) => {
  if (usingMemory) {
    return queryMemory(text, params);
  }
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool.query(text, params);
};

async function withTransaction(operation) {
  if (usingMemory) {
    // In-memory mode: just run the operation directly
    return operation({
      query: queryMemory,
      release: () => {},
    });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original operation error.
    }
    throw error;
  } finally {
    client.release();
  }
}


module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  withTransaction,
};
