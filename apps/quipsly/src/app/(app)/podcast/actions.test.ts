import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { canAccessStudio } from "@/lib/studio-authz";
import { createEpisodeAction, getCloudRendersAction, getEpisodesAction } from "./actions";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/studio-authz", () => ({ canAccessStudio: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

describe("podcast desk truth states", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    (auth as jest.Mock).mockResolvedValue({
      user: {
        id: "user-1",
        primaryEmail: "producer@example.com",
        roles: ["studio"],
      },
    });
    (canAccessStudio as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("fails closed without substituting simulated episodes when the database read fails", async () => {
    (getPrismaClient as jest.Mock).mockReturnValue({
      podcastEpisode: {
        findMany: jest.fn().mockRejectedValue(new Error("database unavailable")),
      },
    });

    const result = await getEpisodesAction();

    expect(result).toMatchObject({
      success: false,
      state: "unavailable",
      episodes: [],
    });
    expect(result).not.toHaveProperty("isSimulated");
    expect(result.error).toContain("No episode list was loaded");
  });

  it("does not expose hard-coded cloud renders as production media", async () => {
    const result = await getCloudRendersAction();

    expect(result).toMatchObject({
      success: false,
      state: "unavailable",
      renders: [],
    });
    expect(result.error).toContain("not connected");
  });

  it("rejects unauthenticated podcast writes without a development bypass", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const result = await createEpisodeAction({
      slug: "unpersisted-episode",
      title: "Unpersisted episode",
      description: "This must not be written.",
      audioUrl: "https://example.invalid/audio.mp3",
      audioSizeBytes: 100,
      durationSeconds: 10,
      episodeType: "full",
    });

    expect(result).toEqual({ success: false, error: "Sign in required." });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });
});
