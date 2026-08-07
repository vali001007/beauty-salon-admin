import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type ApiErrorCategory = 'business_blocker' | 'permission' | 'system' | 'conflict';

interface GovernanceErrorMetadata {
  code: string;
  category: ApiErrorCategory;
  message: string;
  resolutionType?: string;
  retryable: boolean;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = typeof ctx.getRequest === 'function' ? ctx.getRequest<Request>() : undefined;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误，请稍后重试';
    let code = 'INTERNAL_ERROR';
    let details: unknown = undefined;
    let category: ApiErrorCategory | undefined;
    let resolutionType: string | undefined;
    let retryable: boolean | undefined;

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
        category = apiErrorCategory(resp.category);
        resolutionType = optionalString(resp.resolutionType);
        retryable = typeof resp.retryable === 'boolean' ? resp.retryable : undefined;
      }
    } else {
      this.logger.error(
        'Unhandled API exception',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    if (isGovernanceRequest(request) || isGovernanceError(message, code)) {
      const metadata = governanceErrorMetadata({ status, message, code });
      code = code.startsWith('HTTP_') ? metadata.code : code;
      if (isMachineCode(message) || message === 'Forbidden' || message === 'Forbidden resource') message = metadata.message;
      category ??= metadata.category;
      resolutionType ??= metadata.resolutionType;
      retryable ??= metadata.retryable;
    }

    response.status(status).json({
      message,
      code,
      status,
      details,
      ...(category ? { category } : {}),
      ...(resolutionType ? { resolutionType } : {}),
      ...(retryable !== undefined ? { retryable } : {}),
    });
  }
}

function governanceErrorMetadata(input: { status: number; message: string; code: string }): GovernanceErrorMetadata {
  const machineCode = machineErrorCode(input.message) ?? machineErrorCode(input.code);
  const code = machineCode ?? (input.status === 401 || input.status === 403
    ? 'brain_governance_permission_denied'
    : input.status >= 500
      ? 'brain_governance_system_error'
      : `brain_governance_http_${input.status}`);

  if (input.status === 401 || input.status === 403 || code.includes('permission')) {
    return {
      code,
      category: 'permission',
      message: '缺少执行该治理操作所需的权限。',
      resolutionType: 'request_approval',
      retryable: false,
    };
  }
  if (code === 'governance_task_waiting_for_evidence' || code.includes('valid_gate_receipt_missing')) {
    return {
      code,
      category: 'business_blocker',
      message: '正在等待 CI 可信证据，Receipt 入库后会自动继续。',
      resolutionType: 'wait_ci',
      retryable: false,
    };
  }
  if (code.includes('store_scope_required')) {
    return {
      code,
      category: 'business_blocker',
      message: '该功能需要先选择一个具体门店。',
      resolutionType: 'select_store',
      retryable: false,
    };
  }
  if (input.status === 409) {
    return {
      code,
      category: 'conflict',
      message: '治理状态已发生变化，请刷新后重试。',
      retryable: true,
    };
  }
  if (input.status >= 500) {
    return {
      code,
      category: 'system',
      message: '治理服务暂时不可用，请稍后重试。',
      resolutionType: 'retry_system',
      retryable: true,
    };
  }
  if (code.includes('approval')) {
    return {
      code,
      category: 'business_blocker',
      message: '当前操作需要完成治理审批。',
      resolutionType: 'request_approval',
      retryable: false,
    };
  }
  if (code.includes('policy') || code.includes('risk_') || code.includes('whitelist')) {
    return {
      code,
      category: 'business_blocker',
      message: '当前治理策略不满足操作条件，请检查并修订策略。',
      resolutionType: 'edit_policy',
      retryable: false,
    };
  }
  return {
    code,
    category: 'business_blocker',
    message: '当前治理条件不满足，请查看阻断详情或联系负责人。',
    resolutionType: code.includes('receipt') || code.includes('evidence') ? 'contact_owner' : undefined,
    retryable: false,
  };
}

function isGovernanceRequest(request?: Request): boolean {
  const path = String(request?.originalUrl ?? request?.url ?? '');
  return path.includes('/brain/governance/');
}

function isGovernanceError(message: string, code: string): boolean {
  return /(?:brain_)?governance|policy_snapshot|rollout_|receipt_/u.test(`${message}:${code}`);
}

function isMachineCode(value: string): boolean {
  return machineErrorCode(value) !== undefined;
}

function machineErrorCode(value: string): string | undefined {
  const candidate = String(value ?? '').split(':', 1)[0];
  return /^[a-z][a-z0-9_]*$/u.test(candidate) ? candidate : undefined;
}

function apiErrorCategory(value: unknown): ApiErrorCategory | undefined {
  return ['business_blocker', 'permission', 'system', 'conflict'].includes(String(value))
    ? String(value) as ApiErrorCategory
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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
