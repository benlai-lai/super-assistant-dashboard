import assert from 'node:assert/strict';
import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import test from 'node:test';
import { createHttpServer } from '../server/http-server.mjs';
import { startServer } from '../server/start.mjs';

const scryptAsync = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return {
    salt: salt.toString('hex'),
    hash: hash.toString('hex'),
  };
}

async function setupTestServer(credentials, port = 0) {
  const server = createHttpServer({
    port: port || 0,
    host: '127.0.0.1',
    credentials,
  });

  await server.listen();
  return server;
}

async function getFailedLoginResponse(server, username, password, headers = {}) {
  const { port } = server.server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ username, password }),
  });
  return {
    status: response.status,
    body: await response.text(),
    headers: [...response.headers.entries()].sort(),
  };
}

async function makeRequest(url, method = 'GET', body = null, cookies = '') {
  const baseUrl = new URL(url);
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Host': `${baseUrl.hostname}:${baseUrl.port}`,
    },
  };

  if (cookies) {
    options.headers['Cookie'] = cookies;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const responseBody = await response.text();

  return {
    status: response.status,
    body: responseBody ? JSON.parse(responseBody) : null,
    headers: {
      setCookie: response.headers.get('set-cookie'),
      contentType: response.headers.get('content-type'),
      xContentTypeOptions: response.headers.get('x-content-type-options'),
      xFrameOptions: response.headers.get('x-frame-options'),
    },
  };
}

function extractSessionCookie(setCookieHeader) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/bk_dashboard_session=([^;]+)/);
  return match ? match[1] : null;
}

test('HTTP Server - GET /api/health returns 200', async () => {
  const editorSalt = randomBytes(16);
  const editorHash = (await scryptAsync('editor-password', editorSalt, 32)).toString('hex');
  
  const credentials = {
    'editor-1': {
      username: 'editor',
      passwordHash: editorHash,
      salt: editorSalt.toString('hex'),
      role: 'editor',
    },
  };

  const server = await setupTestServer(credentials, 8081);
  try {
    const response = await makeRequest(`http://127.0.0.1:8081/api/health`);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'ok');
    assert.equal(typeof response.body.timestamp, 'string');
  } finally {
    await server.close();
  }
});

