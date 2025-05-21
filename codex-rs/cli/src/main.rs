use clap::Parser;
use codex_cli::LandlockCommand;
use codex_cli::SeatbeltCommand;
use codex_cli::create_sandbox_policy;
use codex_cli::proto;
use codex_cli::seatbelt;
use codex_core::config::extract_copilot_token;
use codex_exec::Cli as ExecCli;
use codex_tui::Cli as TuiCli;
use std::env;

use crate::proto::ProtoCli;

/// Codex CLI
///
/// If no subcommand is specified, options will be forwarded to the interactive CLI.
#[derive(Debug, Parser)]
#[clap(
    author,
    version,
    // If a sub‑command is given, ignore requirements of the default args.
    subcommand_negates_reqs = true
)]
struct MultitoolCli {
    #[clap(flatten)]
    interactive: TuiCli,

    #[clap(subcommand)]
    subcommand: Option<Subcommand>,
}

#[derive(Debug, clap::Subcommand)]
enum Subcommand {
    /// Run Codex non-interactively.
    #[clap(visible_alias = "e")]
    Exec(ExecCli),

    /// Experimental: run Codex as an MCP server.
    Mcp,

    /// Run the Protocol stream via stdin/stdout
    #[clap(visible_alias = "p")]
    Proto(ProtoCli),

    /// Internal debugging commands.
    Debug(DebugArgs),
}

#[derive(Debug, Parser)]
struct DebugArgs {
    #[command(subcommand)]
    cmd: DebugCommand,
}

#[derive(Debug, clap::Subcommand)]
enum DebugCommand {
    /// Run a command under Seatbelt (macOS only).
    Seatbelt(SeatbeltCommand),

    /// Run a command under Landlock+seccomp (Linux only).
    Landlock(LandlockCommand),
}

#[derive(Debug, Parser)]
struct ReplProto {}

#[tokio::main]
async fn main() -> anyhow::Result<()> {    // Set up logging first
    if env::var("RUST_LOG").is_err() {
        unsafe { env::set_var("RUST_LOG", "info"); }
    }
    tracing_subscriber::fmt::init();
    
    // Try to load GitHub Copilot token if it's not already set
    if env::var("GITHUB_COPILOT_TOKEN").is_err() {
            tracing::debug!("No GitHub Copilot token found in config");
            // Try using auth_utils to extract the token from the standard location
            if let Ok(client) = reqwest::Client::builder().build() {
                match codex_core::auth_utils::extract_github_oauth_token() {
                    Some(oauth_token) => {
                        tracing::debug!("Found GitHub Copilot OAuth token");
                        // We have the OAuth token but we need to get the API token
                        match codex_core::auth_utils::get_github_copilot_api_token(&client).await {
                            Ok(api_token) => {
                                tracing::debug!("Successfully obtained GitHub Copilot API token");
                                unsafe { env::set_var("GITHUB_COPILOT_TOKEN", api_token.api_key); }
                            }
                            Err(e) => {
                                tracing::debug!("Failed to obtain GitHub Copilot API token: {}", e);
                            }
                        }
                    }
                    None => {
                        tracing::debug!("No GitHub Copilot OAuth token found");
                    }
                }
            }
    }
    
    let cli = MultitoolCli::parse();

    match cli.subcommand {
        None => {
            codex_tui::run_main(cli.interactive)?;
        }
        Some(Subcommand::Exec(exec_cli)) => {
            codex_exec::run_main(exec_cli).await?;
        }
        Some(Subcommand::Mcp) => {
            codex_mcp_server::run_main().await?;
        }
        Some(Subcommand::Proto(proto_cli)) => {
            proto::run_main(proto_cli).await?;
        }
        Some(Subcommand::Debug(debug_args)) => match debug_args.cmd {
            DebugCommand::Seatbelt(SeatbeltCommand {
                command,
                sandbox,
                full_auto,
            }) => {
                let sandbox_policy = create_sandbox_policy(full_auto, sandbox);
                seatbelt::run_seatbelt(command, sandbox_policy).await?;
            }
            #[cfg(unix)]
            DebugCommand::Landlock(LandlockCommand {
                command,
                sandbox,
                full_auto,
            }) => {
                let sandbox_policy = create_sandbox_policy(full_auto, sandbox);
                codex_cli::landlock::run_landlock(command, sandbox_policy)?;
            }
            #[cfg(not(unix))]
            DebugCommand::Landlock(_) => {
                anyhow::bail!("Landlock is only supported on Linux.");
            }
        },
    }

    Ok(())
}
