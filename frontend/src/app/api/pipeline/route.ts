/**
 * Pipeline API Route - Proxy to backend
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.POSTTY_API_BASE_URL || 'http://localhost:8080';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Log what we're sending
    console.log('[Pipeline API] Request:', {
      hasProductImage: !!body.productImageBase64,
      textPrompt: body.textPrompt,
      style: body.style,
      useCase: body.useCase,
      textContent: body.textContent,
    });

    const response = await fetch(`${BACKEND_URL}/pipeline/json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    console.log('[Pipeline API] Response:', {
      success: data.success,
      error: data.error,
      hasFinalImage: !!data.finalImage,
    });

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Pipeline proxy error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to connect to backend' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/pipeline/status`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Pipeline status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to connect to backend' },
      { status: 500 }
    );
  }
}

