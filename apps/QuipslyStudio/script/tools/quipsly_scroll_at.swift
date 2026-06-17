#!/usr/bin/env swift
import Foundation
import CoreGraphics

func usage() -> Never {
    fputs("Usage: quipsly_scroll_at.swift <x> <y> <deltaX> <deltaY> [repeatCount]\n", stderr)
    exit(64)
}

let args = CommandLine.arguments.dropFirst()
guard args.count == 4 || args.count == 5 else { usage() }
let values = args.compactMap(Double.init)
guard values.count == args.count else { usage() }

let x = values[0]
let y = values[1]
let deltaX = Int32(values[2])
let deltaY = Int32(values[3])
let repeatCount = max(1, Int(values.count == 5 ? values[4] : 1))
let point = CGPoint(x: x, y: y)

let source = CGEventSource(stateID: .hidSystemState)

if let move = CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left) {
    move.post(tap: .cghidEventTap)
}

usleep(120_000)

for _ in 0..<repeatCount {
    if let scroll = CGEvent(
        scrollWheelEvent2Source: source,
        units: .pixel,
        wheelCount: 2,
        wheel1: deltaY,
        wheel2: deltaX,
        wheel3: 0
    ) {
        scroll.location = point
        scroll.post(tap: .cghidEventTap)
    }
    usleep(40_000)
}
