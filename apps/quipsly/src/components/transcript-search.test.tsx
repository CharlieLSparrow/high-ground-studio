import { fireEvent, render, screen } from "@testing-library/react";
import { TranscriptSearch, TranscriptSearchHighlight } from "./transcript-search";

const segments = [
  {id: "one", speakerLabel: "Riley", text: "Draft chapter one."},
  {id: "two", speakerLabel: "Casey", text: "Chapter two is next."},
];

it("finds text and speakers, cycles matches with Enter, and never removes transcript content", () => {
  const onHighlight = jest.fn();
  const scroll = jest.fn();
  Element.prototype.scrollIntoView = scroll;
  render(<><TranscriptSearch segments={segments} onHighlight={onHighlight} /><article id="transcript-segment-one">A draft stays mounted</article><article id="transcript-segment-two">Another draft</article></>);
  const input = screen.getByRole("searchbox", {name: "Find in transcript"});
  fireEvent.change(input, {target: {value: "CHAPTER"}});
  expect(screen.getByRole("status")).toHaveTextContent("2 matching passages");
  fireEvent.keyDown(input, {key: "Enter"});
  expect(screen.getByRole("status")).toHaveTextContent("1 of 2");
  fireEvent.keyDown(input, {key: "Enter", shiftKey: true});
  expect(screen.getByRole("status")).toHaveTextContent("2 of 2");
  expect(scroll).toHaveBeenCalledTimes(2);
  expect(screen.getByText("A draft stays mounted")).toBeVisible();
  fireEvent.change(input, {target: {value: "riley"}});
  expect(screen.getByRole("status")).toHaveTextContent("1 matching passage");
  fireEvent.click(screen.getByRole("button", {name: "Clear transcript search"}));
  expect(input).toHaveValue("");
  expect(onHighlight).toHaveBeenLastCalledWith("");
});

it("handles zero matches without jumping or changing recording state", () => {
  render(<TranscriptSearch segments={segments} onHighlight={jest.fn()} />);
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "[missing]"}});
  expect(screen.getByRole("status")).toHaveTextContent("No matching passages");
  expect(screen.getByRole("button", {name: "Next matching passage"})).toBeDisabled();
});

it("highlights repeated literal text without treating it as HTML or regex", () => {
  const {container} = render(<TranscriptSearchHighlight text="Try [it] then [IT] <script>" query="[it]" />);
  expect(container.querySelectorAll("mark")).toHaveLength(2);
  expect(container.textContent).toBe("Try [it] then [IT] <script>");
  expect(container.querySelector("script")).toBeNull();
});
