#!/usr/bin/env swift
import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

enum EventToolError: Error, CustomStringConvertible {
    case usage(String)
    case invalidNumber(String)
    case appNotFound(String)

    var description: String {
        switch self {
        case .usage(let message):
            return message
        case .invalidNumber(let value):
            return "Invalid number: \(value)"
        case .appNotFound(let bundleId):
            return "No running application found for bundle id: \(bundleId)"
        }
    }
}

func usage() -> Never {
    print("""
    QuipslyStudio macOS event control

    Usage:
      script/mac_eventctl.swift activate <bundle-id>
      script/mac_eventctl.swift move <x> <y>
      script/mac_eventctl.swift click <x> <y>
      script/mac_eventctl.swift drag <startX> <startY> <endX> <endY>
      script/mac_eventctl.swift scroll <x> <y> <deltaX> <deltaY> [repeatCount]
      script/mac_eventctl.swift key <virtual-key-code>
      script/mac_eventctl.swift check-access
      script/mac_eventctl.swift request-access

    Notes:
      - Coordinates are global screen coordinates.
      - Scroll uses CGEvent, so it exercises the real app event path.
      - macOS may require Accessibility permission for Terminal/Codex.
    """)
    exit(2)
}

func number(_ value: String) throws -> Double {
    guard let parsed = Double(value) else { throw EventToolError.invalidNumber(value) }
    return parsed
}

func intNumber(_ value: String) throws -> Int32 {
    guard let parsed = Int32(value) else { throw EventToolError.invalidNumber(value) }
    return parsed
}

func int(_ value: String) throws -> Int {
    guard let parsed = Int(value) else { throw EventToolError.invalidNumber(value) }
    return parsed
}

func point(_ args: [String], start: Int = 0) throws -> CGPoint {
    guard args.count >= start + 2 else { throw EventToolError.usage("Missing x/y coordinates.") }
    return CGPoint(x: try number(args[start]), y: try number(args[start + 1]))
}

func post(_ event: CGEvent?) {
    event?.post(tap: .cghidEventTap)
}

func runningApp(bundleId: String) throws -> NSRunningApplication {
    guard let app = NSWorkspace.shared.runningApplications.first(where: { $0.bundleIdentifier == bundleId }) else {
        throw EventToolError.appNotFound(bundleId)
    }
    return app
}

let args = Array(CommandLine.arguments.dropFirst())
guard let command = args.first else { usage() }

do {
    switch command {
    case "activate":
        guard args.count >= 2 else { throw EventToolError.usage("Missing bundle id.") }
        let bundleId = args[1]
        let app = try runningApp(bundleId: bundleId)
        app.activate(options: [.activateAllWindows])
        print("activated bundleId=\(bundleId)")

    case "check-access":
        let allowed = CGPreflightPostEventAccess()
        let axTrusted = AXIsProcessTrusted()
        print("postEventAccess=\(allowed ? "allowed" : "blocked")")
        print("accessibilityTrusted=\(axTrusted ? "allowed" : "blocked")")

    case "request-access":
        let eventAllowed = CGRequestPostEventAccess()
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        let axTrusted = AXIsProcessTrustedWithOptions(options)
        print("postEventAccess=\(eventAllowed ? "allowed" : "blocked")")
        print("accessibilityTrusted=\(axTrusted ? "allowed" : "blocked")")
        print("hint=If blocked, grant Accessibility/Input Monitoring to Codex or Terminal, then rerun check-access.")

    case "move":
        let p = try point(args, start: 1)
        CGWarpMouseCursorPosition(p)
        CGAssociateMouseAndMouseCursorPosition(boolean_t(1))
        print("moved x=\(Int(p.x)) y=\(Int(p.y))")

    case "click":
        let p = try point(args, start: 1)
        CGWarpMouseCursorPosition(p)
        CGAssociateMouseAndMouseCursorPosition(boolean_t(1))
        post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left))
        usleep(25_000)
        post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left))
        print("clicked x=\(Int(p.x)) y=\(Int(p.y))")

    case "drag":
        guard args.count >= 5 else { throw EventToolError.usage("Missing drag args: <startX> <startY> <endX> <endY>.") }
        let start = try point(args, start: 1)
        let end = try point(args, start: 3)
        let source = CGEventSource(stateID: .hidSystemState)
        CGWarpMouseCursorPosition(start)
        CGAssociateMouseAndMouseCursorPosition(boolean_t(1))
        post(CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: start, mouseButton: .left))
        usleep(40_000)
        post(CGEvent(mouseEventSource: source, mouseType: .leftMouseDragged, mouseCursorPosition: end, mouseButton: .left))
        usleep(40_000)
        post(CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: end, mouseButton: .left))
        print("dragged startX=\(Int(start.x)) startY=\(Int(start.y)) endX=\(Int(end.x)) endY=\(Int(end.y))")

    case "scroll":
        guard args.count >= 5 else { throw EventToolError.usage("Missing scroll args: <x> <y> <deltaX> <deltaY> [repeatCount].") }
        let p = try point(args, start: 1)
        let deltaX = try intNumber(args[3])
        let deltaY = try intNumber(args[4])
        let repeatCount = max(1, try (args.count >= 6 && !args[5].isEmpty) ? int(args[5]) : 1)
        CGWarpMouseCursorPosition(p)
        CGAssociateMouseAndMouseCursorPosition(boolean_t(1))
        let source = CGEventSource(stateID: .hidSystemState)
        for _ in 0..<repeatCount {
            let event = CGEvent(
                scrollWheelEvent2Source: source,
                units: .pixel,
                wheelCount: 2,
                wheel1: deltaY,
                wheel2: deltaX,
                wheel3: 0
            )
            event?.location = p
            post(event)
            usleep(40_000)
        }
        print("scrolled x=\(Int(p.x)) y=\(Int(p.y)) deltaX=\(deltaX) deltaY=\(deltaY) repeatCount=\(repeatCount)")

    case "key":
        guard args.count >= 2 else { throw EventToolError.usage("Missing virtual key code.") }
        let keyCode = CGKeyCode(try intNumber(args[1]))
        post(CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true))
        usleep(20_000)
        post(CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false))
        print("key virtualKeyCode=\(keyCode)")

    default:
        usage()
    }
} catch {
    fputs("\(error)\n", stderr)
    exit(2)
}
