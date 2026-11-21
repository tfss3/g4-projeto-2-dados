import test from "node:test";
import assert from "node:assert/strict";
import { fieldTrend } from "../ui/field-overview.mjs";

test("tendência de campo exige amostra mínima e ciclos consecutivos", () => {
  const row = (name, idv, examined = 10) => ({ name, idv, examined });
  assert.equal(fieldTrend([row(1, 20), row(2, 10)]).change, -50);
  assert.equal(fieldTrend([row(1, 20), row(3, 10)]).change, null);
  assert.equal(fieldTrend([row(1, 0), row(2, 10)]).change, null);
  assert.equal(fieldTrend([row(1, 20), row(2, 10, 9)]).change, null);
  assert.deepEqual(
    fieldTrend(Array.from({ length: 8 }, (_, i) => row(i + 1, 10))).series.map(
      (row) => row.name,
    ),
    [3, 4, 5, 6, 7, 8],
  );
});
