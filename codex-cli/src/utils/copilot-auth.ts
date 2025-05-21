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
  const oauthToken = getGithubCopilotOauthToken();

  if (!oauthToken) {
    console.warn("GitHub Copilot OAuth token not found. Cannot refresh API token.");
    return undefined;
  }

  // First try the proper GitHub Copilot token exchange API
  try {
    const headers = {
      "Authorization": `Bearer ${oauthToken}`,
      "Accept": "application/json",
      "User-Agent": "GithubCopilot/1.155.0", 
      "Editor-Version": "Codex/0.1.0",
      "Editor-Plugin-Version": "copilot.vim/1.16.0",
      "Copilot-Integration-Id": "vscode-chat"
    };

    const response = await fetch("https://api.githubcopilot.com/copilot_internal/v2/token", {
      method: "GET",
      headers: headers,
    });

    if (response.ok) {
      const responseData = await response.json() as { token: string; expires_at: number };
      currentApiKey = responseData.token;
      currentApiKeyExpiresAt = responseData.expires_at * 1000; // Convert seconds to milliseconds

      console.log(`GitHub Copilot API token refreshed. Expires at: ${new Date(currentApiKeyExpiresAt).toISOString()}`);
      return { apiKey: currentApiKey, expiresAt: currentApiKeyExpiresAt };
    } else {
      console.log(`First token exchange attempt failed. Status: ${response.status}. Trying alternative endpoint...`);
      
      // Try the GitHub API endpoint if the first one fails
      const githubHeaders = {
        "Authorization": `token ${oauthToken}`,
        "Accept": "application/json",
        "User-Agent": "GithubCopilot/1.155.0", 
        "Editor-Version": "Codex/0.1.0",
        "Editor-Plugin-Version": "copilot.vim/1.16.0"
      };

      const githubResponse = await fetch("https://api.github.com/copilot_internal/v2/token", {
        method: "GET",
        headers: githubHeaders,
      });

      if (githubResponse.ok) {
        const data = await githubResponse.json() as { token: string; expires_at: number };
        currentApiKey = data.token;
        currentApiKeyExpiresAt = data.expires_at * 1000; // Convert seconds to milliseconds

        console.log(`GitHub Copilot API token refreshed via alternative endpoint. Expires at: ${new Date(currentApiKeyExpiresAt).toISOString()}`);
        return { apiKey: currentApiKey, expiresAt: currentApiKeyExpiresAt };
      } else {
        const errorBody = await githubResponse.text();
        console.error(`Failed to refresh GitHub Copilot token. Status: ${githubResponse.status}. Body: ${errorBody}`);
        
        // As a fallback, try to use the OAuth token itself
        console.log("Using OAuth token as fallback API key");
        currentApiKey = oauthToken;
        currentApiKeyExpiresAt = Date.now() + 3600 * 1000; // Set expiry to 1 hour from now
        return { apiKey: currentApiKey, expiresAt: currentApiKeyExpiresAt };
      }
    }
  } catch (error) {
    console.error("Error during GitHub Copilot token refresh:", error);
    
    // As a last resort, use the OAuth token directly
    console.log("Using OAuth token as fallback API key due to error");
    currentApiKey = oauthToken;
    currentApiKeyExpiresAt = Date.now() + 3600 * 1000; // Set expiry to 1 hour from now
    return { apiKey: currentApiKey, expiresAt: currentApiKeyExpiresAt };
  }
}

export function getCachedCopilotToken(): { apiKey: string; expiresAt: number } | undefined {
  if (currentApiKey && currentApiKeyExpiresAt && currentApiKeyExpiresAt > Date.now() + 5 * 60 * 1000) {
    // Token exists and is valid for at least 5 more minutes
    return { apiKey: currentApiKey, expiresAt: currentApiKeyExpiresAt };
  }
  return undefined;
}
