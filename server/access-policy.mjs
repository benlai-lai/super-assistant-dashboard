/**
 * Permission access control policy for Phase 2C-A.
 * Implements role-based access control (RBAC).
 */

/**
 * Valid actions that can be checked
 */
const ACTIONS = {
  READ: 'read',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  PUBLISH: 'publish',
  CATEGORY_LIST: 'category:list',
  CATEGORY_CREATE: 'category:create',
  CATEGORY_RENAME: 'category:rename',
  CATEGORY_DEACTIVATE: 'category:deactivate',
};

/**
 * Role definitions and their permissions
 */
const ROLE_PERMISSIONS = {
  editor: {
    [ACTIONS.READ]: true,
    [ACTIONS.CREATE]: true,
    [ACTIONS.UPDATE]: true,
    [ACTIONS.DELETE]: true,
    [ACTIONS.PUBLISH]: true,
    [ACTIONS.CATEGORY_LIST]: true,
    [ACTIONS.CATEGORY_CREATE]: true,
    [ACTIONS.CATEGORY_RENAME]: true,
    [ACTIONS.CATEGORY_DEACTIVATE]: true,
  },
  viewer: {
    [ACTIONS.READ]: true,
    [ACTIONS.CREATE]: false,
    [ACTIONS.UPDATE]: false,
    [ACTIONS.DELETE]: false,
    [ACTIONS.PUBLISH]: false,
    [ACTIONS.CATEGORY_LIST]: false,
    [ACTIONS.CATEGORY_CREATE]: false,
    [ACTIONS.CATEGORY_RENAME]: false,
    [ACTIONS.CATEGORY_DEACTIVATE]: false,
  },
};

/**
 * Check if an actor can perform an action
 * Fail-closed policy: missing policy, throw, invalid result, unknown action all reject
 *
 * @param {string} role - 'editor' or 'viewer'
 * @param {string} action - Action to check
 * @returns {boolean} True if allowed, false if denied
 * @throws {Error} On invalid policy state
 */
export function checkPermission(role, action) {
  // Fail-closed: unknown role
  if (!ROLE_PERMISSIONS[role]) {
    throw new Error(`Unknown role: ${role}`);
  }

  // Fail-closed: unknown action
  if (!Object.values(ACTIONS).includes(action)) {
    throw new Error(`Unknown action: ${action}`);
  }

  const permission = ROLE_PERMISSIONS[role][action];

  // Fail-closed: missing or invalid permission
  if (permission !== true && permission !== false) {
    throw new Error(`Invalid permission state for ${role}.${action}`);
  }

  return permission;
}

/**
 * Verify that a session's role cannot be spoofed
 * Server must only set role based on internal credential mapping
 *
 * @param {string} role - Role from session
 * @returns {boolean} True if role is valid
 * @throws {Error} On invalid role
 */
export function validateRoleFromSession(role) {
  if (!ROLE_PERMISSIONS[role]) {
    throw new Error(`Invalid role in session: ${role}`);
  }
  return true;
}

/**
 * Get policy matrix for debugging/testing
 * @returns {Object} Role -> Action -> boolean
 */
export function getPolicyMatrix() {
  return JSON.parse(JSON.stringify(ROLE_PERMISSIONS));
}
