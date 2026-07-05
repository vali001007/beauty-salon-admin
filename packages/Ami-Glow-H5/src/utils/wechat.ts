export function isWechatBrowser(userAgent = window.navigator.userAgent) {
  return /micromessenger/i.test(userAgent);
}

export function readWechatOAuthParams(params = new URLSearchParams(window.location.search)) {
  const code = params.get('code') || undefined;
  const state = params.get('state') || undefined;
  return {
    code,
    state,
    inWechat: isWechatBrowser(),
  };
}
