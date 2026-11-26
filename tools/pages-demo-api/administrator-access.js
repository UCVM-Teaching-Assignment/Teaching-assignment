'use strict';

const { normalizeBaseRole } = require('../../server/src/auth/role-policy');

const AFC_ENTRY = '/api/v1/dashboard/afc-records';
const PERMITTED_CAPABILITIES = new Set(['afcSingle', 'decisions']);
const SWAP_CAPABILITIES = ['canCreate', 'canRevise', 'canWithdraw', 'canDecide', 'canOverride', 'requiresOverride', 'canPreviewDoe'];
const isReadOnlyAdministrator = role => normalizeBaseRole(role) === 'adfa_regular';

function deny() {
  return { status: 403, jsonBody: { error: { code: 'ROLE_DENIED', message: 'ADFAD Administrator may read records, enter AFC forms and decide AFC requests routed to them.' } } };
}

async function restrictAdministratorRequest(request, pathname) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    if (pathname === '/api/v1/swaps/faculty-preview') return deny();
    return null;
  }
  if (request.method !== 'POST') return deny();

  if (pathname === '/api/v1/reports/query' ||
      pathname === '/api/v1/afc-forms' ||
      /^\/api\/v1\/afc-requests\/[^/]+\/(recommend|reject)$/.test(pathname)) return null;

  if (pathname === AFC_ENTRY) {
    // The normal AFC entry can include an original PDF. Creating available
    // Special Leave would also write a DOE deduction.
    const body = await request.clone().json().catch(() => null);
    return body?.availability === 'available' ? deny() : null;
  }
  return deny();
}

function restrictAdministratorResponse(pathname, response) {
  const body = response?.jsonBody;
  if (response?.status !== 200 || !body) return response;
  if (body.writeCapabilities) {
    for (const key of Object.keys(body.writeCapabilities)) {
      if (!PERMITTED_CAPABILITIES.has(key)) body.writeCapabilities[key] = false;
    }
  }
  if (pathname.startsWith('/api/v1/swaps/')) {
    for (const key of SWAP_CAPABILITIES) {
      if (key in body) body[key] = false;
      if (body.capabilities && key in body.capabilities) body.capabilities[key] = false;
    }
    if (body.capabilities) {
      body.capabilities.decisions = [];
      body.capabilities.editableFields = [];
    }
    for (const row of body.requests || []) {
      row.canDecide = false;
      row.requiresOverride = false;
    }
  }
  if (pathname === '/api/v1/scheduling-tasks') {
    if (body.capabilities) body.capabilities.canReview = false;
    for (const row of body.tasks || []) row.canReview = false;
  }
  if (pathname === '/api/v1/schedule-workflow' && body.capabilities) {
    body.capabilities.canADFAD = false;
  }
  return response;
}

module.exports = { isReadOnlyAdministrator, restrictAdministratorRequest, restrictAdministratorResponse };
