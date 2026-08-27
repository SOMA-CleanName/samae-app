import assert from "node:assert/strict";
import test from "node:test";
import * as motion from "./search-copy.ts";

test("starts the border motion only from the idle state", () => {
  assert.equal(typeof motion.startSearchBorderMotion, "function");
  assert.equal(motion.startSearchBorderMotion("idle"), "running");
  assert.equal(motion.startSearchBorderMotion("running"), "running");
  assert.equal(motion.startSearchBorderMotion("done"), "done");
});

test("finishes a running border motion permanently for that component instance", () => {
  assert.equal(typeof motion.finishSearchBorderMotion, "function");
  assert.equal(motion.finishSearchBorderMotion("running"), "done");
  assert.equal(motion.finishSearchBorderMotion("idle"), "idle");
  assert.equal(motion.finishSearchBorderMotion("done"), "done");
});

test("anchors the border trace to the upper-left of the responsive outline", () => {
  assert.deepEqual(motion.getSearchBorderTraceRect(1, 6), {
    x: 1,
    y: 1,
    width: "calc(100% - 2px)",
    height: "calc(100% - 2px)",
    rx: 7,
    pathLength: 100,
  });
});

test("travels one full lap and arrives back at the upper-left corner", () => {
  const trace = motion.getSearchBorderTraceMotion(100, 14);

  assert.deepEqual(trace, {
    dashArray: "14 86",
    startDashOffset: 14,
    endDashOffset: -86,
  });
  assert.equal(trace.endDashOffset - trace.startDashOffset, -100);
});
