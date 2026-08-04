const DEFAULT_ASK_DATA_MODEL_MAX_CONCURRENCY = 3;
const MAX_ASK_DATA_MODEL_MAX_CONCURRENCY = 8;

type WaitingCall = (release: () => void) => void;

let activeCalls = 0;
const waitingCalls: WaitingCall[] = [];

export function acquireAskDataModelSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    waitingCalls.push(resolve);
    dispatchWaitingCalls();
  });
}

export function askDataModelMaxConcurrency() {
  const parsed = Number(process.env.ASK_DATA_FREE_SQL_MODEL_MAX_CONCURRENCY);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_ASK_DATA_MODEL_MAX_CONCURRENCY;
  return Math.min(Math.trunc(parsed), MAX_ASK_DATA_MODEL_MAX_CONCURRENCY);
}

function dispatchWaitingCalls() {
  const limit = askDataModelMaxConcurrency();
  while (activeCalls < limit && waitingCalls.length > 0) {
    const next = waitingCalls.shift();
    if (!next) return;
    activeCalls += 1;
    let released = false;
    next(() => {
      if (released) return;
      released = true;
      activeCalls = Math.max(activeCalls - 1, 0);
      dispatchWaitingCalls();
    });
  }
}
