# GitHub Copilot Support in codex-rs

codex-rs now includes support for using GitHub Copilot as a model provider, allowing you to use your existing GitHub Copilot subscription with codex-rs.

## Quick Start

If you already have GitHub Copilot installed and authenticated on your system, codex-rs will automatically detect and use your credentials:

```bash
codex --provider githubcopilot --model gpt-4
```

## Features

- **Automatic Authentication**: Automatically detects and uses your GitHub Copilot credentials
- **Token Refresh**: Handles token refresh when needed
- **Multiple Models**: Supports both gpt-4 and gpt-3.5-turbo models

## Configuration

You can configure the GitHub Copilot provider in your `~/.codex/config.toml` file:

```toml
[profile.copilot]
provider = "githubcopilot"
model = "gpt-4"
```

Then use it with:

```bash
codex --profile copilot
```

## Authentication

codex-rs supports multiple ways to authenticate with GitHub Copilot:

1. **Automatic detection** from standard GitHub Copilot configuration files
2. **Environment variable**: Set `GITHUB_COPILOT_TOKEN` with your token
3. **Manual configuration** in your `~/.codex/config.toml` file

For more details, see [GitHub Copilot Integration Documentation](./docs/github-copilot.md).
