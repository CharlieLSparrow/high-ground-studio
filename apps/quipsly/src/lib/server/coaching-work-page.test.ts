import {coachingWorkPage} from "./coaching-work-page";

const at = "2026-09-07T00:00:00.000Z";
const page = (query = "", space = "space", actor = "client") => coachingWorkPage(new URLSearchParams(query), space, actor);

it("bounds queries and pages before accessing the database", () => {
  for (const query of ["pageSize=0", "pageSize=101", "pageSize=1.2", "pageSize=NaN", "kind=unknown", `q=${"x".repeat(201)}`, `item=${"x".repeat(241)}`]) {
    expect(() => page(query)).toThrow("INVALID_WORK_QUERY");
  }
  expect(page("q=++one+++thought++&kind=note&pageSize=12")).toMatchObject({q: "one thought", kind: "NOTE", take: 13});
});

it("binds a continuation to its actor, space, query, kind, and exact-item scope", () => {
  const result = page("pageSize=1&q=writing").result([
    {id: "t", kind: "TASK", updatedAt: at}, {id: "n", kind: "NOTE", updatedAt: at},
  ]);
  const cursor = result.page.nextCursor!;
  expect(page(`q=writing&cursor=${cursor}`).where("TASK")).toBeDefined();
  for (const query of ["q=other", "q=writing&kind=NOTE", "q=writing&item=n"]) {
    expect(() => page(`${query}&cursor=${cursor}`)).toThrow("INVALID_WORK_CURSOR");
  }
  expect(() => page(`q=writing&cursor=${cursor}`, "other-space")).toThrow("INVALID_WORK_CURSOR");
  expect(() => page(`q=writing&cursor=${cursor}`, "space", "other-client")).toThrow("INVALID_WORK_CURSOR");
  for (const value of ["garbage", "e30", "x".repeat(2001)]) expect(() => page(`cursor=${value}`)).toThrow("INVALID_WORK_CURSOR");
});

it("keeps database collation within a tied model and gives an empty terminal page no cursor", () => {
  const rows = [{id: "Z", kind: "NOTE" as const, updatedAt: at}, {id: "a", kind: "NOTE" as const, updatedAt: at}];
  expect(page().result(rows).entries).toEqual(rows);
  expect(page().result([])).toMatchObject({entries: [], page: {nextCursor: null}});
  expect(page("item=old-note").where("NOTE").AND).toContainEqual({id: "old-note"});
});