test('HTTP Server - POST /api/session with valid editor credentials', async () => {
  const editorPassword = 'editor-secure-password-123';
  const editorSalt = randomBytes(16);
  const editorHash = (await scryptAsync(editorPassword, editorSalt, 32)).toString('hex');

  const credentials = {
    'editor-1': {
      username: 'editor@example.com',
      passwordHash: editorHash,
      salt: editorSalt.toString('hex'),
      role: 'editor',
    },
  };

  const server = await setupTestServer(credentials, 8082);
  try {
    const response = await makeRequest(
      `http://127.0.0.1:8082/api/session`,
      'POST',
      { username: 'editor@example.com', password: editorPassword }
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(typeof response.headers.setCookie, 'string');
    assert(response.headers.setCookie.includes('bk_dashboard_session='));
    assert(response.headers.setCookie.includes('HttpOnly'));
    assert(response.headers.setCookie.includes('SameSite=Strict'));
  } finally {
    await server.close();
  }
});

test('HTTP Server - POST /api/session with valid viewer credentials', async () => {
  const viewerPassword = 'viewer-secure-password-456';
  const viewerSalt = randomBytes(16);
  const viewerHash = (await scryptAsync(viewerPassword, viewerSalt, 32)).toString('hex');

  const credentials = {
    'viewer-1': {
      username: 'viewer@example.com',
      passwordHash: viewerHash,
      salt: viewerSalt.toString('hex'),
      role: 'viewer',
    },
  };

  const server = await setupTestServer(credentials, 8083);
  try {
    const response = await makeRequest(
      `http://127.0.0.1:8083/api/session`,
      'POST',
      { username: 'viewer@example.com', password: viewerPassword }
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
  } finally {
    await server.close();
  }
});

test('HTTP Server - POST /api/session with invalid password', async () => {
  const editorPassword = 'editor-secure-password-123';
  const editorSalt = randomBytes(16);
  const editorHash = (await scryptAsync(editorPassword, editorSalt, 32)).toString('hex');

  const credentials = {
    'editor-1': {
      username: 'editor@example.com',
      passwordHash: editorHash,
      salt: editorSalt.toString('hex'),
      role: 'editor',
    },
  };

  const server = await setupTestServer(credentials, 8084);
  try {
    const response = await makeRequest(
      `http://127.0.0.1:8084/api/session`,
      'POST',
      { username: 'editor@example.com', password: 'wrong-password' }
    );

    assert.equal(response.status, 401);
    assert.equal(response.body.error, 'Invalid credentials');
  } finally {
    await server.close();
  }
});

test('HTTP Server - POST /api/session with unknown username', async () => {

  test('HTTP Server - unknown username and wrong password have equivalent public responses', async () => {
    const salt = randomBytes(16);
    const hash = (await scryptAsync('correct-password', salt, 32)).toString('hex');
    const credentials = {
      'editor-1': {
        username: 'known@example.com',
        passwordHash: hash,
        salt: salt.toString('hex'),
        role: 'editor',
      },
    };
    const server = await setupTestServer(credentials, 8090);
    try {
      const unknown = await getFailedLoginResponse(server, 'unknown@example.com', 'wrong-password');
      const wrongPassword = await getFailedLoginResponse(server, 'known@example.com', 'wrong-password');
      assert.deepEqual(unknown, wrongPassword);
    } finally {
      await server.close();
    }
  });

  test('HTTP Server - forged X-Forwarded-For cannot bypass the same remote IP limit', async () => {
    const server = await setupTestServer({}, 8091);
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await getFailedLoginResponse(server, 'unknown@example.com', 'wrong-password', {
          'X-Forwarded-For': `203.0.113.${attempt + 1}`,
        });
        assert.equal(response.status, 401);
      }
      const limited = await getFailedLoginResponse(server, 'unknown@example.com', 'wrong-password', {
        'X-Forwarded-For': '203.0.113.99',
      });
      assert.equal(limited.status, 429);
    } finally {
      await server.close();
    }
  });

  test('HTTP Server - caller-controlled headers do not create unbounded rate-limit buckets', async () => {
    const server = createHttpServer({ maxRateLimitEntries: 32 });
    try {
      for (let index = 0; index < 10000; index++) {
        server.getClientIp({
          headers: { 'x-forwarded-for': `203.0.113.${index}` },
          socket: { remoteAddress: '127.0.0.1' },
        });
        server.rateLimiter.isLimited('127.0.0.1');
      }
      assert.equal(server.rateLimiter.attempts.size, 1);
      assert(server.rateLimiter.attempts.size <= server.rateLimiter.maxEntries);
    } finally {
      await server.close();
    }
  });

  test('HTTP Server - rate-limit entries expire and are cleaned during normal operations', async () => {
    const server = createHttpServer({ rateLimitWindowMs: 1, maxRateLimitEntries: 2 });
    try {
      server.rateLimiter.isLimited('expired-ip');
      await new Promise((resolve) => setTimeout(resolve, 5));
      server.rateLimiter.isLimited('new-ip');
      assert.equal(server.rateLimiter.attempts.has('expired-ip'), false);
    } finally {
      await server.close();
    }
  });

  test('HTTP Server - full rate-limit capacity fails closed without evicting valid entries', async () => {
    const server = createHttpServer({ maxRateLimitEntries: 1 });
    try {
      server.rateLimiter.isLimited('valid-ip');
      assert.equal(server.rateLimiter.isLimited('new-ip'), true);
      assert.equal(server.rateLimiter.attempts.has('valid-ip'), true);
      assert.equal(server.rateLimiter.attempts.has('new-ip'), false);
      assert.equal(server.rateLimiter.attempts.size, 1);
    } finally {
      await server.close();
    }
  });
  const editorPassword = 'editor-secure-password-123';
  const editorSalt = randomBytes(16);
  const editorHash = (await scryptAsync(editorPassword, editorSalt, 32)).toString('hex');

  const credentials = {
    'editor-1': {
      username: 'editor@example.com',
      passwordHash: editorHash,
      salt: editorSalt.toString('hex'),
      role: 'editor',
    },
  };

  const server = await setupTestServer(credentials, 8085);
  try {
    const response = await makeRequest(
      `http://127.0.0.1:8085/api/session`,
      'POST',
      { username: 'unknown@example.com', password: editorPassword }
    );

    assert.equal(response.status, 401);
    // Generic error message, same as wrong password
    assert.equal(response.body.error, 'Invalid credentials');
  } finally {
    await server.close();
  }
});

