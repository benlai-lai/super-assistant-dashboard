import { checkPermission, validateRoleFromSession } from './access-policy.mjs';
import {
  ApprovalConflictError,
  ApprovalDeniedError,
  ApprovalNotFoundError,
} from './approval-repository.mjs';
import {
  QuotationProjectionDeniedError,
  QuotationProjectionNotFoundError,
} from './quotation-projection.mjs';

const DECISIONS = new Set(['APPROVED', 'RETURNED']);

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

function requireExactFields(value, required, optional = []) {
  const actual = Object.keys(value).sort();
  const allowed = [...required, ...optional].sort();
  if (required.some((field) => value[field] === undefined)
    || actual.length > allowed.length
    || actual.some((field) => !allowed.includes(field))) {
    throw new ApiError(400, 'Invalid request body');
  }
}

function requireDecision(value) {
  if (!DECISIONS.has(value)) throw new ApiError(400, 'Invalid request body');
}

function requireReason(value) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1 || [...value].length > 1000) {
    throw new ApiError(400, 'Invalid request body');
  }
}

function requireVersionId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,80}$/.test(value)) {
    throw new ApiError(400, 'Invalid quotation version');
  }
}

function requireNoQuery(url) {
  if ([...url.searchParams.keys()].length > 0) throw new ApiError(400, 'Invalid query');
}

export function createQuotationApi({ projections, approvals, getSession, parseJsonBody }) {
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

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const internalMatch = url.pathname.match(/^\/api\/quotations\/([^/]+)\/internal$/);
    const customerMatch = url.pathname.match(/^\/api\/quotations\/([^/]+)\/customer$/);
    const decisionMatch = url.pathname.match(/^\/api\/quotations\/([^/]+)\/approval-decisions$/);

    try {
      if (req.method === 'GET' && internalMatch) {
        const session = await authorize(req, 'quotation:internal:read');
        requireNoQuery(url);
        requireVersionId(internalMatch[1]);
        return send(res, 200, { quotation: projections.internal(internalMatch[1], session) });
      }
      if (req.method === 'GET' && customerMatch) {
        const session = await authorize(req, 'quotation:customer:read');
        requireNoQuery(url);
        requireVersionId(customerMatch[1]);
        return send(res, 200, { quotation: projections.customer(customerMatch[1], session) });
      }
      if (req.method === 'POST' && decisionMatch) {
        const session = await authorize(req, 'quotation:approval:decide');
        requireNoQuery(url);
        requireVersionId(decisionMatch[1]);
        const input = requireObject(await parseJsonBody(req));
        requireExactFields(input, ['decision'], ['reason']);
        requireDecision(input.decision);
        requireReason(input.reason);
        const result = approvals.decide({
          quotationVersionId: decisionMatch[1],
          actorId: session.actorId,
          decision: input.decision,
          reason: input.reason ?? null,
        });
        return send(res, 201, {
          approval: {
            id: result.approval.id,
            quotationVersionId: result.approval.quotation_version_id,
            decision: result.approval.decision,
            approverActorId: result.approval.approver_actor_id,
            reason: result.approval.reason,
            createdAt: result.approval.created_at,
          },
          quotation: {
            id: result.quotation.id,
            status: result.quotation.status,
            approvalStatus: result.quotation.approval_status,
            publishedAt: result.quotation.published_at,
          },
        });
      }
      return false;
    } catch (error) {
      if (error instanceof ApiError) return send(res, error.status, { error: error.message });
      if (error?.status) return send(res, error.status, { error: error.message || 'Invalid request' });
      if (error instanceof ApprovalDeniedError || error instanceof QuotationProjectionDeniedError) {
        return send(res, 403, { error: 'Forbidden' });
      }
      if (error instanceof ApprovalNotFoundError || error instanceof QuotationProjectionNotFoundError) {
        return send(res, 404, { error: 'Not found' });
      }
      if (error instanceof ApprovalConflictError) return send(res, 409, { error: 'Conflict' });
      return send(res, 500, { error: 'Internal Server Error' });
    }
  }

  return { handle };
}
