import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Ask Data Free SQL migration and grants', () => {
  it('creates the independent audit table', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260801020000_ask_data_free_sql/migration.sql'),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE "ask_data_free_sql_runs"');
    expect(sql).toContain('"status" TEXT NOT NULL');
    expect(sql).toContain('"storeId" INTEGER NOT NULL');
  });

  it('grants the read-only role only the 37 registered views', () => {
    const sql = readFileSync(resolve(process.cwd(), 'prisma/ask-data-free-sql-readonly-grants.template.sql'), 'utf8');
    expect(sql).toContain('ALTER ROLE ask_data_free_sql_readonly SET default_transaction_read_only = on');
    expect(sql).toContain('NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS');
    expect((sql.match(/^\s+NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;/gm) ?? []).length).toBe(1);
    expect(sql).toContain("ALTER ROLE ask_data_free_sql_readonly PASSWORD '<SET_LOCALLY>'");
    expect(sql).toContain('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public');
    expect(sql).toContain('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public');
    expect(sql).not.toContain('GRANT SELECT ON ALL TABLES');
    expect(sql).not.toContain('GRANT INSERT');
    expect((sql.match(/(?:agent_v3|ask_data)_[a-z_]+_view/g) ?? []).length).toBe(37);
  });

  it('keeps the deferred next-version discount/refund artifact free of sensitive internals and revokes readonly access', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260804190000_ask_data_discount_refund_governance/migration.sql'),
      'utf8',
    );
    expect(sql).toContain('CREATE VIEW ask_data_discount_refund_governance_view AS');
    expect(sql).toContain("THEN 'review_manual_source'");
    expect(sql).toContain("THEN 'review_unlinked_discount'");
    expect(sql).toContain('successful_refund_processing_hours');
    expect(sql).toContain('refund_after_completed_service');
    expect(sql).toContain('repurchased_within_7d');
    expect(sql).toContain('staff_attribution_status');
    expect(sql).toContain('GRANT SELECT ON ask_data_discount_refund_governance_view TO ask_data_free_sql_readonly');
    expect(sql).not.toContain('refund."reason"');
    expect(sql).not.toContain('orders."remark"');
    expect(sql).not.toContain('orders."discountPayload"');
    expect(sql).not.toContain('item."discountPayload"');
    expect(sql).not.toContain('approvalJson');

    const deferralSql = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260804193000_defer_ask_data_discount_refund_governance/migration.sql'),
      'utf8',
    );
    expect(deferralSql).toContain('REVOKE SELECT ON ask_data_discount_refund_governance_view FROM ask_data_free_sql_readonly');
    expect(deferralSql).not.toContain('DROP VIEW');
  });

  it('creates the Ask-only item contribution margin view with governed cost completeness', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260804170000_ask_data_item_margin/migration.sql'),
      'utf8',
    );
    expect(sql).toContain('CREATE VIEW ask_data_item_margin_view AS');
    expect(sql).toContain("'order_sale'::text AS event_type");
    expect(sql).toContain("'card_redemption'::text AS event_type");
    expect(sql).toContain("'refund'::text AS event_type");
    expect(sql).toContain("THEN 'cost_missing'");
    expect(sql).toContain("THEN 'bom_standard_estimate'");
    expect(sql).toContain("ELSE 'order_proportional_allocation'");
    expect(sql).toContain("movement.\"movementType\" = 'sale_return_in'");
    expect(sql).toContain('event.net_revenue - event.attributed_cost');
    expect(sql).toContain('GRANT SELECT ON ask_data_item_margin_view TO ask_data_free_sql_readonly');
    expect(sql).not.toContain('customer."phone"');
    expect(sql).not.toContain('refund."reason"');
    expect(sql).not.toContain('orders."remark"');
  });

  it('creates the Ask-only approved supplier quote and commercial terms view', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260804123000_ask_data_supplier_quote_terms/migration.sql'),
      'utf8',
    );
    expect(sql).toContain('CREATE VIEW ask_data_supplier_quote_terms_view AS');
    expect(sql).toContain('quote."auditStatus" = \'approved\'');
    expect(sql).toContain('mapping."mappingStatus" = \'active\'');
    expect(sql).toContain('alternative_supplier_count');
    expect(sql).toContain('lowest_current_quote_price');
    expect(sql).toContain('price_difference_from_lowest');
    expect(sql).toContain("GRANT SELECT ON ask_data_supplier_quote_terms_view TO ask_data_free_sql_readonly");
    expect(sql).not.toContain('supplier."phone"');
    expect(sql).not.toContain('supplier."email"');
    expect(sql).not.toContain('quote."rejectReason"');
  });

  it('keeps equal supplier prices on the same governed price rank', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260804124500_ask_data_supplier_quote_terms_rank_fix/migration.sql'),
      'utf8',
    );
    expect(sql).toContain('CREATE OR REPLACE VIEW ask_data_supplier_quote_terms_view AS');
    expect(sql).toContain('DENSE_RANK() OVER');
    expect(sql).toContain('ORDER BY quote.quote_price ASC');
    expect(sql).not.toContain('ORDER BY quote.quote_price ASC, quote.supplier_id ASC');
  });

  it('creates the Ask-only inventory turnover and procurement coverage view', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260804090000_ask_data_inventory_turnover/migration.sql'),
      'utf8',
    );
    expect(sql).toContain('CREATE VIEW ask_data_inventory_turnover_view AS');
    expect(sql).toContain('outbound_quantity_current_quarter');
    expect(sql).toContain('operational_turnover_ratio_30d');
    expect(sql).toContain("THEN 'low_turnover'");
    expect(sql).toContain("THEN 'below_safety_no_open_procurement'");
    expect(sql).toContain("'catalog_cost_estimated_not_batch_actual'::text AS cost_policy");
    expect(sql).toContain("IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ask_data_free_sql_readonly')");
    expect(sql).not.toContain('movement."remark"');
    expect(sql).not.toContain('procurement."items"');
  });

  it('creates nine independent Ask views and repairs the two stale marketing views', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260802090000_ask_data_free_sql_business_expansion/migration.sql'),
      'utf8',
    );
    expect((sql.match(/^CREATE VIEW ask_data_[a-z_]+_view AS/gm) ?? []).length).toBe(9);
    for (const viewName of [
      'ask_data_confirmed_profit_view',
      'ask_data_reconciliation_issue_view',
      'ask_data_member_liability_view',
      'ask_data_staff_capacity_view',
      'ask_data_transfer_status_view',
      'ask_data_bom_consumption_variance_view',
      'ask_data_customer_feedback_view',
      'ask_data_customer_lifecycle_view',
      'ask_data_marketing_roi_view',
    ]) {
      expect(sql).toContain(`CREATE VIEW ${viewName} AS`);
    }
    expect(sql).toContain('CREATE OR REPLACE VIEW agent_v3_marketing_activity_view');
    expect(sql).toContain('CREATE OR REPLACE VIEW agent_v3_promotion_offer_view');
    expect(sql).toContain("WHERE close.\"status\" = 'confirmed'");
    expect(sql).toContain("WHERE snapshot.\"status\" = 'confirmed'");
    expect(sql).toContain("WHEN effect.marketing_cost = 0 THEN NULL");
    expect(sql).toContain("ABS((calculated.actual_qty - calculated.standard_qty) / calculated.standard_qty) > 0.2");
    expect(sql).toContain('LEFT JOIN "Project" project ON project."id" = reservation."projectId"');
    expect(sql).not.toContain('feedback."content"');
    expect(sql).not.toContain('feedback."resolutionNote"');
    expect(sql).not.toContain('feedback."sourceChannel"');
    expect(sql).not.toContain('transfer."items"');
    expect(sql).not.toContain('issue."details"');
    expect(sql).not.toContain('issue."resolutionNote"');
    expect(sql).not.toContain('issue."actionPath"');
  });

  it('replaces the sensitive legacy customer profile in the Ask surface with a sanitized wrapper', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260802103000_ask_data_free_sql_customer_profile_hardening/migration.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('CREATE VIEW ask_data_customer_profile_summary_view AS');
    expect(sql).toContain('FROM agent_v3_customer_profile_summary_view profile');
    expect(sql).not.toContain('phone_last4');
    expect(sql).not.toContain('tags_summary');
  });

  it('keeps the reconciliation run key without exposing internal issue details', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260802110000_ask_data_free_sql_reconciliation_run_key/migration.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('issue."runId" AS run_id');
    expect(sql).not.toContain('issue."details"');
    expect(sql).not.toContain('issue."resolutionNote"');
    expect(sql).not.toContain('issue."actionPath"');
  });

  it('exposes staff settlement month as a real date through an Ask-only wrapper', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260802113000_ask_data_staff_performance_date_contract/migration.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('CREATE VIEW ask_data_staff_performance_view AS');
    expect(sql).toContain("TO_DATE(performance.settle_month || '-01', 'YYYY-MM-DD')");
    expect(sql).toContain('FROM agent_v3_staff_performance_view performance');
    expect(sql).toContain('GRANT SELECT ON ask_data_staff_performance_view TO ask_data_free_sql_readonly');
  });

  it('exposes operating-cost period month as a real date through an Ask-only wrapper', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260802114500_ask_data_operating_cost_date_contract/migration.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('CREATE VIEW ask_data_operating_cost_view AS');
    expect(sql).toContain("TO_DATE(cost.period_month || '-01', 'YYYY-MM-DD')");
    expect(sql).toContain('FROM agent_v3_operating_cost_view cost');
    expect(sql).toContain('GRANT SELECT ON ask_data_operating_cost_view TO ask_data_free_sql_readonly');
  });

  it('exposes service-task status as text so unknown literals cannot fail the query', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260802121500_ask_data_service_quality_status_contract/migration.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('DROP VIEW agent_v3_service_quality_view');
    expect(sql).toContain('st."status"::text AS status');
    expect(sql).toContain('GRANT SELECT ON agent_v3_service_quality_view TO ask_data_free_sql_readonly');
  });

  it('clamps invalid supplier delivery durations and removes duplicate self-store transfer perspectives', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260802123000_ask_data_supplier_transfer_quality_contract/migration.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('CREATE OR REPLACE VIEW agent_v3_supplier_performance_view');
    expect(sql).toContain('GREATEST(');
    expect(sql).toContain('CREATE OR REPLACE VIEW ask_data_transfer_status_view');
    expect(sql).toContain('WHERE transfer."fromStoreId" <> transfer."toStoreId"');
    expect(sql).toContain('GRANT SELECT ON agent_v3_supplier_performance_view, ask_data_transfer_status_view');
  });

  it('expands the Ask-only customer profile with governed behavior facts', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260802124500_ask_data_customer_behavior_profile/migration.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('CREATE OR REPLACE VIEW ask_data_customer_profile_summary_view');
    expect(sql).toContain('days_since_last_visit');
    expect(sql).toContain('average_return_interval_days');
    expect(sql).toContain('days_until_birthday');
    expect(sql).toContain('unused_card_count');
    expect(sql).toContain('customer_status');
    expect(sql).not.toContain('phone_last4');
    expect(sql).not.toContain('tags_summary');
    expect(sql).not.toContain('skinCondition');
    expect(sql).not.toContain('evidenceJson');
  });

  it('applies marketing automation time filters before aggregating task success', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260803143000_ask_data_marketing_automation_event_time/migration.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('CREATE OR REPLACE VIEW agent_v3_marketing_automation_view');
    expect(sql).toContain('1::integer AS task_count');
    expect(sql).toContain('task."createdAt"::timestamp without time zone AS latest_task_at');
    expect(sql).toContain('CASE WHEN task."completedAt" IS NULL THEN 0 ELSE 1 END::integer AS completed_count');
    expect(sql).not.toContain('MAX(task."createdAt")');
    expect(sql).not.toContain('GROUP BY');
    expect(sql).toContain('"TerminalFollowUpTask_storeId_createdAt_active_idx"');
    expect(sql).toContain('WHERE "deletedAt" IS NULL');
  });

  it('fails readiness when the independent audit table is missing', () => {
    const source = readFileSync(resolve(process.cwd(), 'prisma/ask-data-free-sql-readiness.ts'), 'utf8');
    expect(source).toContain('!auditTablePresent');
    expect(source).toContain("current_user === 'ask_data_free_sql_readonly'");
    expect(source).toContain("default_transaction_read_only === 'on'");
    expect(source).toContain("has_table_privilege(current_user, c.oid, 'INSERT')");
    expect(source).toContain("await client.query('BEGIN')");
  });

  it('isolates the Ask Data migration from the pending Ami Brain migration', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts/ask-data-free-sql-isolated-migration.mjs'), 'utf8');
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(source).toContain(
      "const TARGET_MIGRATION = '20260804170000_ask_data_item_margin'",
    );
    expect(source).toContain(
      "const EXCLUDED_BRAIN_MIGRATION = '20260801010000_brain_governance_tasks_and_gate_receipts'",
    );
    expect(source).toContain('const selectedMigrations = [TARGET_MIGRATION]');
    expect(source).toContain('!row.finished_at && !row.rolled_back_at');
    expect(source).toContain("if (apply && !confirmed)");
    expect(source).toContain('after.excludedBrainMigrationApplied !== before.excludedBrainMigrationApplied');
    expect(source).toContain("excludedBrainMigrationPolicy: 'preserve_existing_state'");
    expect(packageJson.scripts?.['ask-data:free-sql:migration:plan']).toContain(
      'ask-data-free-sql-isolated-migration.mjs',
    );
    expect(packageJson.scripts?.['ask-data:free-sql:migration:apply']).toContain('--apply --yes');
    expect(packageJson.scripts?.['ask-data:free-sql:role:apply-and-eval']).toContain('--run-live-eval');
    expect(packageJson.scripts?.['ask-data:free-sql:configure']).toContain('--write-env');
    expect(packageJson.scripts?.['ask-data:free-sql:api-acceptance']).toContain('--mode=execute');
    expect(packageJson.scripts?.['ask-data:free-sql:dev-admin:api-smoke']).toContain('--mode=development_admin');
    expect(packageJson.scripts?.['ask-data:free-sql:rollback-acceptance']).toContain('--mode=legacy');
  });

  it('provides an admin-side role preflight without requiring the read-only password', () => {
    const source = readFileSync(resolve(process.cwd(), 'prisma/ask-data-free-sql-role-preflight.ts'), 'utf8');
    expect(source).toContain("const roleName = 'ask_data_free_sql_readonly'");
    expect(source).toContain('has_table_privilege($1, $2, \'SELECT\')');
    expect(source).toContain("has_schema_privilege($1, 'public', 'CREATE')");
    expect(source).toContain('default_transaction_read_only=on');
    expect(source).toContain('writableTableCount');
  });

  it('requires a local password and explicit confirmation before provisioning the role', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'scripts/ask-data-free-sql-provision-readonly-role.mjs'),
      'utf8',
    );
    expect(source).toContain('ASK_DATA_FREE_SQL_READONLY_PASSWORD');
    expect(source).toContain("process.argv.includes('--apply')");
    expect(source).toContain("process.argv.includes('--yes')");
    expect(source).toContain('buildChildEnv(process.env, readonlyUrl.toString())');
    expect(source).toContain("process.argv.includes('--run-live-eval')");
    expect(source).toContain("process.argv.includes('--write-env')");
    expect(source).toContain('readHiddenLine');
    expect(source).toContain('writeManagedEnvFile');
    expect(source).toContain('printSafeFailure');
    expect(source).toContain('safeErrorMessage');
    expect(source).toContain('prisma/ask-data-free-sql-live-eval.ts');
    expect(source).not.toContain('console.log(readonlyUrl');
  });

  it('provides an authenticated API, permission, audit and rollback acceptance gate', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'scripts/ask-data-free-sql-api-acceptance.mjs'),
      'utf8',
    );
    expect(source).toContain('/ask-data/free-sql/catalog');
    expect(source).toContain("'/ask-data/free-sql'");
    expect(source).toContain('ordinary_user_debug_sql_visible');
    expect(source).toContain('cross_store_expected_403');
    expect(source).toContain('ask_data_free_sql_runs');
    expect(source).toContain("options.mode === 'legacy'");
    expect(source).toContain("options.mode === 'development_admin'");
    expect(source).not.toContain('console.log(token)');
  });

  it('provides a 37-view real SQL smoke gate for dedicated and development-admin connections', () => {
    const source = readFileSync(resolve(process.cwd(), 'prisma/ask-data-free-sql-view-smoke.ts'), 'utf8');
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(source).toContain('mapWithConcurrency(ASK_DATA_FREE_SQL_VIEWS, concurrency');
    expect(source).toContain('guard.inspect(sql, ASK_DATA_FREE_SQL_VIEWS');
    expect(source).toContain('await executor.execute');
    expect(source).toContain("item.status === 'success' || item.status === 'no_data'");
    expect(packageJson.scripts?.['ask-data:free-sql:dev-admin:view-smoke']).toContain(
      '--strict --allow-development-admin',
    );
  });
});
