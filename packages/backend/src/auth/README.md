# Discord OAuth Setup Guide

This guide will help you set up Discord OAuth for the EcBot SaaS platform.

## 1. Create Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Enter your application name (e.g., "EcBot SaaS Platform")
4. Click "Create"

## 2. Configure OAuth2 Settings

1. In your Discord application, go to the "OAuth2" section
2. Click "Add Redirect" under "Redirects"
3. Add your redirect URI:
   - Development: `http://localhost:3000/auth/callback`
   - Production: `https://yourdomain.com/auth/callback`

## 3. Get Application Credentials

1. In the "General Information" section, copy:
   - **Application ID** (this is your `DISCORD_CLIENT_ID`)
   - **Client Secret** (this is your `DISCORD_CLIENT_SECRET`)

## 4. Configure Environment Variables

Update your `.env` file with the Discord credentials:

```env
DISCORD_CLIENT_ID=your_application_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
DISCORD_REDIRECT_URI=http://localhost:3000/auth/callback
JWT_SECRET=your_secure_jwt_secret_here
```

## 5. Configure Supabase Authentication

1. Go to your Supabase project dashboard
2. Navigate to Authentication > Settings
3. Enable Discord provider:
   - **Client ID**: Your Discord Application ID
   - **Client Secret**: Your Discord Client Secret
   - **Redirect URL**: `https://your-project.supabase.co/auth/v1/callback`

## 6. Required OAuth2 Scopes

The application requests the following Discord scopes:
- `identify` - Access to user's basic profile information
- `email` - Access to user's email address
- `guilds` - Access to user's Discord servers (for server management)

## 7. Testing the Setup

1. Start your backend server:
   ```bash
   cd packages/backend
   npm run dev
   ```

2. Test the auth endpoints:
   ```bash
   # Get Discord authorization URL
   curl http://localhost:3001/api/auth/discord
   
   # The response should include an authUrl
   ```

3. Complete the OAuth flow:
   - Visit the authorization URL
   - Authorize the application
   - You'll be redirected to your frontend with an authorization code
   - Exchange the code for a JWT token using `/api/auth/login`

## 8. API Endpoints

### GET /api/auth/discord
Get Discord OAuth authorization URL.

**Response:**
```json
{
  "success": true,
  "data": {
    "authUrl": "https://discord.com/api/oauth2/authorize?...",
    "clientId": "your_client_id"
  }
}
```

### POST /api/auth/login
Exchange Discord authorization code for JWT token.

**Request:**
```json
{
  "code": "discord_authorization_code",
  "state": "optional_state_parameter"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token",
    "user": {
      "id": "uuid",
      "discordId": "123456789",
      "username": "username",
      "avatar": "avatar_hash",
      "email": "user@example.com"
    },
    "guilds": [
      {
        "id": "server_id",
        "name": "Server Name",
        "icon": "icon_hash",
        "owner": true,
        "permissions": "8"
      }
    ]
  }
}
```

### GET /api/auth/me
Get current user information (requires authentication).

**Headers:**
```
Authorization: Bearer jwt_token
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "discordId": "123456789",
      "username": "username",
      "avatar": "avatar_hash",
      "email": "user@example.com"
    },
    "guilds": [...]
  }
}
```

### POST /api/auth/refresh
Refresh JWT token (requires authentication).

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "new_jwt_token",
    "expiresIn": 604800
  }
}
```

### POST /api/auth/logout
Logout user (client-side token removal).

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  }
}
```

## 9. Error Handling

All endpoints return errors in the following format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

Common error codes:
- `MISSING_TOKEN` - Authorization header missing
- `INVALID_TOKEN` - JWT token is invalid or expired
- `MISSING_CODE` - Discord authorization code missing
- `INVALID_CODE` - Discord authorization code is invalid
- `DISCORD_API_ERROR` - Discord API request failed
- `DATABASE_ERROR` - Database operation failed
- `TOKEN_REFRESH_FAILED` - Failed to refresh Discord token

## 10. Security Considerations

- Store JWT tokens securely on the client side
- Use HTTPS in production
- Rotate your Discord client secret regularly
- Monitor for suspicious authentication attempts
- Implement rate limiting on auth endpoints
- Validate all user inputs
- Use secure JWT secrets (minimum 32 characters)

## 11. Troubleshooting

### "Invalid redirect URI" error
- Ensure the redirect URI in Discord matches exactly with your environment variable
- Check for trailing slashes or protocol mismatches

### "Invalid client" error
- Verify your Discord Client ID and Client Secret are correct
- Ensure the Discord application is not deleted or suspended

### JWT verification fails
- Check that JWT_SECRET is set and consistent across restarts
- Verify the token hasn't expired (7 day default)
- Ensure the token format is correct (Bearer prefix)

### Database connection errors
- Verify Supabase credentials are correct
- Check that the users table exists and has proper RLS policies
- Ensure the service role key has sufficient permissions