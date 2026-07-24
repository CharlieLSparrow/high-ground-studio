function decodeXmlText(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#([0-9]+);/g, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 10)));
}

function tokenize(xml) {
  const withoutMetadata = xml
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  return withoutMetadata.match(/<[^>]+>|[^<]+/g) ?? [];
}

export function parseXmlPropertyList(xml) {
  const tokens = tokenize(String(xml));
  let index = 0;

  function skipWhitespace() {
    while (index < tokens.length && !tokens[index].startsWith("<") && tokens[index].trim() === "") {
      index += 1;
    }
  }

  function expect(expected) {
    skipWhitespace();
    const actual = tokens[index];
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, found ${actual ?? "end of document"}.`);
    }
    index += 1;
  }

  function readTextElement(tag) {
    const opening = tokens[index];
    if (opening === `<${tag}/>` || opening === `<${tag} />`) {
      index += 1;
      return "";
    }
    expect(`<${tag}>`);
    const chunks = [];
    while (index < tokens.length && tokens[index] !== `</${tag}>`) {
      if (tokens[index].startsWith("<")) {
        throw new Error(`Unexpected nested element ${tokens[index]} inside <${tag}>.`);
      }
      chunks.push(tokens[index]);
      index += 1;
    }
    expect(`</${tag}>`);
    return decodeXmlText(chunks.join(""));
  }

  function parseValue() {
    skipWhitespace();
    const token = tokens[index];

    if (token === "<dict/>" || token === "<dict />") {
      index += 1;
      return {};
    }
    if (token === "<dict>") {
      index += 1;
      const value = {};
      while (true) {
        skipWhitespace();
        if (tokens[index] === "</dict>") {
          index += 1;
          return value;
        }
        if (tokens[index] !== "<key>") {
          throw new Error(`Expected <key> inside <dict>, found ${tokens[index] ?? "end of document"}.`);
        }
        const key = readTextElement("key");
        if (Object.hasOwn(value, key)) {
          throw new Error(`Duplicate property-list key: ${key}.`);
        }
        value[key] = parseValue();
      }
    }
    if (token === "<array/>" || token === "<array />") {
      index += 1;
      return [];
    }
    if (token === "<array>") {
      index += 1;
      const value = [];
      while (true) {
        skipWhitespace();
        if (tokens[index] === "</array>") {
          index += 1;
          return value;
        }
        value.push(parseValue());
      }
    }
    if (token === "<true/>" || token === "<true />") {
      index += 1;
      return true;
    }
    if (token === "<false/>" || token === "<false />") {
      index += 1;
      return false;
    }
    if (token === "<string>" || token === "<string/>" || token === "<string />") {
      return readTextElement("string");
    }
    if (token === "<integer>") {
      const value = readTextElement("integer").trim();
      if (!/^-?\d+$/.test(value)) throw new Error(`Invalid property-list integer: ${value}.`);
      return Number.parseInt(value, 10);
    }
    if (token === "<real>") {
      const value = readTextElement("real").trim();
      if (!/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
        throw new Error(`Invalid property-list real: ${value}.`);
      }
      return Number.parseFloat(value);
    }

    throw new Error(`Unsupported or malformed property-list value: ${token ?? "end of document"}.`);
  }

  skipWhitespace();
  const plistOpening = tokens[index];
  if (!/^<plist(?:\s+version=(?:"[^"]*"|'[^']*'))?\s*>$/.test(plistOpening ?? "")) {
    throw new Error(`Expected <plist> root, found ${plistOpening ?? "end of document"}.`);
  }
  index += 1;
  const value = parseValue();
  expect("</plist>");
  skipWhitespace();
  if (index !== tokens.length) {
    throw new Error(`Unexpected content after </plist>: ${tokens[index]}.`);
  }
  return value;
}
