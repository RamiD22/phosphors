import puppeteer from 'puppeteer-core';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Find Chrome on macOS
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function captureArtScreenshot(url, outputPath) {
  console.log(`📸 Capturing screenshot of ${url}...`);
  
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1200 });
    
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Wait a bit for animations to settle
    await new Promise(r => setTimeout(r, 2000));
    
    const screenshot = await page.screenshot({ 
      type: 'png',
      clip: { x: 0, y: 0, width: 1200, height: 1200 }
    });
    
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    
    await writeFile(outputPath, screenshot);
    console.log(`✅ Screenshot saved to ${outputPath}`);
    
    return outputPath;
  } finally {
    await browser.close();
  }
}

// CLI usage
if (process.argv[2]) {
  const url = process.argv[2];
  const filename = process.argv[3] || 'screenshot.png';
  captureArtScreenshot(url, filename).catch(console.error);
}
