"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp, Paperclip, Globe, Mic, Square, Loader2 } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  isDisabled: boolean;
}

export function ChatInput({ onSend, isLoading, isDisabled }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Voice Recording State ---
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [input]);

  // --- Voice Recording Logic ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await handleTranscription(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("Please allow microphone access to use voice typing.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      // Turn off the red recording light on the browser tab
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleTranscription = async (blob: Blob) => {
    setIsTranscribing(true);
    
    const file = new File([blob], "voice-message.webm", { type: "audio/webm" });
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      
      if (data.text) {
        // Append the transcribed text to whatever is already in the input box
        setInput((prevText) => {
          const newText = prevText + (prevText.trim() ? " " : "") + data.text;
          return newText;
        });
      }
    } catch (error) {
      console.error("Transcription failed:", error);
      alert("Failed to transcribe audio. Please try again.");
    } finally {
      setIsTranscribing(false);
      // Focus the text area so the user can immediately edit or send
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  };

  // --- Submit Logic ---
  const handleSubmit = () => {
    if (!input.trim() || isLoading || isDisabled || isTranscribing) return;
    onSend(input.trim());
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="sticky bottom-0 pb-4 pt-2 bg-background">
      <div className="max-w-3xl mx-auto px-4">
        {/* Main Input Container */}
        <div className="relative rounded-3xl bg-card border border-border shadow-lg transition-all duration-200">
          
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? "Listening..." : isTranscribing ? "Transcribing..." : "Message AI..."}
            disabled={isDisabled || isRecording || isTranscribing}
            rows={1}
            className={`w-full px-4 pt-4 pb-12 bg-transparent text-foreground placeholder:text-muted-foreground resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed text-base rounded-3xl ${
              isRecording ? "text-red-500 animate-pulse" : ""
            }`}
            style={{ maxHeight: "200px" }}
          />

          {/* Bottom Action Bar */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-3">
            
            {/* Left Actions */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Attach file"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Search web"
              >
                <Globe className="w-5 h-5" />
              </button>
              
              {/* Voice Input Button */}
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranscribing || isDisabled}
                className={`p-2 rounded-full transition-colors ${
                  isRecording 
                    ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" 
                    : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                }`}
                aria-label={isRecording ? "Stop recording" : "Start voice typing"}
              >
                {isTranscribing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isRecording ? (
                  <Square className="w-5 h-5 fill-current" />
                ) : (
                  <Mic className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Send Button */}
            <button
              onClick={handleSubmit}
              disabled={isLoading || isDisabled || !input.trim() || isTranscribing}
              className={`flex items-center justify-center w-8 h-8 rounded-full transition-all ${
                input.trim() && !isLoading && !isDisabled && !isTranscribing
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
              aria-label="Send message"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-center text-xs text-muted-foreground mt-3">
          AI can make mistakes. Consider checking important information.
        </p>
      </div>
    </div>
  );
}