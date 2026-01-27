import { NextRequest, NextResponse } from 'next/server';
import DatabaseManager from '@/lib/database';

export async function POST(req: NextRequest) {
  try {
    const filters = await req.json();
    const db = DatabaseManager.getInstance();
    
    // Default to a page size of 50, same as the main list
    const index = await db.getPaginationIndex(filters, 50);

    return NextResponse.json({
      success: true,
      data: index,
    });
  } catch (error) {
    console.error('Error fetching pagination index:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch pagination index' },
      { status: 500 }
    );
  }
}
