# Docker Deployment Guide

## Quick Start

### Build and run with Docker:
```bash
docker build -t twilio-mcp-server .
docker run -p 5000:5000 \
  -e TWILIO_ACCOUNT_SID=your_sid_here \
  -e TWILIO_AUTH_TOKEN=your_token_here \
  -e TWILIO_PHONE_NUMBER=your_twilio_number \
  -e DEFAULT_PHONE_NUMBER=your_default_recipient \
  -e SUPABASE_URL=your_supabase_url \
  -e SUPABASE_ANON_KEY=your_supabase_key \
  twilio-mcp-server
```

### Or use Docker Compose:
```bash
# Create .env file with your credentials
cp .env.example .env
# Edit .env with your actual values
docker-compose up -d
```

## Environment Variables Required:
- `TWILIO_ACCOUNT_SID` - Your Twilio account SID
- `TWILIO_AUTH_TOKEN` - Your Twilio auth token  
- `TWILIO_PHONE_NUMBER` - Your Twilio phone number (E.164 format)
- `DEFAULT_PHONE_NUMBER` - Default recipient number (E.164 format)
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anon key

## Server Endpoints:
- MCP Protocol: `http://localhost:5000/mcp`
- Health Check: `http://localhost:5000/health`

## Container runs HTTP server by default for MCP connections via POST requests.