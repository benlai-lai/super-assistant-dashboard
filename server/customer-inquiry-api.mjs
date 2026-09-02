import { randomUUID } from 'node:crypto';
import { checkPermission, validateRoleFromSession } from './access-policy.mjs';
import { assertId, assertIsoDateTime } from './database.mjs';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const STATUS_VALUES = new Set(['draft', 'active', 'closed', 'cancelled']);

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Invalid request body');
  return body;
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (body[field] === undefined) throw new ApiError(400, 'Invalid request body');
  }
}

function rejectUnknown(body, allowed) {
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new ApiError(400, 'Invalid request body');
}

function requireNonEmptyString(value) {
  if (typeof value !== 'string' || value.length === 0) throw new ApiError(400, 'Invalid request body');
}

function validateLimit(url) {
  const raw = url.searchParams.get('limit');
  if (raw === null) return DEFAULT_LIMIT;
  if (!/^\d+$/.test(raw)) throw new ApiError(400, 'Invalid limit');
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new ApiError(400, 'Invalid limit');
  return limit;
}

function mapCustomer(row) {
  return row;
}

function mapInquiry(row) {
  return row;
}

export function createCustomerInquiryApi({ customers, inquiries, getSession, parseJsonBody }) {
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

  async function body(req, action) {
    await authorize(req, action);
    return requireObject(await parseJsonBody(req));
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const customerMatch = url.pathname.match(/^\/api\/customers\/([^/]+)$/);
    const inquiryMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)$/);
    const itemsMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)\/items$/);
    const itemMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)\/items\/([^/]+)$/);

    try {
      if (req.method === 'GET' && url.pathname === '/api/customers') {
        await authorize(req, 'read');
        return send(res, 200, { customers: customers.list({ limit: validateLimit(url) }).map(mapCustomer) });
      }
      if (req.method === 'POST' && url.pathname === '/api/customers') {
        const input = await body(req, 'create');
        rejectUnknown(input, new Set(['displayName', 'contactName', 'email', 'phone']));
        requireFields(input, ['displayName']);
        requireNonEmptyString(input.displayName);
        return send(res, 201, { customer: customers.create({ ...input, id: randomUUID(), createdAt: new Date().toISOString() }) });
      }
      if (customerMatch && (req.method === 'GET' || req.method === 'PATCH')) {
        const id = customerMatch[1];
        if (req.method === 'GET') {
          await authorize(req, 'read');
          const customer = customers.get(id);
          if (!customer) throw new ApiError(404, 'Not found');
          return send(res, 200, { customer });
        }
        const input = await body(req, 'update');
        rejectUnknown(input, new Set(['displayName', 'contactName', 'email', 'phone']));
        if (Object.keys(input).length === 0) throw new ApiError(400, 'Invalid request body');
        for (const value of Object.values(input)) {
          if (value !== null) requireNonEmptyString(value);
        }
        const customer = customers.update(id, input);
        return send(res, 200, { customer });
      }
      if (req.method === 'GET' && url.pathname === '/api/inquiries') {
        await authorize(req, 'read');
        return send(res, 200, { inquiries: inquiries.list({ limit: validateLimit(url) }).map(mapInquiry) });
      }
      if (req.method === 'POST' && url.pathname === '/api/inquiries') {
        const input = await body(req, 'create');
        rejectUnknown(input, new Set(['customerId', 'title', 'status']));
        requireFields(input, ['customerId', 'title']);
        assertId(input.customerId, 'customer id');
        requireNonEmptyString(input.title);
        if (input.status !== undefined && !STATUS_VALUES.has(input.status)) throw new ApiError(400, 'Invalid request body');
        const timestamp = new Date().toISOString();
        return send(res, 201, { inquiry: inquiries.create({ ...input, id: randomUUID(), createdAt: timestamp, updatedAt: timestamp }) });
      }
      if (inquiryMatch && (req.method === 'GET' || req.method === 'PATCH')) {
        const id = inquiryMatch[1];
        if (req.method === 'GET') {
          await authorize(req, 'read');
          const inquiry = inquiries.get(id);
          if (!inquiry) throw new ApiError(404, 'Not found');
          return send(res, 200, { inquiry });
        }
        const input = await body(req, 'update');
        rejectUnknown(input, new Set(['title', 'status']));
        if (Object.keys(input).length === 0) throw new ApiError(400, 'Invalid request body');
        if (input.title !== undefined) requireNonEmptyString(input.title);
        if (input.status !== undefined && !STATUS_VALUES.has(input.status)) throw new ApiError(400, 'Invalid request body');
        return send(res, 200, { inquiry: inquiries.update(id, input) });
      }
      if (itemsMatch && (req.method === 'GET' || req.method === 'POST')) {
        const inquiryId = itemsMatch[1];
        if (req.method === 'GET') {
          await authorize(req, 'read');
          return send(res, 200, { items: inquiries.listItems(inquiryId) });
        }
        const input = await body(req, 'create');
        rejectUnknown(input, new Set(['description', 'quantity', 'notes']));
        requireFields(input, ['description', 'quantity']);
        requireNonEmptyString(input.description);
        if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) throw new ApiError(400, 'Invalid request body');
        return send(res, 201, { item: inquiries.addItem({ ...input, id: randomUUID(), inquiryId, createdAt: new Date().toISOString() }) });
      }
      if (itemMatch && req.method === 'PATCH') {
        const input = await body(req, 'update');
        rejectUnknown(input, new Set(['description', 'quantity', 'notes']));
        if (Object.keys(input).length === 0) throw new ApiError(400, 'Invalid request body');
        if (input.description !== undefined) requireNonEmptyString(input.description);
        if (input.quantity !== undefined && (!Number.isSafeInteger(input.quantity) || input.quantity < 1)) throw new ApiError(400, 'Invalid request body');
        return send(res, 200, { item: inquiries.updateItem(itemMatch[1], itemMatch[2], input) });
      }
      return false;
    } catch (error) {
      if (error instanceof ApiError) return send(res, error.status, { error: error.message });
      if (error?.status) return send(res, error.status, { error: error.message || 'Invalid request' });
      if (/Unknown (customer|inquiry)|Unknown inquiry item/.test(error?.message || '')) return send(res, 404, { error: 'Not found' });
      return send(res, 400, { error: 'Invalid request' });
    }
  }

  return { handle };
}