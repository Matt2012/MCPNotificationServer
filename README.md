# Twilio MCP Server

A Python MCP (Model Context Protocol) server that bridges MCP clients to Twilio SMS with message truncation and error handling.

## Features

- **Single Tool**: `task_complete` - sends SMS notifications when tasks are completed
- **Message Truncation**: Automatically truncates messages to 250 characters
- **Error Handling**: Comprehensive error handling for API failures
- **Environment Configuration**: Secure credential management via environment variables
- **JSON-RPC 2.0 Compliance**: Full MCP protocol implementation
- **Async Support**: Non-blocking operation with asyncio

## Prerequisites

- Python 3.8 or higher
- Twilio account with SMS capabilities
- Valid Twilio phone number

## Installation

1. Install required Python packages:
```bash
pip install mcp twilio python-dotenv
