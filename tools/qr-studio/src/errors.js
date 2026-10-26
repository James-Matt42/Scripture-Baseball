/** Stable, machine-readable errors for application forms and integrations. */
export class QREngineError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'QREngineError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function fail(code, message, details) {
  throw new QREngineError(code, message, details);
}
