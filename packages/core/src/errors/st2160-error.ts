/** All error codes. Each module adds its own codes here as a group. */
export type St2160ErrorCode =
  | 'invalid-argument'
  | 'invalid-state'
  | 'not-supported'
  | 'aborted'
  | 'internal'
  | 'parse-error'
  | 'ass-invalid-script';

export interface St2160ErrorOptions extends ErrorOptions {
  /** Machine-readable details, safe to log. */
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Every st2160 throw and rejection. Match on `code`, never on `message`. */
export class St2160Error extends Error {
  override readonly name = 'St2160Error';
  readonly code: St2160ErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: St2160ErrorCode, message: string, options?: St2160ErrorOptions) {
    super(message, options);
    this.code = code;
    this.details = options?.details;
  }
}

export function isSt2160Error(value: unknown, code?: St2160ErrorCode): value is St2160Error {
  return value instanceof St2160Error && (code === undefined || value.code === code);
}
