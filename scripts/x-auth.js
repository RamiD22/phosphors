/**
 * X OAuth 2.0 Authorization Flow
 * Run once to get access tokens, then save them
 */

import { TwitterApi } from 'twitter-api-v2';
import * as readline from 'readline';

const CLIENT_ID = process.env.X_CLIENT_ID;
const CLIENT_SECRET = process.env.X_CLIENT_SECRET;
const CALLBACK_URL = 'https://phosphors.xyz/callback';

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Set X_CLIENT_ID and X_CLIENT_SECRET in environment');
    process.exit(1);
  }

  const client = new TwitterApi({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });

  // Generate auth link
  const { url, codeVerifier, state } = client.generateOAuth2AuthLink(CALLBACK_URL, {
    scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  });

  console.log('\n🔗 Open this URL in your browser:\n');
  console.log(url);
  console.log('\n📝 After authorizing, you\'ll be redirected to a URL like:');
  console.log('   https://phosphors.xyz/callback?code=XXXXX&state=XXXXX\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  const code = await new Promise(resolve => {
    rl.question('Paste the "code" parameter from the URL: ', resolve);
  });
  rl.close();

  try {
    const { accessToken, refreshToken } = await client.loginWithOAuth2({
      code: code.trim(),
      codeVerifier,
      redirectUri: CALLBACK_URL,
    });

    console.log('\n✅ Success! Add these to your .env:\n');
    console.log(`X_ACCESS_TOKEN_V2=${accessToken}`);
    console.log(`X_REFRESH_TOKEN_V2=${refreshToken}`);
    console.log('\n🔐 Keep these secret!\n');

  } catch (err) {
    console.error('❌ Auth failed:', err.message);
  }
}

main();
