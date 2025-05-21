//! Integration tests for GitHub Copilot functionality
//! 
//! These tests verify that the GitHub Copilot integration works correctly.
//! Note: These tests require a valid GitHub Copilot token to be available
//! either through environment variables or from the standard location.

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use tokio::time::Duration;
    use std::env;
    use crate::auth_utils::{extract_github_oauth_token, get_github_copilot_api_token};
    use crate::client::ModelClient;
    use crate::client_common::{Prompt, ResponseEvent};
    use crate::model_provider_info::{ModelProviderInfo, get_model_provider_info_by_key};

    /// Test that we can extract a GitHub Copilot OAuth token
    #[tokio::test]
    async fn test_extract_oauth_token() -> Result<()> {
        let token = extract_github_oauth_token();
        
        // We can't assert that a token is always present, as users might not have
        // GitHub Copilot installed. Instead, log the result.
        if let Some(token) = token {
            println!("Found GitHub Copilot OAuth token: {}", token.chars().take(5).collect::<String>() + "...");
        } else {
            println!("No GitHub Copilot OAuth token found. This is expected if you don't have GitHub Copilot installed.");
        }
        
        Ok(())
    }

    /// Test that we can get a GitHub Copilot API token
    #[tokio::test]
    #[ignore] // This test requires a valid GitHub Copilot token
    async fn test_get_api_token() -> Result<()> {
        let client = reqwest::Client::new();
        
        // This will fail if no token is available
        let api_token = get_github_copilot_api_token(&client).await?;
        
        assert!(!api_token.api_key.is_empty(), "API token should not be empty");
        assert!(api_token.expires_at > chrono::Utc::now(), "Token should not be expired");
        
        println!("Successfully obtained GitHub Copilot API token, expires at {:?}", api_token.expires_at);
        
        Ok(())
    }

    /// Test creating a ModelClient with GitHub Copilot provider
    #[tokio::test]
    #[ignore] // This test requires a valid GitHub Copilot token
    async fn test_create_model_client() -> Result<()> {
        // Get the GitHub Copilot provider info
        let provider_info = get_model_provider_info_by_key("githubcopilot")
            .expect("GitHub Copilot provider should be available");
            
        // Create a model client with GitHub Copilot provider
        let client = ModelClient::new("gpt-4", provider_info);
        
        assert_eq!(client.model, "gpt-4");
        assert_eq!(client.provider.name, "GitHub Copilot");
        
        Ok(())
    }

    /// Test streaming a simple prompt with GitHub Copilot
    #[tokio::test]
    #[ignore] // This test requires a valid GitHub Copilot token and makes an API call
    async fn test_stream_simple_prompt() -> Result<()> {
        // Set a timeout for the entire test
        let timeout = Duration::from_secs(30);
        
        let test_result = tokio::time::timeout(timeout, async {
            // Get the GitHub Copilot provider info
            let provider_info = get_model_provider_info_by_key("githubcopilot")
                .expect("GitHub Copilot provider should be available");
                
            // Create a model client with GitHub Copilot provider
            let client = ModelClient::new("gpt-4", provider_info);
            
            // Create a simple prompt
            let prompt = Prompt::new("Tell me about Rust in one sentence.".to_string(), None);
            
            // Stream the response
            let mut stream = client.stream(&prompt).await?;
            
            // Get the first event
            let first_event = stream.rx_event.recv().await;
            assert!(first_event.is_some(), "Should receive at least one event");
            
            // The event should be Ok
            let event = first_event.unwrap()?;
            
            // There should be more events
            let mut has_completion = false;
            
            while let Some(event) = stream.rx_event.recv().await {
                match event? {
                    ResponseEvent::Completed { .. } => {
                        has_completion = true;
                        break;
                    }
                    _ => {}
                }
            }
            
            assert!(has_completion, "Should receive a completion event");
            
            Ok::<_, anyhow::Error>(())
        }).await;
        
        match test_result {
            Ok(result) => result?,
            Err(_) => {
                panic!("Test timed out after {:?}", timeout);
            }
        }
        
        Ok(())
    }
}
