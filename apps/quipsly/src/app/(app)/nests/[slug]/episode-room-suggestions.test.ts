import {
  sourceEpisodeNumber,
  suggestedEpisodeSlug,
  suggestedEpisodeTitle,
} from "./episode-room-suggestions";

describe("Episode Room suggestions", () => {
  it("turns the real Episode 8 archive title into one stable episode prefix", () => {
    const sourceTitle = "Podcast Ep 8: May 13 - I wasn't born a leader";
    const episodeNumber = sourceEpisodeNumber(
      "document-kind:draft;hgo-draft-kind:podcast-episode;hgo-podcast-ep:8",
      sourceTitle,
    );
    const title = suggestedEpisodeTitle(sourceTitle, episodeNumber);

    expect(episodeNumber).toBe(8);
    expect(title).toBe("Episode 8: I wasn't born a leader");
    expect(suggestedEpisodeSlug(title, episodeNumber)).toBe("episode-8-i-wasnt-born-a-leader");
  });

  it("creates a plain stable slug when there is no episode number", () => {
    expect(suggestedEpisodeSlug("A New Beginning", null)).toBe("a-new-beginning");
  });
});
