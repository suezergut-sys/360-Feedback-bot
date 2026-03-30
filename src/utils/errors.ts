export class AppError extends Error {
  readonly statusCode: number;
  readonly expose: boolean;

  constructor(message: string, statusCode = 500, expose = false) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.expose = expose;
  }
}

export function toErrorMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