test('HTTP Server - known and unknown usernames each perform one equivalent password verification', async () => {
  const salt = randomBytes(16);
  const hash = (await scryptAsync('correct-password', salt, 32)).toString('hex');
  const credentials = {
    'editor-1': {
      username: 'known@example.com',
      passwordHash: hash,
      salt: salt.toString('hex'),
      role: 'editor',
    },
  };
  const server = createHttpServer({ credentials });
  const originalVerifyPassword = server.credentialManager.verifyPassword.bind(server.credentialManager);
  const verificationCalls = [];
  server.credentialManager.verifyPassword = async (...args) => {
    verificationCalls.push(args);
    return originalVerifyPassword(...args);
  };
  try {
    assert.equal(await server.credentialManager.authenticate('known@example.com', 'wrong-password'), null);
    assert.equal(await server.credentialManager.authenticate('unknown@example.com', 'wrong-password'), null);
    assert.equal(verificationCalls.length, 2);
    assert.equal(verificationCalls[0][1].length, hash.length);
    assert.equal(verificationCalls[1][1].length, hash.length);
    assert.equal(verificationCalls[0][2].length, salt.toString('hex').length);
    assert.equal(verificationCalls[1][2].length, salt.toString('hex').length);
  } finally {
    await server.close();
  }
});

test('HTTP Server - GET /api/session with valid session', async () => {
  const editorPassword = 'editor-secure-password-123';
  const editorSalt = randomBytes(16);
  const editorHash = (await scryptAsync(editorPassword, editorSalt, 32)).toString('hex');

  const credentials = {
    'editor-1': {
      username: 'editor@example.com',
      passwordHash: editorHash,
      salt: editorSalt.toString('hex'),
      role: 'editor',
    },
  };

  const server = await setupTestServer(credentials, 8086);
  try {
    // Login first
    const loginResponse = await makeRequest(
      `http://127.0.0.1:8086/api/session`,
      'POST',
      { username: 'editor@example.com', password: editorPassword }
    );

    const sessionCookie = extractSessionCookie(loginResponse.headers.setCookie);
    assert(sessionCookie, 'Session cookie should be set');

    // Get session
    const getResponse = await makeRequest(
      `http://127.0.0.1:8086/api/session`,
      'GET',
      null,
      `bk_dashboard_session=${sessionCookie}`
    );

    assert.equal(getResponse.status, 200);
    assert.equal(getResponse.body.actorId, 'editor-1');
    assert.equal(getResponse.body.role, 'editor');
    assert.equal(typeof getResponse.body.expiresAt, 'number');
  } finally {
    await server.close();
  }
});

