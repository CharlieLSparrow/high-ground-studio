#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import {
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import { validateResearchBundle } from "../apps/quipsly/src/lib/research-portability.ts";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-product";
const OWNER_EMAIL = "quipsly-media-ms8ct81g@example.test";
const SOURCE_PROJECT_SLUG = "quipsly-local-dogfood";
const SOURCE_PROJECT_NAME = "High Ground real-work dogfood";
const TARGET_PROJECT_SLUG = "qa-retained-build-20-portable-recovery";
const SOURCE_TITLE = "High Ground Odyssey TestFlight rehearsal";
const EXACT_QUOTE = "Never edit that receipt to make a human or physical gate green.";
const TAG_LABEL = "Episode sync";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireLocalDatabase(value) {
  const url = new URL(String(value || ""));
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Retained research operation refuses non-local databases.",
  );
  return url.toString();
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stamp() {
  return new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
}

async function loadFixture(prisma) {
  const [actor, sourceProject, targetProject] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { primaryEmail: OWNER_EMAIL }, select: { id: true } }),
    prisma.studioProject.findFirstOrThrow({
      where: { slug: SOURCE_PROJECT_SLUG },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, name: true },
    }),
    prisma.studioProject.findFirstOrThrow({
      where: { slug: TARGET_PROJECT_SLUG },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, name: true },
    }),
  ]);
  const [sourceGrant, targetGrant, source] = await Promise.all([
    prisma.studioProjectAccessGrant.findUnique({
      where: { projectId_email: { projectId: sourceProject.id, email: OWNER_EMAIL } },
      select: { role: true, status: true },
    }),
    prisma.studioProjectAccessGrant.findUnique({
      where: { projectId_email: { projectId: targetProject.id, email: OWNER_EMAIL } },
      select: { role: true, status: true },
    }),
    prisma.studioSourceUnit.findFirstOrThrow({
      where: { projectId: sourceProject.id, title: SOURCE_TITLE },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, immutableText: true, updatedAt: true },
    }),
  ]);
  for (const [label, grant] of [["source", sourceGrant], ["target", targetGrant]]) {
    assert(grant?.status === "ACTIVE" && ["OWNER", "EDITOR"].includes(grant.role), `Retained owner lacks writable ${label} access.`);
  }
  assert(source.immutableText?.includes(EXACT_QUOTE), "The retained source lost the exact acceptance quote.");
  return {
    actor,
    sourceProject,
    targetProject,
    source,
    sourceSha256: sha256(source.immutableText),
    sourceUpdatedAt: source.updatedAt.toISOString(),
  };
}

async function selectExactQuote(page, sourceId, quote) {
  const selected = await page.evaluate(({ sourceId: requestedId, quote: requestedQuote }) => {
    const root = document.querySelector(`#research-source-${CSS.escape(requestedId)} section[aria-label^="Source text for "] div[tabindex="0"]`);
    if (!(root instanceof HTMLElement)) return { ok: false, reason: "source-text-missing" };
    const textNode = [...root.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes(requestedQuote));
    if (!textNode?.textContent) return { ok: false, reason: "quote-text-node-missing" };
    const start = textNode.textContent.indexOf(requestedQuote);
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + requestedQuote.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    root.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return { ok: selection?.toString() === requestedQuote, selectedText: selection?.toString() };
  }, { sourceId, quote });
  assert(selected.ok && selected.selectedText === quote, `Rendered source selection failed (${selected.reason || "unknown"}).`);
}

