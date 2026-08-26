import { createBrowserSourceDurableWriter } from "./browser-source-vault";

describe("browser source vault worker writer", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("poisons and terminates an ambiguous timed-out writer instead of waiting again", async () => {
    jest.useFakeTimers();
    const originalWorker = globalThis.Worker;
    const terminate = jest.fn();
    const postedActions: string[] = [];

    class FakeWorker {
      private readonly listeners = new Map<
        string,
        Array<(event: MessageEvent<unknown>) => void>
      >();

      addEventListener(
        type: string,
        listener: (event: MessageEvent<unknown>) => void,
      ) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }

      postMessage(packet: { id: number; action: string }) {
        postedActions.push(packet.action);
        if (packet.action !== "init") return;
        window.setTimeout(() => {
          for (const listener of this.listeners.get("message") ?? []) {
            listener(
              new MessageEvent("message", {
                data: {
                  id: packet.id,
                  ok: true,
                  committedSizeBytes: 0,
                },
              }),
            );
          }
        }, 0);
      }

      terminate = terminate;
    }

    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      writable: true,
      value: FakeWorker,
    });

    try {
      const writerPromise = createBrowserSourceDurableWriter("capture.webm.part");
      await jest.runOnlyPendingTimersAsync();
      const writer = await writerPromise;

      const chunk = {
        size: 3,
        arrayBuffer: async () => new Uint8Array([97, 98, 99]).buffer,
      } as Blob;
      const writePromise = writer.write(chunk, 0);
      const timedOut = expect(writePromise).rejects.toThrow(
        "timed out; its final write state is being recovered",
      );
      await jest.advanceTimersByTimeAsync(60_000);
      await timedOut;

      await expect(writer.close()).rejects.toThrow(
        "timed out; its final write state is being recovered",
      );
      expect(postedActions).toEqual(["init", "write"]);
      expect(terminate).toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, "Worker", {
        configurable: true,
        writable: true,
        value: originalWorker,
      });
    }
  });
});
