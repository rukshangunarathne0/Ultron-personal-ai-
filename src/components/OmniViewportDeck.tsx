import React, { useEffect, useRef, useState } from 'react';
import {
  Code2,
  ExternalLink,
  Film,
  Globe,
  Image as ImageIcon,
  MessageCircle,
  Minimize2,
  Maximize2,
  Play,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  SearchBundle,
  UltronLiveWidget,
  UnseenCommsMessage,
} from '../types';

interface OmniViewportDeckProps {
  searchBundle: SearchBundle | null;
  onCloseSearch: () => void;
  commsMessages: UnseenCommsMessage[] | null;
  onCloseComms: () => void;
  onSendCommsReply: (platform: 'whatsapp' | 'telegram', to: string, text: string) => Promise<void>;
  liveWidgets: UltronLiveWidget[];
  onRemoveWidget: (id: string) => void;
  codeOutput: string | null;
  onCloseCodeOutput: () => void;
}

const MountedWidgetCard: React.FC<{
  widget: UltronLiveWidget;
  onRemove: () => void;
}> = ({ widget, onRemove }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    root.innerHTML = widget.html;
    if (widget.js && widget.js.trim()) {
      try {
        const fn = new Function('root', widget.js);
        fn(root);
      } catch (err) {
        console.warn('Widget JS error:', err);
      }
    }
    return () => {
      if (root) root.innerHTML = '';
    };
  }, [widget.html, widget.js]);

  return (
    <div className="ultron-glass ultron-corners p-2 rounded-sm pointer-events-auto">
      <div className="flex items-center justify-between border-b border-white/15 pb-1 mb-1.5 font-mono-tech text-[9.5px] text-amber-300">
        <span className="flex items-center gap-1 truncate">
          <Code2 className="w-3 h-3 shrink-0" />
          {widget.title}
        </span>
        <button
          type="button"
          onClick={onRemove}
          title="Remove custom Ultron widget"
          className="text-red-300 hover:text-white cursor-pointer"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <div ref={containerRef} className="text-xs text-white ultron-scroll overflow-auto max-h-40" />
    </div>
  );
};

