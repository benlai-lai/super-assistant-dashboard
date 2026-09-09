import { createHash, randomUUID } from 'node:crypto';
import { runInTransaction } from './database.mjs';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function requestHash(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex');
}

function conflict(code) {
  const error = new Error(code);
  error.status = 409;
  error.code = code;
  return error;
}

function assertKey(key) {
  if (typeof key !== 'string' || key.length < 8 || key.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(key)) {
    const error = new Error('invalid_idempotency_key');
    error.status = 400;
    error.code = 'invalid_idempotency_key';
    throw error;
  }
}

export function createCustomerInquiryWriteService({
  db,
  customers,
  inquiries,
  audit,
  idempotency,
  now = () => new Date().toISOString(),
  createId = () => randomUUID(),
}) {
  function execute({ session, operation, key, fingerprint, status, mutate }) {
    assertKey(key);
    const hash = requestHash(fingerprint);
    return runInTransaction(db, () => {
      const existing = idempotency.get(session.actorId, operation, key);
      if (existing) {
        if (existing.request_hash !== hash) throw conflict('idempotency_key_reused');
        return { status: existing.response_status, body: existing.response, replayed: true };
      }

      const timestamp = now();
      const change = mutate(timestamp);
      audit.log({
        id: createId(),
        entityType: change.entityType,
        entityId: change.entityId,
        action: change.action,
        actorId: session.actorId,
        requestId: key,
        before: change.before,
        after: change.after,
        payload: {},
        createdAt: timestamp,
      });
      const body = change.body;
      idempotency.record({
        actorId: session.actorId,
        operation,
        key,
        requestHash: hash,
        responseStatus: status,
        response: body,
        createdAt: timestamp,
      });
      return { status, body, replayed: false };
    });
  }

  return {
    createCustomer({ session, key, input }) {
      return execute({
        session,
        operation: 'customer:create',
        key,
        fingerprint: { input },
        status: 201,
        mutate(timestamp) {
          const customer = customers.create({ ...input, id: createId(), createdAt: timestamp, updatedAt: timestamp }, { inTransaction: true });
          return { entityType: 'customer', entityId: customer.id, action: 'created', before: null, after: customer, body: { customer } };
        },
      });
    },

    updateCustomer({ session, key, id, expectedVersion, input }) {
      return execute({
        session,
        operation: `customer:update:${id}`,
        key,
        fingerprint: { id, expectedVersion, input },
        status: 200,
        mutate(timestamp) {
          const before = customers.get(id);
          const customer = customers.update(id, input, { expectedVersion, updatedAt: timestamp, inTransaction: true });
          return { entityType: 'customer', entityId: id, action: 'updated', before, after: customer, body: { customer } };
        },
      });
    },

    createInquiry({ session, key, input }) {
      return execute({
        session,
        operation: 'inquiry:create',
        key,
        fingerprint: { input },
        status: 201,
        mutate(timestamp) {
          const inquiry = inquiries.create({ ...input, id: createId(), createdAt: timestamp, updatedAt: timestamp }, { inTransaction: true });
          return { entityType: 'inquiry', entityId: inquiry.id, action: 'created', before: null, after: inquiry, body: { inquiry } };
        },
      });
    },

    updateInquiry({ session, key, id, expectedVersion, input }) {
      return execute({
        session,
        operation: `inquiry:update:${id}`,
        key,
        fingerprint: { id, expectedVersion, input },
        status: 200,
        mutate(timestamp) {
          const before = inquiries.get(id);
          const inquiry = inquiries.update(id, input, { expectedVersion, updatedAt: timestamp, inTransaction: true });
          return { entityType: 'inquiry', entityId: id, action: 'updated', before, after: inquiry, body: { inquiry } };
        },
      });
    },

    createItem({ session, key, inquiryId, input }) {
      return execute({
        session,
        operation: `inquiry-item:create:${inquiryId}`,
        key,
        fingerprint: { inquiryId, input },
        status: 201,
        mutate(timestamp) {
          const item = inquiries.addItem({ ...input, id: createId(), inquiryId, createdAt: timestamp, updatedAt: timestamp }, { inTransaction: true });
          return { entityType: 'inquiry_item', entityId: item.id, action: 'created', before: null, after: item, body: { item } };
        },
      });
    },

    updateItem({ session, key, inquiryId, itemId, expectedVersion, input }) {
      return execute({
        session,
        operation: `inquiry-item:update:${inquiryId}:${itemId}`,
        key,
        fingerprint: { inquiryId, itemId, expectedVersion, input },
        status: 200,
        mutate(timestamp) {
          const before = inquiries.requireItemInInquiry(itemId, inquiryId);
          const item = inquiries.updateItem(inquiryId, itemId, input, { expectedVersion, updatedAt: timestamp, inTransaction: true });
          return { entityType: 'inquiry_item', entityId: itemId, action: 'updated', before, after: item, body: { item } };
        },
      });
    },
  };
}
