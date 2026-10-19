import test from "node:test";
import assert from "node:assert/strict";
import { allowedActions, assignmentRule, nextRoundRobin, procurementCheck, transition } from "../src/lib/workflow/interior.ts";

test("round robin cycles and wraps", () => {
  assert.equal(nextRoundRobin([3, 1, 2], null), 1);
  assert.equal(nextRoundRobin([3, 1, 2], 1), 2);
  assert.equal(nextRoundRobin([3, 1, 2], 3), 1);
  assert.equal(nextRoundRobin([], 1), null);
});
test("assignment rules per source", () => {
  assert.equal(assignmentRule("meta"), "round_robin");
  assert.equal(assignmentRule("walkin"), "creator");
  assert.equal(assignmentRule("other"), "manager_assigns");
});
test("estimate needs manager approval before client", () => {
  assert.throws(() => transition("estimate_draft", "send_to_client", ["sales_manager"]));
  assert.equal(transition("estimate_manager_review", "approve", ["manager"]), "estimate_approved");
  assert.equal(transition("estimate_manager_review", "reject", ["manager"]), "estimate_draft");
});
test("sales cannot approve own estimate or start work", () => {
  assert.equal(allowedActions("estimate_manager_review", ["sales_manager"]).length, 0);
  assert.throws(() => transition("awaiting_advance", "verify_payment", ["sales_manager"]));
  assert.equal(allowedActions("payment_verification", ["project_manager"]).length, 0);
});
test("work starts only after accounts verify advance", () => {
  assert.equal(transition("payment_verification", "verify_payment", ["accounts"]), "work_started");
});
test("procurement over estimate is flagged", () => {
  assert.equal(procurementCheck(100, 100), "ok");
  assert.equal(procurementCheck(101, 100), "needs_manager_approval");
});
