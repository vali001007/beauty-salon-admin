-- Product decision: defer the discount/refund governance capability to the
-- next Ami Ask iteration. Keep the already-created development view so the
-- shared migration history remains non-destructive, but remove dedicated
-- read-only role access until the capability is reviewed and registered.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ask_data_free_sql_readonly') THEN
    REVOKE SELECT ON ask_data_discount_refund_governance_view FROM ask_data_free_sql_readonly;
  END IF;
END
$$;
