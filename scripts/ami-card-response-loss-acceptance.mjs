import http from 'node:http';
import https from 'node:https';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { ensureRuntimeLayout, parseArgs, redact, writeJson } from './ami-dev-common.mjs';

const args = parseArgs();

function required(name) {
  const value = args.value(name);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`缺少必填参数 --${name}。`);
  return value.trim();
}

function positiveInteger(name) {
  const value = Number(required(name));
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} 必须为正整数。`);
  return value;
}

async function jsonRequest(url, init, expected = [200]) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const body = await response.json().catch(() => null);
  if (!expected.includes(response.status)) {
    throw new Error(`${url} 返回 HTTP ${response.status}：${JSON.stringify(body)?.slice(0, 500)}`);
  }
  return { status: response.status, body };
}

function submitAndDropResponse(urlValue, headers, payload) {
  return new Promise((resolvePromise, reject) => {
    const url = new URL(urlValue);
    const client = url.protocol === 'https:' ? https : http;
    let receivedHeaders = false;
    const request = client.request(
      url,
      {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      },
      (response) => {
        receivedHeaders = true;
        const evidence = {
          status: response.statusCode ?? null,
          headersReceived: true,
          bodyRead: false,
        };
        if ((response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300) {
          response.destroy();
          resolvePromise(evidence);
          return;
        }
        let errorBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          if (errorBody.length < 4096) errorBody += chunk;
        });
        response.on('end', () => resolvePromise({ ...evidence, bodyRead: true, errorBody }));
      },
    );
    request.setTimeout(30_000, () => request.destroy(new Error('response_loss_acceptance_timeout')));
    request.on('error', (error) => {
      if (!receivedHeaders) reject(error);
    });
    request.end(payload);
  });
}

async function main() {
  const apiBaseUrl = required('api-base-url').replace(/\/$/u, '');
  const username = required('username');
  const passwordEnv = args.value('password-env', 'AMI_ACCEPTANCE_PASSWORD');
  const password = process.env[passwordEnv]?.trim();
  if (!password) throw new Error(`缺少环境变量 ${passwordEnv}，拒绝从命令行接收密码。`);
  const customerId = positiveInteger('customer-id');
  const customerCardId = positiveInteger('customer-card-id');
  const projectId = positiveInteger('project-id');
  const beauticianId = positiveInteger('beautician-id');
  const operatorId = positiveInteger('operator-id');
  const idempotencyKey = args.value('idempotency-key')?.trim() || randomUUID();

  const login = await jsonRequest(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': randomUUID() },
    body: JSON.stringify({ username, password }),
  });
  if (!login.body?.token) throw new Error('登录响应缺少 token。');
  const authHeaders = { authorization: `Bearer ${login.body.token}` };
  const cardsUrl = `${apiBaseUrl}/api/terminal/customers/${customerId}/cards`;
  const beforeCards = await jsonRequest(cardsUrl, { headers: authHeaders });
  const before = beforeCards.body?.find?.((item) => item.id === customerCardId);
  if (!before || before.status !== 'active' || before.remainingTimes < 1) {
    throw new Error('目标客户卡不存在、未启用或次数不足。');
  }

  const payload = {
    customerId,
    customerCardId,
    projectId,
    beauticianId,
    operatorId,
    times: 1,
  };
  const requestHeaders = {
    ...authHeaders,
    'idempotency-key': idempotencyKey,
    'x-request-id': randomUUID(),
  };
  const lostResponse = await submitAndDropResponse(
    `${apiBaseUrl}/api/terminal/cards/consume`,
    requestHeaders,
    JSON.stringify(payload),
  );
  if (![200, 201].includes(lostResponse.status)) {
    throw new Error(`首次核销未成功提交：HTTP ${lostResponse.status} ${lostResponse.errorBody ?? ''}`);
  }

  const recovery = await jsonRequest(
    `${apiBaseUrl}/api/terminal/cards/consume`,
    {
      method: 'POST',
      headers: { ...requestHeaders, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
    [200, 201],
  );
  const afterCards = await jsonRequest(cardsUrl, { headers: authHeaders });
  const after = afterCards.body?.find?.((item) => item.id === customerCardId);
  const paths = ensureRuntimeLayout();
  const output = resolve(args.value('output', join(paths.reportsDir, `card-response-loss-${Date.now()}.json`)));
  if (recovery.body?.idempotencyStatus !== 'replayed' || !after || after.remainingTimes !== before.remainingTimes - 1) {
    const report = {
      schemaVersion: 'ami-card-response-loss-acceptance/v1',
      status: 'failed',
      generatedAt: new Date().toISOString(),
      target: { apiBaseUrl, customerId, customerCardId, projectId, beauticianId, operatorId },
      request: { idempotencyKey, times: 1 },
      evidence: {
        firstResponse: lostResponse,
        recoveredRecordId: recovery.body?.id ?? null,
        recoveryStatus: recovery.body?.idempotencyStatus ?? null,
        remainingTimes: { before: before.remainingTimes, after: after?.remainingTimes ?? null },
        deductedExactlyOnce: after ? before.remainingTimes - after.remainingTimes === 1 : false,
      },
      blocker: recovery.body?.idempotencyStatus !== 'replayed'
        ? 'same_key_recovery_not_replayed'
        : 'remaining_times_not_deducted_exactly_once',
    };
    writeJson(output, report);
    console.error(JSON.stringify({ status: report.status, output, blocker: report.blocker, evidence: report.evidence }, null, 2));
    process.exitCode = 1;
    return;
  }

  const replayAgain = await jsonRequest(
    `${apiBaseUrl}/api/terminal/cards/consume`,
    {
      method: 'POST',
      headers: { ...requestHeaders, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
    [200, 201],
  );
  if (replayAgain.body?.idempotencyStatus !== 'replayed' || replayAgain.body?.id !== recovery.body?.id) {
    throw new Error('二次同键请求未稳定回放同一核销记录。');
  }
  const finalCards = await jsonRequest(cardsUrl, { headers: authHeaders });
  const finalCard = finalCards.body?.find?.((item) => item.id === customerCardId);
  if (finalCard?.remainingTimes !== after.remainingTimes) throw new Error('二次回放导致重复扣减。');

  const report = {
    schemaVersion: 'ami-card-response-loss-acceptance/v1',
    status: 'passed',
    generatedAt: new Date().toISOString(),
    target: { apiBaseUrl, customerId, customerCardId, projectId, beauticianId, operatorId },
    request: { idempotencyKey, times: 1 },
    evidence: {
      firstResponse: lostResponse,
      recoveredRecordId: recovery.body.id,
      recoveryStatus: recovery.body.idempotencyStatus,
      repeatedRecoveryStatus: replayAgain.body.idempotencyStatus,
      remainingTimes: { before: before.remainingTimes, after: after.remainingTimes, final: finalCard.remainingTimes },
      deductedExactlyOnce: before.remainingTimes - finalCard.remainingTimes === 1,
    },
  };
  writeJson(output, report);
  console.log(JSON.stringify({ status: report.status, output, evidence: report.evidence }, null, 2));
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
