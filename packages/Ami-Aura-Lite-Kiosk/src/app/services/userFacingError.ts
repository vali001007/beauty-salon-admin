type RequestErrorLike = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  payload?: { message?: unknown; code?: unknown; status?: unknown };
};

function readErrorDetails(error: unknown) {
  const candidate = error && typeof error === "object" ? (error as RequestErrorLike) : {};
  const message =
    typeof candidate.payload?.message === "string"
      ? candidate.payload.message
      : typeof candidate.message === "string"
        ? candidate.message
        : typeof error === "string"
          ? error
          : "";
  const status = Number(candidate.payload?.status ?? candidate.status);
  const code = String(candidate.payload?.code ?? candidate.code ?? "");
  return { message: message.trim(), status: Number.isFinite(status) ? status : undefined, code };
}

export function isRequestOutcomeUncertain(error: unknown) {
  const { message, code } = readErrorDetails(error);
  return code === "ECONNABORTED" || code === "ERR_NETWORK" || /timeout|network error|网络错误|超时/i.test(message);
}

export function formatUserFacingRequestError(error: unknown, fallback = "操作暂时未完成，请稍后重试") {
  const { message, status, code } = readErrorDetails(error);

  if (status === 401 || /认证令牌|登录状态|unauthorized|token/i.test(message)) {
    return "登录状态已失效，请重试当前操作，系统会自动恢复登录状态";
  }
  if (status === 403 || /permission|forbidden|无权限|权限不足/i.test(message)) {
    return "当前账号没有执行此操作的权限，请联系管理员检查角色权限";
  }
  if ((status !== undefined && status >= 500) || /^Request failed with status code 5\d\d$/i.test(message) || /internal server error/i.test(message)) {
    return "Ami_Core 暂时无法完成本次操作，请稍后重试";
  }
  if (code === "ECONNABORTED" || /timeout|超时/i.test(message)) {
    return "Ami_Core 响应较慢，请稍后重试";
  }
  if (code === "ERR_NETWORK" || /network error|网络错误/i.test(message)) {
    return "当前网络连接异常，请检查网络后重试";
  }
  return message || fallback;
}
