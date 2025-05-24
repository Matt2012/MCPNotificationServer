#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const twilio = require('twilio');

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

let twilioClient = null;

// Check if Twilio is configured
function isTwilioConfigured() {
  return accountSid && authToken && twilioPhoneNumber;
}

// Initialize Twilio client if configured
if (isTwilioConfigured()) {
  twilioClient = twilio(accountSid, authToken);
  console.error('✓ Twilio client initialized successfully');
} else {
  console.error('⚠ Twilio client not configured - missing environment variables');
}

// Create MCP server
const server = new Server(
  {
    name: 'twilio-sms-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define the task_complete tool
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'task_complete',
        description: 'Send SMS message via Twilio when a task is completed',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message to send via SMS'
            },
            to_phone_number: {
              type: 'string',
              description: 'The recipient phone number (E.164 format)'
            }
          },
          required: ['message', 'to_phone_number']
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== 'task_complete') {
    throw new Error(`Unknown tool: ${name}`);
  }

  // Validate Twilio configuration
  if (!twilioClient) {
    throw new Error('Twilio client is not configured. Check environment variables.');
  }

  // Extract and validate arguments
  const { message, to_phone_number } = args;

  if (!message) {
    throw new Error('Message is required');
  }

  if (!to_phone_number) {
    throw new Error('to_phone_number is required');
  }

  // Validate phone number format
  if (!to_phone_number.startsWith('+')) {
    throw new Error('Phone number must be in E.164 format (start with +)');
  }

  // Truncate message if it exceeds 250 characters
  const originalLength = message.length;
  let finalMessage = message;
  
  if (originalLength > 250) {
    finalMessage = message.substring(0, 247) + '...';
    console.error(`Message truncated from ${originalLength} to 250 characters`);
  }

  try {
    // Send SMS via Twilio
    const twilioMessage = await twilioClient.messages.create({
      body: finalMessage,
      from: twilioPhoneNumber,
      to: to_phone_number
    });

    const result = {
      success: true,
      message_sid: twilioMessage.sid,
      truncated: originalLength > 250,
      original_length: originalLength,
      sent_length: finalMessage.length
    };

    console.error(`✓ SMS sent successfully: ${twilioMessage.sid}`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };

  } catch (error) {
    console.error(`✗ Failed to send SMS: ${error.message}`);
    throw new Error(`Failed to send SMS: ${error.message}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Twilio MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});