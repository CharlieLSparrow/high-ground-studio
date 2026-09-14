import { render, screen } from "@testing-library/react";
import { TagSearchChips } from "./tag-search-chips";

test("shows canonical colors with readable labels and exact tag navigation", () => {
  render(<TagSearchChips tags={[
    { id: "tag-forest", label: "Research", hexColor: "#23452b" },
    { id: "tag-paper", label: "Ideas", hexColor: "#eedcb3" },
    { id: "tag-old", label: "Previous focus", hexColor: "#23452b", isActive: false },
  ]} />);
  const forest = screen.getByRole("link", { name: "Find all accessible work tagged Research" });
  expect(forest).toHaveAttribute("href", "/find?tag=tag-forest");
  expect(forest).toHaveStyle({ backgroundColor: "#23452b", color: "#ffffff" });
  expect(screen.getByRole("link", { name: "Find all accessible work tagged Ideas" }))
    .toHaveStyle({ backgroundColor: "#eedcb3", color: "#000000" });
  expect(screen.getByRole("link", { name: /Previous focus \(archived\)/ }))
    .toHaveTextContent("#Previous focus · archived");
});

test("uncolored and malformed legacy values use the theme, not a made-up tag color", () => {
  render(<TagSearchChips tags={[{ id: "plain", label: "Plain" },
    { id: "invalid", label: "Invalid color", hexColor: "url(https://example.test)" }]} />);
  for (const link of screen.getAllByRole("link")) expect(link).not.toHaveAttribute("style");
});

test("empty tags do not add an empty visual section", () => {
  const { container } = render(<TagSearchChips tags={[]} />);
  expect(container).toBeEmptyDOMElement();
});