async function operateOwner({ browser, baseURL, fixture, artifactDirectory, annotationBody, responseBody }) {
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: OWNER_EMAIL });
  assert(password, "The retained media operator has no Keychain password.");
  const identity = { role: "research-owner", email: OWNER_EMAIL };
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    const researchPath = `/research?source=${encodeURIComponent(fixture.source.id)}`;
    await signInThroughRenderedLogin({ page, baseURL, identity, password, callbackPath: researchPath });
    await page.getByRole("heading", { name: "Evidence, with its receipts.", exact: true }).waitFor({ timeout: 25_000 });
    const sourceCard = page.locator(`#research-source-${fixture.source.id}`);
    await sourceCard.getByRole("heading", { name: SOURCE_TITLE, exact: true }).waitFor();

    await selectExactQuote(page, fixture.source.id, EXACT_QUOTE);
    const composer = sourceCard.locator('section[aria-label="Annotation composer"]');
    const composerCount = await composer.count();
    assert(composerCount === 1, `Expected one annotation composer, found ${composerCount}.`);
    await composer.getByLabel("Annotation purpose", { exact: true }).selectOption("idea");
    await composer.getByLabel("Annotation visibility", { exact: true }).selectOption("private");
    await composer.getByLabel("Note", { exact: true }).fill(annotationBody);
    const tagButton = composer.getByRole("button", { name: TAG_LABEL, exact: true });
    assert(await tagButton.count() === 1, `Expected the canonical ${TAG_LABEL} tag once.`);
    await tagButton.click();
    const saveAnnotation = composer.getByRole("button", { name: "Save source-linked annotation", exact: true });
    assert(await saveAnnotation.count() === 1 && await saveAnnotation.isEnabled(), "Source-linked annotation did not become saveable.");
    await saveAnnotation.click();
    await composer.getByText("Annotation saved with its source anchor.", { exact: true }).waitFor({ timeout: 25_000 });
    const annotationText = sourceCard.getByText(annotationBody, { exact: true });
    await annotationText.waitFor({ timeout: 25_000 });
    const annotationCard = annotationText.locator("xpath=ancestor::article[1]");
    await annotationCard.screenshot({ path: path.join(artifactDirectory, "owner-private-annotation.png") });

    const startDraft = annotationCard.getByRole("button", { name: "Start private draft with this evidence", exact: true });
    assert(await startDraft.count() === 1, "The saved annotation did not expose its private writing handoff.");
    await startDraft.click();
    await page.waitForURL((url) => url.pathname === "/create" && Boolean(url.searchParams.get("document")), { timeout: 25_000 });
    const writingURL = new URL(page.url());
    const documentId = writingURL.searchParams.get("document");
    assert(documentId, "The private writing handoff lost its canonical document identity.");
    const editableBlocks = page.locator('textarea[aria-label^="Editor block "]');
    const editableBlockCount = await editableBlocks.count();
    assert(editableBlockCount === 1, `Expected one editable response block beside immutable evidence, found ${editableBlockCount}.`);
    const saveStatus = page.getByTestId("document-save-status");
    await editableBlocks.fill(responseBody);
    await saveStatus.filter({ hasText: /Unsaved edits|Saving/ }).waitFor({ timeout: 10_000 });
    await editableBlocks.press("Tab");
    await saveStatus.getByText("Saved", { exact: true }).waitFor({ timeout: 25_000 });
    await page.screenshot({ path: path.join(artifactDirectory, "owner-private-writing.png"), fullPage: true });

    await page.goto(`${baseURL}${researchPath}`, { waitUntil: "load" });
    await page.getByRole("heading", { name: "Portable research", exact: true }).waitFor();
    const exportLink = page.locator(`a[href="/api/research/export?project=${SOURCE_PROJECT_SLUG}"]`);
    assert(await exportLink.count() === 1, "The exact source Nest export control was not unique.");
    const downloadPromise = page.waitForEvent("download");
    await exportLink.click();
    const download = await downloadPromise;
    const downloadPath = path.join(artifactDirectory, `quipsly-${SOURCE_PROJECT_SLUG}-research.json`);
    await download.saveAs(downloadPath);
    const bundleText = await readFile(downloadPath, "utf8");
    const validation = validateResearchBundle(JSON.parse(bundleText));
    assert(validation.ok, `Downloaded research bundle failed validation: ${validation.error || "unknown"}.`);
    const bundle = validation.bundle;
    const exportedAnnotation = bundle.annotations.find((annotation) => annotation.body === annotationBody);
    assert(exportedAnnotation, "The owner-scoped export omitted the new private annotation.");
    const exportedUse = bundle.writingUses.find((use) => use.annotationId === exportedAnnotation.id);
    assert(exportedUse, "The owner-scoped export omitted the evidence-to-writing link.");
    assert(bundle.writingTargets.some((target) => target.useId === exportedUse.id && target.responseBlock?.body === responseBody), "The owner-scoped export omitted the exact private writing response snapshot.");

    const restore = page.locator('[aria-label="Restore portable research"]');
    assert(await restore.count() === 1, "The rendered restore surface was not unique.");
    await restore.getByLabel("Restore destination Nest", { exact: true }).selectOption(TARGET_PROJECT_SLUG);
    const fileInput = restore.locator('input[type="file"]');
    assert(await fileInput.count() === 1, "The restore file input was not unique.");
    await fileInput.setInputFiles(downloadPath);
    await restore.getByText("Bundle loaded locally. Validate it before Quipsly offers a restore.", { exact: true }).waitFor();
    const validate = restore.getByRole("button", { name: "Validate restore plan", exact: true });
    await validate.click();
    await restore.getByText("Integrity and destination checks passed. Review the no-overwrite plan before applying it.", { exact: true }).waitFor({ timeout: 25_000 });
    let planText = await restore.getByText("Verified no-overwrite plan", { exact: true }).locator("xpath=ancestor::div[1]").innerText();
    assert(planText.includes("0 overwrites · 0 source mutations"), "The first rendered restore plan allowed an overwrite or source mutation.");
    const applyRestore = restore.getByRole("button", { name: "Apply verified restore", exact: true });
    assert(await applyRestore.count() === 1 && await applyRestore.isEnabled(), "The verified restore did not become applicable.");
    await applyRestore.click();
    await restore.getByText(/Research and eligible writing excerpts restored privately\./).waitFor({ timeout: 25_000 });

    await validate.click();
    await restore.getByText("Integrity and destination checks passed. Review the no-overwrite plan before applying it.", { exact: true }).waitFor({ timeout: 25_000 });
    planText = await restore.getByText("Verified no-overwrite plan", { exact: true }).locator("xpath=ancestor::div[1]").innerText();
    for (const expected of [
      "0 sources created",
      "0 annotations created",
      "0 private writing excerpt documents created",
      "0 referenced writing blocks created",
      "0 evidence-to-writing links restored",
      "0 overwrites · 0 source mutations",
    ]) assert(planText.includes(expected), `Same-bundle retry was not fully idempotent: missing “${expected}”.`);
    await applyRestore.click();
    await restore.getByText(/Research and eligible writing excerpts restored privately\./).waitFor({ timeout: 25_000 });
    await restore.screenshot({ path: path.join(artifactDirectory, "owner-idempotent-restore.png") });
    assert(pageErrors.length === 0, `Owner operation raised ${pageErrors.length} browser exception(s).`);
    await clearRenderedSession(page, baseURL, identity.role);
    return {
      documentId,
      manifestSha256: bundle.manifestSha256,
      bundlePath: downloadPath,
      exportedAnnotationId: exportedAnnotation.id,
      exportedUseId: exportedUse.id,
      browserExceptions: 0,
      sessionClear: "passed",
    };
  } finally {
    await context.close();
  }
}

