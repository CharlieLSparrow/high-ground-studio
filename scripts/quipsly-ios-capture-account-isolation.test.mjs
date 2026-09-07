import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = "apps/mobile-capture/HighGroundCapture/HighGroundCapture";
const read = (name) => readFileSync(`${root}/${name}`, "utf8");

const auth = read("AuthManager.swift");
const library = read("LocalRecordingLibrary.swift");
const playback = read("LocalRecordingPlaybackController.swift");
const receipts = read("CaptureRoomReceiptStore.swift");
const uploads = read("UploadManager.swift");
const capture = read("AudioCaptureController.swift");
const captureModel = read("CaptureExperienceModel.swift");
const captureShell = read("CapturePhoneShell.swift");
const bridge = read("BridgeModels.swift");
const providerRoom = read("ProviderRoomController.swift");
const mobileContext = read("MobileContextManager.swift");

function swiftFunction(source, name) {
  const start = source.indexOf(`func ${name}(`);
  assert.ok(start >= 0, `Missing Swift function ${name}`);
  const end = source.indexOf("\n    }", start);
  assert.ok(end > start, `Missing Swift function end ${name}`);
  return source.slice(start, end + 6);
}

const queuedUploadOwners = [
  ["syncWritingDraftDecision", "decision"],
  ["syncWeeklyPlanDecision", "decision"],
  ["syncFocusPlan", "plan"],
  ["syncFocusDecision", "decision"],
  ["syncReminderDecision", "decision"],
  ["syncWorkTagDecision", "decision"],
  ["syncDocumentNoteEdit", "edit"],
  ["syncQuickEntry", "entry"],
  ["syncSessionNoteEdit", "edit"],
].map(([method, item]) => ["BridgeModels.swift", method, item]);
queuedUploadOwners.push(
  ["CaptureRecordingCoordinator.swift", "deliver", "receipt"],
  ["CaptureSessionPreflight.swift", "deliver", "receipt"],
  ["CaptureSourceInbox.swift", "sync", "decision"],
  ["TranscriptCorrectionReview.swift", "syncReviewDecision", "decision"],
  ["TranscriptCorrectionReview.swift", "syncSpeakerAttribution", "decision"],
);
for (const [file, method, item] of queuedUploadOwners) {
  test(`${file}/${method} binds queued work to its stored owner before sending`, () => {
    // Wiring evidence only; the Swift test below executes the request boundary.
    assert.match(swiftFunction(read(file), method), new RegExp(
      `authenticatedData\\(\\s*for: request,\\s*expectedOwnerAccountID: ${item}\\.ownerAccountID\\s*\\)`,
    ));
  });
}

test("new typed pending-work upload methods cannot silently inherit the current login", () => {
  const unbound = [];
  for (const file of readdirSync(root).filter((name) => name.endsWith(".swift"))) {
    for (const match of read(file).matchAll(/func ([A-Za-z0-9_]+)\([\s\S]*?\n    }/g)) {
      const body = match[0], signature = body.slice(0, body.indexOf("{"));
      if (/:\s*Pending[A-Za-z]+/.test(signature) && body.includes("authenticatedData(")
        && !body.includes("expectedOwnerAccountID:")) unbound.push(`${file}/${match[1]}`);
    }
  }
  assert.deepEqual(unbound, []);
});

