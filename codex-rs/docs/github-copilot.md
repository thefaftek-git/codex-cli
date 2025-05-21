# Using GitHub Copilot with codex-rs

This guide explains how to use GitHub Copilot as a model provider in codex-rs.

## Prerequisites

1. You must have an active GitHub Copilot subscription.
2. GitHub Copilot must be installed and authenticated on your system.

## Setup

codex-rs can automatically detect and use your GitHub Copilot authentication token in the following ways:

### Automatic Detection

When you run codex-rs, it will automatically attempt to load your GitHub Copilot credentials from the standard location:
- On Windows: `%APPDATA%\Local\github-copilot\hosts.json`
- On macOS/Linux: `~/.config/github-copilot/hosts.json`

If a valid token is found, it will be used automatically.

### Environment Variable

You can manually set the GitHub Copilot token via the `GITHUB_COPILOT_TOKEN` environment variable:

```bash
# Linux/macOS
export GITHUB_COPILOT_TOKEN=ghu_your_token_here

# Windows (CMD)
set GITHUB_COPILOT_TOKEN=ghu_your_token_here

# Windows (PowerShell)
$env:GITHUB_COPILOT_TOKEN = "ghu_your_token_here"
```

## Usage

To use GitHub Copilot as your model provider:

```bash
codex-rs --model gpt-4 --provider githubcopilot
```

You can also specify GitHub Copilot in your configuration file:

```json
{
  "provider": "githubcopilot",
  "model": "gpt-4"
}
```

## Supported Models

GitHub Copilot supports the following models:
- `gpt-4` (default)
- `gpt-3.5-turbo`

If no model is specified, `gpt-4` will be used.

## Token Refresh

codex-rs will automatically refresh your GitHub Copilot token as needed. The token typically expires after a few hours, and codex-rs will handle getting a new one using your GitHub credentials.

## Troubleshooting

### Token Not Found

If you see an error about the GitHub Copilot token not being found:

1. Make sure you're logged into GitHub Copilot in VS Code or another editor
2. Check that the `hosts.json` file exists in the expected location
3. Try setting the token manually via the environment variable

### Invalid Token

If your token is invalid or expired:

1. Log out and back into GitHub Copilot in VS Code
2. Restart codex-rs
3. If the problem persists, try manually extracting the token from `hosts.json` and setting it via the environment variable

### Need More Help?

If you continue to have issues with GitHub Copilot integration, please file an issue on the codex-rs repository with details about your setup and the specific error messages you're seeing.
