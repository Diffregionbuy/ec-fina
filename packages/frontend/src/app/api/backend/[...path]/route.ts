import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Request deduplication cache with TTL
const requestCache = new Map<string, { promise: Promise<NextResponse>; timestamp: number }>();

// Response cache for GET requests
const responseCache = new Map<string, { response: any; expiresAt: number }>();

// Cleanup interval for request cache
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requestCache.entries()) {
    if (now - value.timestamp > 30000) { // 30 seconds TTL
      requestCache.delete(key);
    }
  }
}, 60000); // Clean every minute

async function forwardRequest(
  request: NextRequest,
  path: string,
  backendToken: string
): Promise<NextResponse> {
  let requestBody: string | undefined;
  
  try {
    const url = new URL(request.url);
    const backendUrl = `${BACKEND_URL}/api/${path}${url.search}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${backendToken}`,
      'Content-Type': request.headers.get('content-type') || 'application/json',
    };

    const forwardHeaders = ['user-agent', 'accept', 'accept-language'];
    forwardHeaders.forEach(header => {
      const value = request.headers.get(header);
      if (value) {
        headers[header] = value;
      }
    });

    const requestOptions: RequestInit = {
      method: request.method,
      headers,
    };

    // Handle request body properly to avoid stream locking
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        // Clone the request to avoid consuming the original stream
        const clonedRequest = request.clone();
        requestBody = await clonedRequest.text();
        if (requestBody) {
          requestOptions.body = requestBody;
        }
      } catch (error) {
        console.error('Error reading request body:', error);
      }
    }

    const response = await fetch(backendUrl, requestOptions);
    
    // Handle response stream properly to avoid locking
    const responseText = await response.text();
    let responseData;
    
    // Handle empty or malformed responses more gracefully
    if (!responseText || responseText.trim() === '') {
      console.warn(`Empty response from backend for ${path}`);
      responseData = { success: false, error: 'Empty response from server' };
    } else {
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.error(`JSON parse error for ${path}:`, parseError);
        console.error('Response text that failed to parse:', responseText);
        responseData = { 
          success: false, 
          error: 'Invalid JSON response from server',
          rawResponse: responseText 
        };
      }
    }

    // Create response with proper headers to avoid stream issues
    const nextResponse = NextResponse.json(responseData, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': request.method === 'GET' ? 'public, max-age=60' : 'no-cache',
      },
    });

    // Cache successful GET responses
    if (request.method === 'GET' && response.ok) {
      const cacheKey = `${path}${url.search}`;
      const cacheDuration = getCacheDuration(path);
      
      if (cacheDuration > 0) {
        responseCache.set(cacheKey, {
          response: responseData,
          expiresAt: Date.now() + cacheDuration
        });
      }
    }

    return nextResponse;

  } catch (error) {
    console.error('Error forwarding request to backend:', error);
    console.error('Request details:', {
      path,
      method: request.method,
      url: request.url,
      backendUrl: `${BACKEND_URL}/api/${path}${new URL(request.url).search}`
    });
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );
  }
}

function getCacheDuration(path: string): number {
  // Define cache durations for different endpoints
  if (path.includes('/servers') && path.includes('/details')) {
    return 30 * 1000; // 30 seconds for server details
  }
  if (path.includes('/bot-status')) {
    return 10 * 1000; // 10 seconds for bot status
  }
  if (path.includes('/products')) {
    return 60 * 1000; // 1 minute for products
  }
  if (path.includes('/users/servers')) {
    return 5 * 60 * 1000; // 5 minutes for user servers
  }
  if (path.includes('/stats')) {
    return 30 * 1000; // 30 seconds for stats
  }
  
  return 0; // No cache by default
}

async function handleRequest(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const pathString = params.path.join('/');
    const url = new URL(request.url);
    const cacheKey = `${request.method}-${pathString}${url.search}`;
    
    // Debug logging for products requests
    if (pathString.includes('products')) {
      console.log('🔍 Products API request caught by [...path] route:', {
        pathString,
        fullUrl: request.url,
        method: request.method
      });
    }
    
    // Check response cache for GET requests
    if (request.method === 'GET') {
      const cached = responseCache.get(`${pathString}${url.search}`);
      if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json(cached.response, {
          headers: {
            'Content-Type': 'application/json',
            'X-Cache': 'HIT',
          }
        });
      }
    }

    // Check for duplicate requests with proper cleanup
    const existingRequest = requestCache.get(cacheKey);
    if (existingRequest && (Date.now() - existingRequest.timestamp < 30000)) {
      try {
        return await existingRequest.promise;
      } catch (error) {
        // If the cached request failed, remove it and continue
        requestCache.delete(cacheKey);
      }
    }

    const requestPromise = (async (): Promise<NextResponse> => {
      try {
        const session = await getServerSession(authOptions);
        
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 API Proxy - Session check:', {
            hasSession: !!session,
            sessionKeys: session ? Object.keys(session) : [],
            hasBackendToken: !!(session as any)?.backendToken,
            backendTokenLength: (session as any)?.backendToken?.length || 0
          });
        }
        
        if (!session) {
          console.log('❌ API Proxy - No session found');
          return NextResponse.json(
            { error: 'Authentication required' },
            { 
              status: 401,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }

        const backendToken = (session as any).backendToken;
        
        if (!backendToken) {
          console.log('❌ API Proxy - No backend token in session');
          
          // Try to get a fresh backend token
          try {
            const origin = new URL(request.url).origin;
            const nextAuthBase = process.env.NEXTAUTH_URL || origin;
            const tokenResponse = await fetch(`${nextAuthBase}/api/auth/backend-token`, {
              headers: {
                Cookie: request.headers.get('cookie') || ''
              },
              cache: 'no-store'
            });
            
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json();
              if (tokenData?.token) {
                console.log('✅ API Proxy - Got fresh backend token');
                return await forwardRequest(request, pathString, tokenData.token);
              } else {
                console.warn('⚠️ API Proxy - backend-token response missing token field');
              }
            } else {
              console.warn('⚠️ API Proxy - backend-token endpoint returned', tokenResponse.status);
            }
          } catch (tokenError) {
            console.error('Failed to get fresh backend token:', tokenError);
          }
          
          return NextResponse.json(
            { error: 'Backend token not found in session' },
            { 
              status: 401,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }

        if (process.env.NODE_ENV === 'development') {
          console.log('✅ API Proxy - Backend token found, forwarding request');
        }
        
        return await forwardRequest(request, pathString, backendToken);

      } catch (error) {
        console.error('Error in API proxy:', error);
        return NextResponse.json(
          { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
          { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    })();

    // Store request with timestamp for cleanup
    requestCache.set(cacheKey, { promise: requestPromise, timestamp: Date.now() });
    
    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up request cache after completion
      setTimeout(() => requestCache.delete(cacheKey), 1000);
    }

  } catch (error) {
    console.error('Error in API proxy:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return handleRequest(request, { params });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return handleRequest(request, { params });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return handleRequest(request, { params });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return handleRequest(request, { params });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return handleRequest(request, { params });
}

// Clean up expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  
  // Clean response cache
  for (const [key, value] of responseCache.entries()) {
    if (value.expiresAt <= now) {
      responseCache.delete(key);
    }
  }
  
  // Clean request cache (shouldn't have long-lived entries, but just in case)
  for (const [key, promise] of requestCache.entries()) {
    // Remove entries older than 30 seconds
    setTimeout(() => requestCache.delete(key), 30000);
  }
}, 60000); // Clean up every minute