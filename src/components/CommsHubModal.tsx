import React, { useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Link2,
  MessageCircle,
  RefreshCw,
  Send,
  Smartphone,
  Terminal,
  X,
} from 'lucide-react';
import { CommsPlatform, CommsVaultConfig } from '../types';
import {
  checkWhatsAppStatus,
  requestCloudWhatsAppPairingCode,
  verifyTelegramToken,
} from '../lib/omniTools';

interface CommsHubModalProps {
  isOpen: boolean;
  initialPlatform?: CommsPlatform;
  onClose: () => void;
  commsVault: CommsVaultConfig;
  onChangeCommsVault: (next: CommsVaultConfig) => void;
  onCheckUnseenNow: (platform: CommsPlatform | 'all') => void;
}

export const CommsHubModal: React.FC<CommsHubModalProps> = ({
  isOpen,
  initialPlatform = 'whatsapp',
  onClose,
  commsVault,
  onChangeCommsVault,
  onCheckUnseenNow,
}) => {
  const [tab, setTab] = useState<CommsPlatform>(initialPlatform);
  const [statusBanner, setStatusBanner] = useState<string>('');
  const [pairingCode, setPairingCode] = useState<string>('');
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const wa = commsVault.whatsapp;
  const tg = commsVault.telegram;
  const gh = commsVault.github;

  const handleVerifyWhatsApp = async () => {
    setBusy(true);
    setStatusBanner('Checking WhatsApp connection status...');
    try {
      const st = await checkWhatsAppStatus(commsVault);
      if (st.pairingCode) setPairingCode(st.pairingCode);
      if (st.authorized) {
        onChangeCommsVault({
          ...commsVault,
          whatsapp: { ...wa, authorized: true, awaitingPhoneInput: false },
        });
        setStatusBanner(
          `✓ WHATSAPP LINKED (${st.via === 'local_baileys' ? 'Local PC Bridge' : 'Cloud Green-API'})! Ultron now has persistent access — ask "What are my unseen messages?" anytime.`
        );
      } else {
        setStatusBanner(
          st.detail ||
            'Not linked yet. Complete Cloud Green-API or Local PC Bridge pairing below, then click VERIFY ACCESS.'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRequestGreenPairingCode = async () => {
    if (!wa.phoneNumber.trim()) {
      setStatusBanner('Enter your WhatsApp phone number with country code (+94...) first.');
      return;
    }
    if (!wa.greenIdInstance.trim() || !wa.greenApiToken.trim()) {
      setStatusBanner(
        'Create a free developer instance at green-api.com and paste Instance ID + API Token below first (or use Local PC Bridge).'
      );
      return;
    }
    setBusy(true);
    setStatusBanner('Requesting 8-digit WhatsApp phone pairing code...');
    try {
      const code = await requestCloudWhatsAppPairingCode(commsVault);
      setPairingCode(code);
      setStatusBanner(
        `✓ PAIRING CODE READY: ${code} — Open WhatsApp on your phone -> Linked Devices -> Link with phone number!`
      );
    } catch (err) {
      setStatusBanner(
        `✗ ${err instanceof Error ? err.message : 'Could not request pairing code'} (Tip: You can also scan QR inside your Green-API dashboard!)`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyTelegram = async () => {
    if (!tg.botToken.trim()) {
      setStatusBanner('Paste your Telegram Bot Token (from @BotFather) first.');
      return;
    }
    setBusy(true);
    setStatusBanner('Connecting to Telegram API...');
    try {
      const info = await verifyTelegramToken(tg.botToken);
      onChangeCommsVault({
        ...commsVault,
        telegram: {
          ...tg,
          botUsername: info.username,
          authorized: true,
          awaitingTokenInput: false,
        },
      });
      setStatusBanner(
        `✓ TELEGRAM CONNECTED (@${info.username})! Send any message to @${info.username} on Telegram, then ask Ultron "What are my unseen Telegram messages?"`
      );
    } catch (err) {
      setStatusBanner(`✗ ${err instanceof Error ? err.message : 'Telegram connection failed'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="ultron-modal-glass ultron-corners w-full max-w-2xl max-h-[90vh] flex flex-col rounded-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/20">
          <div className="flex items-center gap-2.5">
            <MessageCircle className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="font-display text-sm font-bold tracking-[0.16em] text-white">
                ULTRON COMMS &amp; ACCOUNT ACCESS BRIDGE
              </h2>
              <p className="font-mono-tech text-[10.5px] text-red-200/85">
                Link WhatsApp, Telegram &amp; GitHub once — Ultron retains persistent access to read unseen messages &amp; reply
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 border border-white/25 hover:bg-white/15 text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Platform Tabs */}
        <div className="grid grid-cols-3 border-b border-white/20 font-mono-tech text-xs">
          {[
            { id: 'whatsapp', label: 'WHATSAPP', linked: wa.authorized },
            { id: 'telegram', label: 'TELEGRAM', linked: tg.authorized },
            { id: 'github', label: 'GITHUB ALERTS', linked: gh.authorized },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setTab(p.id as CommsPlatform);
                setStatusBanner('');
              }}
              className={`py-2.5 flex items-center justify-center gap-1.5 border-r last:border-r-0 border-white/15 cursor-pointer ${
                tab === p.id ? 'bg-white/15 text-white font-bold' : 'text-red-200/75'
              }`}
            >
              <span>{p.label}</span>
              {p.linked && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto ultron-scroll p-5 space-y-4 font-mono-tech text-xs">
          {tab === 'whatsapp' && (
            <>
              {/* Step 1: Phone Number */}
              <div className="p-3 border border-white/25 bg-black/50 space-y-2">
                <label className="block text-emerald-300 font-bold flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  STEP 1: YOUR WHATSAPP NUMBER (WITH COUNTRY CODE)
                </label>
                <input
                  type="text"
                  value={wa.phoneNumber}
                  onChange={(e) =>
                    onChangeCommsVault({
                      ...commsVault,
                      whatsapp: { ...wa, phoneNumber: e.target.value },
                    })
                  }
                  placeholder="+94771234567"
                  className="w-full bg-black/70 border border-white/35 p-2 text-sm text-white"
                />
              </div>

              {/* Step 2: Grant Access */}
              <div className="p-3.5 border border-white/25 bg-black/50 space-y-3">
                <div className="text-amber-300 font-bold flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4" />
                  STEP 2: LINK WHATSAPP ACCESS (CHOOSE CLOUD OR LOCAL PC)
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeCommsVault({
                        ...commsVault,
                        whatsapp: { ...wa, bridgeMode: 'cloud_green' },
                      })
                    }
                    className={`p-2 border text-left cursor-pointer ${
                      wa.bridgeMode === 'cloud_green'
                        ? 'border-emerald-400 bg-emerald-950/35 text-white'
                        : 'border-white/20 text-red-200/75'
                    }`}
                  >
                    <div className="font-bold">CLOUD 24/7 (Green-API Free)</div>
                    <div className="text-[10px] opacity-80">Works on Vercel &amp; Mobile</div>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeCommsVault({
                        ...commsVault,
                        whatsapp: { ...wa, bridgeMode: 'local_baileys' },
                      })
                    }
                    className={`p-2 border text-left cursor-pointer ${
                      wa.bridgeMode === 'local_baileys'
                        ? 'border-emerald-400 bg-emerald-950/35 text-white'
                        : 'border-white/20 text-red-200/75'
                    }`}
                  >
                    <div className="font-bold">LOCAL PC BRIDGE (Zero Signup)</div>
                    <div className="text-[10px] opacity-80">Direct Phone Pairing Code</div>
                  </button>
                </div>

                {wa.bridgeMode === 'cloud_green' ? (
                  <div className="space-y-2.5 text-[11px] text-red-100">
                    <p className="leading-relaxed">
                      1. Create a free developer instance at{' '}
                      <a
                        href="https://console.green-api.com"
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-300 underline"
                      >
                        console.green-api.com
                      </a>{' '}
                      and paste <strong>idInstance</strong> + <strong>apiTokenInstance</strong>:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={wa.greenIdInstance}
                        onChange={(e) =>
                          onChangeCommsVault({
                            ...commsVault,
                            whatsapp: { ...wa, greenIdInstance: e.target.value },
                          })
                        }
                        placeholder="idInstance (e.g. 71039...)"
                        className="w-full bg-black/75 border border-white/30 p-2 text-white"
                      />
                      <input
                        type="password"
                        value={wa.greenApiToken}
                        onChange={(e) =>
                          onChangeCommsVault({
                            ...commsVault,
                            whatsapp: { ...wa, greenApiToken: e.target.value },
                          })
                        }
                        placeholder="apiTokenInstance"
                        className="w-full bg-black/75 border border-white/30 p-2 text-white"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleRequestGreenPairingCode}
                      className="w-full py-2 border border-amber-400/70 bg-amber-950/35 hover:bg-amber-700/35 text-amber-200 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      GET 8-DIGIT WHATSAPP PHONE PAIRING CODE
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 text-[11px] text-red-100">
                    <div className="flex items-center gap-1.5 text-emerald-300">
                      <Terminal className="w-3.5 h-3.5" />
                      Run this 1-line bridge in your PC terminal inside this repo:
                    </div>
                    <pre className="p-2.5 bg-black/80 border border-white/25 text-amber-200 overflow-x-auto select-all">
                      {`npm install --no-save @whiskeysockets/baileys pino && npm run whatsapp-bridge -- ${
                        wa.phoneNumber || '+9477XXXXXXX'
                      }`}
                    </pre>
                    <p className="text-[10.5px] text-red-200/85">
                      Enter the 8-digit code printed in your terminal into WhatsApp &rarr; Linked Devices &rarr; Link with phone number. Ultron connects automatically to <code>localhost:3005</code>!
                    </p>
                  </div>
                )}

                {pairingCode && (
                  <div className="p-3 border-2 border-emerald-400 bg-emerald-950/40 text-center">
                    <div className="text-[10px] text-emerald-300">
                      ENTER THIS 8-DIGIT CODE ON YOUR PHONE IN WHATSAPP:
                    </div>
                    <div className="font-display text-2xl font-bold tracking-[0.25em] text-white mt-1">
                      {pairingCode}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleVerifyWhatsApp}
                    className="flex-1 py-2 bg-emerald-700/45 hover:bg-emerald-600/65 border border-emerald-400 text-white flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                    VERIFY &amp; SAVE WHATSAPP ACCESS
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCheckUnseenNow('whatsapp');
                      onClose();
                    }}
                    className="px-4 py-2 bg-white/15 hover:bg-white/25 border border-white/50 text-white cursor-pointer"
                  >
                    CHECK UNSEEN MESSAGES
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === 'telegram' && (
            <div className="p-3.5 border border-white/25 bg-black/50 space-y-3">
              <div className="text-sky-300 font-bold">
                CONNECT TELEGRAM (100% CLOUD NATIVE — TAKES 20 SECONDS)
              </div>
              <ol className="list-decimal list-inside text-[11px] text-red-100/90 space-y-1">
                <li>
                  Open Telegram &rarr; message <strong>@BotFather</strong> &rarr; send{' '}
                  <code>/newbot</code> &rarr; copy your Bot Token.
                </li>
                <li>
                  Paste the token below and click <strong>CONNECT TELEGRAM</strong>. Any messages forwarded or sent to your bot appear immediately when you ask Ultron for unseen messages!
                </li>
              </ol>
              <input
                type="password"
                value={tg.botToken}
                onChange={(e) =>
                  onChangeCommsVault({
                    ...commsVault,
                    telegram: { ...tg, botToken: e.target.value },
                  })
                }
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz..."
                className="w-full bg-black/75 border border-white/35 p-2 text-white"
              />
              <input
                type="text"
                value={tg.defaultChatId}
                onChange={(e) =>
                  onChangeCommsVault({
                    ...commsVault,
                    telegram: { ...tg, defaultChatId: e.target.value },
                  })
                }
                placeholder="Optional Default Chat ID (auto-filled when you message your bot)"
                className="w-full bg-black/75 border border-white/25 p-2 text-white"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleVerifyTelegram}
                  className="flex-1 py-2 bg-sky-700/45 hover:bg-sky-600/65 border border-sky-400 text-white flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  CONNECT TELEGRAM
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCheckUnseenNow('telegram');
                    onClose();
                  }}
                  className="px-4 py-2 bg-white/15 hover:bg-white/25 border border-white/50 text-white cursor-pointer"
                >
                  CHECK UNSEEN
                </button>
              </div>
            </div>
          )}

          {tab === 'github' && (
            <div className="p-3.5 border border-white/25 bg-black/50 space-y-3">
              <div className="text-amber-300 font-bold">
                GITHUB UNSEEN NOTIFICATIONS &amp; REPO MONITOR
              </div>
              <input
                type="password"
                value={gh.token}
                onChange={(e) =>
                  onChangeCommsVault({
                    ...commsVault,
                    github: { ...gh, token: e.target.value, authorized: Boolean(e.target.value.trim()) },
                  })
                }
                placeholder="ghp_... (GitHub Classic Token with notifications scope)"
                className="w-full bg-black/75 border border-white/35 p-2 text-white"
              />
              <button
                type="button"
                onClick={() => {
                  onCheckUnseenNow('github');
                  onClose();
                }}
                className="w-full py-2 bg-white/15 hover:bg-white/25 border border-white/50 text-white cursor-pointer"
              >
                FETCH UNREAD GITHUB NOTIFICATIONS
              </button>
            </div>
          )}

          {statusBanner && (
            <div className="p-3 border border-amber-400/50 bg-black/75 text-amber-200 leading-relaxed">
              {statusBanner}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/20 flex justify-end bg-black/40">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 bg-white/15 hover:bg-white/25 border border-white/60 font-mono-tech text-xs text-white cursor-pointer"
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
};
