import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  MessageCircle,
  MessageSquare,
  Mic,
  MicOff,
  Radio,
  RotateCcw,
  Send,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { ChatMessage } from '../types';

interface RightControlHudProps {
  muted: boolean;
  onToggleMute: () => void;
  isListening: boolean;
  speechSupported: boolean;
  onToggleMic: () => void;
  isTextBoxOpen: boolean;
  onToggleTextBox: () => void;
  onOpenVoiceBrainSetup: () => void;
  onOpenCommsHub: () => void;
  commsLinkedCount: number;
  interimTranscript: string;
  lastUserSpokenOrTyped: string;
  messages: ChatMessage[];
  isProcessing: boolean;
  isSpeaking: boolean;
  toastNotice: string | null;
  onSendMessage: (text: string, viaVoice?: boolean) => void;
  onReplayLastSpeech: (text: string) => void;
  onOpenInAppTab?: (item: { url: string; title?: string }) => void;
}

function renderLinkifiedText(
  text: string,
  onOpenInAppTab?: (item: { url: string; title?: string }) => void
): React.ReactNode {
  const normalized = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1: $2');
  const parts = normalized.split(/(https?:\/\/[^\s<>")]+)/g);
  return parts.map((part, idx) => {
    if (/^https?:\/\//i.test(part)) {
      const cleanHref = part.replace(/[.,;!?]+$/, '');
      const trailing = part.slice(cleanHref.length);
      return (
        <React.Fragment key={idx}>
          <button
            type="button"
            onClick={() =>
              onOpenInAppTab
                ? onOpenInAppTab({ url: cleanHref })
                : window.open(cleanHref, '_blank', 'noopener,noreferrer')
            }
            className="text-amber-300 underline hover:text-white break-all text-left cursor-pointer"
          >
            {cleanHref}
          </button>
          {trailing}
        </React.Fragment>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

const QUICK_DIRECTIVES = [
  'Open wikipedia.org in a tab',
  'Open Google and give me details on Iron Man vs Ultron',
  'Bring back the command details',
  'Go to my WhatsApp',
];

export const RightControlHud: React.FC<RightControlHudProps> = ({
  muted,
  onToggleMute,
  isListening,
  speechSupported,
  onToggleMic,
  isTextBoxOpen,
  onToggleTextBox,
  onOpenVoiceBrainSetup,
  onOpenCommsHub,
  commsLinkedCount,
  interimTranscript,
  lastUserSpokenOrTyped,
  messages,
  isProcessing,
  isSpeaking,
  toastNotice,
  onSendMessage,
  onReplayLastSpeech,
  onOpenInAppTab,
}) => {
  const [inputText, setInputText] = useState('');
  const [showRecentLog, setShowRecentLog] = useState(false);

  const latestAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const latestUser = [...messages].reverse().find((m) => m.role === 'user');
  const recent10 = messages.slice(-10);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isProcessing) return;
    onSendMessage(inputText.trim(), false);
    setInputText('');
  };

  const displayedUserWords =
    interimTranscript || lastUserSpokenOrTyped || latestUser?.content || '';

  return (
    <aside className="h-full min-h-0 w-full flex flex-col items-end justify-between pointer-events-none gap-1.5 z-20">
      {/* TOP-RIGHT: COMMAND PANEL HEADER + ICON DOCK + LIVE TRANSCRIPT */}
      <div className="w-full flex-1 min-h-0 flex flex-col items-end gap-1.5 pointer-events-auto">
        {/* RIGHT-SIDE PANEL HEADER BANNER: "COMMAND PANEL" */}
        <div
          id="ultron-right-panel-header"
          className="ultron-glass ultron-corners w-full px-2.5 py-1.5 rounded-sm flex items-center justify-between gap-2 shrink-0"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Zap className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--ultron-bright)' }} />
            <span className="font-display text-[10.5px] font-bold tracking-[0.16em] text-white truncate">
              COMMAND PANEL
            </span>
          </div>
          <span className="font-mono-tech text-[8.5px] text-red-200/80 shrink-0">
            {isListening ? 'MIC LIVE' : 'VOICE & TEXT'}
          </span>
        </div>

        {/* Right-Side Action Icons: Mute, Mic, Open Text Box, Comms, Setup */}
        <div id="ultron-top-dock" className="w-full grid grid-cols-5 gap-1 shrink-0">
          {/* 1. MUTE / UNMUTE */}
          <button
            type="button"
            onClick={onToggleMute}
            title={muted ? 'Unmute Ultron Voice' : 'Mute Ultron Voice'}
            className={`ultron-icon-btn h-10 flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
              muted ? 'opacity-80 border-red-500/40' : 'active'
            }`}
          >
            {muted ? (
              <VolumeX className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-red-100" />
            )}
            <span className="font-mono-tech text-[7.5px] tracking-wider text-red-200">
              {muted ? 'MUTED' : 'MUTE'}
            </span>
          </button>

          {/* 2. MIC */}
          <div className="relative">
            {isListening && (
              <span className="absolute inset-0 rounded-sm border-2 border-red-500 animate-sonic-ring pointer-events-none" />
            )}
            <button
              type="button"
              onClick={onToggleMic}
              title={isListening ? 'Stop Listening' : 'Speak to Ultron'}
              className={`ultron-icon-btn w-full h-10 flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                isListening ? 'active !bg-red-600/45' : !speechSupported ? 'opacity-80' : ''
              }`}
            >
              {isListening ? (
                <Mic className="w-3.5 h-3.5 text-white animate-pulse" />
              ) : (
                <MicOff className="w-3.5 h-3.5 text-red-200" />
              )}
              <span className="font-mono-tech text-[7.5px] tracking-wider text-red-200">
                {isListening ? 'LIVE' : 'MIC'}
              </span>
            </button>
          </div>

          {/* 3. OPEN TEXT BOX */}
          <button
            type="button"
            onClick={onToggleTextBox}
            title="Open / Close Text Box"
            className={`ultron-icon-btn h-10 flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
              isTextBoxOpen ? 'active' : ''
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-red-100" />
            <span className="font-mono-tech text-[7.5px] tracking-wider text-red-200">
              TEXT
            </span>
          </button>

          {/* 4. WHATSAPP / TELEGRAM COMMS BRIDGE */}
          <button
            type="button"
            onClick={onOpenCommsHub}
            title="WhatsApp, Telegram & GitHub Access Bridge"
            className={`ultron-icon-btn h-10 flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
              commsLinkedCount > 0 ? 'active' : ''
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-300" />
            <span className="font-mono-tech text-[7.5px] tracking-wider text-emerald-200">
              {commsLinkedCount > 0 ? `LINK(${commsLinkedCount})` : 'COMMS'}
            </span>
          </button>

          {/* 5. VOICE & BRAIN SETUP */}
          <button
            type="button"
            onClick={onOpenVoiceBrainSetup}
            title="Voice & AI Brain Setup"
            className="ultron-icon-btn h-10 flex flex-col items-center justify-center gap-0.5 cursor-pointer border-red-400/75"
          >
            <Radio className="w-3.5 h-3.5 text-amber-300" />
            <span className="font-mono-tech text-[7.5px] tracking-wider text-amber-200">
              VOICE+
            </span>
          </button>
        </div>

        {toastNotice && (
          <div className="w-full ultron-glass px-2.5 py-1 font-mono-tech text-[9.5px] text-amber-200 border-amber-500/60 shrink-0">
            {toastNotice}
          </div>
        )}

        {/* RIGHT-SIDE LIVE VOICE & REPLY MONITOR */}
        <div
          id="ultron-chat-feed"
          className="ultron-glass ultron-corners w-full flex-1 min-h-0 p-2.5 rounded-sm flex flex-col gap-2 overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-red-500/30 pb-1 shrink-0">
            <span className="font-mono-tech text-[9.5px] tracking-[0.14em] text-red-300 flex items-center gap-1.5 truncate">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isListening
                    ? 'bg-red-400 animate-ping'
                    : isSpeaking
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-red-500'
                }`}
              />
              {isListening ? 'MIC LISTENING...' : 'VOICE // CHAT FEED'}
            </span>
            <button
              type="button"
              onClick={() => setShowRecentLog((v) => !v)}
              className="font-mono-tech text-[9px] text-red-300/80 hover:text-white flex items-center gap-0.5 cursor-pointer shrink-0"
            >
              LOG({recent10.length})
              {showRecentLog ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>

          {/* What Rukshan Said */}
          <div className="p-2 border border-red-500/35 bg-black/35 shrink-0">
            <div className="font-mono-tech text-[9px] text-red-400 mb-0.5 flex items-center justify-between">
              <span>YOU SAID:</span>
              {latestUser?.viaVoice && (
                <span className="text-[8px] px-1 border border-red-500/40 text-red-300">
                  VOICE
                </span>
              )}
            </div>
            <p className="text-[11px] text-white/95 leading-snug break-words min-h-[16px] max-h-16 overflow-y-auto ultron-scroll">
              {displayedUserWords ? (
                <>
                  &ldquo;{displayedUserWords}&rdquo;
                  {interimTranscript && (
                    <span className="inline-block w-1.5 h-3 bg-red-500 ml-1 animate-pulse" />
                  )}
                </>
              ) : (
                <span className="text-red-300/50 italic">
                  Speak on MIC or type below...
                </span>
              )}
            </p>
          </div>

          {/* Ultron Reply */}
          <div className="p-2 border border-white/25 bg-black/40 flex-1 min-h-0 overflow-y-auto ultron-scroll">
            <div className="flex items-center justify-between font-mono-tech text-[9px] text-amber-300/90 mb-1">
              <span className="flex items-center gap-1">
                {isProcessing ? 'EXECUTING...' : 'ULTRON:'}
                {latestAssistant?.autonomous && (
                  <span className="px-1 py-0.2 border border-amber-400/60 bg-amber-950/60 text-amber-200 text-[8px]">
                    UNPROMPTED
                  </span>
                )}
              </span>
              {latestAssistant && (
                <button
                  type="button"
                  onClick={() => onReplayLastSpeech(latestAssistant.content)}
                  title="Replay voice"
                  className="text-red-300 hover:text-white flex items-center gap-0.5 cursor-pointer"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  SPEAK
                </button>
              )}
            </div>

            {isProcessing ? (
              <div className="font-mono-tech text-[11px] text-red-200 animate-pulse">
                Checking memory &amp; executing...
              </div>
            ) : latestAssistant ? (
              <>
                <p className="text-[11px] text-red-50 whitespace-pre-wrap leading-relaxed break-words">
                  {renderLinkifiedText(latestAssistant.content, onOpenInAppTab)}
                </p>
                {latestAssistant.memoryUpdate &&
                  (latestAssistant.memoryUpdate.save.length > 0 ||
                    latestAssistant.memoryUpdate.delete.length > 0) && (
                    <div className="mt-1.5 pt-1 border-t border-red-500/30 flex flex-wrap gap-1">
                      {latestAssistant.memoryUpdate.save.map((s, idx) => (
                        <span
                          key={idx}
                          className="font-mono-tech text-[8.5px] px-1 py-0.5 bg-red-600/30 border border-red-400/60 text-red-100"
                        >
                          +SAVED [{s.type}]
                        </span>
                      ))}
                      {latestAssistant.memoryUpdate.delete.length > 0 && (
                        <span className="font-mono-tech text-[8.5px] px-1 py-0.5 bg-amber-950/60 border border-amber-500/60 text-amber-200">
                          -{latestAssistant.memoryUpdate.delete.length} FORGOT
                        </span>
                      )}
                    </div>
                  )}
              </>
            ) : null}
          </div>

          {showRecentLog && (
            <div className="border-t border-red-500/30 pt-1.5 max-h-[120px] overflow-y-auto ultron-scroll space-y-1 shrink-0">
              {recent10.map((m) => (
                <div
                  key={m.id}
                  className={`p-1.5 text-[10.5px] border ${
                    m.role === 'user'
                      ? 'border-red-500/25 bg-black/40 text-red-100'
                      : 'border-red-500/40 bg-red-950/25 text-red-50'
                  }`}
                >
                  <span className="font-mono-tech text-[8.5px] text-red-400 mr-1 uppercase">
                    {m.role === 'user' ? 'YOU:' : 'AI:'}
                  </span>
                  <span className="whitespace-pre-wrap break-words">
                    {renderLinkifiedText(m.content, onOpenInAppTab)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM-RIGHT: COMMAND PANEL TEXT BOX */}
      {isTextBoxOpen && (
        <div
          id="ultron-text-dock"
          className="ultron-glass ultron-corners w-full p-2 rounded-sm pointer-events-auto shrink-0"
        >
          <div className="flex items-center justify-between font-mono-tech text-[9.5px] text-red-300 mb-1">
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-red-500" />
              TEXT COMMAND
            </span>
            <button
              type="button"
              onClick={onOpenVoiceBrainSetup}
              className="text-amber-300 hover:underline cursor-pointer"
            >
              + Add Voice
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
            <textarea
              rows={2}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Tell Ultron what to search, remember, or do..."
              className="w-full bg-black/45 border border-red-500/45 p-1.5 text-[11px] text-white placeholder:text-red-300/45 focus:outline-none focus:border-red-400 resize-none ultron-scroll"
            />
            <button
              type="submit"
              disabled={isProcessing || !inputText.trim()}
              className="w-full py-1.5 bg-red-600/35 hover:bg-red-600/60 disabled:opacity-40 border border-red-400 font-mono-tech text-[11px] text-white flex items-center justify-center gap-1.5 tracking-wider cursor-pointer"
            >
              <Send className="w-3 h-3" />
              SEND TO ULTRON
            </button>
          </form>

          <div className="mt-1.5 pt-1 border-t border-red-500/25 flex flex-wrap gap-1">
            {QUICK_DIRECTIVES.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSendMessage(q, false)}
                disabled={isProcessing}
                className="text-left font-mono-tech text-[8.5px] px-1.5 py-0.5 border border-red-500/30 bg-black/35 hover:border-red-400 hover:bg-red-950/40 text-red-200/90 truncate max-w-full cursor-pointer"
              >
                {q.length > 34 ? `${q.slice(0, 34)}...` : q}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
};
