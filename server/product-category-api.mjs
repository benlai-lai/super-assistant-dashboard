import { randomUUID } from 'node:crypto';
import { checkPermission, validateRoleFromSession } from './access-policy.mjs';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const STATUS_VALUES = new Set(['ACTIVE', 'INACTIVE', 'ALL']);

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Invalid request body');
  return value;
}

function requireExactFields(value, fields) {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new ApiError(400, 'Invalid request body');
  }
}

function requireName(value) {
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1 || [...value].length > 100) {
    throw new ApiError(400, 'Invalid request body');
  }
}

function parseListOptions(url) {
  for (const key of url.searchParams.keys()) {
    if (key !== 'status' && key !== 'limit') throw new ApiError(400, 'Invalid query');
  }
  const status = url.searchParams.get('status') ?? 'ACTIVE';
  if (!STATUS_VALUES.has(status)) throw new ApiError(400, 'Invalid status');
  const rawLimit = url.searchParams.get('limit');
  if (rawLimit === null) return { status, limit: DEFAULT_LIMIT };
  if (!/^\d+$/.test(rawLimit)) throw new ApiError(400, 'Invalid limit');
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new ApiError(400, 'Invalid limit');
  return { status, limit };
}

export function createProductCategoryApi({ categories, getSession, parseJsonBody, now = () => new Date().toISOString(), createId = randomUUID }) {
  async function authorize(req, action) {
    const session = getSession(req);
    if (!session) throw new ApiError(401, 'Unauthorized');
    try {
      validateRoleFromSession(session.role);
      if (!checkPermission(session.role, action)) throw new ApiError(403, 'Forbidden');
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(401, 'Unauthorized');
    }
    return session;
  }

  function send(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  async function parseAuthorizedBody(req, action) {
    await authorize(req, action);
    return requireObject(await parseJsonBody(req));
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const categoryMatch = url.pathname.match(/^\/api\/product-categories\/([^/]+)$/);
    const deactivateMatch = url.pathname.match(/^\/api\/product-categories\/([^/]+)\/deactivate$/);

    try {
      if (req.method === 'GET' && url.pathname === '/api/product-categories') {
        await authorize(req, 'category:list');
        return send(res, 200, { productCategories: categories.list(parseListOptions(url)) });
      }
      if (req.method === 'POST' && url.pathname === '/api/product-categories') {
        const input = await parseAuthorizedBody(req, 'category:create');
        requireExactFields(input, ['name']);
        requireName(input.name);
        return send(res, 201, {
          productCategory: categories.create({ id: createId(), name: input.name, createdAt: now() }),
        });
      }
      if (req.method === 'PATCH' && categoryMatch) {
        const input = await parseAuthorizedBody(req, 'category:rename');
        requireExactFields(input, ['name']);
        requireName(input.name);
        return send(res, 200, {
          productCategory: categories.rename(categoryMatch[1], { name: input.name, updatedAt: now() }),
        });
      }
      if (req.method === 'POST' && deactivateMatch) {
        const input = await parseAuthorizedBody(req, 'category:deactivate');
        requireExactFields(input, []);
        return send(res, 200, {
          productCategory: categories.deactivate(deactivateMatch[1], { updatedAt: now() }),
        });
      }
      return false;
    } catch (error) {
      if (error instanceof ApiError) return send(res, error.status, { error: error.message });
      if (/Unknown product category/.test(error?.message || '')) return send(res, 404, { error: 'Not found' });
      if (/UNIQUE|constraint/i.test(error?.message || '')) return send(res, 409, { error: 'Conflict' });
      return send(res, 400, { error: 'Invalid request' });
    }
  }

  return { handle };
}
