'use client';

import { Server, BotStatus } from '@/types/dashboard';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { 
  CheckCircle, 
  AlertCircle, 
  XCircle, 
  ExternalLink, 
  RefreshCw,
  Bot,
  Shield
} from 'lucide-react';

interface ServerInviteStatusProps {
  server: Server;
  botStatus: BotStatus | null;
}

export function ServerInviteStatus({ server, botStatus }: ServerInviteStatusProps) {
  const generateInviteUrl = () => {
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || 'YOUR_BOT_CLIENT_ID';
    const permissions = '8'; // Administrator permissions
    const scope = 'bot%20applications.commands';
    
    return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=${scope}&guild_id=${server.discord_server_id}`;
  };

  if (!server.bot_invited) {
    return (
      <Alert variant="warning" className="mb-6">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-medium text-yellow-800 mb-1">Bot Not Invited</h4>
            <p className="text-yellow-700 mb-3">
              The EcBot hasn't been added to your Discord server yet. You need to invite the bot before you can configure it.
            </p>
            <div className="flex items-center space-x-2">
              <Button
                size="sm"
                onClick={() => window.open(generateInviteUrl(), '_blank')}
              >
                <Bot className="w-4 h-4 mr-2" />
                Invite Bot
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Check Status
              </Button>
            </div>
          </div>
        </div>
      </Alert>
    );
  }

  if (!botStatus?.is_in_server) {
    return (
      <Alert variant="error" className="mb-6">
        <div className="flex items-start space-x-3">
          <XCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-medium text-red-800 mb-1">Bot Not Found in Server</h4>
            <p className="text-red-700 mb-3">
              The bot was invited but is no longer in your server. It may have been kicked or the invitation expired.
            </p>
            <div className="flex items-center space-x-2">
              <Button
                size="sm"
                onClick={() => window.open(generateInviteUrl(), '_blank')}
              >
                <Bot className="w-4 h-4 mr-2" />
                Re-invite Bot
              </Button>
            </div>
          </div>
        </div>
      </Alert>
    );
  }

  if (!botStatus?.has_permissions || (botStatus?.missing_permissions && botStatus.missing_permissions.length > 0)) {
    return (
      <Alert variant="warning" className="mb-6">
        <div className="flex items-start space-x-3">
          <Shield className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-medium text-yellow-800 mb-1">Missing Permissions</h4>
            <p className="text-yellow-700 mb-2">
              The bot is in your server but doesn't have all required permissions:
            </p>
            {botStatus?.missing_permissions && botStatus.missing_permissions.length > 0 && (
              <ul className="list-disc list-inside text-yellow-700 text-sm mb-3 space-y-1">
                {botStatus.missing_permissions.map((permission) => (
                  <li key={permission}>{permission.replace(/_/g, ' ')}</li>
                ))}
              </ul>
            )}
            <div className="flex items-center space-x-2">
              <Button
                size="sm"
                onClick={() => window.open(generateInviteUrl(), '_blank')}
              >
                <Shield className="w-4 h-4 mr-2" />
                Fix Permissions
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Check Again
              </Button>
            </div>
          </div>
        </div>
      </Alert>
    );
  }

  if (!botStatus?.is_online) {
    return (
      <Alert variant="warning" className="mb-6">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-medium text-yellow-800 mb-1">Bot Offline</h4>
            <p className="text-yellow-700 mb-3">
              The bot is in your server with proper permissions but appears to be offline. 
              {botStatus?.last_seen && (
                <span> Last seen: {new Date(botStatus.last_seen).toLocaleString()}</span>
              )}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Check Status
            </Button>
          </div>
        </div>
      </Alert>
    );
  }

  // Bot is working properly
  return (
    <Alert variant="success" className="mb-6">
      <div className="flex items-start space-x-3">
        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h4 className="font-medium text-green-800 mb-1">Bot Active</h4>
          <p className="text-green-700">
            EcBot is online and ready to serve your Discord server. All permissions are configured correctly.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <a
            href={`https://discord.com/channels/${server.discord_server_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-600 hover:text-green-700"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </Alert>
  );
}