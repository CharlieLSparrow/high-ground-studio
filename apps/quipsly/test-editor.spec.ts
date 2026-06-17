import { test, expect } from '@playwright/test';

test('play with episodes 1-3 in the editor', async ({ page }) => {
  test.setTimeout(60000); // 1 minute timeout

  const projectSlug = 'high-ground-odyssey-manuscript';
  const episodes = ['episode-1', 'episode-2', 'episode-3'];

  for (const episode of episodes) {
    console.log(`\nNavigating to ${episode}...`);
    const url = `http://localhost:3001/editor?project=${projectSlug}&episode=${episode}`;
    console.log(`URL: ${url}`);
    
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasEditorText = bodyText.includes('Video Segmenter') || bodyText.includes('Manuscript') || bodyText.includes('Timeline') || bodyText.includes('TIMELINE');
    console.log(`Episode ${episode} loaded successfully? ${hasEditorText ? 'Yes' : 'No'}`);
    
    const mediaCount = await page.evaluate(() => document.querySelectorAll('video, iframe').length);
    console.log(`Found ${mediaCount} media elements in the editor for ${episode}`);
    
    // Play with it: click the TIMELINE button
    const timelineButton = page.getByRole('button', { name: 'TIMELINE', exact: true });
    if (await timelineButton.isVisible()) {
      console.log('Clicking TIMELINE view...');
      await timelineButton.click();
      await page.waitForTimeout(2000);
      console.log('Played with the timeline view for ' + episode);
    }
  }
});
