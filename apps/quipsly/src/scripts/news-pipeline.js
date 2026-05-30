import Parser from 'rss-parser';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';

// Initialize RSS parser and Gemini AI client
const parser = new Parser();
// Requires GEMINI_API_KEY environment variable to be set
const ai = new GoogleGenAI({});

// The requested stylistic persona
const SYSTEM_PROMPT = `Malcolm Gladwell, Daniel Pink, Michael Lewis, had Terry Pratchett write all their books in Discworld Style. It strives to be Warm, Witty, Never Self Serious or Self Aggrandizing, Wise, in awe of the world and excited to tell people cool stuff about it, Warm.`;

// Define the 10 niches and their corresponding RSS feeds (URLs mocked/estimated for some)
const niches = [
  { 
    name: 'AI', 
    feedUrl: 'https://export.arxiv.org/rss/cs.AI',
    notes: 'Keep in mind that this AI news will eventually be turned into a "Tonight Show" style daily news show.'
  },
  { 
    name: 'Leadership', 
    feedUrl: 'https://hbr.org/rss/articles',
    notes: 'Must include focus on sub-topics: Sidekick Leadership, ADHD Leadership.'
  },
  { 
    name: 'ADHD', 
    feedUrl: 'https://www.additudemag.com/feed/' 
  },
  { 
    name: 'Photography and Videography', 
    feedUrl: 'https://www.petapixel.com/feed/' 
  },
  { 
    name: 'Data Science / Analytics and Data Storytelling', 
    feedUrl: 'https://towardsdatascience.com/feed' 
  },
  { 
    name: 'Course Creation and Learning Sciences', 
    feedUrl: 'https://elearningindustry.com/feed' 
  },
  { 
    name: 'Storytelling', 
    feedUrl: 'https://www.storynory.com/feed/' 
  },
  { 
    name: 'Ukulele', 
    feedUrl: 'https://ukuleleunderground.com/feed/' 
  },
  { 
    name: 'Guitar', 
    feedUrl: 'https://www.premierguitar.com/feed' 
  },
  { 
    name: 'Wood Laser Creators', 
    feedUrl: 'https://lasercuttingblog.com/feed/'
  }
];

async function generateArticleForNiche(niche) {
  console.log(`Fetching news for ${niche.name}...`);
  try {
    const feed = await parser.parseURL(niche.feedUrl);
    
    // Take the top 3 items to summarize
    const topItems = feed.items.slice(0, 3).map(item => ({
      title: item.title,
      link: item.link,
      contentSnippet: item.contentSnippet || item.content,
    }));
    
    if (topItems.length === 0) {
      console.log(`No news found for ${niche.name}`);
      return;
    }

    const newsData = JSON.stringify(topItems, null, 2);
    
    // Build the prompt dynamically including notes/subtopics if they exist
    let prompt = `Here are the latest news items for the niche: ${niche.name}.\n`;
    if (niche.notes) {
      prompt += `\nCRITICAL CONTEXT: ${niche.notes}\n`;
    }
    
    prompt += `
${newsData}

Please write an engaging, combined news summary article for these items formatted in Markdown. 
Remember to strictly follow your persona instructions. Include a catchy title and links to the original articles.`;

    console.log(`Generating article for ${niche.name} with Gemini...`);
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: 0.7,
        }
    });

    const articleContent = response.text;
    
    // Save to a Markdown file
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `${niche.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${dateStr}.md`;
    const outputPath = path.join(process.cwd(), 'articles', filename);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    
    await fs.writeFile(outputPath, articleContent, 'utf-8');
    console.log(`Successfully generated and saved: ${filename}`);

  } catch (error) {
    console.error(`Error processing niche ${niche.name}:`, error.message);
  }
}

async function main() {
  console.log('Starting Autonomous News Pipeline...');
  for (const niche of niches) {
    await generateArticleForNiche(niche);
  }
  console.log('Pipeline finished successfully.');
}

main();