async function databaseReadback({ prisma, fixture, annotationBody, responseBody, ownerResult }) {
  const source = await prisma.studioSourceUnit.findUniqueOrThrow({
    where: { id: fixture.source.id },
    select: { immutableText: true, updatedAt: true },
  });
  assert(sha256(source.immutableText || "") === fixture.sourceSha256, "Rendered work mutated immutable source text.");
  assert(source.updatedAt.toISOString() === fixture.sourceUpdatedAt, "Rendered work changed the immutable source timestamp.");
  const sourceAnnotation = await prisma.studioSourceAnnotation.findFirstOrThrow({
    where: { projectId: fixture.sourceProject.id, createdByUserId: fixture.actor.id, body: annotationBody },
    select: {
      id: true, visibility: true, exactText: true, sourceFingerprint: true,
      revisions: { select: { operation: true }, orderBy: { revision: "asc" } },
      uses: { select: { id: true, documentId: true, blockId: true, createdByUserId: true, sourceJson: true } },
    },
  });
  assert(sourceAnnotation.visibility === "private" && sourceAnnotation.exactText === EXACT_QUOTE, "Source annotation lost its private exact-quote boundary.");
  assert(sourceAnnotation.sourceFingerprint === fixture.sourceSha256, "Source annotation fingerprint does not match immutable source bytes.");
  assert(sourceAnnotation.revisions.some((revision) => revision.operation === "created"), "Source annotation lost its append-only creation receipt.");
  assert(sourceAnnotation.uses.length === 1, "Source annotation did not retain exactly one writing-use identity.");
  const sourceUse = sourceAnnotation.uses[0];
  assert(sourceUse.documentId === ownerResult.documentId && sourceUse.createdByUserId === fixture.actor.id, "Writing use lost the owner-created document identity.");
  const sourceDocument = await prisma.studioDocument.findUniqueOrThrow({
    where: { id: ownerResult.documentId },
    select: { id: true, isPrivate: true, projectionStatus: true, personalOwnerUserId: true, blocks: { orderBy: { order: "asc" }, select: { id: true, body: true, isPrivate: true, projectionStatus: true } } },
  });
  const responseBlock = sourceDocument.blocks.find((block) => block.body === responseBody);
  assert(sourceDocument.isPrivate && sourceDocument.personalOwnerUserId === fixture.actor.id && sourceDocument.projectionStatus === "draft", "Source writing draft lost its personal-owner privacy boundary.");
  assert(responseBlock?.isPrivate && responseBlock.projectionStatus === "draft", "Source response block lost its private draft boundary.");
  assert(sourceUse.blockId !== responseBlock.id, "Writing-use evidence identity was rebound to the editable response block.");
  assert(sourceUse.sourceJson?.responseBlockId === responseBlock.id, "Writing use lost the exact linked response-block identity.");

  const restoredAnnotation = await prisma.studioSourceAnnotation.findFirstOrThrow({
    where: { projectId: fixture.targetProject.id, createdByUserId: fixture.actor.id, body: annotationBody },
    select: {
      id: true, visibility: true,
      revisions: { select: { operation: true } },
      uses: { select: { id: true, documentId: true, blockId: true, createdByUserId: true, sourceJson: true } },
    },
  });
  assert(restoredAnnotation.visibility === "private", "Restored annotation was not private.");
  assert(restoredAnnotation.revisions.length === 1 && restoredAnnotation.revisions[0].operation === "restored-from-export", "Restored annotation lost its restore receipt.");
  assert(restoredAnnotation.uses.length === 1, "Restore retry duplicated or omitted the writing-use identity.");
  const restoredUse = restoredAnnotation.uses[0];
  const restoredDocument = await prisma.studioDocument.findUniqueOrThrow({
    where: { id: restoredUse.documentId },
    select: { id: true, title: true, isPrivate: true, projectionStatus: true, blocks: { orderBy: { order: "asc" }, select: { id: true, body: true, isPrivate: true, projectionStatus: true } } },
  });
  assert(restoredDocument.isPrivate && restoredDocument.projectionStatus === "private", "Restored writing excerpt document is not private.");
  const restoredEvidenceBlock = restoredDocument.blocks.find((block) => block.id === restoredUse.blockId);
  const restoredResponseBlock = restoredDocument.blocks.find((block) => block.body === responseBody);
  assert(restoredEvidenceBlock && restoredResponseBlock, "Restored writing excerpt lost its evidence or exact response block.");
  assert(restoredEvidenceBlock.isPrivate && restoredEvidenceBlock.projectionStatus === "private", "Restored evidence block is not private.");
  assert(restoredResponseBlock.isPrivate && restoredResponseBlock.projectionStatus === "private", "Restored response block is not private.");
  assert(restoredUse.sourceJson?.responseBlockId === restoredResponseBlock.id, "Restored writing use did not rebind its response-block identity.");
  assert(restoredUse.createdByUserId === fixture.actor.id, "Restored writing use lost the importing actor boundary.");
  assert(restoredUse.sourceJson?.restore?.manifestSha256 === ownerResult.manifestSha256, "Restored writing use lost the verified manifest receipt.");
  return {
    sourceAnnotationId: sourceAnnotation.id,
    sourceDocumentId: sourceDocument.id,
    sourceResponseBlockId: responseBlock.id,
    restoredAnnotationId: restoredAnnotation.id,
    restoredDocumentId: restoredDocument.id,
    restoredWritingUseId: restoredUse.id,
    sourceSha256: fixture.sourceSha256,
  };
}

