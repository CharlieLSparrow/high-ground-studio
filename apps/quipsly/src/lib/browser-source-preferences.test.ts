import {
  preferredBrowserSourceType,
  readBrowserSourcePreferences,
  writeBrowserSourcePreferences,
} from "./browser-source-preferences";

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
    value: () => value,
  };
}

describe("browser source preferences", () => {
  it("uses familiar audio and video defaults before a person chooses", () => {
    expect(preferredBrowserSourceType("coaching", {})).toBe("audio");
    expect(preferredBrowserSourceType("episode", {})).toBe("video");
  });

  it("remembers source choices independently for coaching and episodes", () => {
    const storage = memoryStorage();
    writeBrowserSourcePreferences(
      { coachingSourceType: "video", headphonesAttested: true },
      storage,
    );
    writeBrowserSourcePreferences({ episodeSourceType: "audio" }, storage);

    const preferences = readBrowserSourcePreferences(storage);
    expect(preferredBrowserSourceType("coaching", preferences)).toBe("video");
    expect(preferredBrowserSourceType("episode", preferences)).toBe("audio");
    expect(preferences.headphonesAttested).toBe(true);
  });

  it("ignores corrupt and unsupported stored values", () => {
    expect(readBrowserSourcePreferences(memoryStorage("not-json"))).toEqual({});
    expect(
      readBrowserSourcePreferences(
        memoryStorage(
          JSON.stringify({
            headphonesAttested: "yes",
            coachingSourceType: "screen",
            episodeSourceType: "video",
          }),
        ),
      ),
    ).toEqual({ episodeSourceType: "video" });
  });
});
