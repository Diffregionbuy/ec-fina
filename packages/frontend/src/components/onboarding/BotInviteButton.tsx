'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ExternalLink, Bot } from 'lucide-react';

interface BotInviteButtonProps {
  serverId: string;
  onSuccess: () => void;
  onError: (error: string) => void;
  isInviting: boolean;
  setIsInviting: (inviting: boolean) => void;
}

// Discord bot permissions - specific permissions needed
const REQUIRED_PERMISSIONS = {
  SEND_MESSAGES: 2048,           // 0x800
  MANAGE_MESSAGES: 8192,         // 0x2000
  USE_SLASH_COMMANDS: 2147483648, // 0x80000000
  EMBED_LINKS: 16384,            // 0x4000
  READ_MESSAGE_HISTORY: 65536,   // 0x10000
  VIEW_CHANNEL: 1024,            // 0x400
};

// Calculate combined permissions (not administrator)
const COMBINED_PERMISSIONS = Object.values(REQUIRED_PERMISSIONS).reduce((sum, perm) => sum + perm, 0);

// Bot client ID from environment variables
const BOT_CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_BOT_CLIENT_ID;

export function BotInviteButton({ 
  serverId, 
  onSuccess, 
  onError, 
  isInviting, 
  setIsInviting 
}: BotInviteButtonProps) {
  const [hasClickedInvite, setHasClickedInvite] = useState(false);

  const generateInviteUrl = () => {
    if (!BOT_CLIENT_ID) {
      throw new Error('Discord bot client ID is not configured');
    }
    
    const permissions = COMBINED_PERMISSIONS.toString(); // Specific required permissions
    const baseUrl = 'https://discord.com/api/oauth2/authorize';
    const params = new URLSearchParams({
      client_id: BOT_CLIENT_ID,
      permissions,
      scope: 'bot applications.commands',
      guild_id: serverId,
      // No redirect_uri needed for simple bot invitations
    });
    
    return `${baseUrl}?${params.toString()}`;
  };

  const handleInviteClick = () => {
    try {
      setIsInviting(true);
      setHasClickedInvite(true);
      
      const inviteUrl = generateInviteUrl();
    
    // Open Discord invite in new window
    const inviteWindow = window.open(
      inviteUrl,
      'discord-invite',
      'width=500,height=700,scrollbars=yes,resizable=yes'
    );

    // Since we're not using a callback, we'll rely on window polling

    // Poll for window closure and check bot status
    const pollTimer = setInterval(() => {
      if (inviteWindow?.closed) {
        clearInterval(pollTimer);
        clearTimeout(timeoutId);
        // Check if bot was actually invited
        checkBotInviteStatus();
      }
    }, 1000);

    // Timeout after 5 minutes
    const timeoutId = setTimeout(() => {
      clearInterval(pollTimer);
      if (!inviteWindow?.closed) {
        inviteWindow?.close();
      }
      if (isInviting) {
        setIsInviting(false);
        onError('Invite process timed out. Please try again.');
      }
    }, 300000);
    } catch (error) {
      setIsInviting(false);
      onError(error instanceof Error ? error.message : 'Failed to generate invite URL');
    }
  };

  const checkBotInviteStatus = async () => {
    try {
      console.log('🤖 Checking bot invite status for server:', serverId);
      
      // Check if bot is in the server by calling our API
      const response = await fetch(`/api/backend/servers/${serverId}/bot-status`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to check bot status: ${response.status}`);
      }

      const data = await response.json();
      console.log('🤖 Bot status response:', data);
      
      if (data.success && data.data.botStatus && data.data.botStatus.invited) {
        console.log('🤖 Bot successfully invited!');
        setIsInviting(false);
        onSuccess();
      } else {
        console.log('🤖 Bot not yet invited');
        setIsInviting(false);
        onError('Bot invitation was not completed. Please try again.');
      }
    } catch (error) {
      console.error('🤖 Failed to check bot status:', error);
      setIsInviting(false);
      onError('Failed to verify bot invitation. Please try again.');
    }
  };

  const handleManualCheck = () => {
    setIsInviting(true);
    checkBotInviteStatus();
  };

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <Button
          onClick={handleInviteClick}
          disabled={isInviting}
          size="lg"
          className="w-full"
        >
          {isInviting ? (
            <>
              <LoadingSpinner size="sm" className="mr-2" />
              Inviting Bot...
            </>
          ) : (
            <>
              <Bot className="w-5 h-5 mr-2" />
              Invite EcBot to Server
              <ExternalLink className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </motion.div>

      {hasClickedInvite && !isInviting && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="text-center space-y-3"
        >
          <p className="text-sm text-gray-600">
            Did you complete the bot invitation?
          </p>
          
          <Button
            variant="outline"
            onClick={handleManualCheck}
            size="sm"
          >
            Yes, Check Bot Status
          </Button>
        </motion.div>
      )}

      <div className="text-xs text-gray-500 space-y-1">
        <p>• This will open Discord in a new window</p>
        <p>• Make sure you have permission to add bots to the server</p>
        <p>• The bot will be added with the minimum required permissions</p>
      </div>
    </div>
  );
}