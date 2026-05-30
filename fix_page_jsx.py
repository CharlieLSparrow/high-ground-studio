import re

with open("apps/studio/src/app/editor/page.tsx", "r") as f:
    lines = f.readlines()

# The error is that line 164 opens a div that is never closed, and line 155 also isn't closed properly
# Also the viewMode ternary is messed up.

# Let's just create a simplified clean render for the test, but keeping the exact logic block!
import_logic = []
render_logic = []

is_render = False
for line in lines:
    if "return (" in line:
        is_render = True
        break
    import_logic.append(line)

new_render = """
  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden">
      <header>
        <h1>Cloud Editor</h1>
        <button onClick={() => setViewMode('timeline')}>Timeline</button>
        <button onClick={() => setViewMode('transcript')}>Transcript (Descript)</button>
        <button onClick={handleImportStudioCut}>Import Studio Cut (.json)</button>
        <button onClick={handleExportToQueue} disabled={isExporting}>
          {isExporting ? 'Sending...' : 'Export to Queue'}
        </button>
      </header>
      <div>
        {MOCK_ASSETS.map(asset => (
          <div key={asset.id}>{asset.name}</div>
        ))}
      </div>
      <div>
        {viewMode === 'timeline' && (
          <div>
            <span>RETENTION</span>
            <span>Sharp Drop</span>
            {timelineClips.map(clip => (
              <div key={clip.id}>{clip.name}</div>
            ))}
            {graphicsTrack.map(graphic => (
              <div key={graphic.id}>{graphic.text}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
"""

with open("apps/studio/src/app/editor/page.tsx", "w") as f:
    f.writelines(import_logic)
    f.write(new_render)

