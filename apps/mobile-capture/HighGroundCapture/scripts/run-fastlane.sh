#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
capture_root="$(cd "${script_dir}/.." && pwd)"
ruby_version_file="${capture_root}/.ruby-version"
gemfile_lock="${capture_root}/Gemfile.lock"

fail() {
  echo "FAIL $*" >&2
  exit 1
}

[[ "$#" -ge 1 ]] || fail "Usage: $0 <verify|ui_test|candidate|release|beta> [fastlane options]"

lane="$1"
shift
case "${lane}" in
  verify|ui_test|candidate|release|beta) ;;
  *) fail "Unsupported Capture lane: ${lane}" ;;
esac

[[ -f "${ruby_version_file}" ]] || fail "Missing pinned Ruby version at ${ruby_version_file}"
[[ -f "${gemfile_lock}" ]] || fail "Missing dependency lock at ${gemfile_lock}"

required_ruby_version="$(tr -d '[:space:]' < "${ruby_version_file}")"
required_bundler_version="$(
  awk '
    /^BUNDLED WITH$/ {
      getline
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      print
      exit
    }
  ' "${gemfile_lock}"
)"

[[ "${required_ruby_version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
  fail "Invalid pinned Ruby version: ${required_ruby_version}"
[[ "${required_bundler_version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
  fail "Invalid pinned Bundler version: ${required_bundler_version}"

candidate_bins=()
if command -v ruby >/dev/null 2>&1; then
  candidate_bins+=("$(dirname "$(command -v ruby)")")
fi
candidate_bins+=(
  "/opt/homebrew/opt/ruby/bin"
  "/usr/local/opt/ruby/bin"
)
if command -v brew >/dev/null 2>&1; then
  brewed_ruby_prefix="$(brew --prefix ruby 2>/dev/null || true)"
  if [[ -n "${brewed_ruby_prefix}" ]]; then
    candidate_bins+=("${brewed_ruby_prefix}/bin")
  fi
fi

ruby_bin=""
for candidate_bin in "${candidate_bins[@]}"; do
  candidate_ruby="${candidate_bin}/ruby"
  candidate_bundle="${candidate_bin}/bundle"
  [[ -x "${candidate_ruby}" && -x "${candidate_bundle}" ]] || continue

  candidate_ruby_version="$(
    "${candidate_ruby}" -e 'print RUBY_VERSION' 2>/dev/null || true
  )"
  candidate_bundler_version="$(
    "${candidate_ruby}" "${candidate_bundle}" --version 2>/dev/null |
      awk '{ print $NF }' || true
  )"
  if [[ "${candidate_ruby_version}" == "${required_ruby_version}" &&
        "${candidate_bundler_version}" == "${required_bundler_version}" ]]; then
    ruby_bin="${candidate_bin}"
    break
  fi
done

if [[ -z "${ruby_bin}" ]]; then
  fail "Capture release tooling requires Ruby ${required_ruby_version} and Bundler ${required_bundler_version}. Install the pinned Ruby with Homebrew, mise, or rbenv; do not modify Apple's system Ruby."
fi

user_cache_root="$(getconf DARWIN_USER_CACHE_DIR 2>/dev/null || true)"
if [[ -z "${user_cache_root}" ]]; then
  user_cache_root="/tmp/quipsly-capture-bundle-${UID}"
fi

export PATH="${ruby_bin}:${PATH}"
export BUNDLE_GEMFILE="${capture_root}/Gemfile"
export BUNDLE_PATH="${BUNDLE_PATH:-${user_cache_root%/}/quipsly-capture/bundle/ruby-${required_ruby_version}}"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

[[ -x "${DEVELOPER_DIR}/usr/bin/xcodebuild" ]] ||
  fail "Pinned Xcode developer directory is unavailable: ${DEVELOPER_DIR}"

cd "${capture_root}"
if ! "${ruby_bin}/ruby" "${ruby_bin}/bundle" check >/dev/null 2>&1; then
  "${ruby_bin}/ruby" "${ruby_bin}/bundle" install --jobs 4 --retry 3
fi

if ! git diff --quiet -- Gemfile Gemfile.lock .ruby-version; then
  fail "Bundler changed the committed Capture toolchain contract. Review and commit that dependency change before release work."
fi

exec "${ruby_bin}/ruby" "${ruby_bin}/bundle" exec fastlane ios "${lane}" "$@"
