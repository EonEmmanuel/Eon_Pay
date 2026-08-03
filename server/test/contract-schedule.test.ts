import assert from "node:assert/strict";
import test from "node:test";
import { distribute, scheduleDate } from "../src/contracts/contracts.service.js";

test("distribute preserves totals and assigns at most one unit of remainder", () => {
  const parts = distribute(100, 6);
  assert.equal(
    parts.reduce((sum, part) => sum + part, 0),
    100,
  );
  assert.deepEqual(parts, [17, 17, 17, 17, 16, 16]);
});

test("weekly and biweekly dates are deterministic", () => {
  assert.equal(scheduleDate("2026-01-01", "weekly", 3), "2026-01-22");
  assert.equal(scheduleDate("2026-01-01", "biweekly", 2), "2026-01-29");
});

test("monthly schedules clamp to the last valid calendar day", () => {
  assert.equal(scheduleDate("2026-01-31", "monthly", 1), "2026-02-28");
  assert.equal(scheduleDate("2028-01-31", "monthly", 1), "2028-02-29");
  assert.equal(scheduleDate("2026-01-31", "monthly", 2), "2026-03-31");
});
