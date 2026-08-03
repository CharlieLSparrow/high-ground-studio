import type {
  TranscriptEvaluationCoverage,
  TranscriptEvaluationProviderReport,
  TranscriptEvaluationReport,
  TranscriptEvaluationThresholdStatus,
  TranscriptEvaluationWorkloadProviderReport,
} from "./transcript-evaluation.js";

export function renderTranscriptEvaluationReportHtml(
  report: TranscriptEvaluationReport,
): string {
  const workloadSections = report.workloads.map((workload) => `
    <section class="panel" aria-labelledby="${workload.workload}-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">${escapeHtml(workload.workload)} evidence</p>
          <h2 id="${workload.workload}-title">${titleCase(workload.workload)}</h2>
        </div>
        ${statusBadge(workload.coverage.complete ? "pass" : "insufficient-evidence", workload.coverage.complete ? "Coverage complete" : "Coverage incomplete")}
      </div>
      ${coverageMarkup(workload.coverage)}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Provider</th><th>Evidence</th><th>Clean WER</th><th>Difficult WER</th><th>Speaker error</th><th>Result</th></tr></thead>
          <tbody>${workload.providers.map(providerRow).join("") || '<tr><td colspan="6">No provider candidates recorded.</td></tr>'}</tbody>
        </table>
      </div>
      ${workload.providers.map(providerEvidenceDetails).join("")}
    </section>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly transcript evidence · ${escapeHtml(report.corpusId)}</title>
  <style>
    :root { color-scheme: light dark; --bg:#f3f1eb; --panel:#fffdf8; --ink:#17211d; --muted:#65716b; --line:#d9ded9; --brand:#126b4d; --pass:#19734e; --fail:#a33a32; --wait:#8b5d08; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    main { width:min(1180px,calc(100% - 32px)); margin:0 auto; padding:48px 0 72px; }
    h1,h2,h3,p { margin-top:0; } h1 { max-width:760px; font-size:clamp(2rem,6vw,4.5rem); line-height:.95; letter-spacing:-.05em; margin-bottom:20px; }
    h2 { font-size:1.7rem; margin:0; } h3 { font-size:1rem; margin-bottom:8px; }
    .hero { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(260px,.7fr); gap:28px; align-items:end; margin-bottom:32px; }
    .eyebrow { color:var(--brand); font-weight:800; letter-spacing:.12em; text-transform:uppercase; font-size:.75rem; margin-bottom:8px; }
    .lede,.muted { color:var(--muted); } .lede { max-width:720px; font-size:1.05rem; }
    .panel,.summary { background:var(--panel); border:1px solid var(--line); border-radius:22px; box-shadow:0 12px 36px rgba(20,35,28,.06); }
    .panel { padding:28px; margin-top:20px; } .summary { padding:20px; }
    .summary dl { display:grid; grid-template-columns:1fr auto; gap:8px 16px; margin:0; } dt { color:var(--muted); } dd { margin:0; font-weight:750; text-align:right; }
    .section-heading { display:flex; justify-content:space-between; gap:20px; align-items:center; margin-bottom:22px; }
    .badge { display:inline-flex; align-items:center; border-radius:999px; padding:5px 10px; font-size:.78rem; font-weight:800; white-space:nowrap; }
    .badge.pass { background:#dff3e8; color:var(--pass); } .badge.fail { background:#f9dfdc; color:var(--fail); } .badge.insufficient-evidence { background:#faedce; color:var(--wait); }
    .coverage { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-bottom:22px; }
    .coverage > div,.evidence { border:1px solid var(--line); border-radius:14px; padding:14px; }
    .condition-list { display:flex; flex-wrap:wrap; gap:7px; margin-top:8px; }
    .condition { padding:3px 8px; border-radius:8px; background:color-mix(in srgb,var(--brand) 9%,transparent); font-size:.78rem; }
    .condition.missing { color:var(--wait); background:color-mix(in srgb,var(--wait) 12%,transparent); }
    .table-wrap { overflow:auto; } table { width:100%; border-collapse:collapse; min-width:760px; } th,td { padding:13px 10px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; } th { color:var(--muted); font-size:.75rem; text-transform:uppercase; letter-spacing:.06em; }
    .provider { font-weight:800; } .provider small { display:block; color:var(--muted); font-weight:500; }
    .metric { font-variant-numeric:tabular-nums; } .evidence { margin-top:14px; } .evidence summary { cursor:pointer; font-weight:800; }
    .evidence-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin-top:14px; }
    code { overflow-wrap:anywhere; } footer { margin-top:24px; color:var(--muted); font-size:.85rem; }
    @media (prefers-color-scheme:dark) { :root { --bg:#101512; --panel:#171e1a; --ink:#edf4ef; --muted:#a8b4ad; --line:#344139; --brand:#71d3ac; } .badge.pass { background:#173c2c; } .badge.fail { background:#482422; } .badge.insufficient-evidence { background:#463816; } }
    @media (max-width:760px) { main { width:min(100% - 20px,1180px); padding-top:28px; } .hero,.coverage,.evidence-grid { grid-template-columns:1fr; } .panel { padding:19px; border-radius:17px; } .section-heading { align-items:flex-start; flex-direction:column; } }
  </style>
</head>
<body><main>
  <header class="hero">
    <div><p class="eyebrow">Quipsly private evaluation</p><h1>Transcript evidence, without the blended-score illusion.</h1><p class="lede">Podcast and coaching quality are reviewed separately. Missing conditions and unsupported capabilities stay visible; this report never chooses a universal winner.</p></div>
    <aside class="summary" aria-label="Report summary"><dl><dt>Corpus</dt><dd>${escapeHtml(report.corpusId)}</dd><dt>Revision</dt><dd>${escapeHtml(report.corpusRevisionId)}</dd><dt>Windows</dt><dd>${report.windowCount}</dd><dt>Generated</dt><dd>${escapeHtml(formatDate(report.generatedAt))}</dd><dt>Overall coverage</dt><dd>${statusBadge(report.coverage.complete ? "pass" : "insufficient-evidence", report.coverage.complete ? "Complete" : "Incomplete")}</dd></dl></aside>
  </header>
  ${workloadSections}
  <section class="panel"><p class="eyebrow">Decision boundary</p><h2>Human release decision still required</h2><p class="muted">Accuracy thresholds are only one gate. Review correction effort, latency, cost, provider policy, failure recovery, physical-device evidence, and full-session dogfood before changing a production default.</p></section>
  <footer>${escapeHtml(report.interpretation.privacy)} Consent receipt: <code>${escapeHtml(shortHash(report.consentReceiptSha256))}</code>.</footer>
</main></body></html>\n`;
}

function coverageMarkup(coverage: TranscriptEvaluationCoverage) {
  return `<div class="coverage">
    <div><h3>Present conditions</h3><div class="condition-list">${coverage.presentConditions.map((condition) => `<span class="condition">${escapeHtml(condition)}</span>`).join("") || '<span class="muted">None</span>'}</div></div>
    <div><h3>Missing conditions</h3><div class="condition-list">${coverage.missingConditions.map((condition) => `<span class="condition missing">${escapeHtml(condition)}</span>`).join("") || '<span class="muted">None</span>'}</div></div>
    <div><h3>Coverage accounting</h3><p class="muted">${coverage.windowCount} windows · ${coverage.presentConditions.length}/${coverage.requiredConditions.length} required conditions</p></div>
  </div>`;
}

function providerRow(provider: TranscriptEvaluationWorkloadProviderReport) {
  return `<tr>
    <td class="provider">${escapeHtml(provider.providerName)}<small>${escapeHtml(provider.model)} · ${escapeHtml(provider.adapterVersion)}</small></td>
    <td>${provider.succeededWindowCount}/${provider.expectedWindowCount} succeeded${provider.failedWindowCount ? ` · ${provider.failedWindowCount} failed` : ""}${provider.missingCandidateWindowCount ? ` · ${provider.missingCandidateWindowCount} missing` : ""}</td>
    <td class="metric">${metric(provider.cleanWordMetrics?.wordErrorRate)}</td>
    <td class="metric">${metric(provider.difficultWordMetrics?.wordErrorRate)}</td>
    <td class="metric">${metric(provider.speakerMetrics?.speakerErrorRate)}</td>
    <td>${statusBadge(provider.thresholdAssessment.status, titleCase(provider.thresholdAssessment.status))}</td>
  </tr>`;
}

function providerEvidenceDetails(provider: TranscriptEvaluationWorkloadProviderReport) {
  return `<details class="evidence"><summary>${escapeHtml(provider.providerName)} evidence boundary</summary><div class="evidence-grid">
    <div><h3>Capabilities</h3><p class="muted">Speaker: ${escapeHtml(provider.speakerAttribution)}<br>Timing: ${escapeHtml(provider.timingGranularity)}</p></div>
    <div><h3>Operations</h3><p class="muted">RTF: ${provider.realTimeFactor == null ? "Unavailable" : provider.realTimeFactor.toFixed(2)}<br>Observed cost: ${money(provider)}<br>Correction passes: ${provider.correctionObservationCount}</p></div>
    <div><h3>Threshold notes</h3><div class="condition-list">${provider.thresholdAssessment.reasons.map((reason) => `<span class="condition missing">${escapeHtml(reason)}</span>`).join("") || '<span class="condition">All required quantitative bars passed</span>'}</div></div>
  </div></details>`;
}

function statusBadge(status: TranscriptEvaluationThresholdStatus, label: string) {
  return `<span class="badge ${status}">${escapeHtml(label)}</span>`;
}

function metric(value: number | null | undefined) {
  return value == null ? "Unavailable" : `${(value * 100).toFixed(2)}%`;
}

function money(provider: TranscriptEvaluationProviderReport) {
  return provider.estimatedCostUsd == null ? "Unavailable" : `$${provider.estimatedCostUsd.toFixed(4)}`;
}

function shortHash(value: string) { return `${value.slice(0, 12)}…`; }
function titleCase(value: string) { return value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)); }
function escapeHtml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
