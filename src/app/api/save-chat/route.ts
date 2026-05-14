import { NextResponse } from 'next/server';
// Import your database instance based on your project structure
import { db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { sessionId, messages } = body;

        if (!sessionId || !messages) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Reference a document in the 'chats' collection using the sessionId
        const chatRef = doc(db, 'chats', sessionId);

        // Write the data to Firestore. 
        // merge: true ensures we don't overwrite other metadata if it exists
        await setDoc(chatRef, {
            sessionId: sessionId,
            messages: messages,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Firebase write error:", error);
        return NextResponse.json({ error: "Failed to save to database" }, { status: 500 });
    }
}