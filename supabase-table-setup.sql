-- Create table for storing SMS messages in Supabase
-- Run this SQL in your Supabase dashboard under "SQL Editor"

CREATE TABLE IF NOT EXISTS sms_messages (
  id SERIAL PRIMARY KEY,
  message_sid VARCHAR(50) UNIQUE NOT NULL,
  from_phone VARCHAR(20) NOT NULL,
  to_phone VARCHAR(20) NOT NULL,
  original_message TEXT NOT NULL,
  sent_message TEXT NOT NULL,
  original_length INTEGER NOT NULL,
  sent_length INTEGER NOT NULL,
  truncated BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
  twilio_status VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index for faster queries on message_sid
CREATE INDEX IF NOT EXISTS idx_sms_messages_sid ON sms_messages(message_sid);

-- Create an index for faster queries on sent_at timestamp
CREATE INDEX IF NOT EXISTS idx_sms_messages_sent_at ON sms_messages(sent_at);

-- Create an index for faster queries on status
CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON sms_messages(status);

-- Enable Row Level Security (optional, for better security)
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations (you can customize this based on your needs)
CREATE POLICY "Allow all operations on sms_messages" ON sms_messages
FOR ALL USING (true);