use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use dirs::home_dir;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, ACCEPT};
use serde::Deserialize;
use tracing::{debug, error};

use crate::flags::GITHUB_COPILOT_TOKEN;

/// Github Copilot configuration directory
pub fn github_copilot_config_dir() -> PathBuf {
    if cfg!(target_os = "windows") {
        home_dir().unwrap_or_default().join("AppData").join("Local").join("github-copilot")
    } else {
        home_dir().unwrap_or_default().join(".config").join("github-copilot")
    }
}

/// OAuth token response from the GitHub Copilot API
#[derive(Debug, Deserialize)]
pub struct OAuthTokenResponse {
    token: String,
    expires_at: i64,
}

/// GitHub Copilot API token
#[derive(Debug, Clone)]
pub struct GithubCopilotToken {
    pub api_key: String,
    pub expires_at: DateTime<Utc>,
}

impl GithubCopilotToken {
    /// Check if the token is still valid with a buffer time
    pub fn is_valid(&self) -> bool {
        let now = Utc::now();
        let buffer = Duration::from_secs(5 * 60); // 5 minutes buffer
        let buffer_expires_at = self.expires_at - chrono::Duration::from_std(buffer).unwrap_or_default();
        now < buffer_expires_at
    }

    /// Convert from OAuth token response
    pub fn from_response(response: OAuthTokenResponse) -> Result<Self> {
        let expires_at = DateTime::from_timestamp(response.expires_at, 0)
            .ok_or_else(|| anyhow!("Invalid expires_at timestamp"))?;

        Ok(Self {
            api_key: response.token,
            expires_at,
        })
    }
}

/// Extract the OAuth token from GitHub Copilot configuration files
pub fn extract_github_oauth_token() -> Option<String> {
    let hosts_path = github_copilot_config_dir().join("hosts.json");
    if !hosts_path.exists() {
        debug!("GitHub Copilot hosts.json file not found at {:?}", hosts_path);
        return None;
    }

    match fs::read_to_string(hosts_path) {
        Ok(contents) => {
            match serde_json::from_str::<serde_json::Value>(&contents) {
                Ok(json) => {
                    // Modern GitHub Copilot format: {"github.com:AppId":{"oauth_token":"ghu_XXX"}}
                    // or older format: {"github.com":{"oauth_token":"ghu_XXX"}}
                    
                    // First try to find a key starting with "github.com"
                    let mut token: Option<String> = None;
                    
                    for (key, value) in json.as_object().iter().flat_map(|obj| obj.iter()) {
                        if key.starts_with("github.com") {
                            if let Some(oauth) = value.get("oauth_token").and_then(|t| t.as_str()) {
                                token = Some(oauth.to_string());
                                break;
                            }
                        }
                    }
                    
                    // Fallback to exact "github.com" key (older format)
                    if token.is_none() {
                        token = json.get("github.com")
                            .and_then(|github| github.get("oauth_token"))
                            .and_then(|token| token.as_str())
                            .map(|s| s.to_string());
                    }
                    
                    if token.is_none() {
                        debug!("OAuth token not found in GitHub Copilot hosts.json");
                    } else {
                        debug!("Successfully found GitHub Copilot OAuth token");
                    }
                    
                    token
                }
                Err(e) => {
                    error!("Failed to parse GitHub Copilot hosts.json: {}", e);
                    None
                }
            }
        }
        Err(e) => {
            error!("Failed to read GitHub Copilot hosts.json: {}", e);
            None
        }
    }
}

/// Get a valid GitHub Copilot API token using the OAuth token
pub async fn get_github_copilot_api_token(client: &reqwest::Client) -> Result<GithubCopilotToken> {
    // First try to get the token from environment variable
    let oauth_token = match GITHUB_COPILOT_TOKEN.as_ref() {
        Some(token) if !token.is_empty() => token.to_string(),
        _ => extract_github_oauth_token().ok_or_else(|| anyhow!("GitHub Copilot OAuth token not found"))?
    };

    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("token {}", oauth_token))?);
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert("User-Agent", HeaderValue::from_static("GithubCopilot/1.155.0"));
    headers.insert("editor-version", HeaderValue::from_static("Neovim/0.6.1"));
    headers.insert("editor-plugin-version", HeaderValue::from_static("copilot.vim/1.16.0"));

    let response = client
        .get("https://api.github.com/copilot_internal/v2/token")
        .headers(headers)
        .send()
        .await?;

    if response.status().is_success() {
        let token_response: OAuthTokenResponse = response.json().await?;
        let api_token = GithubCopilotToken::from_response(token_response)?;
        
        debug!("Successfully obtained GitHub Copilot API token, expires at {:?}", api_token.expires_at);
        Ok(api_token)
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_else(|_| "".to_string());
        Err(anyhow!("Failed to get GitHub Copilot API token. Status: {}, Body: {}", status, body))
    }
}
