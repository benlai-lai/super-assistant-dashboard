import { scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { createHttpServer } from './http-server.mjs';

const scryptAsync = promisify(scrypt);

/**
 * Helper to hash a password with a random salt
 */
async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return {
    salt: salt.toString('hex'),
    hash: hash.toString('hex'),
  };
}

/**
 * Set up credentials from environment or provided config
 * Credentials format: { [actorId]: { username, passwordHash, salt, role } }
 */
export async function setupCredentials(credentialConfig = null) {
  const credentials = {};

  if (credentialConfig) {
    // Use provided config (for testing)
    return credentialConfig;
  }

  // Get credentials from environment
  // Expected format: DASHBOARD_CREDENTIALS_JSON='[{"actorId":"...", "username":"...", "password":"...", "role":"..."}]'
  const envCredentials = process.env.DASHBOARD_CREDENTIALS_JSON;
  if (envCredentials) {
    try {
      const parsed = JSON.parse(envCredentials);
      for (const cred of parsed) {
        const { salt, hash } = await hashPassword(cred.password);
        credentials[cred.actorId] = {
          username: cred.username,
          passwordHash: hash,
          salt,
          role: cred.role,
        };
      }
    } catch (err) {
      throw new Error(`Failed to parse DASHBOARD_CREDENTIALS_JSON: ${err.message}`);
    }
  }

  return credentials;
}

/**
 * Start the HTTP server with given configuration
 */
export async function startServer(options = {}) {
  const {
    port = parseInt(process.env.DASHBOARD_PORT || '8080', 10),
    host = process.env.DASHBOARD_HOST || '127.0.0.1',
    credentials = null,
    maxBodySize = 16 * 1024,
    sessionExpiry = 24 * 60 * 60 * 1000,
    maxLoginAttempts = 5,
  } = options;

  const creds = await setupCredentials(credentials);

  const server = createHttpServer({
    port,
    host,
    credentials: creds,
    maxBodySize,
    sessionExpiry,
    maxLoginAttempts,
  });

  await server.listen();

  const info = server.getInfo();
  console.log(`Dashboard server listening at ${info.url}`);

  return server;
}

/**
 * CLI entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await startServer();
  
  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await server.close();
    process.exit(0);
  });
}