async function verifyOutsider({ browser, baseURL, fixture, readback, annotationBody, responseBody, artifactDirectory }) {
  const credentialPath = String(process.env.QUIPSLY_RESEARCH_OUTSIDER_CREDENTIAL_FILE || "").trim();
  assert(path.isAbsolute(credentialPath), "Outsider credential file must be an explicit absolute path.");
  const credential = JSON.parse(await readFile(credentialPath, "utf8"));
  assert(typeof credential.email === "string" && typeof credential.password === "string", "Outsider credential file is invalid.");
  const identity = { role: "research-outsider", email: credential.email };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", locale: "en-US", reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity,
      password: credential.password,
      callbackPath: `/research?source=${encodeURIComponent(fixture.source.id)}`,
    });
    await page.getByRole("heading", { name: "Evidence, with its receipts.", exact: true }).waitFor({ timeout: 25_000 });
    for (const secret of [SOURCE_TITLE, annotationBody, responseBody]) {
      assert(await page.getByText(secret, { exact: true }).count() === 0, "Unrelated account could read owner-only Research content.");
    }
    for (const projectSlug of [SOURCE_PROJECT_SLUG, TARGET_PROJECT_SLUG]) {
      const response = await page.request.get(`${baseURL}/api/research/export?project=${encodeURIComponent(projectSlug)}`);
      assert(response.status() === 404, `Unrelated account export denial returned ${response.status()} for ${projectSlug}.`);
      assert((response.headers()["cache-control"] || "").includes("private") && (response.headers()["cache-control"] || "").includes("no-store"), "Private export denial lost its cache boundary.");
    }
    for (const [projectSlug, documentId] of [
      [SOURCE_PROJECT_SLUG, readback.sourceDocumentId],
      [TARGET_PROJECT_SLUG, readback.restoredDocumentId],
    ]) {
      await page.goto(`${baseURL}/create?project=${encodeURIComponent(projectSlug)}&document=${encodeURIComponent(documentId)}`, { waitUntil: "load" });
      assert(new URL(page.url()).pathname === "/projects", "Unrelated account was not redirected away from a private writing document.");
      assert(await page.getByText(annotationBody, { exact: true }).count() === 0, "Unrelated account learned the private annotation through writing fallback.");
      assert(await page.getByText(responseBody, { exact: true }).count() === 0, "Unrelated account learned the private writing response through fallback.");
    }
    await page.screenshot({ path: path.join(artifactDirectory, "outsider-private-writing-denial.png"), fullPage: true });
    await clearRenderedSession(page, baseURL, identity.role);
    return { exportSource: 404, exportRestore: 404, sourceDocument: "redirected", restoredDocument: "redirected", privateMarkers: "concealed", sessionClear: "passed" };
  } finally {
    await context.close();
  }
}

