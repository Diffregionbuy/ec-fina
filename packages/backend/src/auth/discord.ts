import axios from 'axios';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { supabase } from '../config/database';
import { OptimizedDiscordApiClient } from '../services/OptimizedDiscordApiClient';
import { optimizedJwtService } from '../utils/optimizedJwt';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email: string | null;
  verified: boolean;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  approximate_member_count?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class DiscordAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly jwtSecret: string;

  constructor() {
    this.clientId = process.env.DISCORD_CLIENT_ID!;
    this.clientSecret = process.env.DISCORD_CLIENT_SECRET!;
    this.redirectUri = process.env.DISCORD_REDIRECT_URI!;
    this.jwtSecret = process.env.JWT_SECRET!;

    if (!this.clientId || !this.clientSecret || !this.redirectUri || !this.jwtSecret) {
      throw new Error('Missing Discord OAuth configuration');
    }
  }

  /**
   * Exchange authorization code for Discord access token
   */
  async exchangeCodeForToken(code: string): Promise<AuthTokens> {
    try {
      const response = await axios.post(
        'https://discord.com/api/oauth2/token',
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
      };
    } catch (error) {
      console.error('Discord token exchange error:', error);
      throw new Error('Failed to exchange Discord authorization code');
    }
  }

  /**
   * Refresh Discord access token
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const response = await axios.post(
        'https://discord.com/api/oauth2/token',
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
      };
    } catch (error) {
      console.error('Discord token refresh error:', error);
      throw new Error('Failed to refresh Discord access token');
    }
  }

  /**
   * Get Discord user information
   */
  async getDiscordUser(accessToken: string): Promise<DiscordUser> {
    try {
      const response = await axios.get('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return {
        id: response.data.id,
        username: response.data.username,
        discriminator: response.data.discriminator,
        avatar: response.data.avatar,
        email: response.data.email,
        verified: response.data.verified,
      };
    } catch (error) {
      console.error('Discord user fetch error:', error);
      throw new Error('Failed to fetch Discord user information');
    }
  }

  /**
   * Get Discord user's guilds (servers) using resilient API client
   */
  async getDiscordGuilds(accessToken: string): Promise<DiscordGuild[]> {
    try {
      // Use the optimized Discord API client instead of direct axios
      const apiClient = new OptimizedDiscordApiClient();
      
      return await apiClient.getDiscordGuilds(accessToken);
    } catch (error) {
      console.error('Discord guilds fetch error:', error);
      throw new Error('Failed to fetch Discord guilds');
    }
  }

  /**
   * Create or update user in database
   */
  async createOrUpdateUser(discordUser: DiscordUser): Promise<any> {
    try {
      const { data: existingUser, error: selectError } = await supabase
        .from('users')
        .select('*')
        .eq('discord_id', discordUser.id)
        .single();

      if (selectError && selectError.code !== 'PGRST116') {
        throw selectError;
      }

      const userData = {
        discord_id: discordUser.id,
        username: discordUser.username,
        avatar: discordUser.avatar,
        email: discordUser.email,
        updated_at: new Date().toISOString(),
      };

      if (existingUser) {
        // Update existing user
        const { data, error } = await supabase
          .from('users')
          .update(userData)
          .eq('discord_id', discordUser.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new user
        const { data, error } = await supabase
          .from('users')
          .insert({
            ...userData,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    } catch (error) {
      console.error('Database user operation error:', error);
      throw new Error('Failed to create or update user');
    }
  }

  /**
   * OPTIMIZED: Generate JWT token for authenticated user - Prevents token spam
   */
  generateJWT(user: any, discordTokens: AuthTokens): string {
    const payload = {
      userId: user.id,
      discordId: user.discord_id,
      username: user.username,
      avatar: user.avatar,
      email: user.email,
      discordAccessToken: discordTokens.accessToken,
      discordRefreshToken: discordTokens.refreshToken,
      discordExpiresAt: Date.now() + discordTokens.expiresIn * 1000,
    };

    // Use optimized JWT service that prevents token spam
    return optimizedJwtService.generateToken(payload);
  }

  /**
   * Verify and decode JWT token
   */
  verifyJWT(token: string): any {
    try {
      return jwt.verify(token, this.jwtSecret, {
        issuer: 'ecbot-api',
        audience: 'ecbot-frontend',
      });
    } catch (error) {
      throw new Error('Invalid or expired JWT token');
    }
  }

  /**
   * Check if Discord token needs refresh
   */
  needsTokenRefresh(payload: any): boolean {
    return Date.now() >= payload.discordExpiresAt - 60000; // Refresh 1 minute before expiry
  }

  /**
   * Check if user has management permissions for a Discord server
   */
  hasManagementPermissions(guild: DiscordGuild): boolean {
    // Owner always has permissions
    if (guild.owner) return true;
    
    // Check for MANAGE_GUILD or ADMINISTRATOR permissions
    const MANAGE_GUILD = 0x20;
    const ADMINISTRATOR = 0x8;
    const permissions = BigInt(guild.permissions);
    
    return (permissions & BigInt(MANAGE_GUILD)) !== 0n || (permissions & BigInt(ADMINISTRATOR)) !== 0n;
  }

  /**
   * Filter guilds to only include manageable servers
   */
  filterManageableGuilds(guilds: DiscordGuild[]): DiscordGuild[] {
    return guilds.filter(guild => this.hasManagementPermissions(guild));
  }

  /**
   * Get authorization URL for Discord OAuth
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'identify email guilds',
    });

    if (state) {
      params.append('state', state);
    }

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  }
}