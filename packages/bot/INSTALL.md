# Installation Guide - EC Bot Discord Bot

## Quick Start

### Prerequisites
- Node.js 18+ installed
- Discord Bot Token
- Backend API running (see `packages/backend`)

### Installation Steps

1. **Navigate to bot directory**
   ```bash
   cd packages/bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your settings:
   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   DISCORD_CLIENT_ID=your_discord_client_id_here
   DISCORD_BOT_SERVICE_TOKEN=your_bot_service_token_here
   API_BASE_URL=http://localhost:3001
   ```

4. **Start the bot**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm run build
   npm start
   ```

## Windows Installation Issues

If you encounter canvas/GTK dependency errors on Windows, the bot has been configured to work without canvas. The QR code generation will still work using the `qrcode` package without native dependencies.

### Common Windows Issues

**Error: Missing GTK libraries**
- This is resolved - canvas dependency has been removed
- QR codes are generated using pure JavaScript

**Error: node-gyp build failed**
- This should not occur with the current configuration
- If it does, ensure you have Visual Studio Build Tools installed

### Alternative QR Code Generation

The bot uses `qrcode` package which generates QR codes as:
- Data URLs (base64 encoded images)
- SVG strings
- Terminal output (for debugging)

No native compilation required!

## Docker Installation

For a cleaner installation experience, use Docker:

```bash
# Build the image
docker build -t ec-bot .

# Run the container
docker run -d --name ec-bot \
  -e DISCORD_TOKEN=your_token \
  -e API_BASE_URL=http://host.docker.internal:3001 \
  ec-bot
```

Or use docker-compose:

```bash
docker-compose up -d
```

## Verification

After installation, verify the bot is working:

1. **Check logs**
   ```bash
   # Development
   npm run dev
   
   # Check log files
   ls logs/
   ```

2. **Test commands in Discord**
   - `/shop` - Should show product browsing interface
   - `/admin status` - Should show bot statistics (Admin only)
   - `/link minecraft` - Should generate linking code

3. **Check API connection**
   The bot will log API connection status on startup.

## Troubleshooting

### Bot not responding to commands
- Check Discord token is correct
- Verify bot has proper permissions in server
- Check API_BASE_URL is accessible

### API connection failed
- Ensure backend is running on specified URL
- Check DISCORD_BOT_SERVICE_TOKEN matches backend configuration
- Verify network connectivity

### Commands not registering
- Bot needs `applications.commands` scope
- Check DISCORD_CLIENT_ID is correct
- Commands register automatically on bot startup

## Support

If you encounter issues:
1. Check the logs in `logs/` directory
2. Verify all environment variables are set
3. Ensure backend API is running and accessible
4. Check Discord bot permissions and scopes

For additional help, refer to the main README.md file.