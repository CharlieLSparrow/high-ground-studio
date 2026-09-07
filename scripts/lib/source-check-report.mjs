// Static source checks are partial evidence, not runtime acceptance.
export function createSourceCheckReport() {
  const checks = [];
  return {
    checks,
    assert(condition, message, details = {}, label = details.label ?? message) {
      checks.push({ status: condition ? "pass" : "fail", label, message, details });
    },
    summary() {
      const failures = checks.filter((check) => check.status === "fail");
      return {
        ok: checks.length > 0 && failures.length === 0,
        checkCount: checks.length,
        statusCounts: { pass: checks.length - failures.length, fail: failures.length },
        failures,
      };
    },
  };
}
