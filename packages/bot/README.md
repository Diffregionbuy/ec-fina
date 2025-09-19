# EC Bot - Discord Bot

A powerful Discord bot for EC Bot with integrated cryptocurrency payments, Minecraft account linking, and dynamic template system.

## 🚀 Features

- **🛍️ Shop System**: Browse and purchase products directly in Discord
- **💳 Crypto Payments**: Secure cryptocurrency payments via Tatum integration
- **⛏️ Minecraft Integration**: Link Discord accounts with Minecraft for automatic delivery
- **📋 Dynamic Templates**: Server-customizable embeds and interfaces
- **⚙️ Admin Panel**: Comprehensive server management and statistics
- **🔒 Security**: JWT authentication and permission-based access control
- **📊 Analytics**: Real-time statistics and monitoring
- **🎨 Customizable**: Template-driven UI with variable substitution

## 📦 Installation

### Prerequisites

- Node.js 18+ 
- TypeScript
- Discord Bot Token
- Backend API running (see `packages/backend`)

### Setup

1. **Install Dependencies**
   ```bash
   cd packages/bot
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   DISCORD_TOKEN=your_discord_bot_token
   DISCORD_CLIENT_ID=your_discord_client_id
   DISCORD_BOT_SERVICE_TOKEN=your_bot_service_token
   API_BASE_URL=http://localhost:3001
   ```

3. **Build and Start**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm run build
   npm start
   ```

## 🎮 Commands

### User Commands

- **`/shop`** - Browse and purchase products
  - `/shop browse [category]` - Browse products by category
  - `/shop cart` - View shopping cart
  - `/shop orders` - View order history

- **`/link`** - Minecraft account linking
  - `/link minecraft` - Generate linking code
  - `/link status` - Check linking status
  - `/link unlink` - Unlink account

### Admin Commands

- **`/admin`** - Server administration (Admin only)
  - `/admin status` - Bot status and statistics
  - `/admin templates` - Template management
  - `/admin products` - Product statistics
  - `/admin payments` - Payment analytics
  - `/admin cache` - Cache management

## 🏗️ Architecture

```
packages/bot/
├── src/
│   ├── commands/          # Slash commands
│   │   ├── shop.ts        # Shop system
│   │   ├── admin.ts       # Admin panel
│   │   └── link.ts        # Minecraft linking
│   ├── handlers/          # Event handlers
│   │   ├── commandHandler.ts      # Command execution
│   │   ├── interactionHandler.ts  # Button/menu interactions
│   │   └── eventHandler.ts        # Discord events
│   ├── services/          # Core services
│   │   ├── botApiService.ts       # Backend API integration
│   │   ├── templateService.ts     # Template processing
│   │   └── paymentService.ts      # Payment handling
│   ├── types/             # TypeScript definitions
│   ├── utils/             # Utilities
│   │   └── logger.ts      # Logging system
│   └── index.ts           # Bot entry point
├── logs/                  # Log files
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 Configuration

### Discord Bot Setup

1. **Create Discord Application**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create new application
   - Go to "Bot" section
   - Create bot and copy token

2. **Bot Permissions**
   Required permissions:
   - Send Messages
   - Use Slash Commands
   - Embed Links
   - Attach Files
   - Read Message History
   - Add Reactions

3. **Invite Bot**
   ```
   https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147483648&scope=bot%20applications.commands
   ```

### Backend Integration

The bot requires the backend API to be running with the following endpoints:

- `POST /api/bot-service/auth` - Authentication
- `GET /api/bot-service/templates/:serverId` - Templates
- `GET /api/bot-service/products/:serverId` - Products
- `POST /api/bot-service/orders` - Create orders
- `GET /api/bot-service/orders/:orderId` - Order status
- `POST /api/bot-service/minecraft/link-code` - Generate link codes
- `GET /api/bot-service/minecraft/:serverId/:userId` - Account status

## 📋 Template System

The bot uses a dynamic template system that allows servers to customize their interface:

### Available Templates