export const OmniViewportDeck: React.FC<OmniViewportDeckProps> = ({
  searchBundle,
  onCloseSearch,
  commsMessages,
  onCloseComms,
  onSendCommsReply,
  liveWidgets,
  onRemoveWidget,
  codeOutput,
  onCloseCodeOutput,
}) => {
  const [mediaTab, setMediaTab] = useState<'images' | 'videos' | 'web'>('images');
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    if (!searchBundle) return;
    setPlayingVideoId(null);
    setSelectedImage(null);
    if (searchBundle.images.length > 0) setMediaTab('images');
    else if (searchBundle.videos.length > 0) setMediaTab('videos');
    else setMediaTab('web');
  }, [searchBundle]);

  const handleQuickReply = async (msg: UnseenCommsMessage) => {
    if (!replyText.trim() || (msg.platform !== 'whatsapp' && msg.platform !== 'telegram')) return;
    setSendingReply(true);
    try {
      await onSendCommsReply(msg.platform, msg.chatId, replyText.trim());
      setReplyText('');
      setReplyTarget(null);
    } finally {
      setSendingReply(false);
    }
  };

  const hasAnything =
    Boolean(searchBundle) ||
    Boolean(commsMessages) ||
    liveWidgets.length > 0 ||
    Boolean(codeOutput);

  if (!hasAnything) return null;

  return (
    <div
      className={`w-full flex flex-col gap-2 pointer-events-none z-30 ${
        expanded ? 'fixed inset-4 z-50 bg-black/85 backdrop-blur-md p-4 pointer-events-auto overflow-y-auto ultron-scroll' : ''
      }`}
    >
      {/* 1. SELF-CODED LIVE ULTRON HUD WIDGETS */}
      {liveWidgets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pointer-events-auto">
          {liveWidgets.map((w) => (
            <MountedWidgetCard
              key={w.id}
              widget={w}
              onRemove={() => onRemoveWidget(w.id)}
            />
          ))}
        </div>
      )}

      {/* 2. LIVE CODE EXECUTION OUTPUT */}
      {codeOutput && (
        <div className="ultron-glass ultron-corners p-2.5 rounded-sm pointer-events-auto">
          <div className="flex items-center justify-between font-mono-tech text-[10px] text-emerald-300 border-b border-white/15 pb-1 mb-1.5">
            <span className="flex items-center gap-1">
              <Code2 className="w-3.5 h-3.5" />
              ULTRON LIVE CODE RUNTIME OUTPUT
            </span>
            <button
              type="button"
              onClick={onCloseCodeOutput}
              className="text-red-200 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <pre className="font-mono-tech text-[10.5px] text-white bg-black/60 p-2 max-h-36 overflow-auto ultron-scroll whitespace-pre-wrap">
            {codeOutput}
          </pre>
        </div>
      )}

      {/* 3. UNSEEN WHATSAPP / TELEGRAM / GITHUB MESSAGES DECK */}
      {commsMessages && (
        <div className="ultron-glass ultron-corners p-2.5 rounded-sm pointer-events-auto max-h-[42vh] flex flex-col">
          <div className="flex items-center justify-between border-b border-white/20 pb-1.5 mb-2 font-mono-tech text-[10px]">
            <span className="flex items-center gap-1.5 text-emerald-300 font-bold">
              <MessageCircle className="w-3.5 h-3.5" />
              LIVE UNSEEN MESSAGES ({commsMessages.length})
            </span>
            <button
              type="button"
              onClick={onCloseComms}
              className="text-red-200 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-y-auto ultron-scroll space-y-1.5 pr-1">
            {commsMessages.length === 0 ? (
              <div className="text-center py-3 font-mono-tech text-xs text-red-200/80">
                Zero unseen messages right now.
              </div>
            ) : (
              commsMessages.map((m) => (
                <div
                  key={`${m.platform}_${m.id}`}
                  className="p-2 border border-white/20 bg-black/55 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2 font-mono-tech text-[9.5px]">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-1.5 py-0.5 uppercase border ${
                          m.platform === 'whatsapp'
                            ? 'border-emerald-400/70 bg-emerald-950/60 text-emerald-300'
                            : m.platform === 'telegram'
                            ? 'border-sky-400/70 bg-sky-950/60 text-sky-300'
                            : 'border-amber-400/70 bg-amber-950/60 text-amber-200'
                        }`}
                      >
                        {m.platform}
                      </span>
                      <span className="text-white font-bold">{m.sender}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-red-200/70">{m.timestamp.slice(11, 16)}</span>
                      {(m.platform === 'whatsapp' || m.platform === 'telegram') && (
                        <button
                          type="button"
                          onClick={() =>
                            setReplyTarget(replyTarget === m.id ? null : m.id)
                          }
                          className="text-amber-300 hover:underline cursor-pointer"
                        >
                          REPLY
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-white/95 leading-snug">{m.text}</p>

                  {replyTarget === m.id && (
                    <div className="flex gap-1 pt-1">
                      <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={`Reply to ${m.sender}...`}
                        className="flex-1 bg-black/75 border border-white/30 px-2 py-1 text-xs text-white font-mono-tech"
                      />
                      <button
                        type="button"
                        disabled={sendingReply}
                        onClick={() => handleQuickReply(m)}
                        className="px-2.5 py-1 bg-emerald-700/50 hover:bg-emerald-600/70 border border-emerald-400 text-[10px] font-mono-tech text-white flex items-center gap-1 cursor-pointer"
                      >
                        <Send className="w-3 h-3" />
                        SEND
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 4. GOOGLE / WEB SEARCH + IMAGES + PLAYABLE YOUTUBE VIDEOS DECK */}
      {searchBundle && (
        <div
          className={`ultron-glass ultron-corners p-2.5 rounded-sm pointer-events-auto flex flex-col ${
            expanded ? 'flex-1' : 'max-h-[44vh]'
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/20 pb-1.5 mb-2">
            <div className="flex items-center gap-1.5 font-mono-tech text-[10px]">
              <button
                type="button"
                onClick={() => setMediaTab('images')}
                className={`px-2 py-0.5 border flex items-center gap-1 cursor-pointer ${
                  mediaTab === 'images'
                    ? 'border-white/80 bg-white/20 text-white font-bold'
                    : 'border-white/20 text-red-200/80'
                }`}
              >
                <ImageIcon className="w-3 h-3" />
                IMGS ({searchBundle.images.length})
              </button>
              <button
                type="button"
                onClick={() => setMediaTab('videos')}
                className={`px-2 py-0.5 border flex items-center gap-1 cursor-pointer ${
                  mediaTab === 'videos'
                    ? 'border-white/80 bg-white/20 text-white font-bold'
                    : 'border-white/20 text-red-200/80'
                }`}
              >
                <Film className="w-3 h-3" />
                VIDS ({searchBundle.videos.length})
              </button>
              <button
                type="button"
                onClick={() => setMediaTab('web')}
                className={`px-2 py-0.5 border flex items-center gap-1 cursor-pointer ${
                  mediaTab === 'web'
                    ? 'border-white/80 bg-white/20 text-white font-bold'
                    : 'border-white/20 text-red-200/80'
                }`}
              >
                <Globe className="w-3 h-3" />
                WEB ({searchBundle.web.length})
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                title={expanded ? 'Restore compact view' : 'Expand full screen'}
                className="p-1 border border-white/25 text-red-200 hover:text-white cursor-pointer"
              >
                {expanded ? (
                  <Minimize2 className="w-3 h-3" />
                ) : (
                  <Maximize2 className="w-3 h-3" />
                )}
              </button>
              <button
                type="button"
                onClick={onCloseSearch}
                className="p-1 border border-white/25 text-red-200 hover:text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Lightbox Image Preview */}
          {selectedImage && mediaTab === 'images' && (
            <div className="mb-2 relative bg-black/80 border border-white/30 p-1.5 flex items-center justify-center">
              <img
                src={selectedImage}
                alt="Selected result"
                className="max-h-52 object-contain"
              />
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="absolute top-1.5 right-1.5 p-1 bg-black/80 border border-white/40 text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Inline Playable YouTube Embed */}
          {playingVideoId && mediaTab === 'videos' && (
            <div className="mb-2 relative aspect-video w-full max-h-56 bg-black border border-white/35">
              <iframe
                src={`https://www.youtube.com/embed/${playingVideoId}?autoplay=1`}
                title="Ultron Video Feed"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
              <button
                type="button"
                onClick={() => setPlayingVideoId(null)}
                className="absolute top-1.5 right-1.5 px-2 py-0.5 bg-black/85 border border-white/50 font-mono-tech text-[10px] text-white cursor-pointer"
              >
                CLOSE PLAYER
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto ultron-scroll pr-1">
            {mediaTab === 'images' && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {searchBundle.images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedImage(img.imageUrl || img.thumbnailUrl)}
                    className="group relative aspect-video bg-black/60 border border-white/20 hover:border-white overflow-hidden cursor-pointer"
                  >
                    <img
                      src={img.thumbnailUrl || img.imageUrl}
                      alt={img.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/75 px-1 py-0.5 text-[9px] font-mono-tech text-white truncate">
                      {img.title}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {mediaTab === 'videos' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {searchBundle.videos.map((vid) => (
                  <div
                    key={vid.videoId}
                    className="border border-white/20 bg-black/55 p-1.5 flex gap-2 items-center"
                  >
                    <button
                      type="button"
                      onClick={() => setPlayingVideoId(vid.videoId)}
                      className="relative w-24 aspect-video shrink-0 bg-black overflow-hidden border border-white/25 cursor-pointer group"
                    >
                      <img
                        src={vid.thumbnailUrl}
                        alt={vid.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-red-600/45">
                        <Play className="w-5 h-5 text-white fill-white" />
                      </div>
                      {vid.duration && (
                        <span className="absolute bottom-0.5 right-0.5 bg-black/85 px-1 text-[8.5px] font-mono-tech text-white">
                          {vid.duration}
                        </span>
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setPlayingVideoId(vid.videoId)}
                        className="text-left text-[11px] font-semibold text-white hover:underline line-clamp-2 cursor-pointer"
                      >
                        {vid.title}
                      </button>
                      <div className="flex items-center justify-between mt-0.5 font-mono-tech text-[9px] text-red-200/75">
                        <span className="truncate">{vid.channel}</span>
                        <a
                          href={vid.watchUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-300 hover:underline flex items-center gap-0.5 shrink-0"
                        >
                          YT <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {mediaTab === 'web' && (
              <div className="space-y-1.5">
                {searchBundle.web.map((w, idx) => (
                  <a
                    key={idx}
                    href={w.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block p-2 border border-white/20 bg-black/50 hover:border-white/60 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-amber-200 truncate">
                        {w.title}
                      </span>
                      <span className="font-mono-tech text-[8.5px] px-1 border border-white/25 text-red-200 shrink-0">
                        {w.source}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/90 leading-snug mt-0.5 line-clamp-2">
                      {w.snippet}
                    </p>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
