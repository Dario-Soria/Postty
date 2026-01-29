/**
 * User First Post API Route - Proxy to backend
 * Checks if this is the user's first post
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.POSTTY_API_BASE_URL || 'http://localhost:8080';

export async function GET(request: NextRequest) {
  try {
    // Forward the Authorization header
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json(
        { status: 'error', message: 'Missing Authorization header' },
        { status: 401 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/user/is-first-post`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('User first post proxy error:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Failed to connect to backend',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
