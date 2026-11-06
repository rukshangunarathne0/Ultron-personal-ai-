import React, { useState } from 'react';
import {
  Activity,
  Brain,
  CheckCircle2,
  Circle,
  Code2,
  Cpu,
  Database,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserCheck,
} from 'lucide-react';
import {
  BrainConfig,
  DirectiveTask,
  MemoryCategory,
  MemoryItem,
  ThinkingStepId,
  UltronEmotion,
  VoiceConfig,
} from '../types';
import { THINKING_STEPS } from '../lib/rukAiPrompt';
import { getProfileMemories } from '../lib/memorySearch';

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

const TYPE_COLORS: Record<MemoryCategory, string> = {
  fact: 'border-red-500/60 text-red-300 bg-red-950/40',
  preference: 'border-amber-500/60 text-amber-300 bg-amber-950/40',
  project: 'border-rose-400/70 text-rose-200 bg-rose-950/50',
  decision: 'border-orange-500/60 text-orange-300 bg-orange-950/40',
  person: 'border-pink-500/60 text-pink-300 bg-pink-950/40',
};

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
  onAddMemoryManual,
  onDeleteMemory,
  onAddTask,
  onToggleTask,
  onDeleteTask,
}) => {
  const [activeTab, setActiveTab] = useState<'memories' | 'profile' | 'tasks' | 'xml'>('memories');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMemType, setNewMemType] = useState<MemoryCategory>('fact');
  const [newMemText, setNewMemText] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');

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

  return (
    <aside className="h-full min-h-0 w-full flex flex-col gap-2 pointer-events-auto z-20">
      {/* 1. RUK-AI // ULTRON DETAILS & EXPRESSION RIG */}
      <div className="ultron-glass ultron-corners p-3 rounded-sm">
        <div className="flex items-center justify-between border-b border-red-500/30 pb-1.5 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600 shadow-[0_0_8px_#ff1430]" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-[11px] xl:text-xs font-bold tracking-[0.16em] text-red-100 truncate">
                RUK-AI // ULTRON
              </h1>
              <p className="font-mono-tech text-[9.5px] text-red-400/90 tracking-widest truncate">
                OP: RUKSHAN // NEURAL CORE
              </p>
            </div>
          </div>
          <span className="font-mono-tech text-[9px] px-1.5 py-0.5 border border-red-500/50 bg-red-950/40 text-red-300 uppercase shrink-0">
            {emotion.replace('_', ' ')}
          </span>
        </div>

        {/* Compact Status Readout */}
        <div className="grid grid-cols-3 gap-1 mb-2 font-mono-tech text-[9.5px]">
          <div className="border border-red-500/25 bg-black/30 px-1.5 py-1">
            <div className="text-red-400/70">BRAIN</div>
            <div className="text-red-100 truncate uppercase">
              {brainConfig.provider === 'autonomous_local' ? 'LOCAL' : brainConfig.provider}
            </div>
          </div>
          <div className="border border-red-500/25 bg-black/30 px-1.5 py-1">
            <div className="text-red-400/70">VOICE</div>
            <div className="text-red-100 truncate uppercase">
              {voiceConfig.muted
                ? 'MUTED'
                : voiceConfig.provider === 'browser_ultron'
                ? 'DSP ON'
                : voiceConfig.provider.replace('_tts', '')}
            </div>
          </div>
          <div className="border border-red-500/25 bg-black/30 px-1.5 py-1">
            <div className="text-red-400/70">VAULT</div>
            <div className="text-red-100 truncate">
              {memories.length}M / {tasks.filter((t) => t.status !== 'completed').length}T
            </div>
          </div>
        </div>

        {/* Facial Emotion Selector */}
        <div>
          <div className="flex items-center justify-between font-mono-tech text-[9.5px] text-red-400/80 mb-1">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-red-500" />
              FACE EMOTIONS
            </span>
            <span className="text-red-300/70">60FPS RIG</span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {EMOTION_OPTIONS.map((opt) => {
              const isSelected = emotion === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectEmotion(opt.id)}
                  className={`font-mono-tech text-[9px] py-0.5 px-0.5 border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-red-400 bg-red-600/35 text-white shadow-[0_0_10px_rgba(255,20,48,0.45)]'
                      : 'border-red-500/25 bg-black/25 text-red-300/75 hover:border-red-500/60 hover:text-red-100'
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
      <div className="ultron-glass ultron-corners px-3 py-2 rounded-sm">
        <div className="flex items-center justify-between font-mono-tech text-[9.5px] text-red-300 mb-1">
          <span className="flex items-center gap-1">
            <Cpu className="w-3 h-3 text-red-500" />
            7-STEP PIPELINE
          </span>
          <span className="text-red-400">
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
                className={`h-1.5 transition-all duration-200 ${
                  active
                    ? 'bg-red-400 shadow-[0_0_10px_#ff1e3c]'
                    : passed
                    ? 'bg-red-600/75'
                    : 'bg-red-950/60 border border-red-500/20'
                }`}
              />
            );
          })}
        </div>

        <div className="font-mono-tech text-[10px] text-red-200/85 truncate">
          {currentStepInfo
            ? `>> ${currentStepInfo.label}: ${currentStepInfo.detail}`
            : '>> Standing by for Rukshan...'}
        </div>
      </div>

      {/* 3. NEURAL MEMORY VAULT (<memories>, <profile>, TASKS, XML) */}
      <div className="ultron-glass ultron-corners flex-1 min-h-0 flex flex-col rounded-sm overflow-hidden">
        <div className="grid grid-cols-4 border-b border-red-500/35 font-mono-tech text-[9.5px]">
          {[
            { id: 'memories', label: `MEM(${memories.length})`, icon: Database },
            { id: 'profile', label: `PROF(${profileMemories.length})`, icon: UserCheck },
            { id: 'tasks', label: `TASK(${tasks.length})`, icon: Activity },
            { id: 'xml', label: 'XML', icon: Code2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isAct = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center justify-center gap-0.5 py-1.5 border-r last:border-r-0 border-red-500/25 transition-colors cursor-pointer ${
                  isAct
                    ? 'bg-red-600/25 text-white font-semibold'
                    : 'text-red-300/70 hover:text-red-100 hover:bg-red-950/30'
                }`}
              >
                <Icon className="w-2.5 h-2.5 text-red-400 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-h-0 flex flex-col p-2.5 overflow-hidden">
          {activeTab === 'memories' && (
            <>
              <div className="flex items-center gap-1 mb-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-3 h-3 text-red-400/70 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search memory..."
                    className="w-full bg-black/35 border border-red-500/35 pl-6 pr-1.5 py-1 text-[11px] font-mono-tech text-red-100 placeholder:text-red-400/45 focus:outline-none focus:border-red-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddForm((v) => !v)}
                  title="Add memory manually"
                  className="px-1.5 py-1 border border-red-500/45 bg-red-950/40 hover:bg-red-600/30 text-red-200 font-mono-tech text-[10px] flex items-center gap-0.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-3 h-3" />
                  ADD
                </button>
              </div>

              {showAddForm && (
                <form
                  onSubmit={handleCreateMem}
                  className="mb-2 p-2 border border-red-500/45 bg-black/55 flex flex-col gap-1.5"
                >
                  <select
                    value={newMemType}
                    onChange={(e) => setNewMemType(e.target.value as MemoryCategory)}
                    className="bg-red-950/70 border border-red-500/45 text-[10.5px] font-mono-tech text-red-100 px-1.5 py-1 focus:outline-none"
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
                    className="w-full bg-black/50 border border-red-500/40 px-2 py-1 text-[11px] text-red-100 placeholder:text-red-400/45 focus:outline-none focus:border-red-400"
                  />
                  <button
                    type="submit"
                    className="w-full py-1 bg-red-600/35 hover:bg-red-600/55 border border-red-400 text-[10px] font-mono-tech text-white tracking-wider cursor-pointer"
                  >
                    SAVE MEMORY
                  </button>
                </form>
              )}

              <div className="flex-1 overflow-y-auto ultron-scroll space-y-1.5 pr-0.5">
                {filteredMemories.length === 0 ? (
                  <div className="text-center py-5 px-2 border border-dashed border-red-500/25 bg-black/20">
                    <Brain className="w-4 h-4 text-red-500/60 mx-auto mb-1" />
                    <p className="font-mono-tech text-[10.5px] text-red-300/75">
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
                            ? 'border-red-400 shadow-[0_0_12px_rgba(255,20,48,0.22)]'
                            : 'border-red-500/25 hover:border-red-500/55'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <div className="flex items-center gap-1">
                            <span
                              className={`font-mono-tech text-[8.5px] uppercase px-1 border ${TYPE_COLORS[mem.type]}`}
                            >
                              {mem.type}
                            </span>
                            {wasMatched && (
                              <span className="font-mono-tech text-[8.5px] text-red-300">
                                ● HIT
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => onDeleteMemory(mem.id)}
                            title="Forget memory"
                            className="opacity-50 group-hover:opacity-100 text-red-400 hover:text-red-200 transition-opacity cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-[11px] text-red-50/95 leading-snug">{mem.text}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {activeTab === 'profile' && (
            <div className="flex-1 overflow-y-auto ultron-scroll space-y-1.5 pr-0.5">
              <div className="font-mono-tech text-[9.5px] text-red-300/80 border-b border-red-500/25 pb-1">
                &lt;profile&gt; // OPERATOR FACTS
              </div>
              {profileMemories.map((m) => (
                <div
                  key={m.id}
                  className="p-1.5 border border-red-500/35 bg-red-950/20 flex items-start justify-between gap-1.5"
                >
                  <div>
                    <span
                      className={`inline-block font-mono-tech text-[8.5px] uppercase px-1 border mb-0.5 ${TYPE_COLORS[m.type]}`}
                    >
                      {m.type}
                    </span>
                    <p className="text-[11px] text-red-50 leading-snug">{m.text}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteMemory(m.id)}
                    className="text-red-400/70 hover:text-red-200 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              <div className="mt-2 p-2 border border-red-500/25 bg-black/35 flex items-start gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                <p className="font-mono-tech text-[9.5px] text-red-300/80 leading-relaxed">
                  SAFETY ACTIVE: Passwords, card numbers &amp; IDs are never stored.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="flex-1 min-h-0 flex flex-col">
              <form onSubmit={handleCreateTask} className="flex gap-1 mb-2">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="New directive..."
                  className="flex-1 min-w-0 bg-black/40 border border-red-500/35 px-2 py-1 text-[11px] font-mono-tech text-red-100 placeholder:text-red-400/45 focus:outline-none focus:border-red-400"
                />
                <button
                  type="submit"
                  className="px-2 py-1 border border-red-500/50 bg-red-600/25 hover:bg-red-600/45 text-[10px] font-mono-tech text-red-100 cursor-pointer"
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
                        done ? 'border-red-500/15 opacity-55' : 'border-red-500/40'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onToggleTask(task.id)}
                        className="flex items-center gap-1.5 text-left flex-1 cursor-pointer"
                      >
                        {done ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        )}
                        <span
                          className={`text-[11px] ${
                            done ? 'line-through text-red-300/60' : 'text-red-50'
                          }`}
                        >
                          {task.title}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTask(task.id)}
                        className="text-red-400/60 hover:text-red-200 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'xml' && (
            <div className="flex-1 overflow-y-auto ultron-scroll space-y-2 pr-0.5 font-mono-tech text-[9.5px]">
              <div>
                <div className="text-red-400 mb-1">LAST XML PACKET:</div>
                <pre className="p-1.5 bg-black/55 border border-red-500/30 text-red-100/90 whitespace-pre-wrap break-words leading-relaxed">
                  {lastXmlPayload || '(Send a message to inspect live XML)'}
                </pre>
              </div>
              <div>
                <div className="text-red-400 mb-1">RAW &lt;memory_update&gt;:</div>
                <pre className="p-1.5 bg-black/55 border border-red-500/30 text-amber-200/90 whitespace-pre-wrap break-words leading-relaxed">
                  {lastRawOutput || '(Awaiting turn response)'}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
