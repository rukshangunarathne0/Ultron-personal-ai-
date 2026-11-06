import React, { useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Brain,
  CheckCircle2,
  Circle,
  Code2,
  Copy,
  Cpu,
  Database,
  Download,
  Edit3,
  ExternalLink,
  FileCode,
  Globe,
  Lock,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Terminal,
  Trash2,
  Undo2,
  UserCheck,
  X,
  Zap,
} from 'lucide-react';
import {
  AutonomousLogEntry,
  BrainConfig,
  DirectiveTask,
  MemoryCategory,
  MemoryItem,
  SearchBundle,
  ThinkingStepId,
  UltronBrowserTabKind,
  UltronCodePayload,
  UltronEmotion,
  UltronLeftPanelMode,
  UltronUiConfig,
  VoiceConfig,
} from '../types';
import { THINKING_STEPS } from '../lib/rukAiPrompt';
import { getProfileMemories } from '../lib/memorySearch';
import { PersistedCodeState, triggerFileDownload } from '../lib/codeEngine';

interface LeftDetailsHudProps {
  memories: MemoryItem[];
  tasks: DirectiveTask[];
  emotion: UltronEmotion;
  onSelectEmotion: (e: UltronEmotion) => void;
  activeStep: ThinkingStepId;
  lastMatchedMemoryIds: string[];
  lastXmlPayload: string;
  lastRawOutput: string;
  brainConfig: BrainConfig;
  voiceConfig: VoiceConfig;
  uiConfig: UltronUiConfig;
  codeState: PersistedCodeState;
  onExecuteCrudCode: (payload: UltronCodePayload) => Promise<void>;
  autonomousLog: AutonomousLogEntry[];
  leftPanelMode: UltronLeftPanelMode;
  onChangeLeftPanelMode: (mode: UltronLeftPanelMode) => void;
  searchBundle: SearchBundle | null;
  latestAssistantReply?: string;
  isProcessing?: boolean;
  onReplaySpeech?: (text: string) => void;
  onOpenInAppTab?: (item: {
    url: string;
    kind?: UltronBrowserTabKind;
    title?: string;
    embedUrl?: string;
    sourceUrl?: string;
  }) => void;
  openTabsCount?: number;
  onToggleMiniBrowser?: () => void;
  onToggleAdultMode: () => void;
  onToggleMobilePreview: () => void;
  onResetUi: () => void;
  onAddMemoryManual: (type: MemoryCategory, text: string) => void;
  onDeleteMemory: (id: string) => void;
  onAddTask: (title: string) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
}

const EMOTION_OPTIONS: Array<{ id: UltronEmotion; label: string }> = [
  { id: 'sentinel', label: 'IDLE' },
  { id: 'listening', label: 'LISTEN' },
  { id: 'thinking', label: 'THINK' },
  { id: 'speaking', label: 'SPEAK' },
  { id: 'hostile', label: 'SCARY' },
  { id: 'memory_sync', label: 'SYNC' },
  { id: 'loyal', label: 'LOYAL' },
  { id: 'alert', label: 'ALERT' },
];

const TYPE_COLORS: Record<MemoryCategory, string> = [
  ['fact', 'border-red-500/60 text-red-300 bg-red-950/40'],
  ['preference', 'border-amber-500/60 text-amber-300 bg-amber-950/40'],
  ['project', 'border-rose-400/70 text-rose-200 bg-rose-950/50'],
  ['decision', 'border-orange-500/60 text-orange-300 bg-orange-950/40'],
  ['person', 'border-pink-500/60 text-pink-300 bg-pink-950/40'],
].reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {} as Record<MemoryCategory, string>);

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

