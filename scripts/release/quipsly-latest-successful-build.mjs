#!/usr/bin/env node

const imageName = process.argv[2]?.trim();
if (!imageName) {
  console.error("Usage: quipsly-latest-successful-build.mjs <image-name>");
  process.exit(2);
}

let input = "";
for await (const chunk of process.stdin) input += chunk;

let builds;
try {
  builds = JSON.parse(input || "[]");
} catch {
  console.error("Cloud Build history was not valid JSON.");
  process.exit(2);
}

if (!Array.isArray(builds)) {
  console.error("Cloud Build history must be a JSON array.");
  process.exit(2);
}

const latest = builds
  .filter((build) => (
    build?.status === "SUCCESS"
      && build?.substitutions?._IMAGE_NAME === imageName
      && Number.isFinite(Date.parse(build?.createTime || ""))
  ))
  .sort((left, right) => Date.parse(right.createTime) - Date.parse(left.createTime))[0];

if (latest) process.stdout.write(latest.createTime);
