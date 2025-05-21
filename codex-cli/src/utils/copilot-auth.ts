import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import fetch from 'node-fetch';

// Module-level variables to store the active API key and its expiry
let currentApiKey: string | undefined = undefined;
let currentApiKeyExpiresAt: number | undefined = undefined; // Stores milliseconds since epoch

// TODO: Consider using the existing log utility if accessible
// import { log } from './log';

function getGithubCopilotHostsPath(): string {
  const platform = os.platform();
  const homeDir = os.homedir();

  if (platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Local', 'github-copilot', 'hosts.json');
  } else {
    // macOS or Linux
    return path.join(homeDir, '.config', 'github-copilot', 'hosts.json');
  }
}

export function getGithubCopilotOauthToken(): string | undefined {
  // 1. Check environment variable
  const tokenFromEnv = process.env.GITHUB_COPILOT_OAUTH_TOKEN;
  if (tokenFromEnv && tokenFromEnv.length > 0) {
    // console.log("Using GitHub Copilot OAuth token from GITHUB_COPILOT_OAUTH_TOKEN environment variable.");
    return tokenFromEnv;
  }

  // 2. Read from hosts.json
  const hostsPath = getGithubCopilotHostsPath();

  try {
    if (!fs.existsSync(hostsPath)) {
      // console.log(`GitHub Copilot hosts.json not found at ${hostsPath}.`);
      return undefined;
    }

    const content = fs.readFileSync(hostsPath, 'utf-8');
    const json = JSON.parse(content);

    for (const key in json) {
      if (key.startsWith('github.com') && json[key] && typeof json[key].oauth_token === 'string') {
        // console.log(`Found GitHub Copilot OAuth token for ${key} in ${hostsPath}.`);
        return json[key].oauth_token;
      }
    }
    // console.log(`No GitHub Copilot OAuth token found in ${hostsPath}.`);
    return undefined;
  } catch (error) {
    console.warn(`Error reading or parsing GitHub Copilot hosts.json at ${hostsPath}:`, error);
    return undefined;
  }
}

export async function refreshCopilotToken(): Promise<{ apiKey: string; expiresAt: number } | undefined> {
  console.log("[copilot-auth] Attempting to refresh Copilot token...");
  const oauthToken = getGithubCopilotOauthToken();

  if (!oauthToken) {
    console.warn("[copilot-auth] GitHub Copilot OAuth token not found. Cannot refresh API token.");
    return undefined;
  }

  const headers = {
    "Authorization": `token ${oauthToken}`,
    "Accept": "application/json",
    "User-Agent": "GithubCopilot/1.155.0", // Example User-Agent
    "Editor-Version": "Codex/0.1.0", // Align with your CLI/tool
    "Editor-Plugin-Version": "copilot.vim/1.16.0", // Example plugin version
  };

  try {
    console.log("[copilot-auth] Fetching new token from GitHub API...");
    const response = await fetch("https://api.github.com/copilot_internal/v2/token", {
      method: "GET",
      headers: headers,
    });

    if (response.ok) {
      const responseData = await response.json() as { token: string; expires_at: number };
      currentApiKey = responseData.token;
      currentApiKeyExpiresAt = responseData.expires_at * 1000; // Convert seconds to milliseconds

      console.log(`[copilot-auth] GitHub Copilot API token refreshed successfully. New API Key: ${currentApiKey ? currentApiKey.substring(0, 10) + '...' : 'undefined'}, Expires at: ${currentApiKeyExpiresAt ? new Date(currentApiKeyExpiresAt).toISOString() : 'undefined'}`);
      return { apiKey: currentApiKey, expiresAt: currentApiKeyExpiresAt };
    } else {
      const errorBody = await response.text();
      console.error(`[copilot-auth] Failed to refresh GitHub Copilot token. Status: ${response.status}. Body: ${errorBody}`);
      currentApiKey = undefined;
      currentApiKeyExpiresAt = undefined;
      console.log("[copilot-auth] Token refresh failed. API key cleared.");
      return undefined;
    }
  } catch (error) {
    console.error("[copilot-auth] Error during GitHub Copilot token refresh:", error);
    currentApiKey = undefined;
    currentApiKeyExpiresAt = undefined;
    console.log("[copilot-auth] Token refresh resulted in an error. API key cleared.");
    return undefined;
  }
}

export function getCachedCopilotToken(): { apiKey: string; expiresAt: number } | undefined {
  console.log("[copilot-auth] Checking for cached Copilot token...");
  console.log(`[copilot-auth] Current cached API Key: ${currentApiKey ? currentApiKey.substring(0, 10) + '...' : 'undefined'}, Expires At: ${currentApiKeyExpiresAt ? new Date(currentApiKeyExpiresAt).toISOString() : 'undefined'}`);
  
  if (currentApiKey && currentApiKeyExpiresAt && currentApiKeyExpiresAt > Date.now() + 5 * 60 * 1000) {
    // Token exists and is valid for at least 5 more minutes
    console.log("[copilot-auth] Valid cached token found.");
    return { apiKey: currentApiKey, expiresAt: currentApiKeyExpiresAt };
  }
  console.log("[copilot-auth] No valid cached token found or token is expiring soon.");
  return undefined;
}
