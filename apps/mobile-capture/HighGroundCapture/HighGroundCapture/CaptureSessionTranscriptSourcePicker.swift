import SwiftUI

struct CaptureSessionRecordingTranscriptDestination: Hashable {
  let roomID: String
  let title: String
  let recordingAssetID: String
  let canUseProjectTeamNotes: Bool
}

/// Uses the Session's existing authorized source inventory. Older takes remain
/// accessible without pretending they are one continuous conversation.
struct CaptureSessionTranscriptSourcePicker: View {
  let session: MobileCaptureSession
  let previewOnly: Bool
  var selectedSourceID: String? = nil
  var onSelectLatest: (() -> Void)? = nil
  let onSelect: (CaptureSessionRecordingTranscriptDestination) -> Void
  @State private var showsRecordings = false
  @State private var searchText = ""
  @State private var onlyWithTranscript = false
  @State private var pendingSource: MobileCaptureSourceSummary?
  @State private var pendingLatest = false

  private var sources: [MobileCaptureSourceSummary] {
    (session.captureSources ?? []).filter {
      $0.recordingStatus == "VERIFIED" && ["LOCAL_AUDIO", "LOCAL_VIDEO"].contains($0.kind ?? "")
    }.sorted { ($0.recordedStartedAt ?? "") > ($1.recordedStartedAt ?? "") }
  }

  private var visibleSources: [MobileCaptureSourceSummary] {
    sources.filter {
      (!onlyWithTranscript || $0.transcript?.status == "COMPLETED")
        && (searchText.isEmpty
          || CaptureTranscriptRecordingLabel.title(fileName: $0.fileName, isVideo: $0.isVideoSource)
            .localizedCaseInsensitiveContains(searchText))
    }
  }

  var body: some View {
    if !sources.isEmpty {
      Button {
        showsRecordings = true
      } label: {
        Label(selectedSourceID.flatMap { id in sources.first { $0.id == id } }
          .map { CaptureTranscriptRecordingLabel.title(fileName: $0.fileName, isVideo: $0.isVideoSource) }
          ?? "Choose a recording", systemImage: "waveform")
          .frame(minHeight: 44)
      }
      .buttonStyle(.bordered)
      .accessibilityIdentifier("CaptureSessionTranscriptRecordings_\(session.callRoomId)")
      .sheet(isPresented: $showsRecordings, onDismiss: {
        if pendingLatest {
          onSelectLatest?()
        } else if let source = pendingSource {
          onSelect(.init(roomID: session.callRoomId,
                         title: CaptureTranscriptRecordingLabel.title(fileName: source.fileName, isVideo: source.isVideoSource),
                         recordingAssetID: source.id,
                         canUseProjectTeamNotes: session.canUseProjectTeamNotes == true))
        }
        pendingSource = nil
        pendingLatest = false
      }) { recordingsSheet }
    }
  }

  private func sourceRow(_ source: MobileCaptureSourceSummary) -> some View {
    Button {
      pendingSource = source
      showsRecordings = false
    } label: {
      VStack(alignment: .leading, spacing: 5) {
        HStack {
          Text(CaptureTranscriptRecordingLabel.title(
            fileName: source.fileName, isVideo: source.isVideoSource)).font(.headline)
          if selectedSourceID == source.id {
            Image(systemName: "checkmark").accessibilityLabel("Selected recording")
          }
        }
        if let timestamp = source.recordedStartedAt,
          let date = CaptureDateCoding.date(from: timestamp)
        {
          Text(date, format: .dateTime.month().day().hour().minute()).font(.caption)
        }
        if let duration = source.durationSeconds {
          Text(duration.captureDurationLabel).font(.caption).foregroundStyle(.secondary)
        }
        Text(
          CaptureTranscriptProgressSource(
            recordingAssetId: source.id, participantLabel: "",
            transcriptJobId: source.transcript?.id,
            status: source.transcript?.status, error: source.transcript?.errorMessage,
            failureCode: source.transcript?.failureCode, retryable: source.transcript?.retryable
          ).title
        ).font(.subheadline).foregroundStyle(.secondary)
      }
      .padding(.vertical, 4)
    }
    .accessibilityIdentifier("CaptureSessionSourceTranscript_\(source.id)")
    .accessibilityValue(source.transcript?.status ?? "READY")
    .tint(CapturePalette.ink)
  }

  private var recordingsSheet: some View {
    NavigationStack {
      List {
        if onSelectLatest != nil && searchText.isEmpty {
          Button {
            pendingLatest = true
            pendingSource = nil
            showsRecordings = false
          } label: {
            Label("Latest session transcript", systemImage: selectedSourceID == nil ? "checkmark" : "text.alignleft")
              .frame(minHeight: 44)
          }
          .accessibilityIdentifier("CaptureSessionLatestTranscript")
        }
        ForEach(visibleSources) { source in sourceRow(source) }
        if visibleSources.isEmpty {
          if !searchText.isEmpty {
            ContentUnavailableView.search(text: searchText).listRowBackground(Color.clear)
          } else {
            ContentUnavailableView("No transcripts yet", systemImage: "text.alignleft",
              description: Text("Choose All to see recordings that are still being transcribed."))
              .listRowBackground(Color.clear)
          }
        }
      }
        .scrollContentBackground(.hidden)
        .safeAreaInset(edge: .top) {
          Picker("Recordings", selection: $onlyWithTranscript) {
            Text("All").tag(false)
            Text("With transcript").tag(true)
          }
          .pickerStyle(.segmented)
          .padding(.horizontal)
          .padding(.bottom, 8)
          .background(CapturePalette.canvas)
        }
        .searchable(text: $searchText, prompt: "Find a recording")
        .background(CapturePalette.canvas)
        .navigationTitle("Recordings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .confirmationAction) {
            Button("Done") { showsRecordings = false }
          }
        }
    }
    .presentationDetents([.large])
  }
}