async function main() {
  const baseURL = requireLoopbackOrigin(process.env.QUIPSLY_RETAINED_RESEARCH_BASE_URL || "http://127.0.0.1:3012", "QUIPSLY_RETAINED_RESEARCH_BASE_URL");
  const databaseURL = requireLocalDatabase(process.env.DATABASE_URL);
  const artifactDirectory = await mkdtemp(path.join(process.env.QUIPSLY_RETAINED_RESEARCH_ARTIFACT_ROOT || tmpdir(), "quipsly-research-portability-"));
  const operationStamp = stamp();
  const annotationBody = `QA retained research annotation ${operationStamp}: preserve physical TestFlight truth as a private evidence overlay.`;
  const responseBody = `QA retained writing response ${operationStamp}: explain the human gate, name the next verification step, and never rewrite the preserved source.`;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseURL }), log: ["error"] });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const fixture = await loadFixture(prisma);
    const owner = await operateOwner({ browser, baseURL, fixture, artifactDirectory, annotationBody, responseBody });
    const readback = await databaseReadback({ prisma, fixture, annotationBody, responseBody, ownerResult: owner });
    const outsider = await verifyOutsider({ browser, baseURL, fixture, readback, annotationBody, responseBody, artifactDirectory });
    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      retained: true,
      renderedProduct: true,
      credentialStores: { owner: "macOS Keychain", outsider: "owner-only temporary file" },
      secretsPrinted: false,
      artifactDirectory,
      screenshotsCaptured: 4,
      operation: {
        exactSourceSelection: EXACT_QUOTE,
        privateAnnotationCreated: true,
        canonicalTagApplied: TAG_LABEL,
        privateWritingDraftCreated: true,
        privateWritingEditedAndSaved: true,
        browserExportDownloaded: true,
        browserRestoreValidated: true,
        browserRestoreApplied: true,
        sameBundleRetryIdempotent: true,
      },
      owner,
      readback,
      outsider,
      boundaries: {
        immutableSourceMutated: false,
        overwroteExisting: false,
        externalResourcesFetched: false,
        providerMutated: false,
        externalMessagesSent: false,
        externalCalendarEventsCreated: false,
      },
    }, null, 2));
  } finally {
    await prisma.$disconnect();
    await browser.close();
  }
}

await main();
