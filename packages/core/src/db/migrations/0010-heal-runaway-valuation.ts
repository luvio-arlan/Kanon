export const KANON_HEAL_RUNAWAY_VALUATION_SQL = `
UPDATE valuation_scenarios AS v
SET
  bear_eps = ROUND((GREATEST(0.5, LEAST(t.current_price, 1000000) / 22.0 * 0.9))::numeric, 2)::double precision,
  bear_pe = 17,
  base_eps = ROUND((GREATEST(0.8, LEAST(t.current_price, 1000000) / 22.0 * 1.38))::numeric, 2)::double precision,
  base_pe = 22,
  bull_eps = ROUND((GREATEST(1.2, LEAST(t.current_price, 1000000) / 22.0 * 1.8))::numeric, 2)::double precision,
  bull_pe = 27
FROM theses AS t
WHERE v.thesis_id = t.id
  AND (
    NOT (v.bear_eps > 0 AND v.bear_eps <= 100000)
    OR NOT (v.base_eps > 0 AND v.base_eps <= 100000)
    OR NOT (v.bull_eps > 0 AND v.bull_eps <= 100000)
    OR NOT (v.bear_pe > 0 AND v.bear_pe <= 500)
    OR NOT (v.base_pe > 0 AND v.base_pe <= 500)
    OR NOT (v.bull_pe > 0 AND v.bull_pe <= 500)
  );
`;
