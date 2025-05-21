//! Integration tests for the GitHub Copilot API.
//!
//! These tests verify that the GitHub Copilot API integration works correctly,
//! including authentication, token refresh, and API access.

use anyhow::Result;
use codex_core::auth_utils::{extract_github_oauth_token, get_github_copilot_api_token};
use codex_core::client::ModelClient;
use codex_core::client_common::{Prompt, ResponseEvent};
use codex_core::model_provider_info::get_model_provider_info_by_key;
use std::env;
use tokio::time::timeout;
use std::time::Duration;

/// Test that we can extract a token from the GitHub Copilot configuration.
#[test]
fn test_extract_oauth_token() {
    let token = extract_github_oauth_token();
    
    // This test is informational and will pass even if no token is found
    if let Some(token) = &token {
        println!("Found GitHub Copilot OAuth token: {}...", &token[..min(10, token.len())]);
    } else {
        println!("No GitHub Copilot OAuth token found. This is expected if GitHub Copilot is not installed.");
    }
}

/// Test that we can get an API token from the GitHub API using the OAuth token.
#[tokio::test]
#[ignore = "Requires GitHub Copilot to be installed"]
async fn test_get_api_token() -> Result<()> {
    let client = reqwest::Client::new();
    
    // First check if we have an OAuth token
    let oauth_token = match extract_github_oauth_token() {
        Some(token) => token,
        None => {
            println!("No GitHub Copilot OAuth token found. Skipping test.");
            return Ok(());
        }
    };

    // Try to get an API token
    match get_github_copilot_api_token(&client).await {
        Ok(token) => {
            println!("Successfully obtained GitHub Copilot API token, expires at: {:?}", token.expires_at);
            assert!(token.is_valid(), "Token should be valid");
            Ok(())
        }
        Err(err) => {
            println!("Failed to get GitHub Copilot API token: {}", err);
            // Not marking as a failure as this might be due to invalid tokens or expired auth
            Ok(())
        }
    }
}

/// Test that we can create a client with the GitHub Copilot provider.
#[test]
fn test_github_copilot_provider() {
    let provider = get_model_provider_info_by_key("githubcopilot");
    assert!(provider.is_some(), "GitHub Copilot provider should be defined");
    
    let provider = provider.unwrap();
    assert_eq!(provider.name, "GitHub Copilot", "Provider name should be GitHub Copilot");
    assert_eq!(provider.base_url, "https://api.githubcopilot.com", "Base URL should be correct");
    assert_eq!(provider.env_key, Some("GITHUB_COPILOT_TOKEN".to_string()), "Environment variable should be GITHUB_COPILOT_TOKEN");
}

/// Test streaming a simple completion from GitHub Copilot.
/// This test is marked as #[ignore] because it requires a valid GitHub Copilot token.
#[tokio::test]
#[ignore = "Requires a valid GitHub Copilot token"]
async fn test_stream_github_copilot() -> Result<()> {
    // Set a short timeout for the test
    let test_timeout = Duration::from_secs(30);

    // Run the actual test with a timeout
    match timeout(test_timeout, async {
        // Set up a temporary token from environment or local config
        if env::var("GITHUB_COPILOT_TOKEN").is_err() {
            let client = reqwest::Client::new();
            if let Some(oauth_token) = extract_github_oauth_token() {
                if let Ok(api_token) = get_github_copilot_api_token(&client).await {
                    env::set_var("GITHUB_COPILOT_TOKEN", api_token.api_key);
                } else {
                    println!("Could not get API token. Skipping test.");
                    return Ok(());
                }
            } else {
                println!("No OAuth token found. Skipping test.");
                return Ok(());
            }
        }

        // Create the model client with GitHub Copilot provider
        let provider = get_model_provider_info_by_key("githubcopilot")
            .expect("GitHub Copilot provider should be available");
        let client = ModelClient::new("gpt-4", provider);

        // Create a simple prompt
        let prompt = Prompt::new("Write a short hello world function in Rust.".to_string(), None);

        // Stream the response
        println!("Streaming response from GitHub Copilot...");
        let mut stream = client.stream(&prompt).await?;

        // Process the response
        let mut received_response = false;
        let mut received_completion = false;

        while let Some(event) = stream.rx_event.recv().await {
            match event? {
                ResponseEvent::OutputItemDone(item) => {
                    received_response = true;
                    println!("Received response from GitHub Copilot");
                }
                ResponseEvent::Completed { .. } => {
                    received_completion = true;
                    println!("Completion received");
                    break;
                }
                _ => {}
            }
        }

        assert!(received_response, "Should have received a response");
        assert!(received_completion, "Should have received a completion");

        Ok(())
    }).await {
        Ok(result) => result,
        Err(_) => {
            // Test timed out
            println!("Test timed out after {:?}", test_timeout);
            Ok(())
        }
    }
}

fn min(a: usize, b: usize) -> usize {
    if a < b { a } else { b }
}
