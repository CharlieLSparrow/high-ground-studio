import SwiftUI

struct CaptureTranscriptProgressList: View {
  let sources: [CaptureTranscriptProgressSource]
  let canRequest: Bool
  let isBusy: Bool
  let startingAssetID: String?
  let onStart: (String) -> Void
  @State private var showsRecordings = false

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      if sources.count > 1 {
        let processingCount = sources.filter(\.isProcessing).count
        Text(
          processingCount > 0
            ? "Transcribing \(processingCount) recordings"
            : "\(sources.count) recordings need attention"
        )
        .font(.headline)
        Text("Your original recordings are saved.")
          .font(.subheadline).foregroundStyle(.secondary)
        DisclosureGroup("Recordings (\(sources.count))", isExpanded: $showsRecordings) {
          recordingRows
            .padding(.top, 8)
        }
        .accessibilityIdentifier("CaptureTranscriptProgressDetails")
      } else {
        recordingRows
      }
    }
  }

  private var recordingRows: some View {
    ForEach(sources) { source in
      VStack(alignment: .leading, spacing: 8) {
        HStack(spacing: 10) {
          if source.isProcessing || startingAssetID == source.id {
            ProgressView()
          } else {
            Image(systemName: source.failureCode == "NO_AUDIO_SIGNAL" ? "mic.slash" : "text.bubble")
              .foregroundStyle(CapturePalette.brass)
          }
          VStack(alignment: .leading, spacing: 3) {
            Text(source.title).font(.headline)
            Text(source.participantLabel).font(.subheadline).foregroundStyle(.secondary)
          }
        }
        Text(source.detail).font(.subheadline).foregroundStyle(.secondary)
        if canRequest, let action = source.actionTitle {
          Button(action) { onStart(source.id) }
            .buttonStyle(.bordered)
            .disabled(isBusy || startingAssetID != nil)
            .accessibilityIdentifier("CaptureTranscriptStart_\(source.id)")
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(14)
      .background(CapturePalette.surface, in: RoundedRectangle(cornerRadius: 16))
      .accessibilityElement(children: .contain)
      .accessibilityIdentifier("CaptureTranscriptProgress_\(source.id)")
    }
  }
}
