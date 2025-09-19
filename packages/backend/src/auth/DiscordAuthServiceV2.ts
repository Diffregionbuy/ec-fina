import jwt from 'jsonwebtoken';
import { supabase } from '../config/database';
import { DiscordApiClient, DiscordUser, DiscordGuild, AuthTokens } from '../services/DiscordApiClient';
import { logger } from '../utils/logger';

export class DiscordAuthServiceV2 {
  private readonly jwtSecret: string;
  private readonly discordApiClient: DiscordApiClient;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET!;
    
    if (!this.jwtSecret) {
      throw new Error('Missing JWT_SECRET configuration');
    }

    this.discordApiClient = new DiscordApiClient();
  }

  /**
   * Exchange authorization code for Discord access token
   */
  async exchangeCodeForToken(code: string): Promise<AuthTokens> {
    return this.discordApiClient.exchangeCodeForToken(code);
  }

  /**
   * Refresh Discord access token
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    return this.discordApiClient.refreshAccessToken(refreshToken);
  }

  /**
   * Get Discord user information
   */
  async getDiscordUser(accessToken: string): Promise<DiscordUser> {
    return this.discordApiClient.getDiscordUser(accessToken);
  }

  /**
   * Get Discord user's guilds (servers)
   */
  async getDiscordGuilds(accessToken: string): Promise<DiscordGuild[]> {
    return this.discordApiClient.getDiscordGuilds(accessToken);
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
        
        logger.info('User updated successfully', { 
          userId: data.id, 
          discordId: discordUser.id 
        });
        
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
        
        logger.info('New user created successfully', { 
          userId: data.id, 
          discordId: discordUser.id 
        });
        
        return data;
      }
    } catch (error) {
      logger.error('Database user operation error', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        discordId: discordUser.id 
      });
      throw new Error('Failed to create or update user');
    }
  }

  /**
   * Generate JWT token for authenticated user
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

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: '7d', // JWT expires in 7 days
      issuer: 'ecbot-api',
      audience: 'ecbot-frontend',
    });
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
      logger.warn('JWT verification failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
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
    return this.discordApiClient.hasManagementPermissions(guild);
  }

  /**
   * Filter guilds to only include manageable servers
   */
  filterManageableGuilds(guilds: DiscordGuild[]): DiscordGuild[] {
    return this.discordApiClient.filterManageableGuilds(guilds);
  }

  /**
   * Get authorization URL for Discord OAuth
   */
  getAuthorizationUrl(state?: string): string {
    return this.discordApiClient.getAuthorizationUrl(state);
  }

  /**
   * Get Discord API metrics
   */
  getApiMetrics() {
    return this.discordApiClient.getMetrics();
  }

  /**
   * Reset Discord API metrics
   */
  resetApiMetrics(): void {
    this.discordApiClient.resetMetrics();
  }

  /**
   * Update Discord API configuration
   */
  updateApiConfig(updates: any): void {
    this.discordApiClient.updateConfig(updates);
  }

  /**
   * Invalidate cache for a specific user
   */
  invalidateUserCache(accessToken: string): void {
    this.discordApiClient.invalidateUserCache(accessToken);
  }

  /**
   * Clear all Discord cache data
   */
  clearDiscordCache(): void {
    this.discordApiClient.clearCache();
  }

  /**
   * Get Discord cache statistics
   */
  getCacheStats() {
    return this.discordApiClient.getCacheStats();
  }

  /**
   * Handle token refresh with resilience
   */
  async handleTokenRefresh(payload: any): Promise<{ user: any; tokens: AuthTokens }> {
    try {
      logger.info('Refreshing Discord token', { userId: payload.userId });
      
      const newTokens = await this.refreshAccessToken(payload.discordRefreshToken);
      
      // Update user record with new tokens (optional - could be done in JWT only)
      const user = {
        id: payload.userId,
        discord_id: payload.discordId,
        username: payload.username,
        avatar: payload.avatar,
        email: payload.email
      };

      logger.info('Discord token refreshed successfully', { 
        userId: payload.userId,
        newExpiresAt: Date.now() + newTokens.expiresIn * 1000
      });

      return { user, tokens: newTokens };
    } catch (error) {
      logger.error('Failed to refresh Discord token', {
        userId: payload.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error('Failed to refresh Discord access token');
    }
  }

  /**
   * Validate user access to Discord server with resilience
   */
  async validateServerAccess(accessToken: string, serverId: string): Promise<boolean> {
    try {
      const guilds = await this.getDiscordGuilds(accessToken);
      const targetGuild = guilds.find(guild => guild.id === serverId);
      
      if (!targetGuild) {
        logger.warn('User attempted to access server they are not a member of', { 
          serverId 
        });
        return false;
      }

      const hasAccess = this.hasManagementPermissions(targetGuild);
      
      if (!hasAccess) {
        logger.warn('User attempted to access server without management permissions', { 
          serverId,
          permissions: targetGuild.permissions,
          owner: targetGuild.owner
        });
      }

      return hasAccess;
    } catch (error) {
      logger.error('Failed to validate server access', {
        serverId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}