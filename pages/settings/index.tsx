import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Layout from '@/components/Layout';
import axios from 'axios';
import toast from 'react-hot-toast';
import { copyToClipboard } from '@/lib/clipboard';

interface CookieStatus {
  configured: boolean;
  totalCount: number;
  youtubeCount: number;
  hasAuthCookies: boolean;
  detectedAuthCookies: string[];
  updatedAt: string | null;
  fileSize: number;
  rawJson: string;
  source: 'file' | 'db' | 'none';
}

interface TestResult {
  success: boolean;
  id?: string;
  title?: string;
  uploader?: string;
  thumbnail?: string;
  durationFormatted?: string;
  resolution?: string;
  viewCount?: number;
  message?: string;
  error?: string;
  requiresCookies?: boolean;
  isPrivate?: boolean;
}

interface ApiKeyItem {
  id: number;
  name: string;
  key: string;
  created_at: string;
  last_used?: string | null;
}

export default function SettingsPage() {
  const [cookieStatus, setCookieStatus] = useState<CookieStatus | null>(null);
  const [cookieJson, setCookieJson] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // API Key state
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Record<number, boolean>>({});
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // Test state
  const [testUrl, setTestUrl] = useState('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Guide toggle
  const [showGuide, setShowGuide] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCookieStatus();
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      setIsLoadingKeys(true);
      const res = await axios.get('/api/settings/api-keys');
      if (res.data.keys) {
        setApiKeys(res.data.keys);
      }
    } catch (err: any) {
      console.error('Failed to load API keys:', err);
    } finally {
      setIsLoadingKeys(false);
    }
  };

  const handleGenerateApiKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setIsGeneratingKey(true);
      const res = await axios.post('/api/settings/api-keys', {
        name: newKeyName.trim() || 'New API Key',
      });
      toast.success(`Generated API key: "${res.data.key.name}"`);
      setNewKeyName('');
      setShowGenerateModal(false);
      fetchApiKeys();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to generate API key');
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleDeleteApiKey = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to revoke API key "${name}"? External apps using this key will immediately lose access.`)) {
      return;
    }
    try {
      await axios.delete(`/api/settings/api-keys/${id}`);
      toast.success(`API key "${name}" revoked`);
      fetchApiKeys();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to revoke API key');
    }
  };

  const toggleRevealKey = (id: number) => {
    setRevealedKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyKeyToClipboard = async (key: string, name: string, id: number) => {
    const ok = await copyToClipboard(key);
    if (ok) {
      setCopiedKeyId(id);
      setTimeout(() => setCopiedKeyId(null), 2000);
      toast.success(`API Key (${name}) copied!`);
    } else {
      toast.error('Could not copy API Key to clipboard automatically');
    }
  };

  const handleCopyJson = async () => {
    if (!cookieJson.trim()) {
      toast.error('No cookies JSON to copy');
      return;
    }
    const ok = await copyToClipboard(cookieJson);
    if (ok) {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
      toast.success('cookies.json copied to clipboard!');
    } else {
      toast.error('Could not copy cookies.json automatically');
    }
  };

  const fetchCookieStatus = async () => {
    try {
      setIsLoading(false);
      const res = await axios.get('/api/settings/cookies');
      setCookieStatus(res.data);
      if (res.data.rawJson) {
        setCookieJson(res.data.rawJson);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load cookies configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormatJson = () => {
    if (!cookieJson.trim()) {
      toast.error('Editor is empty');
      return;
    }

    try {
      // Check if it's JSON
      const parsed = JSON.parse(cookieJson.trim());
      const formatted = JSON.stringify(parsed, null, 2);
      setCookieJson(formatted);
      toast.success('JSON formatted successfully!');
    } catch (err: any) {
      // If not JSON, see if it looks like Netscape format
      if (cookieJson.includes('\t') || cookieJson.startsWith('#')) {
        toast('Detected Netscape format. It will be converted to JSON upon saving.', { icon: 'ℹ️' });
      } else {
        toast.error(`Invalid JSON: ${err.message}`);
      }
    }
  };

  const handleValidateJson = () => {
    if (!cookieJson.trim()) {
      toast.error('Cookie editor is empty');
      return;
    }

    try {
      const parsed = JSON.parse(cookieJson.trim());
      if (!Array.isArray(parsed) && typeof parsed !== 'object') {
        toast.error('Cookies must be an array of cookie objects or a key-value object.');
        return;
      }
      const count = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
      toast.success(`Valid format! Detected ${count} cookies.`);
    } catch (err: any) {
      if (cookieJson.includes('\t') || cookieJson.startsWith('#')) {
        toast.success('Valid Netscape cookie format detected!');
      } else {
        toast.error(`Invalid syntax: ${err.message}`);
      }
    }
  };

  const handleSaveCookies = async () => {
    if (!cookieJson.trim()) {
      toast.error('Please enter or upload cookie data before saving.');
      return;
    }

    try {
      setIsSaving(true);
      const res = await axios.post('/api/settings/cookies', {
        cookies: cookieJson.trim(),
      });

      setCookieStatus(res.data);
      if (res.data.rawJson) {
        setCookieJson(res.data.rawJson);
      }
      toast.success(res.data.message || 'cookies.json saved successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save cookies.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCookies = async () => {
    if (!confirm('Are you sure you want to clear saved YouTube cookies? YouTube extraction may fail on restricted videos without cookies.')) {
      return;
    }

    try {
      setIsDeleting(true);
      const res = await axios.delete('/api/settings/cookies');
      setCookieStatus(res.data);
      setCookieJson('');
      setTestResult(null);
      toast.success('Cookies cleared.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to clear cookies.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setCookieJson(content);
        try {
          const parsed = JSON.parse(content);
          const pretty = JSON.stringify(parsed, null, 2);
          setCookieJson(pretty);
          toast.success(`Loaded ${file.name} (${Array.isArray(parsed) ? parsed.length : 'JSON'} cookies)`);
        } catch {
          toast.success(`Loaded ${file.name}`);
        }
      }
    };

    reader.onerror = () => {
      toast.error('Failed to read uploaded file.');
    };

    reader.readAsText(file);
    // Reset file input so same file can be chosen again
    e.target.value = '';
  };

  const handleRunTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testUrl.trim()) return;

    try {
      setIsTesting(true);
      setTestResult(null);
      const res = await axios.post('/api/settings/cookies/test', {
        url: testUrl.trim(),
      });
      setTestResult(res.data);
      toast.success('YouTube extraction test succeeded!');
    } catch (err: any) {
      const data = err.response?.data;
      setTestResult({
        success: false,
        error: data?.error || err.message || 'YouTube extraction failed.',
        requiresCookies: data?.requiresCookies,
        isPrivate: data?.isPrivate,
      });
      toast.error('YouTube extraction test failed.');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Layout>
      <Head>
        <title>Settings &amp; YouTube Cookies - LOOP STREAM by CMAISNAM</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 selection:bg-white selection:text-black">
        {/* Page Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10 text-white border border-white/10">
                Configuration
              </span>
              <span className="text-zinc-500 text-xs">•</span>
              <span className="text-zinc-400 text-xs">YouTube Authentication &amp; Settings</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              Settings &amp; Cookies
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
              Configure <code className="text-white bg-white/10 px-1 py-0.5 rounded font-mono text-[11px]">cookies.json</code> to bypass YouTube bot detection and authenticate video extraction.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white border border-white/10 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{showGuide ? 'Hide Export Guide' : 'How to get cookies.json'}</span>
            </button>
          </div>
        </div>

        {/* Step-by-Step Export Guide Accordion */}
        {showGuide && (
          <div className="mb-8 p-6 rounded-2xl bg-amber-500/[0.05] border border-amber-500/20 backdrop-blur-xl animate-fadeIn">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
                  💡
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">How to Export cookies.json from your Browser</h2>
                  <p className="text-xs text-zinc-400">Takes less than 60 seconds with the free Cookie-Editor browser extension.</p>
                </div>
              </div>
              <button
                onClick={() => setShowGuide(false)}
                className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <span className="w-5 h-5 rounded-full bg-amber-400/20 flex items-center justify-center text-[10px]">1</span>
                  <span>Install Extension</span>
                </div>
                <p className="text-zinc-300">
                  Install <a href="https://cookie-editor.com" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2 hover:text-amber-300">Cookie-Editor</a> on Chrome, Edge, Firefox, or Brave.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <span className="w-5 h-5 rounded-full bg-amber-400/20 flex items-center justify-center text-[10px]">2</span>
                  <span>Log in to YouTube</span>
                </div>
                <p className="text-zinc-300">
                  Open a new tab, navigate to <span className="text-white font-mono">youtube.com</span>, and make sure you are signed in.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <span className="w-5 h-5 rounded-full bg-amber-400/20 flex items-center justify-center text-[10px]">3</span>
                  <span>Export as JSON</span>
                </div>
                <p className="text-zinc-300">
                  Click the Cookie-Editor puzzle icon on YouTube, click <strong className="text-white">Export</strong> at the bottom, and select <strong className="text-white">Export as JSON</strong>.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <span className="w-5 h-5 rounded-full bg-amber-400/20 flex items-center justify-center text-[10px]">4</span>
                  <span>Paste &amp; Save</span>
                </div>
                <p className="text-zinc-300">
                  Paste the JSON into the editor below (or click <strong className="text-white">Upload File</strong>) and click <strong className="text-white">Save cookies.json</strong>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Top Status & Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Status Metric */}
          <div className="p-5 rounded-2xl bg-white/[0.025] border border-white/10 backdrop-blur-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Cookie Status</span>
              {cookieStatus?.configured ? (
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-lg font-bold tracking-tight ${cookieStatus?.configured ? 'text-emerald-400' : 'text-zinc-400'}`}>
                {cookieStatus?.configured ? 'Active & Configured' : 'Not Configured'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              {cookieStatus?.configured
                ? 'yt-dlp uses authenticated cookies'
                : 'Limited to public unauthenticated requests'}
            </p>
          </div>

          {/* Cookie Counts */}
          <div className="p-5 rounded-2xl bg-white/[0.025] border border-white/10 backdrop-blur-xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-2">Total Cookies</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{cookieStatus?.totalCount ?? 0}</span>
              <span className="text-xs text-zinc-400">({cookieStatus?.youtubeCount ?? 0} YouTube)</span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Parsed from cookies.json</p>
          </div>

          {/* Auth Tokens */}
          <div className="p-5 rounded-2xl bg-white/[0.025] border border-white/10 backdrop-blur-xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-2">Auth Credentials</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {cookieStatus?.detectedAuthCookies && cookieStatus.detectedAuthCookies.length > 0 ? (
                cookieStatus.detectedAuthCookies.slice(0, 3).map((token) => (
                  <span
                    key={token}
                    className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  >
                    {token}
                  </span>
                ))
              ) : (
                <span className="text-xs text-zinc-500">No login tokens detected</span>
              )}
              {cookieStatus?.detectedAuthCookies && cookieStatus.detectedAuthCookies.length > 3 && (
                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-white/5 text-zinc-400">
                  +{cookieStatus.detectedAuthCookies.length - 3} more
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 mt-2">Required to bypass bot checks</p>
          </div>

          {/* Last Updated */}
          <div className="p-5 rounded-2xl bg-white/[0.025] border border-white/10 backdrop-blur-xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-2">Last Updated</span>
            <span className="text-sm font-semibold text-white block mt-1">
              {cookieStatus?.updatedAt
                ? new Date(cookieStatus.updatedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Never'}
            </span>
            <p className="text-[11px] text-zinc-500 mt-1">
              Storage: <span className="font-mono text-zinc-400">./data/cookies.json</span>
            </p>
          </div>
        </div>

        {/* Main 2-Column Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Left Column: cookies.json Editor (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="p-6 rounded-2xl bg-white/[0.025] border border-white/10 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
              {/* Header inside card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <span>cookies.json Editor</span>
                    <span className="text-[11px] font-mono font-normal text-zinc-400 bg-white/5 px-2 py-0.5 rounded">
                      data/cookies.json
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Paste the exported JSON cookie array below or upload a .json file directly.
                  </p>
                </div>

                {/* Editor Action Buttons */}
                <div className="flex items-center flex-wrap gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".json,.txt"
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/10 transition-all flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span>Upload File</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/10 transition-all flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    <span>{copiedJson ? '✓ Copied JSON' : 'Copy JSON'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleFormatJson}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/10 transition-all"
                  >
                    Format JSON
                  </button>

                  <button
                    type="button"
                    onClick={handleValidateJson}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/10 transition-all"
                  >
                    Validate
                  </button>
                </div>
              </div>

              {/* Code Textarea */}
              <div className="mt-4 relative">
                <textarea
                  value={cookieJson}
                  onChange={(e) => setCookieJson(e.target.value)}
                  placeholder={`[\n  {\n    "domain": ".youtube.com",\n    "name": "__Secure-1PSID",\n    "value": "...",\n    "path": "/",\n    "secure": true,\n    "httpOnly": true\n  }\n]`}
                  rows={14}
                  className="w-full px-4 py-3 bg-black/70 border border-white/10 rounded-xl text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-white transition-all leading-relaxed resize-y selection:bg-white selection:text-black"
                  spellCheck={false}
                />
              </div>

              {/* Bottom Footer Actions */}
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2">
                  {cookieStatus?.configured && (
                    <button
                      type="button"
                      disabled={isDeleting || isSaving}
                      onClick={handleDeleteCookies}
                      className="px-3.5 py-2 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl transition-all disabled:opacity-40"
                    >
                      {isDeleting ? 'Clearing...' : 'Delete Cookies'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCookieJson('')}
                    className="px-3 py-2 text-xs text-zinc-400 hover:text-white transition-all"
                  >
                    Clear Editor
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isSaving || !cookieJson.trim()}
                    onClick={handleSaveCookies}
                    className="px-6 py-2.5 bg-white text-black font-semibold text-xs rounded-xl hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                        <span>Saving &amp; Syncing...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        <span>Save cookies.json</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Verification & Test Sandbox (1 col) */}
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-white/[0.025] border border-white/10 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
              <h2 className="text-base font-bold text-white flex items-center gap-2 mb-1">
                <span>Verify YouTube Access</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </h2>
              <p className="text-xs text-zinc-400 mb-4">
                Test whether yt-dlp successfully authenticates and extracts metadata using the saved cookies.
              </p>

              <form onSubmit={handleRunTest} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                    Test YouTube URL
                  </label>
                  <input
                    type="text"
                    value={testUrl}
                    onChange={(e) => setTestUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    disabled={isTesting}
                    className="w-full px-3.5 py-2.5 bg-black/60 border border-white/10 rounded-xl text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-all"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTestUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}
                    className="px-2.5 py-1 rounded-lg text-[10px] text-zinc-400 bg-white/5 hover:bg-white/10 border border-white/5 transition-colors"
                  >
                    Rick Astley
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestUrl('https://youtu.be/uX-j_MiHS-Y')}
                    className="px-2.5 py-1 rounded-lg text-[10px] text-zinc-400 bg-white/5 hover:bg-white/10 border border-white/5 transition-colors"
                  >
                    Bot-Check Video
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isTesting || !testUrl.trim()}
                  className="w-full mt-2 px-4 py-2.5 bg-white/[0.08] hover:bg-white/[0.15] text-white font-semibold text-xs rounded-xl border border-white/15 transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isTesting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Testing Extraction...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡</span>
                      <span>Run Verification Test</span>
                    </>
                  )}
                </button>
              </form>

              {/* Test Result Display */}
              {testResult && (
                <div className="mt-5 pt-5 border-t border-white/10 animate-fadeIn">
                  {testResult.success ? (
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                      <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Extraction Succeeded!</span>
                      </div>

                      {testResult.thumbnail && (
                        <div className="relative aspect-video rounded-lg overflow-hidden border border-white/10 bg-black">
                          <img
                            src={testResult.thumbnail}
                            alt={testResult.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      <div className="text-xs space-y-1">
                        <p className="font-semibold text-white truncate">{testResult.title}</p>
                        <p className="text-zinc-400 text-[11px]">By {testResult.uploader} • {testResult.durationFormatted}</p>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-mono">
                          {testResult.resolution}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 space-y-2 text-xs">
                      <div className="flex items-center gap-2 text-red-400 font-semibold">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span>Extraction Failed</span>
                      </div>
                      <p className="text-red-200 text-[11px] leading-relaxed">
                        {testResult.error}
                      </p>
                      {testResult.requiresCookies && (
                        <div className="pt-2 border-t border-red-500/20 text-[11px] text-zinc-300">
                          💡 <strong>Solution:</strong> YouTube bot detection was triggered. Export fresh cookies from your browser and save them in the editor on the left.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* System Diagnostics Card */}
            <div className="p-6 rounded-2xl bg-white/[0.025] border border-white/10 backdrop-blur-xl">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
                Engine Diagnostics
              </h3>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="text-zinc-400">Deno Runtime</span>
                  <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Installed (v2.9.7)
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="text-zinc-400">yt-dlp Extractor</span>
                  <span className="text-white font-mono text-[11px]">v2026.08.19</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="text-zinc-400">EJS Challenge Solver</span>
                  <span className="text-emerald-400 font-mono text-[11px]">Active</span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span className="text-zinc-400">Netscape Cookie Sync</span>
                  <span className="text-zinc-300 font-mono text-[11px]">Automatic</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* API Key Management Section */}
        <div className="p-6 rounded-2xl bg-white/[0.025] border border-white/10 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-white">API Keys &amp; External Access</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {apiKeys.length} Active
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Generate secure access tokens for ChatGPT Custom GPT Actions, Claude Desktop, Cursor, and automated REST scripts.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowGenerateModal(true)}
              className="px-4 py-2 bg-white text-black font-semibold text-xs rounded-xl hover:bg-zinc-200 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)] flex items-center gap-2 flex-shrink-0"
            >
              <span>🔑</span>
              <span>Generate API Key</span>
            </button>
          </div>

          {/* Generate Key Modal */}
          {showGenerateModal && (
            <div className="mt-4 p-4 rounded-xl bg-white/[0.04] border border-white/15 backdrop-blur-md animate-fadeIn">
              <form onSubmit={handleGenerateApiKey} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Generate New API Key</span>
                  <button
                    type="button"
                    onClick={() => setShowGenerateModal(false)}
                    className="text-xs text-zinc-400 hover:text-white"
                  >
                    ✕ Cancel
                  </button>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                    Key Description / Name
                  </label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. ChatGPT Custom Action, Claude Desktop, Home Automation"
                    className="w-full px-3.5 py-2 bg-black/60 border border-white/15 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-all"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowGenerateModal(false)}
                    className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isGeneratingKey}
                    className="px-4 py-1.5 bg-emerald-400 text-black font-semibold text-xs rounded-lg hover:bg-emerald-300 transition-all shadow-[0_0_15px_rgba(52,211,153,0.3)] disabled:opacity-50"
                  >
                    {isGeneratingKey ? 'Generating...' : 'Create Key'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* API Keys List */}
          <div className="mt-4 space-y-3">
            {isLoadingKeys ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin inline-block mr-2" />
                Loading API keys...
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400 border border-dashed border-white/10 rounded-xl">
                No API keys generated yet. Click &ldquo;Generate API Key&rdquo; above to create one.
              </div>
            ) : (
              apiKeys.map((k) => {
                const isRevealed = Boolean(revealedKeys[k.id]);
                const displayKey = isRevealed
                  ? k.key
                  : `${k.key.substring(0, 10)}${'•'.repeat(24)}${k.key.substring(k.key.length - 4)}`;

                return (
                  <div
                    key={k.id}
                    className="p-4 rounded-xl bg-black/40 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{k.name}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400">
                          Active
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-zinc-300 bg-white/5 px-2 py-1 rounded">
                          {displayKey}
                        </code>
                        <button
                          type="button"
                          onClick={() => toggleRevealKey(k.id)}
                          className="text-[11px] text-zinc-400 hover:text-white px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10"
                        >
                          {isRevealed ? 'Hide' : 'Reveal'}
                        </button>
                        <button
                          type="button"
                          onClick={() => copyKeyToClipboard(k.key, k.name, k.id)}
                          className="text-[11px] text-zinc-300 hover:text-white px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 transition-colors font-medium flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                          </svg>
                          <span>{copiedKeyId === k.id ? '✓ Copied' : 'Copy Key'}</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                        <span>Created: {new Date(k.created_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>Last used: {k.last_used ? new Date(k.last_used).toLocaleDateString() : 'Never'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-auto">
                      <button
                        type="button"
                        onClick={() => handleDeleteApiKey(k.id, k.name)}
                        className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors"
                      >
                        Revoke Key
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Authentication Guide */}
          <div className="mt-5 p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2 text-xs">
            <span className="font-semibold text-zinc-300 block">How to use your API Key:</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
              <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 font-mono">
                <span className="text-zinc-500 block mb-1"># HTTP Header (Recommended)</span>
                <span className="text-emerald-400">x-api-key:</span> <span className="text-zinc-300">ls_live_...</span>
              </div>
              <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 font-mono">
                <span className="text-zinc-500 block mb-1"># Bearer Token</span>
                <span className="text-cyan-400">Authorization:</span> <span className="text-zinc-300">Bearer ls_live_...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
