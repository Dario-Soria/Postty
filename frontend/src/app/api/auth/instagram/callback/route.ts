import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

export async function GET(request: NextRequest) {
  // Forward the callback to the backend
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  const state = searchParams.get('state');

  // Build the backend callback URL
  const backendUrl = new URL(`${BACKEND_URL}/auth/instagram/callback`);
  if (code) backendUrl.searchParams.set('code', code);
  if (error) backendUrl.searchParams.set('error', error);
  if (errorDescription) backendUrl.searchParams.set('error_description', errorDescription);
  if (state) backendUrl.searchParams.set('state', state);

  try {
    const response = await fetch(backendUrl.toString(), {
      redirect: 'manual', // Don't follow redirects automatically
    });

    // Get the redirect location from the backend
    const location = response.headers.get('location');
    
    if (location) {
      // Parse the location and extract data
      const redirectUrl = new URL(location, request.nextUrl.origin);
      return NextResponse.redirect(redirectUrl);
    }

    // If no redirect, return error
    return NextResponse.redirect(new URL('/v2?error=no_redirect', request.nextUrl.origin));
  } catch (error) {
    console.error('Instagram callback error:', error);
    return NextResponse.redirect(new URL('/v2?error=callback_failed', request.nextUrl.origin));
  }
}