1. **public_homepage** - Main shop interface
2. **private_main_menu** - User dashboard
3. **confirmation_page** - Purchase confirmation
4. **invoice_page** - Payment invoice with QR code
5. **payment_successful** - Success notification
6. **link_minecraft** - Account linking interface
7. **reviews_page** - Analytics dashboard
8. **vouch_page** - Customer testimonials

### Template Variables

Templates support variable substitution:

```json
{
  "title": "Welcome {{username}}!",
  "description": "Server: {{serverName}}\nProducts: {{productCount}}"
}
```

Available variables:
- `{{username}}` - User's Discord username
- `{{serverId}}` - Discord server ID
- `{{serverName}}` - Discord server name
- `{{productCount}}` - Number of products
- `{{categoryCount}}` - Number of categories
- `{{timestamp}}` - Current timestamp

## 💳 Payment Integration

### Crypto Payments

The bot integrates with Tatum for cryptocurrency payments:

1. **Order Creation**: User selects products
2. **Wallet Generation**: Unique crypto address created
3. **QR Code**: Payment QR code displayed
4. **Monitoring**: Real-time payment tracking
5. **Confirmation**: Automatic order fulfillment

### Supported Cryptocurrencies

- Ethereum (ETH)
- Bitcoin (BTC)
- USDT
- USDC

## ⛏️ Minecraft Integration

### Account Linking Flow

1. **Generate Code**: `/link minecraft` creates 6-digit code
2. **In-Game Linking**: Player uses `/ecbot link <code>` in Minecraft
3. **Verification**: Backend verifies and links accounts
4. **Automatic Delivery**: Products delivered automatically

### Benefits

- Automatic product delivery
- Faster checkout process
- Account verification
- Enhanced security

## 📊 Monitoring & Logging

### Log Files

- `logs/bot-YYYY-MM-DD.log` - General bot logs
- `logs/error-YYYY-MM-DD.log` - Error logs
- `logs/debug-YYYY-MM-DD.log` - Debug logs (development)

### Log Categories

- **Commands**: Command execution tracking
- **API**: Backend API call monitoring
- **Payments**: Payment processing logs
- **Templates**: Template rendering logs
- **Events**: Discord event handling

### Statistics

The bot tracks:
- Command usage statistics
- API response times
- Payment success rates
- Template rendering performance
- Cache hit rates

## 🔒 Security

### Authentication

- JWT tokens for API authentication
- Permission-based access control
- Rate limiting on commands
- Secure webhook signatures

### Data Protection

- Encrypted payment wallet private keys
- Secure Discord token handling
- Request validation and sanitization
- Audit logging for admin actions

## 🚀 Deployment

### Development

```bash
npm run dev:watch  # Auto-restart on changes
```

### Production

```bash
# Build
npm run build

# Start with PM2
pm2 start dist/index.js --name "ec-bot"

# Or with Docker
docker build -t ec-bot .
docker run -d --name ec-bot ec-bot
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
CMD ["node", "dist/index.js"]
```

## 🧪 Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Lint code
npm run lint
npm run lint:fix
```

## 📈 Performance

### Optimization Features

- Template caching (5-minute TTL)
- Payment order caching (2-minute TTL)
- Command cooldowns
- Rate limiting
- Efficient API batching

### Monitoring

- Response time tracking
- Memory usage monitoring
- Cache hit rate analysis
- Error rate tracking

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

- **Documentation**: Check the implementation plan and API guides
- **Issues**: Report bugs via GitHub issues
- **Discord**: Join our support server

## 🔄 Changelog

### v1.0.0 (2025-09-05)

- ✅ Initial bot foundation
- ✅ Shop system with product browsing
- ✅ Admin panel with statistics
- ✅ Minecraft account linking
- ✅ Template system integration
- ✅ Payment order creation
- ✅ Comprehensive logging
- ✅ Error handling and validation

### Upcoming Features

- 🔄 Shopping cart persistence
- 🔄 Order history tracking
- 🔄 Payment monitoring dashboard
- 🔄 Advanced template editor
- 🔄 Multi-language support
- 🔄 Webhook notifications

---

**EC Bot Discord Integration** - Bringing cryptocurrency commerce to Discord servers with seamless Minecraft integration.