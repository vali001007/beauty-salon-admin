import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误，请稍后重试';
    let code = 'INTERNAL_ERROR';
    let details: unknown = undefined;

    if (isDatabaseUnavailable(exception)) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = '数据服务暂不可用，请稍后重试';
      code = 'DATABASE_UNAVAILABLE';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || message;
        code = (resp.code as string) || `HTTP_${status}`;
        details = resp.details;
      }
    } else {
      this.logger.error(
        'Unhandled API exception',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({ message, code, status, details });
  }
}

function isDatabaseUnavailable(exception: unknown): boolean {
  if (!exception || typeof exception !== 'object') return false;
  const error = exception as {
    code?: unknown;
    message?: unknown;
    originalCode?: unknown;
    originalMessage?: unknown;
    cause?: unknown;
    meta?: unknown;
  };
  const code = String(error.code ?? error.originalCode ?? '');
  const message = String(error.message ?? error.originalMessage ?? '');

  if (code === 'P1001' || code === 'P1017' || code === 'EMAXCONNSESSION') return true;
  if (
    message.includes("Can't reach database server") ||
    message.includes('DatabaseNotReachable') ||
    message.includes('EMAXCONNSESSION') ||
    message.includes('max clients reached in session mode') ||
    message.includes('too many clients already') ||
    message.includes('timeout exceeded when trying to connect')
  ) {
    return true;
  }

  return isDatabaseUnavailable(error.cause) || isDatabaseUnavailable(error.meta);
}
