import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  Globe,
  Image as ImageIcon,
  MessageCircle,
  MessageSquare,
  Mic,
  MicOff,
  Play,
  Radio,
  RotateCcw,
  Search,
  Send,
  Terminal,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import {
  ChatMessage,
  ImageSearchItem,
  SearchBundle,
  UltronRightPanelMode,
  VideoSearchItem,
} from '../types';

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
  rightPanelMode: UltronRightPanelMode;
  onChangeRightPanelMode: (mode: UltronRightPanelMode) => void;
  searchBundle: SearchBundle | null;
  onSendMessage: (text: string, viaVoice?: boolean) => void;
  onReplayLastSpeech: (text: string) => void;
}

function renderLinkifiedText(text: string): React.ReactNode {
  const normalized = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1: $2');
  const parts = normalized.split(/(https?:\/\/[^\s<>")]+)/g);
  return parts.map((part, idx) => {
    if (/^https?:\/\//i.test(part)) {
      const cleanHref = part.replace(/[.,;!?]+$/, '');
      const trailing = part.slice(cleanHref.length);
      return (
        <React.Fragment key={idx}>
          <a
            href={cleanHref}
            target="_blank"
            rel="noreferrer"
            className="text-amber-300 underline hover:text-white break-all"
          >
            {cleanHref}
          </a>
          {trailing}
        </React.Fragment>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

const QUICK_DIRECTIVES = [
  'Search from Google Iron Man vs Ultron',
  'Bring back the command details',
  'Go to my WhatsApp',
  'Switch to mobile view',
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
  rightPanelMode,
  onChangeRightPanelMode,
  searchBundle,
  onSendMessage,
  onReplayLastSpeech,
}) => {
  const [inputText, setInputText] = useState('');
  const [showRecentLog, setShowRecentLog] = useState(false);

  // Google Search sub-view state inside Right-Side Panel
  const [searchTab, setSearchTab] = useState<'web' | 'images' | 'videos'>('web');
  const [selectedImage, setSelectedImage] = useState<ImageSearchItem | null>(null);
  const [playingVideo, setPlayingVideo] = useState<VideoSearchItem | null>(null);
  const [privacyBlur, setPrivacyBlur] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!searchBundle) return;
    setSelectedImage(null);
    setPlayingVideo(null);
    if (searchBundle.web.length > 0) {
      setSearchTab('web');
    } else if (searchBundle.images.length > 0) {
      setSearchTab('images');
    } else {
      setSearchTab('videos');
    }
  }, [searchBundle]);

  const copyLink = (url: string, key: string) => {
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1800);
  };

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

  const effectiveMode: UltronRightPanelMode =
    rightPanelMode === 'search_details' && searchBundle ? 'search_details' : 'command_details';

  return (
    <aside className="h-full min-h-0 w-full flex flex-col justify-between pointer-events-none gap-1.5 z-20">
      {/* TOP + MIDDLE SECTION OF RIGHT-SIDE PANEL */}
      <div className="w-full flex-1 min-h-0 flex flex-col gap-1.5 pointer-events-auto">
        {/* RIGHT-SIDE PANEL HEADER BANNER: "COMMAND DETAILS" <-> "GOOGLE SEARCH DETAILS" */}
        <div
          id="ultron-right-panel-header"
          className="ultron-glass ultron-corners px-2.5 py-1.5 rounded-sm flex items-center justify-between gap-2 shrink-0"
        >
          {effectiveMode === 'search_details' ? (
            <>
              <div className="min-w-0 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="font-display text-[10.5px] font-bold tracking-[0.14em] text-white truncate">
                  GOOGLE DETAILS
                </span>
              </div>
              <button
                type="button"
                onClick={() => onChangeRightPanelMode('command_details')}
                title="Bring back Command Details to right side"
                className="px-2 py-0.5 border border-amber-400/75 bg-amber-950/50 hover:bg-amber-700/50 font-mono-tech text-[9px] text-amber-200 hover:text-white flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-2.5 h-2.5" />
                COMMAND DETAILS
              </button>
            </>
          ) : (
            <>
              <div className="min-w-0 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span className="font-display text-[10.5px] font-bold tracking-[0.16em] text-white truncate">
                  COMMAND DETAILS
                </span>
              </div>
              {searchBundle && (
                <button
                  type="button"
                  onClick={() => onChangeRightPanelMode('search_details')}
                  title="View Google Search Details on right side"
                  className="px-2 py-0.5 border border-white/35 bg-white/10 hover:bg-white/20 font-mono-tech text-[8.5px] text-amber-200 hover:text-white flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Globe className="w-2.5 h-2.5" />
                  GOOGLE ({searchBundle.web.length + searchBundle.images.length})
                </button>
              )}
            </>
          )}
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

        {/* ===================================================================== */}
        {/* MODE A: GOOGLE SEARCH DETAILS ON THE RIGHT-SIDE PANEL                 */}
        {/* ===================================================================== */}
        {effectiveMode === 'search_details' && searchBundle ? (
          <div
            id="ultron-right-search-details"
            className="ultron-glass ultron-corners w-full flex-1 min-h-0 p-2 rounded-sm flex flex-col gap-1.5 overflow-hidden"
          >
            {/* Query & Privacy Blur Bar */}
            <div className="flex items-center justify-between gap-1.5 border-b border-white/20 pb-1 shrink-0">
              <div className="font-mono-tech text-[9.5px] text-amber-200 truncate">
                GOOGLE: <span className="text-white font-bold">&ldquo;{searchBundle.query}&rdquo;</span>
              </div>
              <button
                type="button"
                onClick={() => setPrivacyBlur((v) => !v)}
                title={privacyBlur ? 'Unblur media previews' : 'Quick-blur media previews'}
                className={`px-1.5 py-0.5 border font-mono-tech text-[8.5px] flex items-center gap-1 shrink-0 cursor-pointer ${
                  privacyBlur
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                    : 'border-white/25 text-red-200 hover:text-white'
                }`}
              >
                {privacyBlur ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                {privacyBlur ? 'UNBLUR' : 'BLUR'}
              </button>
            </div>

            {/* Search Sub-Tabs: DETAILS (WEB) | IMGS | VIDS */}
            <div className="grid grid-cols-3 gap-1 font-mono-tech text-[9px] shrink-0">
              <button
                type="button"
                onClick={() => setSearchTab('web')}
                className={`py-1 px-1.5 border flex items-center justify-center gap-1 cursor-pointer ${
                  searchTab === 'web'
                    ? 'border-white/80 bg-white/20 text-white font-bold'
                    : 'border-white/20 text-red-200/80 hover:text-white'
                }`}
              >
                <Globe className="w-2.5 h-2.5 shrink-0" />
                DETAILS ({searchBundle.web.length})
              </button>
              <button
                type="button"
                onClick={() => setSearchTab('images')}
                className={`py-1 px-1.5 border flex items-center justify-center gap-1 cursor-pointer ${
                  searchTab === 'images'
                    ? 'border-white/80 bg-white/20 text-white font-bold'
                    : 'border-white/20 text-red-200/80 hover:text-white'
                }`}
              >
                <ImageIcon className="w-2.5 h-2.5 shrink-0" />
                IMGS ({searchBundle.images.length})
              </button>
              <button
                type="button"
                onClick={() => setSearchTab('videos')}
                className={`py-1 px-1.5 border flex items-center justify-center gap-1 cursor-pointer ${
                  searchTab === 'videos'
                    ? 'border-white/80 bg-white/20 text-white font-bold'
                    : 'border-white/20 text-red-200/80 hover:text-white'
                }`}
              >
                <Film className="w-2.5 h-2.5 shrink-0" />
                VIDS ({searchBundle.videos.length})
              </button>
            </div>

            {/* Selected Image Zoom Preview */}
            {selectedImage && searchTab === 'images' && (
              <div className="relative bg-black/85 border border-white/35 p-1.5 flex flex-col items-center gap-1 shrink-0">
                <img
                  src={selectedImage.imageUrl || selectedImage.thumbnailUrl}
                  alt={selectedImage.title}
                  referrerPolicy="no-referrer"
                  className="max-h-36 object-contain"
                />
                <div className="w-full flex items-center justify-between gap-1 font-mono-tech text-[8.5px] border-t border-white/15 pt-1">
                  <span className="text-white/90 truncate">{selectedImage.title}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => copyLink(selectedImage.imageUrl, 'r_lightbox')}
                      className="text-emerald-300 hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <Copy className="w-2.5 h-2.5" />
                      {copiedKey === 'r_lightbox' ? 'COPIED' : 'COPY'}
                    </button>
                    <a
                      href={selectedImage.imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-300 hover:underline flex items-center gap-0.5"
                    >
                      FULL <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="absolute top-1 right-1 p-0.5 bg-black/85 border border-white/40 text-white cursor-pointer"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )}

            {/* Inline Playable Video Preview */}
            {playingVideo && searchTab === 'videos' && (
              <div className="relative aspect-video w-full bg-black border border-white/35 shrink-0">
                {playingVideo.directFileUrl ? (
                  <video
                    src={playingVideo.directFileUrl}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain bg-black"
                  />
                ) : playingVideo.embedUrl ? (
                  <iframe
                    src={`${playingVideo.embedUrl}${
                      playingVideo.embedUrl.includes('?') ? '&' : '?'
                    }autoplay=1`}
                    title={playingVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full border-0"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => setPlayingVideo(null)}
                  className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/85 border border-white/50 font-mono-tech text-[8.5px] text-white cursor-pointer"
                >
                  CLOSE
                </button>
              </div>
            )}

            {/* Scrollable Search Results Content */}
            <div className="flex-1 min-h-0 overflow-y-auto ultron-scroll space-y-1.5 pr-0.5">
              {searchTab === 'web' && (
                <>
                  {/* Ultron's Synthesized Search Answer right at top of Right Panel */}
                  {(isProcessing || latestAssistant) && (
                    <div className="p-2 border border-amber-400/45 bg-black/60">
                      <div className="flex items-center justify-between font-mono-tech text-[8.5px] text-amber-300 mb-0.5">
                        <span>{isProcessing ? 'ULTRON SEARCHING GOOGLE...' : 'ULTRON SUMMARY:'}</span>
                        {!isProcessing && latestAssistant && (
                          <button
                            type="button"
                            onClick={() => onReplayLastSpeech(latestAssistant.content)}
                            className="text-red-300 hover:text-white flex items-center gap-0.5 cursor-pointer"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            SPEAK
                          </button>
                        )}
                      </div>
                      {isProcessing ? (
                        <div className="font-mono-tech text-[10px] text-red-200 animate-pulse">
                          Fetching live Google results...
                        </div>
                      ) : latestAssistant ? (
                        <p className="text-[10.5px] text-red-50 whitespace-pre-wrap leading-snug break-words max-h-28 overflow-y-auto ultron-scroll">
                          {renderLinkifiedText(latestAssistant.content)}
                        </p>
                      ) : null}
                    </div>
                  )}

                  {searchBundle.web.length === 0 ? (
                    <div className="text-center py-4 font-mono-tech text-[10px] text-red-200/75">
                      No web snippets returned — check IMGS or VIDS tabs above.
                    </div>
                  ) : (
                    searchBundle.web.map((w, idx) => (
                      <div
                        key={idx}
                        className="p-2 border border-white/20 bg-black/50 hover:border-white/60 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <a
                            href={w.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-bold text-amber-200 hover:underline leading-tight flex items-center gap-1"
                          >
                            <span className="line-clamp-2">{w.title}</span>
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          </a>
                          <span className="font-mono-tech text-[8px] px-1 border border-white/25 text-red-200 shrink-0">
                            {w.source}
                          </span>
                        </div>
                        {w.snippet && (
                          <p className="text-[10.5px] text-white/90 leading-snug mt-1">
                            {w.snippet}
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-1 mt-1 font-mono-tech text-[8.5px]">
                          <span className="text-emerald-300/85 truncate">{w.url}</span>
                          <button
                            type="button"
                            onClick={() => copyLink(w.url, `web_${idx}`)}
                            className="text-amber-300 hover:underline shrink-0 cursor-pointer"
                          >
                            {copiedKey === `web_${idx}` ? 'COPIED' : 'COPY'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}

              {searchTab === 'images' && (
                <div className="grid grid-cols-2 gap-1.5">
                  {searchBundle.images.map((img, i) => (
                    <div
                      key={i}
                      className="group relative aspect-video bg-black/60 border border-white/20 hover:border-white overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedImage(img)}
                        className="w-full h-full cursor-pointer block"
                      >
                        <img
                          src={img.thumbnailUrl || img.imageUrl}
                          alt={img.title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className={`w-full h-full object-cover group-hover:scale-105 transition-all ${
                            privacyBlur ? 'blur-lg' : ''
                          }`}
                        />
                      </button>
                      <div className="absolute inset-x-0 bottom-0 bg-black/80 px-1 py-0.5 flex items-center justify-between gap-1 text-[8px] font-mono-tech text-white">
                        <span className="truncate">{img.title}</span>
                        <a
                          href={img.imageUrl || img.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open direct image link"
                          className="text-amber-300 hover:text-white shrink-0"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchTab === 'videos' && (
                <div className="space-y-1.5">
                  {searchBundle.videos.map((vid) => {
                    const canInlinePlay = Boolean(vid.directFileUrl || vid.embedUrl);
                    const onActivateVideo = () => {
                      if (canInlinePlay) {
                        setPlayingVideo(vid);
                      } else {
                        window.open(vid.watchUrl, '_blank', 'noopener,noreferrer');
                      }
                    };
                    return (
                      <div
                        key={vid.videoId}
                        className="border border-white/20 bg-black/55 p-1.5 flex gap-2 items-center"
                      >
                        <button
                          type="button"
                          onClick={onActivateVideo}
                          className="relative w-20 aspect-video shrink-0 bg-black overflow-hidden border border-white/25 cursor-pointer group"
                        >
                          {vid.thumbnailUrl ? (
                            <img
                              src={vid.thumbnailUrl}
                              alt={vid.title}
                              referrerPolicy="no-referrer"
                              className={`w-full h-full object-cover ${
                                privacyBlur ? 'blur-md' : ''
                              }`}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-mono-tech text-[8px] text-red-300">
                              VIDEO
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-red-600/45">
                            {canInlinePlay ? (
                              <Play className="w-4 h-4 text-white fill-white" />
                            ) : (
                              <ExternalLink className="w-3.5 h-3.5 text-amber-300" />
                            )}
                          </div>
                          {vid.duration && (
                            <span className="absolute bottom-0.5 right-0.5 bg-black/85 px-1 text-[8px] font-mono-tech text-white">
                              {vid.duration}
                            </span>
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={onActivateVideo}
                            className="text-left text-[10.5px] font-semibold text-white hover:underline line-clamp-2 cursor-pointer"
                          >
                            {vid.title}
                          </button>
                          <div className="flex items-center justify-between gap-1 mt-0.5 font-mono-tech text-[8px] text-red-200/80">
                            <span className="truncate">{vid.channel}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => copyLink(vid.watchUrl, vid.videoId)}
                                className="text-emerald-300 hover:underline cursor-pointer"
                              >
                                {copiedKey === vid.videoId ? 'COPIED' : 'COPY'}
                              </button>
                              <a
                                href={vid.watchUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-amber-300 hover:underline flex items-center gap-0.5"
                              >
                                OPEN <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ===================================================================== */
          /* MODE B (DEFAULT): COMMAND DETAILS ON THE RIGHT-SIDE PANEL             */
          /* ===================================================================== */
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
                {isListening ? 'MIC LISTENING...' : 'COMMAND DETAILS // FEED'}
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
                    {renderLinkifiedText(latestAssistant.content)}
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
                      {renderLinkifiedText(m.content)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM-RIGHT: TOGGLEABLE TEXT COMMAND BOX */}
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
              placeholder={
                effectiveMode === 'search_details'
                  ? 'Ask another search or say "bring back the command details"...'
                  : 'Tell Ultron what to search, remember, or do...'
              }
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
