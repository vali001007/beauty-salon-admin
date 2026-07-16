import { Pool } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describePostgres = process.env.RUN_BRAIN_REGENERATION_DB_TESTS === 'true' && databaseUrl ? describe : describe.skip;

describePostgres('Brain capability regeneration PostgreSQL clock fencing', () => {
  let pool: Pool;

  beforeAll(() => { pool = new Pool({ connectionString: databaseUrl, max: 1 }); });
  afterAll(async () => { await pool.end(); });

  it('uses PostgreSQL NOW when the application clock is far ahead', async () => {
    const client = await pool.connect();
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 24 * 60 * 60 * 1000);
    try {
      await client.query('CREATE TEMP TABLE brain_regen_clock_test (id integer primary key, status text, owner text, leased_at timestamptz, expires_at timestamptz)');
      await client.query("INSERT INTO brain_regen_clock_test VALUES (1, 'leased', 'worker-a', NOW(), NOW() + INTERVAL '5 minutes')");
      const renewed = await client.query("UPDATE brain_regen_clock_test SET expires_at = NOW() + INTERVAL '5 minutes' WHERE id = 1 AND status = 'leased' AND owner = 'worker-a' AND expires_at > NOW() RETURNING id");
      expect(renewed.rowCount).toBe(1);
    } finally {
      dateSpy.mockRestore();
      client.release();
    }
  });
});