test('HTTP Server - GET /api/session without session cookie returns 401', async () => {
  const editorPassword = 'editor-secure-password-123';
  const editorSalt = randomBytes(16);
  const editorHash = (await scryptAsync(editorPassword, editorSalt, 32)).toString('hex');

  const credentials = {
    'editor-1': {
      username: 'editor@example.com',
      passwordHash: editorHash,
      salt: editorSalt.toString('hex'),
      role: 'editor',
    },
  };

  const server = await setupTestServer(credentials, 8087);
  try {
    const response = await makeRequest(`http://127.0.0.1:8087/api/session`, 'GET');

    assert.equal(response.status, 401);
    assert.equal(response.body.error, 'Unauthorized');
  } finally {
    await server.close();
  }
});

test('HTTP Server - GET /api/session with forged session token returns 401', async () => {
  const editorPassword = 'editor-secure-password-123';
  const editorSalt = randomBytes(16);
  const editorHash = (await scryptAsync(editorPassword, editorSalt, 32)).toString('hex');

  const credentials = {
    'editor-1': {
      username: 'editor@example.com',
      passwordHash: editorHash,
      salt: editorSalt.toString('hex'),
      role: 'editor',
    },
  };

  const server = await setupTestServer(credentials, 8088);
  try {
    const forgedToken = randomBytes(32).toString('hex');
    const response = await makeRequest(
      `http://127.0.0.1:8088/api/session`,
      'GET',
      null,
      `bk_dashboard_session=${forgedToken}`
    );

    assert.equal(response.status, 401);
    assert.equal(response.body.error, 'Unauthorized');
  } finally {
    await server.close();
  }
});

test('HTTP Server - DELETE /api/session logs out successfully', async () => {
  const editorPassword = 'editor-secure-password-123';
  const editorSalt = randomBytes(16);
  const editorHash = (await scryptAsync(editorPassword, editorSalt, 32)).toString('hex');

  const credentials = {
    'editor-1': {
      username: 'editor@example.com',
      passwordHash: editorHash,
      salt: editorSalt.toString('hex'),
      role: 'editor',
    },
  };

  const server = await setupTestServer(credentials, 8089);
  try {
    // Login
    const loginResponse = await makeRequest(
      `http://127.0.0.1:8089/api/session`,
      'POST',
      { username: 'editor@example.com', password: editorPassword }
    );

    const sessionCookie = extractSessionCookie(loginResponse.headers.setCookie);

    // Verify session works
    const getResponse = await makeRequest(
      `http://127.0.0.1:8089/api/session`,
      'GET',
      null,
      `bk_dashboard_session=${sessionCookie}`
    );
    assert.equal(getResponse.status, 200);

    // Logout
    const deleteResponse = await makeRequest(
      `http://127.0.0.1:8089/api/session`,
      'DELETE',
      null,
      `bk_dashboard_session=${sessionCookie}`
    );
    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteResponse.body.success, true);
    assert(deleteResponse.headers.setCookie.includes('Max-Age=0'));

    // Verify session is gone
    const getAgainResponse = await makeRequest(
      `http://127.0.0.1:8089/api/session`,
      'GET',
      null,
      `bk_dashboard_session=${sessionCookie}`
    );
    assert.equal(getAgainResponse.status, 401);
  } finally {
    await server.close();
  }
});

test('HTTP Server - POST /api/session with wrong Content-Type returns 415', async () => {
  const editorPassword = 'editor-secure-password-123';
  const editorSalt = randomBytes(16);
  const editorHash = (await scryptAsync(editorPassword, editorSalt, 32)).toString('hex');

  const credentials = {
    'editor-1': {
      username: 'editor@example.com',
      passwordHash: editorHash,
      salt: editorSalt.toString('hex'),
      role: 'editor',
    },
  };

  const server = await setupTestServer(credentials, 8090);
  try {
    const response = await fetch(`http://127.0.0.1:8090/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'invalid',
    });

    assert.equal(response.status, 415);
  } finally {
    await server.close();
  }
});

test('HTTP Server - POST /api/session with malformed JSON returns 400', async () => {
  const editorPassword = 'editor-secure-password-123';
  const editorSalt = randomBytes(16);
  const editorHash = (await scryptAsync(editorPassword, editorSalt, 32)).toString('hex');

  const credentials = {
    'editor-1': {
      username: 'editor@example.com',
      passwordHash: editorHash,
      salt: editorSalt.toString('hex'),
      role: 'editor',
    },
  };

  const server = await setupTestServer(credentials, 8091);
  try {
    const response = await fetch(`http://127.0.0.1:8091/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json }',
    });

    assert.equal(response.status, 400);
  } finally {
    await server.close();
  }
});

