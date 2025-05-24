"""
Twilio SMS client for MCP server integration.
"""

import asyncio
import logging
import os
from typing import Optional
from twilio.rest import Client
from twilio.base.exceptions import TwilioException

logger = logging.getLogger(__name__)

class TwilioSMSClient:
    """Twilio SMS client with async wrapper."""
    
    def __init__(self):
        """Initialize Twilio client with environment variables."""
        self.account_sid = os.getenv("TWILIO_ACCOUNT_SID")
        self.auth_token = os.getenv("TWILIO_AUTH_TOKEN")
        self.phone_number = os.getenv("TWILIO_PHONE_NUMBER")
        
        # Initialize Twilio client if credentials are available
        if self.is_configured():
            self.client = Client(self.account_sid, self.auth_token)
            logger.info("Twilio client initialized successfully")
        else:
            self.client = None
            logger.warning("Twilio client not initialized - missing environment variables")
    
    def is_configured(self) -> bool:
        """Check if Twilio client is properly configured."""
        return all([
            self.account_sid,
            self.auth_token,
            self.phone_number
        ])
    
    async def send_sms(self, to_phone_number: str, message: str) -> str:
        """
        Send SMS message via Twilio.
        
        Args:
            to_phone_number: Recipient phone number in E.164 format
            message: Message content to send
            
        Returns:
            Message SID from Twilio
            
        Raises:
            RuntimeError: If Twilio client is not configured
            TwilioException: If Twilio API call fails
        """
        if not self.client:
            raise RuntimeError("Twilio client is not configured. Check environment variables.")
        
        # Validate phone number format (basic check)
        if not to_phone_number.startswith('+'):
            raise ValueError("Phone number must be in E.164 format (start with +)")
        
        try:
            # Run Twilio API call in executor to avoid blocking
            loop = asyncio.get_event_loop()
            twilio_message = await loop.run_in_executor(
                None,
                self._send_message_sync,
                to_phone_number,
                message
            )
            
            logger.info(f"SMS sent successfully to {to_phone_number}: {twilio_message.sid}")
            return twilio_message.sid
            
        except TwilioException as e:
            logger.error(f"Twilio API error: {e}")
            raise TwilioException(f"Failed to send SMS via Twilio: {e}")
        except Exception as e:
            logger.error(f"Unexpected error sending SMS: {e}")
            raise RuntimeError(f"Unexpected error sending SMS: {e}")
    
    def _send_message_sync(self, to_phone_number: str, message: str):
        """Synchronous Twilio message sending (for executor)."""
        return self.client.messages.create(
            body=message,
            from_=self.phone_number,
            to=to_phone_number
        )
    
    def get_account_info(self) -> Optional[dict]:
        """Get basic account information for validation."""
        if not self.client:
            return None
        
        try:
            account = self.client.api.accounts(self.account_sid).fetch()
            return {
                "sid": account.sid,
                "friendly_name": account.friendly_name,
                "status": account.status
            }
        except TwilioException as e:
            logger.error(f"Failed to fetch account info: {e}")
            return None
