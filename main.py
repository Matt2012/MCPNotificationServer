#!/usr/bin/env python3
"""
MCP Server entry point for Twilio SMS integration.
"""

import asyncio
import logging
import sys
from mcp_server import TwilioMCPServer

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

async def main():
    """Main entry point for the MCP server."""
    try:
        # Initialize and start the MCP server
        server = TwilioMCPServer()
        await server.run()
    except KeyboardInterrupt:
        logger.info("Server shutdown requested by user")
    except Exception as e:
        logger.error(f"Server failed to start: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