export const LeftDetailsHud: React.FC<LeftDetailsHudProps> = ({
  memories,
  tasks,
  emotion,
  onSelectEmotion,
  activeStep,
  lastMatchedMemoryIds,
  lastXmlPayload,
  lastRawOutput,
  brainConfig,
  voiceConfig,
  uiConfig,
  codeState,
  onExecuteCrudCode,
  autonomousLog,
  leftPanelMode,
  onChangeLeftPanelMode,
  searchBundle,
  latestAssistantReply,
  isProcessing,
  onReplaySpeech,
  onOpenInAppTab,
  openTabsCount = 0,
  onToggleMiniBrowser,
  onToggleAdultMode,
  onToggleMobilePreview,
  onResetUi,
  onAddMemoryManual,
  onDeleteMemory,
  onAddTask,
  onToggleTask,
  onDeleteTask,
}) => {
  const [activeTab, setActiveTab] = useState<'memories' | 'profile' | 'tasks' | 'auto' | 'xml'>('memories');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMemType, setNewMemType] = useState<MemoryCategory>('fact');
  const [newMemText, setNewMemText] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [editingCrudKey, setEditingCrudKey] = useState<string | null>(null);
  const [editDraftTitle, setEditDraftTitle] = useState('');
  const [editDraftCode, setEditDraftCode] = useState('');
  const [editDraftJs, setEditDraftJs] = useState('');
  const [showNewCssForm, setShowNewCssForm] = useState(false);
  const [newCssId, setNewCssId] = useState('');
  const [newCssBody, setNewCssBody] = useState('');

  const activeCrudCount =
    (codeState.liveCss.trim() ? 1 : 0) +
    codeState.cssPatches.length +
    codeState.widgets.length +
    codeState.domPatches.length +
    codeState.scripts.length +
    (codeState.persistentJs.trim() ? 1 : 0) +
    codeState.files.length;

  const profileMemories = getProfileMemories(memories);
  const filteredMemories = memories.filter((m) =>
    searchQuery.trim()
      ? `${m.type} ${m.text}`.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  const currentStepInfo = THINKING_STEPS.find((s) => s.step === activeStep);

  const handleCreateMem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemText.trim()) return;
    onAddMemoryManual(newMemType, newMemText.trim());
    setNewMemText('');
    setShowAddForm(false);
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    onAddTask(newTaskTitle.trim());
    setNewTaskTitle('');
  };

  const copySiteUrl = (url: string, idx: number) => {
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1800);
  };

  const effectiveLeftMode: UltronLeftPanelMode =
    leftPanelMode === 'google_info' && searchBundle ? 'google_info' : 'command_details';

  return (
    <aside className="h-full min-h-0 w-full flex flex-col gap-1.5 pointer-events-auto z-20">
      {/* LEFT PANEL TOP TITLE BANNER: "COMMAND DETAILS" <-> "GOOGLE // INFO & SITES" */}
      <div
        id="ultron-left-panel-header"
        className="ultron-glass ultron-corners px-2.5 py-1.5 rounded-sm flex items-center justify-between gap-2 shrink-0"
      >
        {effectiveLeftMode === 'google_info' ? (
          <>
            <div className="min-w-0 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span className="font-display text-[10.5px] font-bold tracking-[0.14em] text-white truncate">
                GOOGLE // INFO &amp; SITES
              </span>
            </div>
            <button
              type="button"
              onClick={() => onChangeLeftPanelMode('command_details')}
              title="Bring back Command Details to left side"
              className="px-2 py-0.5 border border-amber-400/75 bg-amber-950/50 hover:bg-amber-700/50 font-mono-tech text-[8.5px] text-amber-200 hover:text-white flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-2.5 h-2.5" />
              COMMAND DETAILS
            </button>
          </>
        ) : (
          <>
            <div className="min-w-0 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--ultron-bright)' }} />
              <span className="font-display text-[10.5px] font-bold tracking-[0.16em] text-white truncate">
                COMMAND DETAILS
              </span>
            </div>
            {searchBundle && (
              <button
                type="button"
                onClick={() => onChangeLeftPanelMode('google_info')}
                title="View Google Info & Sites on left side"
                className="px-2 py-0.5 border border-white/35 bg-white/10 hover:bg-white/20 font-mono-tech text-[8.5px] text-amber-200 hover:text-white flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Globe className="w-2.5 h-2.5" />
                INFO &amp; SITES ({searchBundle.web.length})
              </button>
            )}
          </>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MODE A: GOOGLE INFORMATION & SITES ON THE LEFT-SIDE PANEL             */}
      {/* ===================================================================== */}
      {effectiveLeftMode === 'google_info' && searchBundle ? (
        <div
          id="ultron-left-google-info"
          className="ultron-glass ultron-corners flex-1 min-h-0 p-2.5 rounded-sm flex flex-col gap-2 overflow-hidden"
        >
          {/* Query Title Strip */}
          <div className="flex items-center justify-between gap-2 border-b border-white/20 pb-1.5 shrink-0 font-mono-tech text-[9.5px]">
            <span className="text-amber-200 truncate">
              QUERY: <strong className="text-white">&ldquo;{searchBundle.query}&rdquo;</strong>
            </span>
            <span className="px-1.5 py-0.5 border border-emerald-400/50 bg-emerald-950/40 text-emerald-300 shrink-0">
              {searchBundle.web.length} SITES
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto ultron-scroll space-y-2 pr-0.5">
            {/* 1. ULTRON INFORMATION SUMMARY */}
            <div className="p-2 border border-amber-400/45 bg-black/60">
              <div className="flex items-center justify-between font-mono-tech text-[9px] text-amber-300 mb-1">
                <span>{isProcessing ? 'ANALYZING GOOGLE...' : 'INFORMATION:'}</span>
                {!isProcessing && latestAssistantReply && onReplaySpeech && (
                  <button
                    type="button"
                    onClick={() => onReplaySpeech(latestAssistantReply)}
                    className="text-red-300 hover:text-white flex items-center gap-0.5 cursor-pointer"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    SPEAK
                  </button>
                )}
              </div>
              {isProcessing ? (
                <div className="font-mono-tech text-[10.5px] text-red-200 animate-pulse">
                  Extracting live information &amp; web sites...
                </div>
              ) : latestAssistantReply ? (
                <p className="text-[11px] text-red-50 whitespace-pre-wrap leading-relaxed break-words">
                  {renderLinkifiedText(latestAssistantReply, onOpenInAppTab)}
                </p>
              ) : (
                <p className="text-[10.5px] text-red-200/80">
                  Found {searchBundle.web.length} web sources below (photos &amp; videos are mounted at the top).
                </p>
              )}
            </div>

            {/* 2. WEB SITES & ARTICLES LIST */}
            <div className="font-mono-tech text-[9px] text-red-200/85 tracking-wider pt-0.5">
              WEB SITES &amp; SOURCES ({searchBundle.web.length}):
            </div>

            {searchBundle.web.length === 0 ? (
              <div className="p-3 border border-dashed border-white/20 bg-black/30 text-center font-mono-tech text-[10px] text-red-200/75">
                No text site snippets returned for this query — check Photos &amp; Vids at the top.
              </div>
            ) : (
              searchBundle.web.map((site, idx) => (
                <div
                  key={idx}
                  className="p-2 border border-white/20 bg-black/50 hover:border-amber-400/70 transition-colors space-y-1"
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenInAppTab
                          ? onOpenInAppTab({
                              url: site.url,
                              kind: 'web',
                              title: site.title,
                            })
                          : window.open(site.url, '_blank', 'noopener,noreferrer')
                      }
                      className="text-left text-[11.5px] font-bold text-amber-200 hover:text-white hover:underline leading-tight flex items-center gap-1 cursor-pointer"
                    >
                      <span className="line-clamp-2">{site.title}</span>
                    </button>
                    <span className="font-mono-tech text-[8px] px-1 border border-white/25 text-red-200 shrink-0">
                      {site.source}
                    </span>
                  </div>
                  {site.snippet && (
                    <p className="text-[10.5px] text-white/90 leading-snug">{site.snippet}</p>
                  )}
                  <div className="flex items-center justify-between gap-1.5 font-mono-tech text-[8.5px] pt-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenInAppTab?.({
                          url: site.url,
                          kind: 'web',
                          title: site.title,
                        })
                      }
                      className="px-1.5 py-0.5 border border-amber-400/65 bg-amber-950/45 hover:bg-amber-900/60 text-amber-200 font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Globe className="w-2.5 h-2.5" />
                      <span>OPEN TAB</span>
                    </button>
                    <span className="text-emerald-300/85 truncate flex-1">{site.url}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => copySiteUrl(site.url, idx)}
                        className="text-amber-300 hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        <Copy className="w-2.5 h-2.5" />
                        {copiedIdx === idx ? 'OK' : 'COPY'}
                      </button>
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noreferrer"
                        title="Open in External Browser"
                        className="text-red-200/75 hover:text-white"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* ===================================================================== */
        /* MODE B (DEFAULT): COMMAND DETAILS ON THE LEFT-SIDE PANEL              */
        /* ===================================================================== */
        <>
          {/* 1. RUK-AI // ULTRON SYSTEM & EXPRESSION RIG */}
          <div className="ultron-glass ultron-corners p-2.5 rounded-sm shrink-0">
            <div className="flex items-center justify-between border-b border-white/15 pb-1.5 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ backgroundColor: 'var(--ultron-bright)' }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-2 w-2"
                    style={{ backgroundColor: 'var(--ultron-accent)' }}
                  />
                </span>
                <div className="min-w-0">
                  <h1 className="font-display text-[11px] font-bold tracking-[0.14em] text-white truncate">
                    {uiConfig.hudDesignation || 'RUK-AI // ULTRON'}
                  </h1>
                  <p className="font-mono-tech text-[8.5px] text-red-200/85 tracking-wider truncate">
                    {uiConfig.statusBanner || 'OP: RUKSHAN // COMMAND CORE'}
                  </p>
                </div>
              </div>
              <span className="font-mono-tech text-[8.5px] px-1.5 py-0.5 border border-white/25 bg-black/50 text-white uppercase shrink-0">
                {emotion.replace('_', ' ')}
              </span>
            </div>

            {/* COMMAND-ONLY ROOT ACCESS BAR */}
            <div className="mb-2 p-1.5 border border-white/20 bg-black/45 flex items-center justify-between gap-1 font-mono-tech text-[8.5px]">
              <span
                title="Ultron NEVER mutates UI on his own — he codes & changes UI strictly when you command him"
                className="px-1.5 py-0.5 border border-emerald-400/65 bg-emerald-950/45 text-emerald-200 flex items-center gap-1"
              >
                <Lock className="w-2.5 h-2.5 text-emerald-400" />
                <span>CMD ONLY</span>
              </span>

              <button
                type="button"
                onClick={onToggleAdultMode}
                title="Toggle 18+ Unrestricted Adult Search, Info, Images & Video Links (SafeSearch OFF)"
                className={`px-1.5 py-0.5 border flex items-center gap-0.5 cursor-pointer transition-all ${
                  uiConfig.adultMode
                    ? 'border-pink-400/80 bg-pink-950/50 text-pink-200 font-bold'
                    : 'border-white/20 bg-black/40 text-red-200/75'
                }`}
              >
                <span>{uiConfig.adultMode ? '18+ ON' : 'SAFE'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleMobilePreview}
                title="Toggle Mobile View Layout"
                className={`px-1.5 py-0.5 border flex items-center gap-0.5 cursor-pointer ${
                  uiConfig.mobileViewMode === 'force_mobile'
                    ? 'border-cyan-400/80 bg-cyan-950/50 text-cyan-200 font-bold'
                    : 'border-white/20 bg-black/40 text-red-200/80 hover:bg-white/10'
                }`}
              >
                <span>{uiConfig.mobileViewMode === 'force_mobile' ? 'MOB ON' : 'MOBILE'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleMiniBrowser}
                title="Open or Restore Ultron In-App Web / Media Tab Panel"
                className={`px-1.5 py-0.5 border flex items-center gap-0.5 cursor-pointer ${
                  openTabsCount > 0
                    ? 'border-amber-400/80 bg-amber-950/50 text-amber-200 font-bold'
                    : 'border-white/20 bg-black/40 text-red-200/80 hover:bg-white/10'
                }`}
              >
                <Globe className="w-2.5 h-2.5" />
                <span>{openTabsCount > 0 ? `TABS(${openTabsCount})` : 'WEB'}</span>
              </button>

              <button
                type="button"
                onClick={onResetUi}
                title="Reset UI theme, mobile view & all live code patches"
                className="px-1.5 py-0.5 border border-white/20 bg-black/40 hover:bg-white/10 text-red-200/80 flex items-center gap-0.5 cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>RESET</span>
              </button>
            </div>

            {/* Compact Status Readout */}
            <div className="grid grid-cols-3 gap-1 mb-2 font-mono-tech text-[9px]">
              <div className="border border-white/15 bg-black/30 px-1.5 py-0.5">
                <div className="text-red-300/70">UI THEME</div>
                <div className="text-white truncate uppercase">
                  {uiConfig.theme.split('_')[0]}
                </div>
              </div>
              <div className="border border-white/15 bg-black/30 px-1.5 py-0.5">
                <div className="text-red-300/70">VOICE</div>
                <div className="text-white truncate uppercase">
                  {voiceConfig.muted
                    ? 'MUTED'
                    : voiceConfig.provider === 'mp3_clone'
                    ? 'MP3 FORGE'
                    : voiceConfig.provider === 'groq_orpheus'
                    ? 'ORPHEUS'
                    : voiceConfig.provider === 'browser_ultron'
                    ? `P:${voiceConfig.pitch}`
                    : voiceConfig.provider.replace('_tts', '')}
                </div>
              </div>
              <div className="border border-white/15 bg-black/30 px-1.5 py-0.5">
                <div className="text-red-300/70">BRAIN</div>
                <div className="text-white truncate uppercase">
                  {brainConfig.provider === 'autonomous_local' ? 'LOCAL' : brainConfig.provider}
                </div>
              </div>
            </div>

            {/* Facial Emotion Selector */}
            <div>
              <div className="flex items-center justify-between font-mono-tech text-[9px] text-red-300/85 mb-1">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3" style={{ color: 'var(--ultron-bright)' }} />
                  FACE EMOTIONS
                </span>
                <span className="text-white/65">DROP .MP3 ANYWHERE</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {EMOTION_OPTIONS.map((opt) => {
                  const isSelected = emotion === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onSelectEmotion(opt.id)}
                      className={`font-mono-tech text-[8.5px] py-0.5 px-0.5 border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-white/75 bg-white/15 text-white font-bold'
                          : 'border-white/15 bg-black/25 text-red-200/75 hover:border-white/45 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. 7-STEP THINKING PROTOCOL */}
          <div className="ultron-glass ultron-corners px-2.5 py-1.5 rounded-sm shrink-0">
            <div className="flex items-center justify-between font-mono-tech text-[9px] text-red-200 mb-1">
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3" style={{ color: 'var(--ultron-bright)' }} />
                7-STEP PIPELINE
              </span>
              <span style={{ color: 'var(--ultron-bright)' }}>
                {activeStep > 0 ? `0${activeStep}/07` : 'READY'}
              </span>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {THINKING_STEPS.map((s) => {
                const active = activeStep === s.step;
                const passed = activeStep > s.step;
                return (
                  <div
                    key={s.step}
                    title={`${s.code}: ${s.label}`}
                    style={
                      active
                        ? { backgroundColor: 'var(--ultron-bright)' }
                        : passed
                        ? { backgroundColor: 'var(--ultron-accent)', opacity: 0.75 }
                        : undefined
                    }
                    className={`h-1.5 transition-all duration-200 ${
                      !active && !passed ? 'bg-black/60 border border-white/15' : ''
                    }`}
                  />
                );
              })}
            </div>

            <div className="font-mono-tech text-[9.5px] text-red-100/85 truncate">
              {currentStepInfo
                ? `>> ${currentStepInfo.label}: ${currentStepInfo.detail}`
                : '>> Standing by — awaiting your command...'}
            </div>
          </div>

          {/* 3. NEURAL MEMORY VAULT (<memories>, <profile>, TASKS, AUTO, XML) */}
          <div className="ultron-glass ultron-corners flex-1 min-h-0 flex flex-col rounded-sm overflow-hidden">
            <div className="grid grid-cols-5 border-b border-white/20 font-mono-tech text-[8.5px] shrink-0">
              {[
                { id: 'memories', label: `MEM(${memories.length})`, icon: Database },
                { id: 'profile', label: 'PROF', icon: UserCheck },
                { id: 'tasks', label: `TASK(${tasks.length})`, icon: Activity },
                { id: 'auto', label: `CRUD(${activeCrudCount})`, icon: Zap },
                { id: 'xml', label: 'XML', icon: Code2 },
              ].map((tab) => {
                const Icon = tab.icon;
                const isAct = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`flex items-center justify-center gap-0.5 py-1.5 border-r last:border-r-0 border-white/15 transition-colors cursor-pointer ${
                      isAct
                        ? 'bg-white/15 text-white font-semibold'
                        : 'text-red-200/70 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-2.5 h-2.5 shrink-0" style={{ color: 'var(--ultron-bright)' }} />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 min-h-0 flex flex-col p-2 overflow-hidden">
              {activeTab === 'memories' && (
                <>
                  <div className="flex items-center gap-1 mb-1.5 shrink-0">
                    <div className="relative flex-1 min-w-0">
                      <Search className="w-3 h-3 text-red-300/70 absolute left-2 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search memory..."
                        className="w-full bg-black/35 border border-white/25 pl-6 pr-1.5 py-1 text-[10.5px] font-mono-tech text-white placeholder:text-red-300/45 focus:outline-none focus:border-white/60"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddForm((v) => !v)}
                      title="Add memory manually"
                      className="px-1.5 py-1 border border-white/30 bg-black/40 hover:bg-white/15 text-white font-mono-tech text-[9.5px] flex items-center gap-0.5 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                      ADD
                    </button>
                  </div>

                  {showAddForm && (
                    <form
                      onSubmit={handleCreateMem}
                      className="mb-2 p-2 border border-white/30 bg-black/60 flex flex-col gap-1.5 shrink-0"
                    >
                      <select
                        value={newMemType}
                        onChange={(e) => setNewMemType(e.target.value as MemoryCategory)}
                        className="bg-black/80 border border-white/30 text-[10px] font-mono-tech text-white px-1.5 py-1 focus:outline-none"
                      >
                        <option value="fact">fact</option>
                        <option value="preference">preference</option>
                        <option value="project">project</option>
                        <option value="decision">decision</option>
                        <option value="person">person</option>
                      </select>
                      <input
                        type="text"
                        value={newMemText}
                        onChange={(e) => setNewMemText(e.target.value)}
                        placeholder="Durable fact..."
                        className="w-full bg-black/50 border border-white/25 px-2 py-1 text-[10.5px] text-white placeholder:text-red-300/45 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="w-full py-1 bg-white/15 hover:bg-white/25 border border-white/50 text-[10px] font-mono-tech text-white tracking-wider cursor-pointer"
                      >
                        SAVE MEMORY
                      </button>
                    </form>
                  )}

                  <div className="flex-1 overflow-y-auto ultron-scroll space-y-1.5 pr-0.5">
                    {filteredMemories.length === 0 ? (
                      <div className="text-center py-4 px-2 border border-dashed border-white/20 bg-black/20">
                        <Brain className="w-4 h-4 text-red-400/60 mx-auto mb-1" />
                        <p className="font-mono-tech text-[10px] text-red-200/75">
                          No matching memories. Tell Ultron facts, projects, or preferences!
                        </p>
                      </div>
                    ) : (
                      filteredMemories.map((mem) => {
                        const wasMatched = lastMatchedMemoryIds.includes(mem.id);
                        return (
                          <div
                            key={mem.id}
                            className={`group p-1.5 border transition-all bg-black/30 ${
                              wasMatched
                                ? 'border-white/75 shadow-[0_0_12px_rgba(255,255,255,0.14)]'
                                : 'border-white/15 hover:border-white/45'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <div className="flex items-center gap-1">
                                <span
                                  className={`font-mono-tech text-[8px] uppercase px-1 border ${TYPE_COLORS[mem.type]}`}
                                >
                                  {mem.type}
                                </span>
                                {wasMatched && (
                                  <span className="font-mono-tech text-[8px] text-amber-300">
                                    ● HIT
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => onDeleteMemory(mem.id)}
                                title="Forget memory"
                                className="opacity-50 group-hover:opacity-100 text-red-300 hover:text-white transition-opacity cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <p className="text-[10.5px] text-red-50/95 leading-snug">{mem.text}</p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}

              {activeTab === 'profile' && (
                <div className="flex-1 overflow-y-auto ultron-scroll space-y-1.5 pr-0.5">
                  <div className="font-mono-tech text-[9px] text-red-200/80 border-b border-white/20 pb-1">
                    &lt;profile&gt; // OPERATOR FACTS
                  </div>
                  {profileMemories.map((m) => (
                    <div
                      key={m.id}
                      className="p-1.5 border border-white/20 bg-black/30 flex items-start justify-between gap-1.5"
                    >
                      <div>
                        <span
                          className={`inline-block font-mono-tech text-[8px] uppercase px-1 border mb-0.5 ${TYPE_COLORS[m.type]}`}
                        >
                          {m.type}
                        </span>
                        <p className="text-[10.5px] text-red-50 leading-snug">{m.text}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteMemory(m.id)}
                        className="text-red-300/70 hover:text-white cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  <div className="mt-2 p-2 border border-white/20 bg-black/35 flex items-start gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="font-mono-tech text-[9px] text-red-200/80 leading-relaxed">
                      SAFETY ACTIVE: Passwords, card numbers &amp; API keys are never stored.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'tasks' && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <form onSubmit={handleCreateTask} className="flex gap-1 mb-2 shrink-0">
                    <input
                      type="text"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="New directive..."
                      className="flex-1 min-w-0 bg-black/40 border border-white/25 px-2 py-1 text-[10.5px] font-mono-tech text-white placeholder:text-red-300/45 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="px-2 py-1 border border-white/35 bg-white/10 hover:bg-white/20 text-[9.5px] font-mono-tech text-white cursor-pointer"
                    >
                      LOCK
                    </button>
                  </form>

                  <div className="flex-1 overflow-y-auto ultron-scroll space-y-1.5 pr-0.5">
                    {tasks.map((task) => {
                      const done = task.status === 'completed';
                      return (
                        <div
                          key={task.id}
                          className={`p-1.5 border flex items-center justify-between gap-1.5 bg-black/30 ${
                            done ? 'border-white/10 opacity-55' : 'border-white/25'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onToggleTask(task.id)}
                            className="flex items-center gap-1.5 text-left flex-1 cursor-pointer"
                          >
                            {done ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : (
                              <Circle
                                className="w-3.5 h-3.5 shrink-0"
                                style={{ color: 'var(--ultron-bright)' }}
                              />
                            )}
                            <span
                              className={`text-[10.5px] ${
                                done ? 'line-through text-red-300/60' : 'text-red-50'
                              }`}
                            >
                              {task.autonomous ? '[ULTRON] ' : ''}
                              {task.title}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTask(task.id)}
                            className="text-red-300/60 hover:text-white cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'auto' && (
                <div className="flex-1 overflow-y-auto ultron-scroll space-y-2 pr-0.5 font-mono-tech">
                  {/* CRUD ACTION HEADER */}
                  <div className="flex items-center justify-between gap-1 border-b border-white/15 pb-1.5">
                    <span className="text-[8.5px] text-amber-300 font-bold tracking-wider">
                      CODE CRUD ({activeCrudCount})
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowNewCssForm((v) => !v)}
                        title="Create new CSS Patch"
                        className="px-1.5 py-0.5 border border-emerald-400/60 bg-emerald-950/40 hover:bg-emerald-900/50 text-[8px] text-emerald-200 flex items-center gap-0.5 cursor-pointer"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>+CSS</span>
                      </button>
                      <button
                        type="button"
                        disabled={codeState.history.length === 0}
                        onClick={() =>
                          onExecuteCrudCode({
                            undoLastPatch: true,
                            summary: 'Undid last code change from CRUD panel',
                          })
                        }
                        title="Undo last code / UI patch"
                        className="px-1.5 py-0.5 border border-cyan-400/60 bg-cyan-950/40 hover:bg-cyan-900/50 disabled:opacity-35 text-[8px] text-cyan-200 flex items-center gap-0.5 cursor-pointer"
                      >
                        <Undo2 className="w-2.5 h-2.5" />
                        <span>UNDO({codeState.history.length})</span>
                      </button>
                      {activeCrudCount > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            onExecuteCrudCode({
                              clearAllPatches: true,
                              summary: 'Cleared all active CRUD patches',
                            })
                          }
                          title="Delete all custom CSS, widgets, DOM edits & scripts"
                          className="px-1.5 py-0.5 border border-red-400/60 bg-red-950/50 hover:bg-red-900/60 text-[8px] text-red-200 flex items-center gap-0.5 cursor-pointer"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                          <span>WIPE</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick Create CSS Patch Form */}
                  {showNewCssForm && (
                    <div className="p-1.5 border border-emerald-400/50 bg-black/65 space-y-1">
                      <input
                        value={newCssId}
                        onChange={(e) => setNewCssId(e.target.value)}
                        placeholder="Patch ID (e.g. custom_glow)"
                        className="w-full bg-black/70 border border-white/25 px-1.5 py-1 text-[9px] text-white focus:outline-none"
                      />
                      <textarea
                        rows={3}
                        value={newCssBody}
                        onChange={(e) => setNewCssBody(e.target.value)}
                        placeholder="/* CSS rules */"
                        className="w-full bg-black/70 border border-white/25 p-1.5 text-[9px] text-emerald-100 focus:outline-none"
                      />
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setShowNewCssForm(false)}
                          className="px-1.5 py-0.5 border border-white/20 text-[8px] text-red-200 cursor-pointer"
                        >
                          CANCEL
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!newCssBody.trim()) return;
                            await onExecuteCrudCode({
                              cssPatch: {
                                id: newCssId.trim() || `patch_${Date.now()}`,
                                css: newCssBody,
                              },
                            });
                            setNewCssId('');
                            setNewCssBody('');
                            setShowNewCssForm(false);
                          }}
                          className="px-2 py-0.5 border border-emerald-400/70 bg-emerald-900/60 text-[8px] text-white cursor-pointer"
                        >
                          CREATE PATCH
                        </button>
                      </div>
                    </div>
                  )}

                  {activeCrudCount === 0 && (
                    <div className="p-2 border border-white/15 bg-black/35 text-[9px] text-red-100/80 leading-relaxed">
                      Full CRUD Ready — tell Ultron to <strong className="text-white">create</strong>,{' '}
                      <strong className="text-white">read</strong>,{' '}
                      <strong className="text-white">edit/update</strong>, or{' '}
                      <strong className="text-white">delete/undo</strong> any CSS style, widget,
                      DOM element, script, or code file!
                    </div>
                  )}

                  {/* 1. CSS PATCHES (READ / UPDATE / DELETE) */}
                  {(codeState.liveCss.trim() || codeState.cssPatches.length > 0) && (
                    <div className="space-y-1">
                      <div className="text-[8px] text-cyan-300 uppercase tracking-wider">
                        CSS PATCHES (
                        {codeState.cssPatches.length + (codeState.liveCss.trim() ? 1 : 0)})
                      </div>
                      {codeState.liveCss.trim() && (
                        <div className="p-1.5 border border-cyan-400/35 bg-black/45 text-[9px] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-cyan-200 font-bold">[GLOBAL_CSS]</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCrudKey('css:__legacy__');
                                  setEditDraftCode(codeState.liveCss);
                                }}
                                className="text-amber-300 hover:text-white cursor-pointer"
                                title="Edit Global CSS"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onExecuteCrudCode({
                                    removeCssPatchIds: ['__legacy__'],
                                    summary: 'Deleted global live CSS',
                                  })
                                }
                                className="text-red-300 hover:text-white cursor-pointer"
                                title="Delete Global CSS"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          {editingCrudKey === 'css:__legacy__' ? (
                            <div className="space-y-1">
                              <textarea
                                rows={4}
                                value={editDraftCode}
                                onChange={(e) => setEditDraftCode(e.target.value)}
                                className="w-full bg-black/80 border border-cyan-400/60 p-1 text-[8.5px] text-cyan-100 focus:outline-none"
                              />
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingCrudKey(null)}
                                  className="px-1.5 py-0.5 border border-white/20 text-[8px] text-red-200 cursor-pointer"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await onExecuteCrudCode({
                                      liveCss: editDraftCode,
                                      appendCss: false,
                                      summary: 'Edited global live CSS',
                                    });
                                    setEditingCrudKey(null);
                                  }}
                                  className="px-1.5 py-0.5 border border-emerald-400/70 bg-emerald-900/50 text-[8px] text-white flex items-center gap-0.5 cursor-pointer"
                                >
                                  <Save className="w-2.5 h-2.5" />
                                  <span>SAVE</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <pre className="text-[8px] text-red-100/80 whitespace-pre-wrap break-all max-h-14 overflow-hidden">
                              {codeState.liveCss.slice(0, 180)}
                            </pre>
                          )}
                        </div>
                      )}

                      {codeState.cssPatches.map((p) => {
                        const key = `css:${p.id}`;
                        return (
                          <div
                            key={p.id}
                            className="p-1.5 border border-cyan-400/35 bg-black/45 text-[9px] space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-cyan-200 font-bold truncate">#{p.id}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCrudKey(key);
                                    setEditDraftCode(p.css);
                                  }}
                                  className="text-amber-300 hover:text-white cursor-pointer"
                                  title="Edit CSS Patch"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onExecuteCrudCode({
                                      removeCssPatchIds: [p.id],
                                      summary: `Deleted CSS patch [${p.id}]`,
                                    })
                                  }
                                  className="text-red-300 hover:text-white cursor-pointer"
                                  title="Delete CSS Patch"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            {editingCrudKey === key ? (
                              <div className="space-y-1">
                                <textarea
                                  rows={4}
                                  value={editDraftCode}
                                  onChange={(e) => setEditDraftCode(e.target.value)}
                                  className="w-full bg-black/80 border border-cyan-400/60 p-1 text-[8.5px] text-cyan-100 focus:outline-none"
                                />
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingCrudKey(null)}
                                    className="px-1.5 py-0.5 border border-white/20 text-[8px] text-red-200 cursor-pointer"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await onExecuteCrudCode({
                                        cssPatch: { id: p.id, css: editDraftCode },
                                        summary: `Updated CSS patch [${p.id}]`,
                                      });
                                      setEditingCrudKey(null);
                                    }}
                                    className="px-1.5 py-0.5 border border-emerald-400/70 bg-emerald-900/50 text-[8px] text-white flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <Save className="w-2.5 h-2.5" />
                                    <span>SAVE</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <pre className="text-[8px] text-red-100/80 whitespace-pre-wrap break-all max-h-14 overflow-hidden">
                                {p.css.slice(0, 180)}
                              </pre>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 2. WIDGETS (READ / UPDATE / DELETE) */}
                  {codeState.widgets.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[8px] text-amber-300 uppercase tracking-wider">
                        WIDGETS ({codeState.widgets.length})
                      </div>
                      {codeState.widgets.map((w) => {
                        const key = `wid:${w.id}`;
                        return (
                          <div
                            key={w.id}
                            className="p-1.5 border border-amber-400/40 bg-black/45 text-[9px] space-y-1"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-amber-200 font-bold truncate">
                                {w.title} <span className="text-white/50">({w.id})</span>
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCrudKey(key);
                                    setEditDraftTitle(w.title);
                                    setEditDraftCode(w.html);
                                    setEditDraftJs(w.js || '');
                                  }}
                                  className="text-amber-300 hover:text-white cursor-pointer"
                                  title="Edit Widget HTML/JS"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onExecuteCrudCode({
                                      removeWidgetIds: [w.id],
                                      summary: `Deleted widget "${w.title}"`,
                                    })
                                  }
                                  className="text-red-300 hover:text-white cursor-pointer"
                                  title="Delete Widget"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            {editingCrudKey === key ? (
                              <div className="space-y-1">
                                <input
                                  value={editDraftTitle}
                                  onChange={(e) => setEditDraftTitle(e.target.value)}
                                  placeholder="Widget Title"
                                  className="w-full bg-black/80 border border-amber-400/60 px-1 py-0.5 text-[8.5px] text-white"
                                />
                                <textarea
                                  rows={3}
                                  value={editDraftCode}
                                  onChange={(e) => setEditDraftCode(e.target.value)}
                                  placeholder="HTML"
                                  className="w-full bg-black/80 border border-amber-400/60 p-1 text-[8px] text-amber-100"
                                />
                                <textarea
                                  rows={3}
                                  value={editDraftJs}
                                  onChange={(e) => setEditDraftJs(e.target.value)}
                                  placeholder="JS (optional)"
                                  className="w-full bg-black/80 border border-amber-400/40 p-1 text-[8px] text-cyan-100"
                                />
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingCrudKey(null)}
                                    className="px-1.5 py-0.5 border border-white/20 text-[8px] text-red-200 cursor-pointer"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await onExecuteCrudCode({
                                        updateWidget: {
                                          id: w.id,
                                          title: editDraftTitle,
                                          html: editDraftCode,
                                          js: editDraftJs,
                                        },
                                        summary: `Edited widget "${editDraftTitle}"`,
                                      });
                                      setEditingCrudKey(null);
                                    }}
                                    className="px-1.5 py-0.5 border border-emerald-400/70 bg-emerald-900/50 text-[8px] text-white flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <Save className="w-2.5 h-2.5" />
                                    <span>SAVE</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-[8px] text-red-200/75 truncate">
                                Target: {w.targetSelector || 'Top Deck'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 3. REVERSIBLE NATIVE DOM OVERRIDES */}
                  {codeState.domPatches.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[8px] text-pink-300 uppercase tracking-wider">
                        DOM OVERRIDES ({codeState.domPatches.length})
                      </div>
                      {codeState.domPatches.map((d) => (
                        <div
                          key={d.id}
                          className="p-1.5 border border-pink-400/40 bg-black/45 text-[9px] flex items-center justify-between gap-1"
                        >
                          <div className="min-w-0">
                            <div className="text-pink-200 font-bold truncate">
                              {d.action} → {d.selector}
                            </div>
                            {d.value && (
                              <div className="text-[8px] text-white/75 truncate">{d.value}</div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onExecuteCrudCode({
                                removeDomPatchIds: [d.id],
                                summary: `Reverted DOM override [${d.id}]`,
                              })
                            }
                            className="text-red-300 hover:text-white shrink-0 cursor-pointer"
                            title="Revert & Restore Original DOM Element"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 4. PERSISTENT SCRIPTS */}
                  {(codeState.persistentJs.trim() || codeState.scripts.length > 0) && (
                    <div className="space-y-1">
                      <div className="text-[8px] text-emerald-300 uppercase tracking-wider">
                        SCRIPTS (
                        {codeState.scripts.length + (codeState.persistentJs.trim() ? 1 : 0)})
                      </div>
                      {codeState.persistentJs.trim() && (
                        <div className="p-1.5 border border-emerald-400/40 bg-black/45 text-[9px] flex items-center justify-between gap-1">
                          <span className="text-emerald-200 truncate">[GLOBAL_SCRIPT]</span>
                          <button
                            type="button"
                            onClick={() =>
                              onExecuteCrudCode({
                                removeScriptIds: ['__legacy__'],
                                summary: 'Stopped & deleted global script',
                              })
                            }
                            className="text-red-300 hover:text-white cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      {codeState.scripts.map((s) => (
                        <div
                          key={s.id}
                          className="p-1.5 border border-emerald-400/40 bg-black/45 text-[9px] flex items-center justify-between gap-1"
                        >
                          <span className="text-emerald-200 truncate">
                            {s.title || s.id}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onExecuteCrudCode({
                                removeScriptIds: [s.id],
                                summary: `Stopped & deleted script [${s.id}]`,
                              })
                            }
                            className="text-red-300 hover:text-white cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 5. VIRTUAL WORKSPACE FILES */}
                  {codeState.files.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[8px] text-purple-300 uppercase tracking-wider">
                        WORKSPACE FILES ({codeState.files.length})
                      </div>
                      {codeState.files.map((f) => {
                        const key = `file:${f.name}`;
                        return (
                          <div
                            key={f.name}
                            className="p-1.5 border border-purple-400/40 bg-black/45 text-[9px] space-y-1"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-purple-200 font-bold flex items-center gap-1 truncate">
                                <FileCode className="w-3 h-3 shrink-0" />
                                {f.name}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCrudKey(editingCrudKey === key ? null : key);
                                    setEditDraftCode(f.content);
                                  }}
                                  className="text-amber-300 hover:text-white cursor-pointer"
                                  title="Read / Edit File"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    triggerFileDownload(f.name, f.content, f.mimeType)
                                  }
                                  className="text-cyan-300 hover:text-white cursor-pointer"
                                  title="Download File"
                                >
                                  <Download className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onExecuteCrudCode({
                                      deleteFileNames: [f.name],
                                      summary: `Deleted file "${f.name}"`,
                                    })
                                  }
                                  className="text-red-300 hover:text-white cursor-pointer"
                                  title="Delete File"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            {editingCrudKey === key && (
                              <div className="space-y-1">
                                <textarea
                                  rows={5}
                                  value={editDraftCode}
                                  onChange={(e) => setEditDraftCode(e.target.value)}
                                  className="w-full bg-black/80 border border-purple-400/60 p-1 text-[8px] text-purple-100 focus:outline-none"
                                />
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingCrudKey(null)}
                                    className="px-1.5 py-0.5 border border-white/20 text-[8px] text-red-200 cursor-pointer"
                                  >
                                    CLOSE
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await onExecuteCrudCode({
                                        saveFile: { name: f.name, content: editDraftCode },
                                        summary: `Updated file "${f.name}"`,
                                      });
                                      setEditingCrudKey(null);
                                    }}
                                    className="px-1.5 py-0.5 border border-emerald-400/70 bg-emerald-900/50 text-[8px] text-white cursor-pointer"
                                  >
                                    SAVE FILE
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ACTIVITY LOG */}
                  <div className="text-[8.5px] text-amber-300 border-t border-white/15 pt-1.5">
                    ACTIVITY LOG ({autonomousLog.length})
                  </div>
                  {autonomousLog.slice(0, 18).map((entry) => (
                    <div
                      key={entry.id}
                      className="p-1.5 border border-white/20 bg-black/40 text-[9px] space-y-0.5"
                    >
                      <div className="flex items-center justify-between text-[8px] text-amber-300/90">
                        <span className="uppercase">[{entry.category}]</span>
                        <span>{entry.timestamp.slice(11, 19)}</span>
                      </div>
                      <div className="text-white/95 leading-snug">{entry.summary}</div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'xml' && (
                <div className="flex-1 overflow-y-auto ultron-scroll space-y-2 pr-0.5 font-mono-tech text-[9px]">
                  <div>
                    <div className="text-amber-300 mb-1">LAST XML PACKET:</div>
                    <pre className="p-1.5 bg-black/55 border border-white/20 text-red-100/90 whitespace-pre-wrap break-words leading-relaxed">
                      {lastXmlPayload || '(Send a message to inspect live XML)'}
                    </pre>
                  </div>
                  <div>
                    <div className="text-amber-300 mb-1">RAW &lt;memory_update&gt; + &lt;ultron_action&gt;:</div>
                    <pre className="p-1.5 bg-black/55 border border-white/20 text-amber-200/90 whitespace-pre-wrap break-words leading-relaxed">
                      {lastRawOutput || '(Awaiting turn response)'}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
};
