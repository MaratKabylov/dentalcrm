export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function getSafeErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }

  return "Не удалось выполнить действие. Попробуйте ещё раз.";
}
