import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Parse DATABASE_URL manually to handle special characters in password
function parseConnectionString(url) {
  if (!url) return {};
  
  // Format: postgres://user:password@host:port/database?options
  const regex = /^postgres(?:ql)?:\/\/([^:]+):(.+)@([^:]+):(\d+)\/([^?]+)(?:\?(.*))?$/;
  const match = url.match(regex);
  
  if (match) {
    const config = {
      user: match[1],
      password: match[2],
      host: match[3],
      port: parseInt(match[4], 10),
      database: match[5],
    };
    
    // Parse query options like sslmode
    if (match[6]) {
      const params = new URLSearchParams(match[6]);
      if (params.get('sslmode') === 'disable') {
        config.ssl = false;
      } else if (params.get('sslmode')) {
        config.ssl = { rejectUnauthorized: false };
      }
    }
    
    return config;
  }
  
  // Fallback to connectionString if parsing fails
  return { connectionString: url };
}

const dbConfig = parseConnectionString(process.env.DATABASE_URL);

export const pool = new Pool(dbConfig);

export const query = (text, params) => pool.query(text, params);
