const fs = require("fs");
const path = require("path");

const deploymentsDir = path.join(__dirname, "..", "deployments", "sepolia");
const outputPath = path.join(__dirname, "..", "frontend", "src", "config", "contracts.ts");

function loadDeployment(name) {
  const filePath = path.join(deploymentsDir, `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeConfig(vault, cusdt) {
  const content = `export const VAULT_ROCKET_ADDRESS = '${vault.address}';
export const VAULT_ROCKET_ABI = ${JSON.stringify(vault.abi, null, 2)} as const;

export const CUSDT_ADDRESS = '${cusdt.address}';
export const CUSDT_ABI = ${JSON.stringify(cusdt.abi, null, 2)} as const;

export const SUPPORTED_CHAIN_ID = 11155111;
`;

  fs.writeFileSync(outputPath, content);
}

try {
  const vault = loadDeployment("VaultRocket");
  const cusdt = loadDeployment("ConfidentialUSDT");
  writeConfig(vault, cusdt);
  console.log("Synced frontend contract config from deployments/sepolia.");
} catch (err) {
  console.error("Failed to refresh frontend contract config:", err.message);
  process.exit(1);
}
