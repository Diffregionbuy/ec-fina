import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serverId = searchParams.get('serverId');
  
  if (!serverId) {
    return NextResponse.json({
      success: false,
      error: 'serverId parameter is required'
    }, { status: 400 });
  }
  
  try {
    // Test the bot status API endpoint
    const response = await fetch(`http://localhost:3000/api/backend/servers/${serverId}/bot-status`, {
      headers: {
        'Content-Type': 'application/json',
        // Note: This won't work without proper session cookies
        // This is just for testing the endpoint structure
      },
    });
    
    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      data: {
        serverId,
        apiResponse: {
          status: response.status,
          data
        }
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}