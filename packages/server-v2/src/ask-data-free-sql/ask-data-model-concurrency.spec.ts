import { acquireAskDataModelSlot, askDataModelMaxConcurrency } from './ask-data-model-concurrency.js';

describe('Ami Ask model concurrency protection', () => {
  const originalLimit = process.env.ASK_DATA_FREE_SQL_MODEL_MAX_CONCURRENCY;

  afterEach(() => {
    if (originalLimit === undefined) delete process.env.ASK_DATA_FREE_SQL_MODEL_MAX_CONCURRENCY;
    else process.env.ASK_DATA_FREE_SQL_MODEL_MAX_CONCURRENCY = originalLimit;
  });

  it('defaults to three model calls and clamps unsafe configuration values', () => {
    delete process.env.ASK_DATA_FREE_SQL_MODEL_MAX_CONCURRENCY;
    expect(askDataModelMaxConcurrency()).toBe(3);

    process.env.ASK_DATA_FREE_SQL_MODEL_MAX_CONCURRENCY = '0';
    expect(askDataModelMaxConcurrency()).toBe(3);

    process.env.ASK_DATA_FREE_SQL_MODEL_MAX_CONCURRENCY = '99';
    expect(askDataModelMaxConcurrency()).toBe(8);
  });

  it('queues excess Ask model calls until the active call releases its slot', async () => {
    process.env.ASK_DATA_FREE_SQL_MODEL_MAX_CONCURRENCY = '1';

    const firstRelease = await acquireAskDataModelSlot();
    let secondAcquired = false;
    const secondSlot = acquireAskDataModelSlot().then((release) => {
      secondAcquired = true;
      return release;
    });

    await Promise.resolve();
    expect(secondAcquired).toBe(false);

    firstRelease();
    const secondRelease = await secondSlot;
    expect(secondAcquired).toBe(true);
    secondRelease();
  });
});
