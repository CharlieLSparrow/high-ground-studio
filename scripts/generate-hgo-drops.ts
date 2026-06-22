import fs from 'fs';
import path from 'path';

// High Ground Odyssey Themes and Concepts
const themes = [
  { id: 'void-ember', tone: 'dark, introspective, gritty', keywords: ['void', 'rust', 'lightning', 'silence', 'ruin'] },
  { id: 'solar-flare', tone: 'passionate, explosive, urgent', keywords: ['flame', 'burn', 'territory', 'horizon', 'ash'] },
  { id: 'deep-neon', tone: 'cyber, artificial, slick', keywords: ['circuit', 'grid', 'pulse', 'synthetic', 'echo'] },
  { id: 'odyssey-light', tone: 'hopeful, vast, classical', keywords: ['map', 'compass', 'journey', 'vantage', 'stars'] }
];

const speakers = ['Nell', 'The Architect', 'Caelum', 'High Ground Odyssey', 'The Archivist', 'System Log'];

const structures = [
  "The {noun} is not the {noun2}, but the {verb} on the edges tell you exactly where the {noun3} live.",
  "I woke up without {noun}, {noun2}, or any of the traditional equipment for having a {adjective} morning.",
  "We don't {verb} the {noun} because it is easy. We {verb} it because the alternative is {adjective}.",
  "A {noun} built on {noun2} will eventually {verb} its creators.",
  "If you stare into the {noun} long enough, the {noun} begins to {verb} back.",
  "There is a difference between {noun} and {noun2}. One you {verb}, the other you survive.",
  "System text: LOCATION: {noun}. LEGAL STATUS: {adjective}.",
  "They told us the {noun} would {verb} us. They lied. It {verb2} us.",
  "When the {noun} falls, only the {adjective} will {verb}.",
  "To {verb} a {noun} is to invite {noun2} into your {noun3}."
];

const words = {
  noun: ['map', 'void', 'ship', 'truth', 'city', 'grid', 'machine', 'heart', 'star', 'mountain', 'abyss', 'code'],
  noun2: ['territory', 'rust', 'engine', 'lie', 'ruin', 'circuit', 'ghost', 'soul', 'planet', 'valley', 'silence', 'data'],
  noun3: ['monsters', 'gods', 'demons', 'creators', 'architects', 'shadows', 'scrappers', 'planners'],
  verb: ['burn', 'climb', 'build', 'destroy', 'understand', 'fear', 'embrace', 'rewrite', 'seek', 'hide'],
  verb2: ['freed', 'broke', 'remade', 'saved', 'condemned', 'erased', 'illuminated', 'blinded'],
  adjective: ['bad', 'inevitable', 'quiet', 'loud', 'broken', 'perfect', 'flawed', 'endless', 'terminal', 'unlawful']
};

function getRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateQuote() {
  let template = getRandom(structures);

  return template
    .replace(/\{noun\}/g, () => getRandom(words.noun))
    .replace(/\{noun2\}/g, () => getRandom(words.noun2))
    .replace(/\{noun3\}/g, () => getRandom(words.noun3))
    .replace(/\{verb\}/g, () => getRandom(words.verb))
    .replace(/\{verb2\}/g, () => getRandom(words.verb2))
    .replace(/\{adjective\}/g, () => getRandom(words.adjective));
}

const drops = [];

for (let i = 1; i <= 100; i++) {
  const theme = getRandom(themes);
  const speaker = getRandom(speakers);
  const quote = generateQuote();

  const packetJson = {
    snippet: {
      id: `hgo-drop-${i}`,
      highlightedText: `[${speaker}] "${quote}"`,
      note: `Generated based on ${theme.tone} themes.`,
      sourceTitle: `Odyssey Archives Vol. ${Math.floor(i / 10) + 1}`,
      createdAt: new Date().toISOString()
    },
    themeId: theme.id,
    aspect: i % 3 === 0 ? 'landscape' : 'square',
    align: i % 4 === 0 ? 'left' : 'center',
    fontSize: Math.floor(Math.random() * 10) + 24
  };

  drops.push({
    slug: `hgo-daily-drop-${i}`,
    kind: 'quote-card',
    title: `Daily Drop ${i}: ${speaker}'s Wisdom`,
    status: 'draft',
    packetJson: JSON.stringify(packetJson),
    publishAt: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString() // 1 per day starting tomorrow
  });
}

const outputPath = path.join(process.cwd(), 'content', 'hgo-daily-drops.json');
fs.writeFileSync(outputPath, JSON.stringify(drops, null, 2));

console.log(`Successfully generated 100 usable examples to ${outputPath}`);
