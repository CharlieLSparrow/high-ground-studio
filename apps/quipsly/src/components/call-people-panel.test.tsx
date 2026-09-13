import { fireEvent, render, screen, within } from "@testing-library/react";
import { CallPeoplePanel } from "./call-people-panel";
import { callEndpointDetails } from "./call-roster";

const participants = [
  { identity: "coach-browser", name: "Casey Coach", isLocal: true, speaking: false, microphoneMuted: true },
  { identity: "client-phone", name: "Riley Client", isLocal: false, speaking: true, microphoneMuted: false },
];

it("shows two devices under one person and tracks each device's audio and sharing", () => {
  const metadata = JSON.stringify({callRoomId: "room", participantId: "riley"});
  const devices = [participants[0], {...participants[1], ...callEndpointDetails("client-phone", metadata), deviceLabel: "iPhone", companion: true, microphoneMuted: true},
    {...participants[1], identity: "client-browser", ...callEndpointDetails("client-browser", metadata), deviceLabel: "Browser"}];
  const view = render(<CallPeoplePanel participants={devices} sharingIdentities={["client-browser"]} />);
  expect(screen.getByText("2 people in this call")).toBeVisible();
  expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getAllByText("Riley Client")).toHaveLength(1);
  expect(screen.getByText("iPhone")).toBeVisible();
  expect(screen.getByText("Audio on another device")).toBeVisible();
  expect(screen.getByText("Browser")).toBeVisible();
  expect(screen.getByText("Speaking")).toBeVisible();
  expect(screen.getByText("Sharing screen")).toBeVisible();
  view.rerender(<CallPeoplePanel participants={devices.slice(0, 2)} />);
  expect(screen.getByText("2 people in this call")).toBeVisible();
  expect(screen.queryByText("Browser")).not.toBeInTheDocument();
});

it("shows transport membership, the current device and microphone state without moderator actions", () => {
  render(<CallPeoplePanel participants={participants} sharingIdentities={["client-phone"]} />);
  expect(screen.getByText("2 people in this call")).toBeVisible();
  expect(screen.getByText("Casey Coach (you)")).toBeVisible();
  expect(screen.getByText("Sharing screen")).toBeVisible();
  expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(2);
  expect(screen.queryByRole("button", {name: /mute|remove/i})).not.toBeInTheDocument();
});

it("searches names without changing the connected roster and follows joins and leaves", () => {
  const view = render(<CallPeoplePanel participants={participants} />);
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "RILEY"}});
  expect(screen.queryByText("Casey Coach (you)")).not.toBeInTheDocument();
  expect(screen.getByText("Riley Client")).toBeVisible();
  expect(screen.getByText("2 people in this call")).toBeVisible();
  view.rerender(<CallPeoplePanel participants={[participants[0]]} />);
  expect(screen.getByRole("status")).toHaveTextContent("No one matches that name.");
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: ""}});
  expect(screen.getByText("Casey Coach (you)")).toBeVisible();
  view.rerender(<CallPeoplePanel participants={[]} />);
  expect(screen.getByRole("status")).toHaveTextContent("People will appear here when they join.");
});
