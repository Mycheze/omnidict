import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Get the request body
    const body = await request.json();
    
    // Forward the request to AnkiConnect
    const ankiResponse = await fetch('http://localhost:8765', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!ankiResponse.ok) {
      return NextResponse.json(
        { error: `AnkiConnect request failed: ${ankiResponse.status}` },
        { status: ankiResponse.status }
      );
    }

    const responseData = await ankiResponse.json();
    
    // Return the AnkiConnect response
    return NextResponse.json(responseData);

  } catch (error: unknown) {
    console.error('AnkiConnect proxy error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Handle connection errors
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch')) {
      return NextResponse.json(
        { error: 'Unable to connect to AnkiConnect. Make sure Anki is running and AnkiConnect is installed.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: `Proxy error: ${errorMessage}` },
      { status: 500 }
    );
  }
}