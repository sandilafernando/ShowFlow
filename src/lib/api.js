export class ApiError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code || 'UNKNOWN';
    this.details = details;
  }
}

export function hasBridge() {
  return Boolean(window.showflow && typeof window.showflow.events?.list === 'function');
}

function resolveMethod(path) {
  return path.split('.').reduce((target, key) => (target ? target[key] : undefined), window.showflow);
}

/**
 * Invoke an allowlisted preload method and unwrap the main-process envelope.
 * The renderer never sees a raw Electron error object.
 */
export async function api(path, ...args) {
  if (!hasBridge()) {
    throw new ApiError(
      'BRIDGE_MISSING',
      'The ShowFlow bridge is unavailable. Start the app through Electron, not a browser tab.',
    );
  }
  const method = resolveMethod(path);
  if (typeof method !== 'function') {
    throw new ApiError('METHOD_MISSING', `The ShowFlow bridge does not expose “${path}”.`);
  }
  let response;
  try {
    response = await method(...args);
  } catch (error) {
    throw new ApiError('BRIDGE_ERROR', error?.message || 'The ShowFlow bridge did not respond.');
  }
  if (!response || typeof response !== 'object') {
    throw new ApiError('INVALID_RESPONSE', 'ShowFlow returned an invalid response.');
  }
  if (!response.ok) {
    const error = response.error || {};
    throw new ApiError(error.code, error.message || 'The action could not be completed.', error.details);
  }
  return response.data;
}

export const mediaUrl = (assetId) => `showflow-media://asset/${assetId}`;

export function describeError(error) {
  if (!error) return 'Unknown error.';
  if (error instanceof ApiError) return error.message;
  return error.message || String(error);
}
