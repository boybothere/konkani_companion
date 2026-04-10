import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, setDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";

// Save a message AND update the session preview
export const saveMessage = async (sessionId: string, role: string, content: string) => {
try {
    // 1. Save the actual message
    const messagesRef = collection(db, "sessions", sessionId, "messages");
    await addDoc(messagesRef, {
    role,
    content,
    timestamp: serverTimestamp(),
    });

    // 2. Update the parent session document so it shows up in our sidebar list
    const sessionRef = doc(db, "sessions", sessionId);
    await setDoc(sessionRef, {
    updatedAt: serverTimestamp(),
      // If the user is typing, save the first 30 characters as the chat "title"
    ...(role === "user" && { preview: content.substring(0, 30) + "..." })
    }, { merge: true });

} catch (error) {
    console.error("Error saving message:", error);
}
};

// Fetch the history for ONE specific chat
export const getChatHistory = async (sessionId: string) => {
try {
    const messagesRef = collection(db, "sessions", sessionId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => ({
    role: doc.data().role as "user" | "assistant" | "system",
    content: doc.data().content
    }));
} catch (error) {
    console.error("Error fetching history:", error);
    return [];
}
};

// NEW: Fetch ALL chat sessions for the sidebar
export const getAllSessions = async () => {
try {
    const sessionsRef = collection(db, "sessions");
    // Sort so the newest chats are at the top
    const q = query(sessionsRef, orderBy("updatedAt", "desc"));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => ({
    id: doc.id,
    preview: doc.data().preview || "Empty Chat",
    }));
} catch (error) {
    console.error("Error fetching sessions:", error);
    return [];
}
};
// NEW: Delete a session document
export const deleteSession = async (sessionId: string) => {
try {
    const sessionRef = doc(db, "sessions", sessionId);
    await deleteDoc(sessionRef);
} catch (error) {
    console.error("Error deleting session:", error);
}
};