test("the actual Swift owner-binding methods reject a queued edit after account replacement", {
  skip: process.platform !== "darwin" ? "Requires the Apple Swift toolchain" : false,
}, (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "quipsly-request-owner-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = `import Foundation
final class Harness {
    static var storedOwner: String? = "coach"
    var accountOwnerID: String? = "coach"
    var accountIdentityGeneration: UInt64 = 1
    struct AuthenticatedOwnerBinding { let ownerAccountID: String; let generation: UInt64 }
    enum AuthenticatedRequestError: Error { case accountChanged }
    static func currentStoredOwnerID() -> String? { storedOwner }
    static ${swiftFunction(auth, "normalizedOwnerID")}
    ${swiftFunction(auth, "authenticatedOwnerBinding")}
    ${swiftFunction(auth, "validateAuthenticatedOwnerBinding")}
    func rejects(_ operation: () throws -> Void) {
        do { try operation(); fatalError("Accepted an invalid account binding") }
        catch AuthenticatedRequestError.accountChanged {} catch { fatalError("Unexpected error") }
    }
    func run() throws {
        let original = try authenticatedOwnerBinding(expectedOwnerAccountID: "coach")
        try validateAuthenticatedOwnerBinding(original)
        accountOwnerID = "client"; Self.storedOwner = "client"; accountIdentityGeneration += 1
        rejects { _ = try authenticatedOwnerBinding(expectedOwnerAccountID: "coach") }
        rejects { try validateAuthenticatedOwnerBinding(original) }
        let client = try authenticatedOwnerBinding(expectedOwnerAccountID: "client")
        try validateAuthenticatedOwnerBinding(client)
        accountOwnerID = "coach"; Self.storedOwner = "coach"; accountIdentityGeneration += 1
        // Returning to the same account must not revive an in-flight old generation.
        rejects { try validateAuthenticatedOwnerBinding(original) }
        _ = try authenticatedOwnerBinding(expectedOwnerAccountID: "coach")
        rejects { _ = try authenticatedOwnerBinding(expectedOwnerAccountID: "  ") }
        Self.storedOwner = nil
        rejects { _ = try authenticatedOwnerBinding(expectedOwnerAccountID: "coach") }
        print("PASS request ownership survives account replacement and rejects stale generations")
    }
}
try Harness().run()
`;
  const file = path.join(directory, "main.swift"), binary = path.join(directory, "owner-test");
  writeFileSync(file, source);
  const compile = spawnSync("xcrun", ["swiftc", file, "-o", binary], { encoding: "utf8", timeout: 60_000 });
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  const result = spawnSync(binary, [], { encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /PASS request ownership/);
});

test("verified Quipsly actor identity owns the local account partition", () => {
  assert.match(auth, /private struct NativeSessionUser:[\s\S]*?let id: String\?/);
  assert.match(auth, /normalizedOwnerID\(payload\.user\?\.id\)/);
  assert.match(auth, /return VerifiedNativeSession\([\s\S]*?ownerAccountID: ownerID/);
  assert.match(auth, /saveKeychainItem\(account: "accountOwnerID", value: verifiedSession\.ownerAccountID\)/);
  assert.match(auth, /guard getKeychainItem\(account: "refreshToken"\) != nil else \{ return nil \}/);
  assert.match(auth, /deleteKeychainItem\(account: "accountOwnerID"\)/);
  assert.match(auth, /name: \.quipslyCaptureAccountIdentityDidChange/);
});

test("native auth proves a verified mailbox before Nest or Keychain and keeps recovery identity-safe", () => {
  const signIn = auth.slice(
    auth.indexOf("func signIn(email rawEmail:"),
    auth.indexOf("func createAccount(email rawEmail:"),
  );
  const passwordExchange = signIn.indexOf("signInWithFirebasePassword");
  const accountLookup = signIn.indexOf("fetchFirebaseAccount", passwordExchange);
  const verificationGate = signIn.indexOf("account.emailVerified == true", accountLookup);
  const nestSession = signIn.indexOf("verifyQuipslyNativeSession", verificationGate);
  const keychainCommit = signIn.indexOf("saveVerifiedNativeSession", nestSession);
  assert.ok(
    passwordExchange >= 0
      && accountLookup > passwordExchange
      && verificationGate > accountLookup
      && nestSession > verificationGate
      && keychainCommit > nestSession,
  );
  assert.match(signIn, /sendEmailVerification\(idToken: idToken/);

  const create = auth.slice(
    auth.indexOf("func createAccount(email rawEmail:"),
    auth.indexOf("func sendPasswordReset(email rawEmail:"),
  );
  assert.match(create, /createFirebasePasswordAccount/);
  assert.match(create, /sendEmailVerification/);
  assert.doesNotMatch(create, /saveNativeCredentials|saveVerifiedNativeSession|markIdentityVerified/);

  assert.match(auth, /private var interactiveAuthAttemptID: UUID\?/);
  assert.match(auth, /guard interactiveAuthAttemptIsCurrent\(attemptID\) else \{ return \}/);
  assert.match(auth, /private struct StoredSessionBinding/);
  assert.match(auth, /validateStoredSessionBinding\(storedSessionBinding/);
  assert.match(auth, /firebaseErrorCode\(error\) == "EMAIL_NOT_FOUND"/);

  for (const identifier of [
    "QuipslyCaptureCreateAccountModeButton",
    "QuipslyCapturePasswordResetButton",
    "QuipslyCaptureGoogleSignInButton",
    "QuipslyCaptureGoogleIdentityContinuityHint",
    "QuipslyCaptureAccountSupportLink",
  ]) {
    assert.ok(captureShell.includes(identifier) || read("LoginView.swift").includes(identifier));
  }
  assert.doesNotMatch(
    read("LoginView.swift"),
    /QuipslyCapturePasswordConfirmationField/,
  );
});

test("ordinary authenticated mutations inherit a fail-closed owner binding through 401 replay", () => {
  const bindingStart = auth.indexOf("private func authenticatedOwnerBinding(");
  const bindingEnd = auth.indexOf("private func validateAuthenticatedOwnerBinding(", bindingStart);
  const binding = auth.slice(bindingStart, bindingEnd);
  assert.match(binding, /throws -> AuthenticatedOwnerBinding \{/);
  assert.doesNotMatch(binding, /return nil/);
  assert.match(binding, /if let expectedOwnerAccountID \{/);
  assert.match(binding, /guard let currentOwnerAccountID = Self\.currentStoredOwnerID\(\)/);
  assert.match(binding, /Self\.normalizedOwnerID\(accountOwnerID\) == boundOwnerAccountID/);

  const consentStart = bridge.indexOf("func updateRecordingConsent(");
  const consentEnd = bridge.indexOf("func grantRecordingConsent(", consentStart);
  const consentMutation = bridge.slice(consentStart, consentEnd);
  assert.match(consentMutation, /AuthManager\.shared\.authenticatedData\(for: request\)/);

  const requestStart = auth.indexOf("func authenticatedData(");
  const requestEnd = auth.indexOf("private func authenticatedOwnerBinding(", requestStart);
  const authenticatedRequest = auth.slice(requestStart, requestEnd);
  const first401 = authenticatedRequest.indexOf("firstResult.1.statusCode == 401");
  const forcedRefresh = authenticatedRequest.indexOf("force: true", first401);
  const retrySend = authenticatedRequest.indexOf("retryResult = try await sendAuthenticated", forcedRefresh);
  assert.ok(first401 >= 0 && forcedRefresh > first401 && retrySend > forcedRefresh);
  assert.ok(
    authenticatedRequest.indexOf("try validateAuthenticatedOwnerBinding(ownerBinding)", forcedRefresh)
      < retrySend,
  );
  assert.ok(
    authenticatedRequest.indexOf("try validateAuthenticatedOwnerBinding(ownerBinding)", retrySend)
      > retrySend,
  );
});

test("post-owner review and workspace reads cannot bypass the stable-owner request path", () => {
  const digestStart = bridge.indexOf("final class CaptureReviewDigestClient");
  const digestEnd = bridge.indexOf("struct MobileCaptureRoomJoinResponse", digestStart);
  const digest = bridge.slice(digestStart, digestEnd);
  assert.match(digest, /AuthManager\.shared\.authenticatedData\(for: request\)/);
  assert.doesNotMatch(digest, /Authorization|URLSession\.shared\.data/);
  assert.match(mobileContext, /AuthManager\.shared\.authenticatedData\(for: request\)/);
  assert.doesNotMatch(mobileContext, /Authorization|URLSession\.shared\.data/);
});

test("local source rows and file access are filtered by exact nonempty owner", () => {
  assert.match(library, /var ownerAccountID: String\? = nil/);
  assert.match(library, /private var storedRecordings: \[LocalRecording\] = \[\]/);
  assert.match(
    library,
    /if let activeOwnerAccountID = normalizedOwnerID\(activeOwnerAccountID\) \{[\s\S]*?visibleRecordings = storedRecordings\.filter \{\s*normalizedOwnerID\(\$0\.ownerAccountID\) == activeOwnerAccountID\s*\}[\s\S]*?\} else \{\s*visibleRecordings = \[\]/,
  );
  assert.match(library, /guard ownsActivePartition\(recording\), isSafeRecordingFileName\(recording\.fileName\) else \{ return nil \}/);
  assert.match(library, /ownerAccountID: nil,[\s\S]*?displayTitle: "Recovered recording/);
  assert.match(library, /if !allowInactiveOwner \{[\s\S]*?accountIdentityUnavailable/);
  assert.match(playback, /for: \.quipslyCaptureAccountIdentityDidChange[\s\S]*?self\?\.stop\(\)/);
});

test("upload jobs and callbacks cannot cross account partitions", () => {
  assert.match(uploads, /let ownerAccountID: String\?/);
  assert.match(
    uploads,
    /requestedOwnerAccountID == currentOwnerAccountID else \{[\s\S]*?protected source is not available to the current account/,
  );
  assert.match(uploads, /let sessionId = \(localRecordingID \?\? UUID\(\)\)\.uuidString\.lowercased\(\)/);
  assert.match(uploads, /let sessionOwnerAccountID = normalizedOwnerID\(activeUploads\[sessionId\]\?\.ownerAccountID\)/);
  assert.match(uploads, /guard sessionBelongsToActiveOwner\(sessionId\),\s*var uploadSession = activeUploads\[sessionId\] else \{ return \}/);
  assert.match(uploads, /"ownerAccountID": uploadSession\.ownerAccountID \?\? ""/);
  assert.match(capture, /ownerAccountID == AuthManager\.currentStoredOwnerID\(\) else \{ return \}/);
});

test("upload recovery never substitutes a same-named source", () => {
  assert.match(
    uploads,
    /var fileUrl: URL \{[\s\S]*?durableSourceIdentityURL[\s\S]*?\.quipsly-missing-upload-source/,
  );
  assert.doesNotMatch(
    uploads,
    /map\(\{ \$0\.appendingPathComponent\(fileName,[\s\S]*?first\(where:/,
  );
  assert.match(
    uploads,
    /let requestedSourceIdentity = UploadSession\.canonicalConfinedSourceURL\(for: fileUrl\)/,
  );
  assert.match(
    uploads,
    /\$0\.value\.durableSourceIdentityURL == requestedSourceIdentity/,
  );
});

test("every canonical upload control-plane replay is bound to its durable job owner", () => {
  const createStart = uploads.indexOf("private func createOrRecoverCanonicalSession(");
  const createEnd = uploads.indexOf("private func startCanonicalBackgroundUpload(", createStart);
  const finalizeStart = uploads.indexOf("private func finalizeCanonicalUpload(");
  const finalizeEnd = uploads.indexOf("private func handleCanonicalTaskCompletion(", finalizeStart);
  assert.ok(createStart >= 0 && createEnd > createStart);
  assert.ok(finalizeStart >= 0 && finalizeEnd > finalizeStart);

  const createControlPlane = uploads.slice(createStart, createEnd);
  const finalizeControlPlane = uploads.slice(finalizeStart, finalizeEnd);
  for (const operation of [createControlPlane, finalizeControlPlane]) {
    assert.match(
      operation,
      /let expectedOwnerAccountID = normalizedOwnerID\(uploadSession\.ownerAccountID\)/,
    );
    assert.match(
      operation,
      /AuthManager\.shared\.authenticatedData\(\s*for: request,\s*expectedOwnerAccountID: expectedOwnerAccountID\s*\)/,
    );
  }

  assert.equal(
    (uploads.match(/AuthManager\.shared\.authenticatedData\(/g) ?? []).length,
    2,
    "Every authenticated UploadManager control-plane call must be audited and owner-bound.",
  );
  assert.match(auth, /try validateAuthenticatedOwnerBinding\(ownerBinding\)[\s\S]*?retryToken = refreshedToken/);
});

test("room receipt outbox preserves all owners but publishes only the active one", () => {
  assert.match(receipts, /var ownerAccountID: String\? = nil/);
  assert.match(receipts, /private var storedReceipts: \[PendingCaptureRoomReceipt\] = \[\]/);
  assert.match(
    receipts,
    /if action == \.stop, let inheritedStart \{[\s\S]*?normalizedOwnerID\(inheritedStart\.ownerAccountID\) == resolvedOwnerAccountID[\s\S]*?inheritedStart\.sessionID == sessionID[\s\S]*?inheritedStart\.callRoomID == callRoomID/,
  );
  assert.match(
    receipts,
    /\} else \{\s*guard resolvedOwnerAccountID == normalizedOwnerID\(activeOwnerAccountID\) else \{\s*throw ReceiptStoreError\.accountIdentityUnavailable/,
  );
  assert.match(
    receipts,
    /receipts = storedReceipts\.filter \{\s*normalizedOwnerID\(\$0\.ownerAccountID\) == activeOwnerAccountID\s*\}/,
  );
  assert.match(receipts, /\$0\.deliveryDisposition != \.rejectedByNest/);
  assert.match(receipts, /deliveryDisposition = \.rejectedByNest/);
});

test("room receipt delivery is bound to one stable authenticated owner", () => {
  assert.match(auth, /expectedOwnerAccountID: String\? = nil/);
  assert.match(auth, /private var accountIdentityGeneration: UInt64 = 0/);
  assert.match(auth, /binding\.generation == accountIdentityGeneration/);
  assert.match(auth, /Self\.currentStoredOwnerID\(\) == binding\.ownerAccountID/);
  assert.match(
    auth,
    /let refreshedForRetry = await refreshAccessTokenIfNeeded\([\s\S]*?try validateAuthenticatedOwnerBinding\(ownerBinding\)[\s\S]*?retryToken = refreshedToken/,
  );
  assert.match(
    bridge,
    /func sendRoomStateReceipt\([\s\S]*?expectedOwnerAccountID: String[\s\S]*?authenticatedData\([\s\S]*?expectedOwnerAccountID: expectedOwnerAccountID/,
  );
  assert.match(captureModel, /for: \.quipslyCaptureAccountIdentityDidChange/);
  assert.match(captureModel, /receiptFlushTask\?\.cancel\(\)/);
  assert.match(
    captureModel,
    /while !Task\.isCancelled,[\s\S]*?receiptStore\.nextDeliverableReceipt\([\s\S]*?excludingCaptureIDs: deferredCaptureIDs/,
  );
  assert.match(
    captureModel,
    /sendRoomStateReceipt\([\s\S]*?expectedOwnerAccountID: receiptOwnerAccountID/,
  );
});

test("deterministic owner-change-during-permission contract carries one immutable generation to recorder bytes", () => {
  assert.match(auth, /struct StableOwnerSnapshot: Equatable[\s\S]*?let ownerAccountID: String[\s\S]*?generation: UInt64/);
  assert.match(auth, /func matchesStableOwnerSnapshot[\s\S]*?snapshot\.generation == accountIdentityGeneration/);

  const start = captureModel.slice(
    captureModel.indexOf("func startCapture("),
    captureModel.indexOf("func stopCapture(using audioCapture:"),
  );
  const snapshot = start.indexOf("let ownerSnapshot = AuthManager.shared.stableOwnerSnapshot()");
  const authoritativeLoad = start.indexOf("await sessionClient.load(authoritativeSessionID:");
  const loadRecheck = start.indexOf("matchesStableOwnerSnapshot(ownerSnapshot)", authoritativeLoad);
  const permissionAwait = start.indexOf("await audioCapture.prepareForRecording()", loadRecheck);
  const permissionRecheck = start.indexOf("matchesStableOwnerSnapshot(ownerSnapshot)", permissionAwait);
  const arm = start.indexOf("try audioCapture.armNextCapture(", permissionRecheck);
  const preStartRecheck = start.indexOf("matchesStableOwnerSnapshot(ownerSnapshot)", arm);
  const recorderStart = start.indexOf("audioCapture.handleCommand(command)", preStartRecheck);
  assert.ok(
    snapshot >= 0
      && authoritativeLoad > snapshot
      && loadRecheck > authoritativeLoad
      && permissionAwait > loadRecheck
      && permissionRecheck > permissionAwait
      && arm > permissionRecheck
      && preStartRecheck > arm
      && recorderStart > preStartRecheck,
    "An owner switch while microphone permission is open must fail before durable arm or recorder start.",
  );
  assert.match(start, /expectedOwnerSnapshot: ownerSnapshot/);
  assert.match(start, /abortArmedCaptureBeforeRecording\(\)/);

  assert.match(capture, /let ownerSnapshot: AuthManager\.StableOwnerSnapshot/);
  assert.match(capture, /ownerAccountID: expectedOwnerSnapshot\.ownerAccountID/);
  assert.match(capture, /guard pendingCaptureOwnerIsCurrent else \{[\s\S]*?abortArmedCaptureBeforeRecording\(\)/);
  assert.match(capture, /expectedOwnerAccountID: captureIntent\.ownerSnapshot\.ownerAccountID/);
  assert.match(
    capture,
    /guard AuthManager\.shared\.matchesStableOwnerSnapshot\(captureIntent\.ownerSnapshot\)[\s\S]*?guard directRecorder\.record\(\)/,
  );
  assert.match(
    capture,
    /guard AuthManager\.shared\.matchesStableOwnerSnapshot\(captureIntent\.ownerSnapshot\)[\s\S]*?try providerRecorder\.start\(at: startedAt\)/,
  );
  assert.match(library, /expectedOwnerAccountID: String[\s\S]*?ownerAccountID == AuthManager\.currentStoredOwnerID\(\)/);
});

test("provider join token is canceled when its preparing owner generation changes", () => {
  const joinStart = captureModel.indexOf("func joinRoom(");
  const join = captureModel.slice(
    joinStart,
    captureModel.indexOf("func leaveRoom() async"),
  );
  const snapshot = join.indexOf("stableOwnerSnapshot()");
  const permission = join.indexOf("await providerRoom.prepareMicrophonePermissionForJoin()", snapshot);
  const permissionRecheck = join.indexOf("matchesStableOwnerSnapshot(ownerSnapshot)", permission);
  const prepare = join.indexOf("await sessionClient.prepareRoomJoin", permissionRecheck);
  const prepareRecheck = join.indexOf("matchesStableOwnerSnapshot(ownerSnapshot)", prepare);
  const connect = join.indexOf("await providerRoom.connect", prepareRecheck);
  const connectRecheck = join.indexOf("matchesStableOwnerSnapshot(ownerSnapshot)", connect);
  assert.ok(
    joinStart >= 0
      && snapshot >= 0
      && permission > snapshot
      && permissionRecheck > permission
      && prepare > permissionRecheck
      && prepareRecheck > prepare
      && connect > prepareRecheck
      && connectRecheck > connect,
  );
  assert.match(join, /expectedOwnerSnapshot: ownerSnapshot/);
  assert.match(join, /useCallAudio: useCallAudio/);
  assert.match(join, /await providerRoom\.disconnect\(\)/);

  assert.match(providerRoom, /forName: \.quipslyCaptureAccountIdentityDidChange/);
  assert.match(providerRoom, /var activeOwnerSnapshot: AuthManager\.StableOwnerSnapshot\?/);
  assert.match(providerRoom, /try await room\.connect[\s\S]*?matchesStableOwnerSnapshot\(expectedOwnerSnapshot\)[\s\S]*?setMicrophone/);
  assert.match(providerRoom, /setMicrophone\([\s\S]*?enabled: useCallAudio && !joinMuted[\s\S]*?matchesStableOwnerSnapshot\(expectedOwnerSnapshot\)/);
  assert.match(providerRoom, /private func abortForAccountChange\(\) async[\s\S]*?await room\.disconnect\(\)[\s\S]*?activeOwnerSnapshot = nil/);
});

test("consent grant sends exact separate recording, transcription, and nearby-person evidence", () => {
  assert.match(bridge, /2026-07-18\.capture-consent-v2/);
  assert.match(bridge, /379380cecf3bc1b3a1614334e247e6795f09f3eb1c85bf3918daf612b9929ff9/);
  assert.match(bridge, /"canRecordAudio"\] = grantAttestation\.canRecordAudio/);
  assert.match(bridge, /"canRecordVideo"\] = grantAttestation\.canRecordVideo/);
  assert.match(bridge, /"canTranscribe"\] = grantAttestation\.canTranscribe/);
  assert.match(bridge, /"allAudibleParticipantsNotifiedAndAgreed"\] = grantAttestation\.allAudibleParticipantsNotifiedAndAgreed/);
  assert.match(bridge, /"recordingChoicePresented": true/);
  assert.match(bridge, /"transcriptionChoicePresented": true/);
  assert.match(bridge, /"audibleParticipantAttestationPresented": true/);
  assert.doesNotMatch(bridge, /func grantRecordingConsent\(for session:/);

  for (const identifier of [
    "CaptureConsentRecordAudioToggle",
    "CaptureConsentRecordVideoToggle",
    "CaptureConsentTranscriptionToggle",
    "CaptureConsentSaveChoicesButton",
  ]) {
    assert.ok(captureShell.includes(identifier), `Missing explicit consent control ${identifier}`);
  }
  assert.match(captureShell, /@State private var canTranscribe: Bool/);
  assert.match(captureShell, /@State private var presentationOwnerSnapshot: AuthManager\.StableOwnerSnapshot\?/);
  assert.match(captureShell, /matchesStableOwnerSnapshot\(presentationOwnerSnapshot\)/);
  assert.match(captureShell, /Everyone chooses for themselves/);
});

test("daemon transfer is fail-closed on persistence and retries use bounded stable jitter", () => {
  assert.match(uploads, /guard saveActiveUploads\(\) else \{[\s\S]*?task\.cancel\(\)[\s\S]*?holdInMemoryForUnavailableLedger/);
  assert.match(uploads, /let ledgerPersisted = self\.saveActiveUploads\(\)[\s\S]*?guard ledgerPersisted else/);
  assert.match(uploads, /static func deterministicRetryJitterMultiplier/);
  assert.match(uploads, /return 0\.9 \+ tenThousandths/);
  assert.match(uploads, /hash % 2_001/);
  assert.match(uploads, /if let retryAfter \{[\s\S]*?delay = min\(max\(retryAfter, 1\), maximumRetryAfterDelay\)/);
});

test("sign-out hides partitions without deleting local media", () => {
  const signOut = auth.match(/func signOut\(\) \{([\s\S]*?)\n    \}/)?.[1] ?? "";
  assert.ok(signOut.includes('deleteKeychainItem(account: "accountOwnerID")'));
  assert.ok(signOut.includes("publishAccountIdentityChange()"));
  assert.doesNotMatch(signOut, /removeItem|recordings-index|UploadLedgerStore/);
});

test("explicit local deletion is owner-scoped, path-confined, tombstoned, and retired after byte removal", () => {
  const deletion = library.match(/func deleteLocalOriginal\([\s\S]*?\n    \}\n\n    private func sourceFileURL/)?.[0] ?? "";
  assert.match(deletion, /normalizedOwnerID\(\$0\.ownerAccountID\) == activeOwnerAccountID/);
  assert.match(deletion, /case \.armed, \.recording, \.paused, \.finalizing/);
  assert.match(deletion, /case \.queued, \.uploading, \.awaitingVerification/);
  assert.match(deletion, /guard isSafeRecordingFileName\(existing\.fileName\)/);
  assert.match(deletion, /tombstone\.status = \.deletedLocally/);
  assert.match(deletion, /tombstone\.byteCount = 0/);
  assert.match(deletion, /localBytesDeletedByteCount = deletedByteCount/);
  const durableTombstone = deletion.indexOf("try persist(updated)");
  const byteRemoval = deletion.indexOf("try fileManager.removeItem(at: fileURL)");
  assert.ok(durableTombstone >= 0 && byteRemoval > durableTombstone);

  assert.match(uploads, /func localDeletionBlocker\([\s\S]*?normalizedOwnerID\(uploadSession\.ownerAccountID\) == expectedOwnerAccountID/);
  assert.match(uploads, /var durableSourceIdentityURL: URL\?/);
  assert.match(uploads, /static func canonicalConfinedSourceURL/);
  assert.match(uploads, /let matchesLedgerID = uploadSession\.localRecordingID == localRecordingID/);
  assert.match(uploads, /let matchesConfinedSourcePath = uploadSession\.durableSourceIdentityURL == sourceIdentityURL/);
  assert.match(uploads, /guard matchesLedgerID \|\| matchesConfinedSourcePath/);
  assert.match(uploads, /func retireDormantUploadAfterConfirmedLocalDeletion/);
  const coordinatedDelete = captureModel.match(/func deleteLocalOriginal\([\s\S]*?return tombstone/)?.[0] ?? "";
  assert.ok(coordinatedDelete.indexOf("library.deleteLocalOriginal") >= 0);
  assert.ok(
    coordinatedDelete.indexOf("retireDormantUploadAfterConfirmedLocalDeletion") >
      coordinatedDelete.indexOf("library.deleteLocalOriginal"),
  );
  assert.match(captureShell, /Section\("Share first"\)/);
  assert.match(captureShell, /ConfirmDeleteLocalOriginalButton/);
});
