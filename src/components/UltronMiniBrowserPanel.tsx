import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  Film,
  Globe,
  GripHorizontal,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  UltronBrowserTab,
  UltronBrowserTabKind,
  UltronBrowserViewMode,
} from '../types';
import {
  buildProxiedWebUrl,
  extractVideoEmbedInfo,
} from '../lib/browserEngine';

interface UltronMiniBrowserPanelProps {
  tabs: UltronBrowserTab[];
  activeTabId: string | null;
  isMinimized: boolean;
  isMobileLayout: boolean;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCloseAllTabs: () => void;
  onToggleMinimize: () => void;
  onOpenNewTab: (inputUrl: string, kind?: UltronBrowserTabKind, title?: string) => void;
  onNavigateActiveTab: (nextUrl: string, nextTitle?: string) => void;
  onBackActiveTab: () => void;
  onChangeTabViewMode: (tabId: string, mode: UltronBrowserViewMode) => void;
  onUpdateTabMeta: (tabId: string, meta: { title?: string; url?: string }) => void;
}

type PanelSizeMode = 'compact' | 'wide' | 'full';

export const UltronMiniBrowserPanel: React.FC<UltronMiniBrowserPanelProps> = ({
  tabs,
  activeTabId,
  isMinimized,
  isMobileLayout,
  onSelectTab,
  onCloseTab,
  onCloseAllTabs,
  onToggleMinimize,
  onOpenNewTab,
  onNavigateActiveTab,
  onBackActiveTab,
  onChangeTabViewMode,
  onUpdateTabMeta,
}) => {
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0] || null;

  const [sizeMode, setSizeMode] = useState<PanelSizeMode>('compact');
  const [addressInput, setAddressInput] = useState('');
  const [reloadNonce, setReloadNonce] = useState(0);
  const [imgZoom, setImgZoom] = useState(1);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    if (activeTab) {
      setAddressInput(activeTab.url);
      setImgZoom(1);
    }
  }, [activeTab?.id, activeTab?.url]);

  // Listen for link navigation & page title updates from /api/proxy iframe bridge
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || typeof data !== 'object' || !activeTab) return;
      if (data.type === 'ULTRON_TAB_META' && activeTab.kind === 'web') {
        if (typeof data.title === 'string' && data.title.trim()) {
          onUpdateTabMeta(activeTab.id, {
            title: data.title.trim().slice(0, 48),
          });
        }
      } else if (
        data.type === 'ULTRON_TAB_NAVIGATE' &&
        typeof data.url === 'string' &&
        /^https?:\/\//i.test(data.url)
      ) {
        onNavigateActiveTab(data.url);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [activeTab, onNavigateActiveTab, onUpdateTabMeta]);

  if (tabs.length === 0 || !activeTab) return null;

  // Minimized floating tab pill inside Ultron Web
  if (isMinimized) {
    return (
      <div
        id="ultron-mini-browser-pill"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 ultron-modal-glass px-3 py-1.5 rounded-sm border border-amber-400/60 flex items-center gap-2 shadow-[0_0_25px_rgba(255,30,60,0.35)] pointer-events-auto"
      >
        <Globe className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
        <button
          type="button"
          onClick={onToggleMinimize}
          className="font-mono-tech text-[10px] text-white hover:text-amber-200 cursor-pointer flex items-center gap-1.5"
        >
          <span className="font-bold">ULTRON WEB TABS ({tabs.length})</span>
          <span className="text-red-200/80 max-w-[160px] truncate">— {activeTab.title}</span>
        </button>
        <button
          type="button"
          onClick={onToggleMinimize}
          title="Restore Mini Browser Panel"
          className="p-0.5 border border-white/25 hover:bg-white/15 text-white cursor-pointer"
        >
          <Maximize2 className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={onCloseAllTabs}
          title="Close All Tabs"
          className="p-0.5 border border-red-400/40 hover:bg-red-900/50 text-red-200 cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    if (isMobileLayout || sizeMode === 'full') return;
    if ((e.target as HTMLElement).closest('button, input, a')) return;
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      origX: dragOffset.x,
      origY: dragOffset.y,
    };
    const onMove = (me: PointerEvent) => {
      if (!dragStartRef.current) return;
      const dx = me.clientX - dragStartRef.current.pointerX;
      const dy = me.clientY - dragStartRef.current.pointerY;
      setDragOffset({
        x: Math.max(-window.innerWidth * 0.36, Math.min(window.innerWidth * 0.36, dragStartRef.current.origX + dx)),
        y: Math.max(-60, Math.min(window.innerHeight * 0.55, dragStartRef.current.origY + dy)),
      });
    };
    const onUp = () => {
      dragStartRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = addressInput.trim();
    if (!raw) return;
    if (
      /^https?:\/\//i.test(raw) ||
      /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(raw)
    ) {
      const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      onNavigateActiveTab(normalized);
    } else {
      // Treat plain words in address bar as embedded Google search inside the tab!
      const searchUrl = `https://www.google.com/search?igu=1&q=${encodeURIComponent(raw)}`;
      onNavigateActiveTab(searchUrl, `Search: ${raw}`);
    }
  };

  const sizeClasses = isMobileLayout
    ? 'fixed left-2 right-2 top-14 h-[62vh] z-30'
    : sizeMode === 'full'
    ? 'fixed inset-5 z-30'
    : sizeMode === 'wide'
    ? 'fixed top-14 left-1/2 w-[min(700px,64vw)] h-[min(490px,68vh)] z-30'
    : 'fixed top-14 left-1/2 w-[min(480px,52vw)] h-[min(360px,54vh)] z-30';

  const transformStyle =
    !isMobileLayout && sizeMode !== 'full'
      ? {
          transform: `translate(calc(-50% + ${dragOffset.x}px), ${dragOffset.y}px)`,
        }
      : undefined;

  const renderTabIcon = (kind: UltronBrowserTabKind) => {
    if (kind === 'video') return <Film className="w-3 h-3 text-rose-300 shrink-0" />;
    if (kind === 'image') return <ImageIcon className="w-3 h-3 text-cyan-300 shrink-0" />;
    return <Globe className="w-3 h-3 text-amber-300 shrink-0" />;
  };

  const videoInfo =
    activeTab.kind === 'video'
      ? extractVideoEmbedInfo(activeTab.embedUrl || activeTab.url)
      : null;

  const effectiveWebSrc =
    activeTab.kind === 'web'
      ? activeTab.viewMode === 'direct'
        ? activeTab.url
        : activeTab.viewMode === 'reader'
        ? buildProxiedWebUrl(activeTab.url, 'reader')
        : buildProxiedWebUrl(activeTab.url, 'embed')
      : '';

  return (
    <section
      id="ultron-mini-browser"
      style={transformStyle}
      className={`${sizeClasses} ultron-modal-glass ultron-corners rounded-sm border border-white/30 flex flex-col overflow-hidden shadow-[0_12px_48px_rgba(0,0,0,0.88),0_0_28px_rgba(255,20,55,0.28)] pointer-events-auto`}
    >
      {/* 1. DRAGGABLE PANEL HEADER + MULTI-TAB STRIP */}
      <div
        onPointerDown={handleHeaderPointerDown}
        className={`bg-black/85 border-b border-white/20 px-2 pt-1.5 pb-1 flex items-center justify-between gap-1.5 select-none ${
          !isMobileLayout && sizeMode !== 'full' ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto ultron-scroll pb-0.5">
          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-950/70 border border-red-400/50 font-display text-[8.5px] tracking-[0.14em] text-amber-200 shrink-0">
            <GripHorizontal className="w-3 h-3 text-red-400" />
            <span>WEB PANEL</span>
          </span>

          {tabs.map((tab) => {
            const isAct = tab.id === activeTab.id;
            return (
              <div
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`group flex items-center gap-1 px-2 py-1 rounded-t-sm border text-[9.5px] font-mono-tech max-w-[155px] shrink-0 cursor-pointer transition-all ${
                  isAct
                    ? 'border-amber-400/80 bg-white/15 text-white font-bold shadow-[0_0_10px_rgba(251,191,36,0.2)]'
                    : 'border-white/15 bg-black/50 text-red-200/75 hover:bg-white/10 hover:text-white'
                }`}
              >
                {renderTabIcon(tab.kind)}
                <span className="truncate">{tab.title}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  title="Close Tab"
                  className="ml-0.5 p-0.5 rounded-xs text-red-300/70 hover:text-white hover:bg-red-500/30 cursor-pointer"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() =>
              onOpenNewTab('https://en.wikipedia.org', 'web', 'New Tab')
            }
            title="Open New Tab Inside Ultron Web"
            className="p-1 border border-white/20 bg-black/50 hover:bg-white/15 text-amber-200 shrink-0 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Window Size & Close Controls */}
        <div className="flex items-center gap-1 shrink-0 font-mono-tech text-[8.5px]">
          {!isMobileLayout && (
            <button
              type="button"
              onClick={() =>
                setSizeMode((cur) =>
                  cur === 'compact' ? 'wide' : cur === 'wide' ? 'full' : 'compact'
                )
              }
              title="Cycle Panel Size (Compact -> Wide -> Full)"
              className="px-1.5 py-0.5 border border-white/25 bg-black/50 hover:bg-white/15 text-cyan-200 cursor-pointer flex items-center gap-0.5"
            >
              {sizeMode === 'full' ? (
                <Minimize2 className="w-2.5 h-2.5" />
              ) : (
                <Maximize2 className="w-2.5 h-2.5" />
              )}
              <span className="uppercase">{sizeMode}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onToggleMinimize}
            title="Minimize to Tab Pill"
            className="p-1 border border-white/20 bg-black/50 hover:bg-white/15 text-white cursor-pointer"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onCloseAllTabs}
            title="Close Mini Browser Panel"
            className="p-1 border border-red-400/50 bg-red-950/60 hover:bg-red-800/70 text-red-100 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 2. MINI ADDRESS BAR & RENDER ENGINE CONTROLS */}
      <div className="bg-black/75 border-b border-white/15 px-2 py-1 flex items-center gap-1 font-mono-tech text-[9px] shrink-0">
        <button
          type="button"
          disabled={activeTab.history.length <= 1}
          onClick={onBackActiveTab}
          title="Back"
          className="p-1 border border-white/20 bg-black/50 hover:bg-white/10 disabled:opacity-35 text-white cursor-pointer"
        >
          <ArrowLeft className="w-3 h-3" />
        </button>

        <button
          type="button"
          onClick={() => setReloadNonce((n) => n + 1)}
          title="Reload Tab"
          className="p-1 border border-white/20 bg-black/50 hover:bg-white/10 text-white cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
        </button>

        <form onSubmit={handleAddressSubmit} className="flex-1 min-w-0 flex items-center">
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Enter URL (e.g. wikipedia.org) or search..."
            className="w-full bg-black/75 border border-white/25 px-2 py-0.5 text-[9.5px] text-amber-100 placeholder:text-red-300/45 focus:outline-none focus:border-amber-400/75"
          />
        </form>

        {/* Render Mode Switcher for Web Tabs */}
        {activeTab.kind === 'web' && (
          <div className="flex items-center border border-white/20 bg-black/60 shrink-0">
            {(
              [
                { id: 'proxy', label: 'PROXY', icon: Shield, tip: 'Server Proxy (bypasses iframe blocks)' },
                { id: 'direct', label: 'DIRECT', icon: Sparkles, tip: 'Direct Browser Iframe' },
                { id: 'reader', label: 'READER', icon: BookOpen, tip: 'Clean Dark Reader Mode' },
              ] as const
            ).map((m) => {
              const Icon = m.icon;
              const active = activeTab.viewMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  title={m.tip}
                  onClick={() => onChangeTabViewMode(activeTab.id, m.id)}
                  className={`px-1.5 py-0.5 text-[8px] flex items-center gap-0.5 cursor-pointer transition-colors ${
                    active
                      ? 'bg-amber-500/30 text-amber-200 font-bold'
                      : 'text-red-200/70 hover:text-white'
                  }`}
                >
                  <Icon className="w-2.5 h-2.5" />
                  <span className="hidden sm:inline">{m.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Zoom Controls for Image Tabs */}
        {activeTab.kind === 'image' && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setImgZoom((z) => Math.max(0.4, Number((z - 0.25).toFixed(2))))}
              className="p-1 border border-white/20 bg-black/50 hover:bg-white/10 text-cyan-200 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setImgZoom(1)}
              className="px-1.5 py-0.5 border border-white/20 bg-black/50 text-[8px] text-white cursor-pointer"
            >
              {Math.round(imgZoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setImgZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
              className="p-1 border border-white/20 bg-black/50 hover:bg-white/10 text-cyan-200 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            {activeTab.sourceUrl && (
              <button
                type="button"
                onClick={() =>
                  onOpenNewTab(activeTab.sourceUrl!, 'web', `Source: ${activeTab.title}`)
                }
                className="px-1.5 py-0.5 border border-amber-400/50 bg-amber-950/40 text-[8px] text-amber-200 cursor-pointer"
                title="Open Source Webpage in New Tab"
              >
                PAGE
              </button>
            )}
          </div>
        )}

        <a
          href={activeTab.url}
          target="_blank"
          rel="noreferrer"
          title="Open in External Browser Tab (optional)"
          className="p-1 border border-white/20 bg-black/50 hover:bg-white/15 text-amber-300 shrink-0"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* 3. TAB VIEWPORT BODY (WEB / IMAGE / VIDEO) */}
      <div className="flex-1 min-h-0 relative bg-[#060103] overflow-hidden">
        {activeTab.kind === 'image' && (
          <div className="w-full h-full overflow-auto ultron-scroll flex items-center justify-center p-3 bg-black/90">
            <img
              key={`${activeTab.url}_${reloadNonce}`}
              src={activeTab.url}
              alt={activeTab.title}
              referrerPolicy="no-referrer"
              style={{
                transform: `scale(${imgZoom})`,
                transformOrigin: 'center center',
              }}
              className="max-w-full max-h-full object-contain transition-transform duration-150 rounded-xs shadow-lg"
            />
          </div>
        )}

        {activeTab.kind === 'video' && (
          <div className="w-full h-full bg-black flex items-center justify-center">
            {videoInfo?.isDirectVideoFile ? (
              <video
                key={`${activeTab.url}_${reloadNonce}`}
                src={videoInfo.embedUrl || activeTab.url}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain bg-black"
              />
            ) : activeTab.embedUrl || videoInfo?.embedUrl ? (
              <iframe
                key={`${activeTab.id}_${reloadNonce}`}
                src={activeTab.embedUrl || videoInfo?.embedUrl}
                title={activeTab.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                className="w-full h-full border-0 bg-black"
              />
            ) : (
              <iframe
                key={`${activeTab.id}_vidproxy_${reloadNonce}`}
                src={buildProxiedWebUrl(activeTab.url, 'embed')}
                title={activeTab.title}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0 bg-black"
              />
            )}
          </div>
        )}

        {activeTab.kind === 'web' && (
          <iframe
            key={`${activeTab.id}_${activeTab.viewMode}_${activeTab.url}_${reloadNonce}`}
            src={effectiveWebSrc}
            title={activeTab.title}
            referrerPolicy="no-referrer"
            allow="autoplay; fullscreen; clipboard-read; clipboard-write; encrypted-media; picture-in-picture"
            className="w-full h-full border-0 bg-white"
          />
        )}
      </div>
    </section>
  );
};
