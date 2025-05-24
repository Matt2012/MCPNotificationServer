#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const twilio = require('twilio');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const defaultRecipient = process.env.DEFAULT_PHONE_NUMBER;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_ANON_KEY?.trim();
let supabase = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✓ Supabase client initialized successfully');
  } catch (error) {
    console.log('⚠ Supabase client initialization failed:', error.message);
  }
} else {
  console.log('⚠ Supabase not configured - missing environment variables');
}

let twilioClient = null;

// Check if Twilio is configured
function isTwilioConfigured() {
  return accountSid && authToken && twilioPhoneNumber && defaultRecipient;
}

// Check if Supabase is configured
function isSupabaseConfigured() {
  return supabase !== null;
}

// Function to log message to Supabase
async function logMessageToSupabase(messageData) {
  if (!isSupabaseConfigured()) {
    console.log('Supabase not configured, skipping database logging');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('sms_messages')
      .insert([messageData])
      .select();

    if (error) {
      console.error('Error logging to Supabase:', error);
      return null;
    }

    console.log('✓ Message logged to Supabase:', data[0]?.id);
    return data[0];
  } catch (error) {
    console.error('Supabase logging error:', error);
    return null;
  }
}

// Initialize Twilio client if configured
if (isTwilioConfigured()) {
  twilioClient = twilio(accountSid, authToken);
  console.log('✓ Twilio client initialized successfully');
} else {
  console.log('⚠ Twilio client not configured - missing environment variables');
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
              description: 'The recipient phone number (E.164 format). If not provided, uses configured default number'
            }
          },
          required: ['message']
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

  // Use default recipient if no phone number provided
  const recipient = to_phone_number || defaultRecipient;

  // Validate phone number format
  if (!recipient.startsWith('+')) {
    throw new Error('Phone number must be in E.164 format (start with +)');
  }

  // Truncate message if it exceeds 250 characters
  const originalLength = message.length;
  let finalMessage = message;
  
  if (originalLength > 250) {
    finalMessage = message.substring(0, 247) + '...';
    console.log(`Message truncated from ${originalLength} to 250 characters`);
  }

  try {
    // Send SMS via Twilio
    const twilioMessage = await twilioClient.messages.create({
      body: finalMessage,
      from: twilioPhoneNumber,
      to: recipient
    });

    const result = {
      success: true,
      message_sid: twilioMessage.sid,
      truncated: originalLength > 250,
      original_length: originalLength,
      sent_length: finalMessage.length,
      recipient: recipient
    };

    // Log to Supabase database
    const messageData = {
      message_sid: twilioMessage.sid,
      from_phone: twilioPhoneNumber,
      to_phone: recipient,
      original_message: message,
      sent_message: finalMessage,
      original_length: originalLength,
      sent_length: finalMessage.length,
      truncated: originalLength > 250,
      status: 'sent',
      sent_at: new Date().toISOString(),
      twilio_status: twilioMessage.status
    };

    await logMessageToSupabase(messageData);

    console.log(`✓ SMS sent successfully: ${twilioMessage.sid}`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };

  } catch (error) {
    console.log(`✗ Failed to send SMS: ${error.message}`);
    throw new Error(`Failed to send SMS: ${error.message}`);
  }
});

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    server: 'twilio-mcp-server',
    configured: isTwilioConfigured()
  });
});

// MCP endpoint with SSE transport (GET)
app.get('/mcp', async (req, res) => {
  try {
    const transport = new SSEServerTransport('/mcp', res);
    await server.connect(transport);
  } catch (error) {
    console.error('SSE connection error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to establish SSE connection' });
    }
  }
});

// MCP endpoint for direct JSON-RPC requests (POST)
app.post('/mcp', async (req, res) => {
  try {
    const request = req.body;
    console.log('Received MCP request:', JSON.stringify(request, null, 2));
    
    // Handle the request directly
    const response = await server.request(request);
    
    console.log('Sending MCP response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('MCP request error:', error);
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: "Internal error",
        data: error.message
      }
    });
  }
});

// Start HTTP server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Twilio MCP Server running on http://0.0.0.0:${PORT}`);
  console.log(`📡 MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
  console.log(`💚 Health check: http://0.0.0.0:${PORT}/health`);
});