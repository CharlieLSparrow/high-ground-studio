import { useEffect } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CallWorkspacePanel } from "./call-workspace-panel";

it("keeps the recording owner mounted while its panel is opened and closed", () => {
  const mounted = jest.fn();
  const unmounted = jest.fn();
  const onClose = jest.fn();
  function RecorderOwner() {
    useEffect(() => { mounted(); return unmounted; }, []);
    return <input aria-label="Recording name" defaultValue="Coaching call" />;
  }
  const panel = (open: boolean) => <CallWorkspacePanel title="Recording" open={open} onClose={onClose}><RecorderOwner /></CallWorkspacePanel>;
  const view = render(panel(false));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  view.rerender(panel(true));
  expect(screen.getByRole("dialog", { name: "Recording" })).toBeVisible();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Client follow-up" } });
  fireEvent.click(screen.getByRole("button", { name: "Close recording" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  view.rerender(panel(false));
  view.rerender(panel(true));
  expect(screen.getByRole("textbox")).toHaveValue("Client follow-up");
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(unmounted).not.toHaveBeenCalled();
});

it("handles Escape in the tool panel without sending it to the call workspace", () => {
  const onClose = jest.fn();
  const outerKey = jest.fn();
  const outerCancel = jest.fn();
  render(<dialog open aria-label="Call" onKeyDown={outerKey} onCancel={outerCancel}><CallWorkspacePanel title="Devices" open onClose={onClose}>Settings</CallWorkspacePanel></dialog>);
  const dialog = screen.getByRole("dialog", {name: "Devices"});
  fireEvent.keyDown(dialog, { key: "Escape" });
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(outerKey).not.toHaveBeenCalled();
  expect(outerCancel).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("does not let the old panel's delayed close event dismiss a newly selected tool", () => {
  const onClose = jest.fn();
  const view = render(<CallWorkspacePanel title="Recording" open onClose={onClose}>Recorder</CallWorkspacePanel>);
  const dialog = screen.getByRole("dialog");
  view.rerender(<CallWorkspacePanel title="Recording" open={false} onClose={onClose}>Recorder</CallWorkspacePanel>);
  fireEvent(dialog, new Event("close"));
  expect(onClose).not.toHaveBeenCalled();
});

it("uses a nonmodal side panel without remounting its owner or trapping call controls", () => {
  const mounted = jest.fn();
  const unmounted = jest.fn();
  const onClose = jest.fn();
  const outerKey = jest.fn();
  const host = document.createElement("div");
  document.body.append(host);
  function RecorderOwner() {
    useEffect(() => { mounted(); return unmounted; }, []);
    return <input aria-label="Recording name" defaultValue="Session recording" />;
  }
  const panel = (open: boolean) => <div onKeyDown={outerKey}>
    <button>Record</button><button>Mute</button>
    <CallWorkspacePanel title="Recording" open={open} onClose={onClose} container={host}><RecorderOwner /></CallWorkspacePanel>
  </div>;
  const view = render(panel(false));
  screen.getByRole("button", {name: "Record"}).focus();
  view.rerender(panel(true));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const region = within(host).getByRole("region", {name: "Recording"});
  expect(screen.getByRole("button", {name: "Close recording"})).toHaveFocus();
  fireEvent.change(within(region).getByRole("textbox"), {target: {value: "Client follow-up"}});
  screen.getByRole("button", {name: "Mute"}).focus();
  expect(screen.getByRole("button", {name: "Mute"})).toHaveFocus();
  within(region).getByRole("textbox").focus();
  fireEvent.keyDown(region, {key: "Escape"});
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(outerKey).not.toHaveBeenCalled();
  view.rerender(panel(false));
  expect(screen.getByRole("button", {name: "Record"})).toHaveFocus();
  expect(region).not.toBeVisible();
  view.rerender(panel(true));
  expect(within(region).getByRole("textbox")).toHaveValue("Client follow-up");
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(unmounted).not.toHaveBeenCalled();
  view.unmount();
  host.remove();
});
