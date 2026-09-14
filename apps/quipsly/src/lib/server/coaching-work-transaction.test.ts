import {retryCoachingWorkTransaction} from "./coaching-work-transaction";

it.each(["P2034", "P2002"])("retries a rolled-back %s using the original operation", async (code) => {
  const operation = jest.fn().mockRejectedValueOnce({code}).mockResolvedValue({id: "saved-once"});
  await expect(retryCoachingWorkTransaction(operation)).resolves.toEqual({id: "saved-once"});
  expect(operation).toHaveBeenCalledTimes(2);
});

it("bounds contention instead of retrying indefinitely", async () => {
  const error = {code: "P2034"};
  const operation = jest.fn().mockRejectedValue(error);
  await expect(retryCoachingWorkTransaction(operation)).rejects.toBe(error);
  expect(operation).toHaveBeenCalledTimes(5);
});

it.each([{code: "P2028"}, {code: "P2003"}, new Error("network"), null])("does not retry unrelated or unknown failures: %j", async (error) => {
  const operation = jest.fn().mockRejectedValue(error);
  await expect(retryCoachingWorkTransaction(operation)).rejects.toBe(error);
  expect(operation).toHaveBeenCalledTimes(1);
});