test('HTTP Server - POST /api/session with missing credentials returns 400', async () => {
  const editorPassword = 'editor-secure-password-123';
  const editorSalt = randomBytes(16);
  const editorHash = (await scryptAsync(editorPassword, editorSalt, 32)).toString('hex');

  const credentials = {
    'editor-1': {
      username: 'editor@example.com',
      passwordHash: editorHash,
      salt: editorSalt.toString('hex'),
      role: 'editor',
    },
  };

  const server = await setupTestServer(credentials, 8092);
  try {
    const response = await makeRequest(
      `http://127.0.0.1:8092/api/session`,
      'POST',
      { username: 'editor@example.com' } // Missing password
    );

    assert.equal(response.status, 400);
  } finally {
    await server.close();
  }
});

test('HTTP Server - Security headers are set', async () => {
  const editorPassword = 'editor-secure-password-123';
  const editorSalt = randomBytes(16);
  const editorHash = (await scryptAsync(editorPassword, editorSalt, 32)).toString('hex');

  const credentials = {
    'editor-1': {
      username: 'editor@example.com',
      passwordHash: editorHash,
      salt: editorSalt.toString('hex'),
      role: 'editor',
    },
  };

  const server = await setupTestServer(credentials, 8093);
  try {
    const response = await makeRequest(`http://127.0.0.1:8093/api/health`);

    assert.equal(response.headers.xContentTypeOptions, 'nosniff');
    assert.equal(response.headers.xFrameOptions, 'DENY');
  } finally {
    await server.close();
  }
});

test('HTTP Server - Session fixation prevention: new login invalidates old session', async () => {
  const editorPassword = 'editor-secure-password-123';
  const editorSalt = randomBytes(16);
  const editorHash = (await scryptAsync(editorPassword, editorSalt, 32)).toString('hex');

  const credentials = {
    'editor-1': {
      username: 'editor@example.com',
      passwordHash: editorHash,
      salt: editorSalt.toString('hex'),
      role: 'editor',
    },
  };

  const server = await setupTestServer(credentials, 8094);
  try {
    // First login
    const login1 = await makeRequest(
      `http://127.0.0.1:8094/api/session`,
      'POST',
      { username: 'editor@example.com', password: editorPassword }
    );
    const cookie1 = extractSessionCookie(login1.headers.setCookie);

    // Verify first session works
    const get1 = await makeRequest(
      `http://127.0.0.1:8094/api/session`,
      'GET',
      null,
      `bk_dashboard_session=${cookie1}`
    );
    assert.equal(get1.status, 200);

    // Second login (creates new session)
    const login2 = await makeRequest(
      `http://127.0.0.1:8094/api/session`,
      'POST',
      { username: 'editor@example.com', password: editorPassword }
    );
    const cookie2 = extractSessionCookie(login2.headers.setCookie);

    // Both sessions should work (no invalidation of old session)
    const get1Again = await makeRequest(
      `http://127.0.0.1:8094/api/session`,
      'GET',
      null,
      `bk_dashboard_session=${cookie1}`
    );
    assert.equal(get1Again.status, 200);

    const get2 = await makeRequest(
      `http://127.0.0.1:8094/api/session`,
      'GET',
      null,
      `bk_dashboard_session=${cookie2}`
    );
    assert.equal(get2.status, 200);
  } finally {
    await server.close();
  }
});

