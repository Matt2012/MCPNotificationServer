"""
MCP Server implementation for Twilio SMS integration.
Implements JSON-RPC 2.0 protocol for MCP communication.
"""

import asyncio
import json
import logging
import sys
from typing import Any, Dict, List, Optional
from twilio_client import TwilioSMSClient

logger = logging.getLogger(__name__)

class TwilioMCPServer:
    """MCP Server that provides Twilio SMS functionality."""
    
    def __init__(self):
        """Initialize the MCP server with Twilio client."""
        self.twilio_client = TwilioSMSClient()
        self.tools = {
            "task_complete": {
                "name": "task_complete",
                "description": "Send SMS message via Twilio when a task is completed",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string",
                            "description": "The message to send via SMS"
                        },
                        "to_phone_number": {
                            "type": "string",
                            "description": "The recipient phone number (E.164 format)"
                        }
                    },
                    "required": ["message", "to_phone_number"]
                }
            }
        }
    
    async def handle_initialize(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle MCP initialize request."""
        logger.info("Initializing MCP server")
        return {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {}
            },
            "serverInfo": {
                "name": "twilio-sms-mcp-server",
                "version": "1.0.0"
            }
        }
    
    async def handle_tools_list(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle tools/list request."""
        logger.info("Listing available tools")
        return {
            "tools": list(self.tools.values())
        }
    
    async def handle_tools_call(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle tools/call request."""
        tool_name = params.get("name")
        arguments = params.get("arguments", {})
        
        logger.info(f"Tool call: {tool_name} with arguments: {arguments}")
        
        if tool_name != "task_complete":
            raise ValueError(f"Unknown tool: {tool_name}")
        
        # Extract and validate arguments
        message = arguments.get("message")
        to_phone_number = arguments.get("to_phone_number")
        
        if not message:
            raise ValueError("Message is required")
        
        if not to_phone_number:
            raise ValueError("to_phone_number is required")
        
        # Truncate message if it exceeds 250 characters
        original_length = len(message)
        if original_length > 250:
            message = message[:247] + "..."
            logger.info(f"Message truncated from {original_length} to 250 characters")
        
        try:
            # Send SMS via Twilio
            message_sid = await self.twilio_client.send_sms(to_phone_number, message)
            
            result = {
                "success": True,
                "message_sid": message_sid,
                "truncated": original_length > 250,
                "original_length": original_length,
                "sent_length": len(message)
            }
            
            logger.info(f"SMS sent successfully: {message_sid}")
            return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}
            
        except Exception as e:
            error_msg = f"Failed to send SMS: {str(e)}"
            logger.error(error_msg)
            raise RuntimeError(error_msg)
    
    async def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming JSON-RPC 2.0 requests."""
        method = request.get("method")
        params = request.get("params", {})
        request_id = request.get("id")
        
        try:
            if method == "initialize":
                result = await self.handle_initialize(params)
            elif method == "tools/list":
                result = await self.handle_tools_list(params)
            elif method == "tools/call":
                result = await self.handle_tools_call(params)
            else:
                raise ValueError(f"Unknown method: {method}")
            
            # Return successful response
            response = {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": result
            }
            
        except Exception as e:
            # Return error response
            logger.error(f"Error handling request {method}: {e}")
            response = {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {
                    "code": -32603,
                    "message": "Internal error",
                    "data": str(e)
                }
            }
        
        return response
    
    async def process_stdio(self):
        """Process requests from stdin and send responses to stdout."""
        logger.info("Starting stdio processing")
        
        # Read from stdin line by line
        while True:
            try:
                line = await asyncio.get_event_loop().run_in_executor(
                    None, sys.stdin.readline
                )
                
                if not line:
                    break
                
                line = line.strip()
                if not line:
                    continue
                
                # Parse JSON-RPC request
                try:
                    request = json.loads(line)
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON received: {e}")
                    continue
                
                # Handle the request
                response = await self.handle_request(request)
                
                # Send response to stdout
                response_line = json.dumps(response)
                print(response_line, flush=True)
                
            except EOFError:
                break
            except Exception as e:
                logger.error(f"Error processing stdio: {e}")
                break
    
    async def run(self):
        """Run the MCP server."""
        logger.info("Starting Twilio MCP Server")
        
        # Validate Twilio configuration
        if not self.twilio_client.is_configured():
            logger.error("Twilio client is not properly configured. Check environment variables.")
            sys.exit(1)
        
        # Start processing stdio
        await self.process_stdio()
        
        logger.info("Twilio MCP Server stopped")
