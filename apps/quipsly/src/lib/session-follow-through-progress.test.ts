import { sessionFollowThroughProgress as progress } from "./session-follow-through-progress";

test("no job is not falsely presented as processing unless work was requested", () => {
  expect(progress(null, true)).toBeNull();
  expect(progress(null, true, true)).toMatchObject({ state: "PROCESSING", canRetry: false });
});
test.each(["queued", "running", "completed"])("%s remains background work, not a user chore", status => {
  expect(progress({ status, attemptCount: 1, errorCode: null }, true))
    .toMatchObject({ state: "PROCESSING", canRetry: false });
});
test("materialized work is ready unless a fresh upgrade is requested", () => {
  const state = { status: "materialized", attemptCount: 1, errorCode: null };
  expect(progress(state, true)).toMatchObject({ state: "READY", canRetry: false });
  expect(progress(state, true, true)).toMatchObject({ state: "PROCESSING", canRetry: false });
});
test("automatic retries stay automatic; exhausted retries need one deliberate action", () => {
  const state = { status: "failed", attemptCount: 2, errorCode: "PROVIDER_UNAVAILABLE" };
  expect(progress(state, true)).toMatchObject({ state: "RETRYING", canRetry: false });
  state.attemptCount = 3;
  expect(progress(state, true)).toMatchObject({ state: "FAILED", canRetry: true });
  expect(progress(state, false)).toMatchObject({ state: "FAILED", canRetry: false });
});
test.each(["INPUT_TOO_LARGE", "INVALID_SOURCE"])("%s does not offer a futile retry", errorCode => {
  expect(progress({ status: "failed", attemptCount: 1, errorCode }, true)).toMatchObject({ state: "FAILED", canRetry: false });
});
test("private provider diagnostics never become user-facing status", () => {
  const result = progress({ status: "failed", attemptCount: 3, errorCode: "secret private diagnostic" }, true);
  expect(JSON.stringify(result)).not.toContain("secret");
});
