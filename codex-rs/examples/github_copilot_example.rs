//! Example code showing how to use GitHub Copilot as a model provider with codex-core

use codex_core::auth_utils::extract_github_oauth_token;
use codex_core::client::ModelClient;
use codex_core::client_common::{Prompt, ResponseEvent};
use codex_core::model_provider_info::get_model_provider_info_by_key;
use std::env;
use std::error::Error;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // Try to automatically extract and set the GitHub Copilot token
    // if it's not already set in environment variables
    if env::var("GITHUB_COPILOT_TOKEN").is_err() {
        if let Some(token) = extract_github_oauth_token() {
            println!("Automatically detected GitHub Copilot token");
            env::set_var("GITHUB_COPILOT_TOKEN", token);
        } else {
            println!("No GitHub Copilot token found. Please set the GITHUB_COPILOT_TOKEN environment variable.");
        }
    }

    // Get the GitHub Copilot provider information
    let provider = get_model_provider_info_by_key("githubcopilot")
        .expect("GitHub Copilot provider should be available");    // Create a client using the GitHub Copilot provider with o3-mini model
    println!("Creating GitHub Copilot client with o3-mini model");
    let client = ModelClient::new("o3-mini", provider);

    // Create a simple prompt
    let prompt = Prompt::new("Write a Rust function that calculates the fibonacci sequence.", None);

    // Stream the response
    println!("Sending prompt to GitHub Copilot...");
    let mut stream = client.stream(&prompt).await?;

    // Print the streamed response
    println!("\nResponse from GitHub Copilot:");
    println!("----------------------------");

    // Process and print each response event
    while let Some(event) = stream.rx_event.recv().await {
        match event? {
            ResponseEvent::OutputItemDone(item) => {
                // Print the completion text
                println!("{:?}", item);
            }
            ResponseEvent::Completed { .. } => {
                println!("\n----------------------------");
                println!("Response complete.");
                break;
            }
            _ => {}
        }
    }

    Ok(())
}
