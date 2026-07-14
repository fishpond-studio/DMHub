/**
 * AppError — 统一应用错误类
 * 携带错误码、HTTP 状态码和可选的额外信息
 */
export class AppError extends Error {
  public readonly code: number;
  public readonly httpStatus: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: number,
    message?: string,
    httpStatus?: number,
    details?: Record<string, unknown>,
  ) {
    super(message || `Error ${code}`);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus ?? 500;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/** 快捷工厂函数 */
export function badRequest(code: number, message?: string, details?: Record<string, unknown>): AppError {
  return new AppError(code, message, 400, details);
}

export function unauthorized(code: number, message?: string, details?: Record<string, unknown>): AppError {
  return new AppError(code, message, 401, details);
}

export function forbidden(code: number, message?: string, details?: Record<string, unknown>): AppError {
  return new AppError(code, message, 403, details);
}

export function notFound(code: number, message?: string, details?: Record<string, unknown>): AppError {
  return new AppError(code, message, 404, details);
}

export function conflict(code: number, message?: string, details?: Record<string, unknown>): AppError {
  return new AppError(code, message, 409, details);
}

export function rateLimited(code: number, message?: string, details?: Record<string, unknown>): AppError {
  return new AppError(code, message, 429, details);
}