test('HTTP Server - Login rate limiting after multiple failed attempts', async () => {
  const editorPassword = 'editor-secure-password-123';
  const editorSalt = randomBytes(16);
  const editorHash = (await scryptAsync(editorPassword, editorSalt, 32)).toString('hex');

  const credentials = {
    'editor-1': {
      username: 'editor@example.com',
      passwordHash: editorHash,
      salt: editorSalt.toString('hex'),
      role: 'editor',
    },
  };

  const server = await setupTestServer(credentials, 8095);
  try {
    // Make 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await makeRequest(
        `http://127.0.0.1:8095/api/session`,
        'POST',
        { username: 'editor@example.com', password: 'wrong-password' }
      );
    }

    // 6th attempt should be rate limited
    const response = await makeRequest(
      `http://127.0.0.1:8095/api/session`,
      'POST',
      { username: 'editor@example.com', password: 'wrong-password' }
    );

    assert.equal(response.status, 429);
    assert.equal(response.body.error, 'Too many login attempts');
  } finally {
    await server.close();
  }
});

test('HTTP Server - Different actors have different roles', async () => {
  const editorPassword = 'editor-password-123';
  const editorSalt = randomBytes(16);
  const editorHash = (await scryptAsync(editorPassword, editorSalt, 32)).toString('hex');

  const viewerPassword = 'viewer-password-456';
  const viewerSalt = randomBytes(16);
  const viewerHash = (await scryptAsync(viewerPassword, viewerSalt, 32)).toString('hex');

  const credentials = {
    'editor-1': {
      username: 'editor@example.com',
      passwordHash: editorHash,
      salt: editorSalt.toString('hex'),
      role: 'editor',
    },
    'viewer-1': {
      username: 'viewer@example.com',
      passwordHash: viewerHash,
      salt: viewerSalt.toString('hex'),
      role: 'viewer',
    },
  };

  const server = await setupTestServer(credentials, 8096);
  try {
    // Login as editor
    const editorLogin = await makeRequest(
      `http://127.0.0.1:8096/api/session`,
      'POST',
      { username: 'editor@example.com', password: editorPassword }
    );
    const editorCookie = extractSessionCookie(editorLogin.headers.setCookie);

    // Get editor session
    const editorGet = await makeRequest(
      `http://127.0.0.1:8096/api/session`,
      'GET',
      null,
      `bk_dashboard_session=${editorCookie}`
    );
    assert.equal(editorGet.body.role, 'editor');

    // Login as viewer
    const viewerLogin = await makeRequest(
      `http://127.0.0.1:8096/api/session`,
      'POST',
      { username: 'viewer@example.com', password: viewerPassword }
    );
    const viewerCookie = extractSessionCookie(viewerLogin.headers.setCookie);

    // Get viewer session
    const viewerGet = await makeRequest(
      `http://127.0.0.1:8096/api/session`,
      'GET',
      null,
      `bk_dashboard_session=${viewerCookie}`
    );
    assert.equal(viewerGet.body.role, 'viewer');

    // Roles should not match
    assert.notEqual(editorGet.body.role, viewerGet.body.role);
  } finally {
    await server.close();
  }
});

test('HTTP Server - 404 for unknown endpoints', async () => {
  const editorPassword = 'editor-secure-password-123';
  const editorSalt = randomBytes(16);
  const editorHash = (await scryptAsync(editorPassword, editorSalt, 32)).toString('hex');

  const credentials = {
    'editor-1': {
      username: 'editor@example.com',
      passwordHash: editorHash,
      salt: editorSalt.toString('hex'),
      role: 'editor',
    },
  };

  const server = await setupTestServer(credentials, 8097);
  try {
    const response = await makeRequest(`http://127.0.0.1:8097/api/unknown`);

    assert.equal(response.status, 404);
    assert.equal(response.body.error, 'Not Found');
  } finally {
    await server.close();
  }
});
