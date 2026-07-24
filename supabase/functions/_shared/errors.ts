/**
 * _shared/errors.ts — structured error responses for Edge Functions.
 */

import { corsHeaders } from './cors.ts';

export interface ErrorBody {
  ok: false;
  error: string;
  code: string;
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  req: Request,
  code: string,
  message: string,
  status = 400,
): Response {
  const body: ErrorBody = { ok: false, error: message, code };
  return jsonResponse(req, body, status);
}

export class HandledError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
