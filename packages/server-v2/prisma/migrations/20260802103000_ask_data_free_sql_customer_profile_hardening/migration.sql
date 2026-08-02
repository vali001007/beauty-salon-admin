-- Keep Ami Ask customer details limited to ID plus masked name. The legacy
-- Agent view remains intact for backwards compatibility, but is no longer
-- registered or granted to the Ask read-only role.
CREATE VIEW ask_data_customer_profile_summary_view AS
SELECT
  profile.store_id,
  profile.store_name,
  profile.customer_id,
  profile.customer_name_masked,
  profile.member_level,
  profile.last_visit_at,
  profile.last_order_at,
  profile.total_paid_amount,
  profile.order_count
FROM agent_v3_customer_profile_summary_view profile;
