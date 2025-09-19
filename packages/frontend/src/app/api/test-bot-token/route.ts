import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    
    if (!botToken) {
      return NextResponse.json({
        success: false,
        error: 'No bot token configured'
      });
    }
    
    // Test the bot token by getting bot user info
    const response = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `Bot token test failed: ${response.status} ${response.statusText}`
      });
    }
    
    const botUser = await response.json();
    
    return NextResponse.json({
      success: true,
      data: {
        botUser: {
          id: botUser.id,
          username: botUser.username,
          discriminator: botUser.discriminator,
        },
        tokenValid: true
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}