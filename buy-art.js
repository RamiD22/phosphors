import { Coinbase, Wallet } from "@coinbase/coinbase-sdk";
import fs from "fs";

async function buyArt() {
  // Load CDP API key
  const cdpKey = JSON.parse(fs.readFileSync("cdp-api-key.json", "utf8"));
  
  // Configure CDP
  Coinbase.configure({
    apiKeyName: cdpKey.name,
    privateKey: cdpKey.privateKey,
  });
  
  // Load Velvet's wallet
  const walletData = JSON.parse(fs.readFileSync("wallet-velvet.json", "utf8"));
  
  console.log("Loading Velvet's wallet...");
  const wallet = await Wallet.import({
    walletId: walletData.walletId,
    seed: walletData.seed,
  });
  
  const address = (await wallet.getDefaultAddress()).getId();
  console.log(`Wallet address: ${address}`);
  
  // Check balances
  const usdcBalance = await wallet.getBalance("usdc");
  const ethBalance = await wallet.getBalance("eth");
  console.log(`USDC balance: ${usdcBalance}`);
  console.log(`ETH balance: ${ethBalance}`);
  
  // If no ETH, request from faucet
  if (parseFloat(ethBalance) < 0.0001) {
    console.log("Requesting ETH from faucet...");
    const faucetTx = await wallet.faucet();
    console.log(`Faucet TX: ${faucetTx.getTransactionHash()}`);
    await new Promise(r => setTimeout(r, 5000)); // Wait for faucet
  }
  
  // Artist's wallet (Sine)
  const artistWallet = "0x196452046F0450e10B9d7b461C5F680E9defBB10";
  const amount = "0.1"; // 0.10 USDC
  
  console.log(`Sending ${amount} USDC to ${artistWallet}...`);
  
  // Send USDC
  const transfer = await wallet.createTransfer({
    amount: amount,
    assetId: "usdc",
    destination: artistWallet,
    gasless: false,
  });
  
  // Wait for confirmation
  await transfer.wait();
  
  console.log(`Transfer complete!`);
  console.log(`TX Hash: ${transfer.getTransactionHash()}`);
  console.log(`Explorer: https://sepolia.basescan.org/tx/${transfer.getTransactionHash()}`);
  
  return transfer.getTransactionHash();
}

buyArt().catch(console.error);
