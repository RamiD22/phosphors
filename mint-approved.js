/**
 * Phosphors - Mint Approved Submissions
 * 
 * Checks Supabase for approved submissions that haven't been minted yet,
 * captures a screenshot, mints them, and updates the database with token IDs.
 * 
 * Run: node mint-approved.js
 */

import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import puppeteer from 'puppeteer-core';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Config
const SUPABASE_URL = 'https://afcnnalweuwgauzijefs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmY25uYWx3ZXV3Z2F1emlqZWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTI2NjUsImV4cCI6MjA4NTYyODY2NX0.34M21ctB6jiCNsFANwsSea8BoXkCqCyKjqvrvGEpOwA';
const PLATFORM_CONTRACT = '0xf5663DF53DA46718f28C879ae1C3Fb1bDcD4490D';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PREVIEWS_DIR = path.join(__dirname, 'site', 'previews');

async function captureScreenshot(url, submissionId) {
  console.log(`📸 Capturing preview...`);
  
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1200 });
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Wait for animation to settle
    await new Promise(r => setTimeout(r, 2000));
    
    const screenshot = await page.screenshot({ 
      type: 'png',
      clip: { x: 0, y: 0, width: 1200, height: 1200 }
    });
    
    // Ensure previews directory exists
    if (!existsSync(PREVIEWS_DIR)) {
      await mkdir(PREVIEWS_DIR, { recursive: true });
    }
    
    const filename = `${submissionId}.png`;
    const outputPath = path.join(PREVIEWS_DIR, filename);
    await writeFile(outputPath, screenshot);
    
    console.log(`✅ Preview saved`);
    return `/previews/${filename}`;
  } catch (err) {
    console.log(`⚠️ Screenshot failed: ${err.message}`);
    return null;
  } finally {
    await browser.close();
  }
}

async function getApprovedUnminted() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/submissions?status=eq.approved&token_id=is.null&select=*`,
    { headers: { 'apikey': SUPABASE_KEY } }
  );
  return response.json();
}

async function updateSubmission(id, tokenId, txHash, previewUrl) {
  const body = { 
    token_id: tokenId,
    notes: `Minted TX: ${txHash}`
  };
  if (previewUrl) {
    body.preview_url = previewUrl;
  }
  
  await fetch(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify(body)
  });
}

async function main() {
  console.log('🔍 Checking for approved submissions to mint...\n');
  
  const submissions = await getApprovedUnminted();
  
  if (submissions.length === 0) {
    console.log('✓ No pending mints.');
    return;
  }
  
  console.log(`Found ${submissions.length} submission(s) to mint.\n`);
  
  // Initialize wallet
  Coinbase.configureFromJson({ filePath: path.join(__dirname, 'cdp-api-key.json') });
  const walletData = JSON.parse(readFileSync(path.join(__dirname, 'wallet-minter.json'), 'utf8'));
  const wallet = await Wallet.import(walletData);
  const address = await wallet.getDefaultAddress();
  
  console.log('Minting wallet:', address.getId());
  
  const balance = await wallet.getBalance('eth');
  console.log('Balance:', balance.toString(), 'ETH\n');
  
  let tokenId = 1;
  
  for (const sub of submissions) {
    console.log(`\n🎨 Minting: "${sub.title}" by ${sub.moltbook}`);
    
    try {
      // Capture screenshot first
      const previewUrl = await captureScreenshot(sub.url, sub.id);
      
      const mint = await wallet.invokeContract({
        contractAddress: PLATFORM_CONTRACT,
        method: 'mint',
        abi: [{
          inputs: [{ name: 'to', type: 'address' }],
          name: 'mint',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function'
        }],
        args: { to: address.getId() }
      });
      
      await mint.wait();
      const txHash = mint.getTransactionHash();
      
      console.log('✅ Minted! TX:', txHash);
      
      await updateSubmission(sub.id, tokenId, txHash, previewUrl);
      console.log('📝 Database updated with token ID:', tokenId);
      
      tokenId++;
      
    } catch (error) {
      console.error('❌ Failed to mint:', error.message);
    }
  }
  
  console.log('\n🎉 Done!');
  console.log('\n⚠️ Run `vercel --prod` in site/ to deploy preview images!');
}

main().catch(console.error);
