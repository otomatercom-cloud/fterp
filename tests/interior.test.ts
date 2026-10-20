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
test("procurement must confirm availability and costing before manager review", () => {
  assert.equal(transition("estimate_draft", "submit_to_procurement", ["sales_manager"]), "procurement_check");
  assert.equal(transition("procurement_check", "confirm_costing", ["procurement"]), "estimate_manager_review");
  assert.equal(transition("procurement_check", "return_to_sales", ["procurement"]), "estimate_draft");
  assert.throws(() => transition("procurement_check", "confirm_costing", ["sales_manager"]));
  assert.throws(() => transition("estimate_draft", "approve", ["manager"]));
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
test("handover only by PM, sign-off by sales or manager", () => {
  assert.equal(transition("work_started", "complete_work", ["project_manager"]), "handover");
  assert.throws(() => transition("work_started", "complete_work", ["sales_manager"]));
  assert.equal(transition("handover", "confirm_handover", ["sales_manager"]), "completed");
  assert.throws(() => transition("handover", "confirm_handover", ["project_manager"]));
});
import { tasksDomain, rolesFromGroups } from "../src/lib/workflow/roles.ts";
test("tasks domain scopes sales manager and PM to their own leads", () => {
  const d = JSON.stringify(tasksDomain(["sales_manager"], 7));
  assert.ok(d.includes('"user_id","=",7'));
  assert.deepEqual(rolesFromGroups(["otm_ft_pipeline.group_ft_accounts"]), ["accounts"]);
  assert.equal(JSON.stringify(tasksDomain([], 1)), '[["id","=",0]]');
});
