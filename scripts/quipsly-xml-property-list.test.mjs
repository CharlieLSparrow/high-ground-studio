#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { parseXmlPropertyList } from "./lib/parse-xml-property-list.mjs";

test("parses the committed Capture privacy manifest without macOS tools", () => {
  const privacy = parseXmlPropertyList(
    fs.readFileSync(
      "apps/mobile-capture/HighGroundCapture/HighGroundCapture/PrivacyInfo.xcprivacy",
      "utf8",
    ),
  );

  assert.equal(privacy.NSPrivacyTracking, false);
  assert.deepEqual(privacy.NSPrivacyTrackingDomains, []);
  assert.equal(
    privacy.NSPrivacyAccessedAPITypes[2].NSPrivacyAccessedAPIType,
    "NSPrivacyAccessedAPICategoryDiskSpace",
  );
  assert.deepEqual(
    privacy.NSPrivacyAccessedAPITypes[2].NSPrivacyAccessedAPITypeReasons,
    ["E174.1"],
  );
});

test("parses nested values and decodes XML entities", () => {
  assert.deepEqual(
    parseXmlPropertyList(`
      <?xml version="1.0"?>
      <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "PropertyList-1.0.dtd">
      <plist version="1.0">
        <dict>
          <key>title</key><string>Research &amp; writing</string>
          <key>count</key><integer>2</integer>
          <key>ratio</key><real>1.5</real>
          <key>enabled</key><true/>
          <key>items</key><array><string>A</string><false/></array>
        </dict>
      </plist>
    `),
    {
      title: "Research & writing",
      count: 2,
      ratio: 1.5,
      enabled: true,
      items: ["A", false],
    },
  );
});

test("rejects duplicate keys and malformed values", () => {
  assert.throws(
    () => parseXmlPropertyList("<plist><dict><key>x</key><true/><key>x</key><false/></dict></plist>"),
    /Duplicate property-list key: x/,
  );
  assert.throws(
    () => parseXmlPropertyList("<plist><date>today</date></plist>"),
    /Unsupported or malformed property-list value/,
  );
});
