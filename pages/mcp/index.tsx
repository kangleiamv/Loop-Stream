import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Layout from '@/components/Layout';
import axios from 'axios';
import toast from 'react-hot-toast';
import { copyToClipboard as copyUniversal } from '@/lib/clipboard';

export default function McpPage() {
  const [mcpData, setMcpData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'claude' | 'cursor' | 'chatgpt' | 'http'>('claude');
  const [selectedTool, setSelectedTool] = useState('list_streams');
  const [toolParams, setToolParams] = useState<Record<string, any>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  useEffect(() => {
    fetchMcpInfo();
  }, []);

  const fetchMcpInfo = async () => {
    try {
      setIsLoading(true);
      const res = await axios.get('/api/mcp');
      setMcpData(res.data);
      if (res.data.apiKey) {
        setApiKey(res.data.apiKey);
      }

      // Also fetch primary key from api-keys table
      try {
        const keyRes = await axios.get('/api/settings/api-keys');
        if (keyRes.data.primaryKey) {
          setApiKey(keyRes.data.primaryKey);
        }
      } catch {}
    } catch (err: any) {
      toast.error('Failed to load MCP server information');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateKey = async () => {
    try {
      setIsGeneratingKey(true);
      const res = await axios.post('/api/settings/api-keys', { name: 'MCP Console Key' });
      setApiKey(res.data.key.key);
      toast.success('Generated fresh API Key and updated configurations!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to generate API key');
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const executeTool = async () => {
    try {
      setIsExecuting(true);
      setExecutionResult(null);

      const res = await axios.post('/api/mcp', {
        method: 'tools/call',
        params: {
          name: selectedTool,
          arguments: toolParams,
        },
      });

      setExecutionResult(res.data.result?.data || res.data.result || res.data);
      toast.success(`Executed ${selectedTool} successfully`);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message;
      setExecutionResult({ error: msg });
      toast.error(`Tool execution failed: ${msg}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    if (!text) {
      toast.error(`No ${label} available to copy`);
      return;
    }
    const ok = await copyUniversal(text);
    if (ok) {
      setCopiedLabel(label);
      setTimeout(() => setCopiedLabel(null), 2000);
      toast.success(`${label} copied to clipboard!`);
    } else {
      toast.error(`Could not copy ${label} to clipboard automatically`);
    }
  };

  const effectiveApiKey = apiKey || 'ls_live_default_key';

  const claudeConfigJson = JSON.stringify(
    {
      mcpServers: {
        loopstream: {
          command: 'node',
          args: ['/home/ubuntu/loopstream/QC-Live/scripts/mcp-server.js'],
          env: {
            LOOPSTREAM_API_BASE: typeof window !== 'undefined' ? `${window.location.origin}` : 'http://127.0.0.1:3000',
            LOOPSTREAM_API_KEY: effectiveApiKey,
            LOOPSTREAM_INTERNAL_KEY: 'loopstream-internal-mcp-key',
          },
        },
      },
    },
    null,
    2
  );

  const cursorConfigJson = JSON.stringify(
    {
      mcpServers: {
        loopstream: {
          command: 'node',
          args: ['/home/ubuntu/loopstream/QC-Live/scripts/mcp-server.js'],
          env: {
            LOOPSTREAM_API_BASE: typeof window !== 'undefined' ? `${window.location.origin}` : 'http://127.0.0.1:3000',
            LOOPSTREAM_API_KEY: effectiveApiKey,
          },
        },
      },
    },
    null,
    2
  );

  const chatgptConfigJson = JSON.stringify(
    {
      mcpServers: {
        loopstream: {
          command: 'node',
          args: ['/home/ubuntu/loopstream/QC-Live/scripts/mcp-server.js'],
          env: {
            LOOPSTREAM_API_BASE: typeof window !== 'undefined' ? `${window.location.origin}` : 'http://127.0.0.1:3000',
            LOOPSTREAM_API_KEY: effectiveApiKey,
            LOOPSTREAM_INTERNAL_KEY: 'loopstream-internal-mcp-key',
          },
        },
      },
    },
    null,
    2
  );

  const customGptSchemaJson = JSON.stringify(
    {
      openapi: '3.1.0',
      info: {
        title: 'LOOP STREAM Broadcast Control',
        description: 'Control live 24/7 video streaming, hot-swap media, and monitor RTMP telemetry',
        version: '1.0.0',
      },
      servers: [
        {
          url: typeof window !== 'undefined' ? `${window.location.origin}` : 'http://127.0.0.1:3000',
        },
      ],
      paths: {
        '/api/mcp': {
          post: {
            operationId: 'callMcpTool',
            summary: 'Execute LoopStream MCP Tool',
            description: 'Run commands: list_streams, get_stream, start_stream, stop_stream, switch_stream_video, create_stream, import_youtube_video, get_system_stats',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      method: { type: 'string', example: 'tools/call' },
                      params: {
                        type: 'object',
                        properties: {
                          name: { type: 'string', description: 'Tool name to call' },
                          arguments: { type: 'object', description: 'Arguments for the tool' },
                        },
                        required: ['name'],
                      },
                    },
                    required: ['method', 'params'],
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Tool execution result',
              },
            },
          },
        },
      },
    },
    null,
    2
  );

  return (
    <Layout>
      <Head>
        <title>AI &amp; MCP Console - LOOP STREAM by CMAISNAM</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 selection:bg-white selection:text-black">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
                AI &amp; MCP Engine
              </h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Model Context Protocol Active
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Connect Claude Desktop, Cursor, and AI agents to manage broadcasts, hot-swap videos, and monitor telemetry
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchMcpInfo}
              className="px-3.5 py-2 text-xs font-medium rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/10 transition-all backdrop-blur-md"
            >
              Refresh Info
            </button>
          </div>
        </div>

        {/* Feature Overview Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-xl p-5 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">🤖</span>
              <h3 className="text-sm font-bold text-white">Full AI Autonomy</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              AI assistants can start, stop, monitor, or create 24/7 continuous streams and relay channels programmatically.
            </p>
          </div>

          <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-xl p-5 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">⚡</span>
              <h3 className="text-sm font-bold text-white">Zero-Drop Video Switch</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              AI agents can call <code>switch_stream_video</code> to swap playing videos in real time with zero stream disconnection.
            </p>
          </div>

          <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-xl p-5 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">🛡️</span>
              <h3 className="text-sm font-bold text-white">Watchdog &amp; Recovery</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Background watchdog daemon automatically restarts crashed broadcasts and triggers scheduled start/stop timers.
            </p>
          </div>
        </div>

        {/* API Key Quick Bar */}
        <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl p-5 mb-8 shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-base shadow-[0_0_15px_rgba(52,211,153,0.2)] flex-shrink-0">
              🔑
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Active API Key</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Ready for ChatGPT &amp; MCP
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-xs font-mono text-zinc-300 bg-black/60 px-2.5 py-1 rounded border border-white/10">
                  {apiKey ? `${apiKey.substring(0, 12)}••••••••••••${apiKey.substring(apiKey.length - 4)}` : 'Loading API key...'}
                </code>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => copyToClipboard(apiKey, 'Active API Key')}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/10 transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              <span>{copiedLabel === 'Active API Key' ? '✓ Copied!' : 'Copy Key'}</span>
            </button>
            <button
              type="button"
              onClick={handleGenerateKey}
              disabled={isGeneratingKey}
              className="px-4 py-2 bg-white text-black font-semibold text-xs rounded-xl hover:bg-zinc-200 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)] disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>⚡</span>
              <span>{isGeneratingKey ? 'Generating...' : 'Generate New Key'}</span>
            </button>
          </div>
        </div>

        {/* Client Configuration Box */}
        <div className="backdrop-blur-2xl bg-white/[0.03] border border-white/10 rounded-2xl p-6 mb-8 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Client Connection Setup</h2>
              <p className="text-xs text-zinc-400">Copy-paste into your Claude Desktop, Cursor, or ChatGPT configuration</p>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-lg border border-white/10">
              <button
                onClick={() => setActiveTab('claude')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeTab === 'claude' ? 'bg-white text-black shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Claude Desktop
              </button>
              <button
                onClick={() => setActiveTab('cursor')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeTab === 'cursor' ? 'bg-white text-black shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Cursor IDE
              </button>
              <button
                onClick={() => setActiveTab('chatgpt')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeTab === 'chatgpt' ? 'bg-white text-black shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                ChatGPT
              </button>
              <button
                onClick={() => setActiveTab('http')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeTab === 'http' ? 'bg-white text-black shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                HTTP / JSON-RPC
              </button>
            </div>
          </div>

          {activeTab === 'claude' && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-zinc-400 font-mono">claude_desktop_config.json</span>
                <button
                  onClick={() => copyToClipboard(claudeConfigJson, 'Claude configuration')}
                  className="text-xs px-3 py-1 bg-white text-black font-semibold rounded hover:bg-zinc-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                >
                  {copiedLabel === 'Claude configuration' ? '✓ Copied!' : 'Copy JSON'}
                </button>
              </div>
              <pre className="p-4 rounded-xl bg-black/60 border border-white/10 text-emerald-400 font-mono text-xs overflow-x-auto">
                {claudeConfigJson}
              </pre>
            </div>
          )}

          {activeTab === 'cursor' && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-zinc-400 font-mono">~/.cursor/mcp.json</span>
                <button
                  onClick={() => copyToClipboard(cursorConfigJson, 'Cursor configuration')}
                  className="text-xs px-3 py-1 bg-white text-black font-semibold rounded hover:bg-zinc-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                >
                  {copiedLabel === 'Cursor configuration' ? '✓ Copied!' : 'Copy JSON'}
                </button>
              </div>
              <pre className="p-4 rounded-xl bg-black/60 border border-white/10 text-emerald-400 font-mono text-xs overflow-x-auto">
                {cursorConfigJson}
              </pre>
            </div>
          )}

          {activeTab === 'chatgpt' && (
            <div className="space-y-6">
              {/* Option A: ChatGPT Desktop App */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <div>
                    <span className="text-xs font-bold text-white">Method 1: ChatGPT Desktop App (Native MCP)</span>
                    <span className="block text-[11px] text-zinc-400 font-mono mt-0.5">
                      ~/Library/Application Support/OpenAI/ChatGPT/mcp_servers.json or App Settings → Developer
                    </span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(chatgptConfigJson, 'ChatGPT Desktop MCP configuration')}
                    className="text-xs px-3 py-1 bg-white text-black font-semibold rounded hover:bg-zinc-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                  >
                    {copiedLabel === 'ChatGPT Desktop MCP configuration' ? '✓ Copied!' : 'Copy MCP JSON'}
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-black/60 border border-white/10 text-emerald-400 font-mono text-xs overflow-x-auto">
                  {chatgptConfigJson}
                </pre>
              </div>

              {/* Option B: Custom GPT on ChatGPT Web */}
              <div className="pt-4 border-t border-white/10">
                <div className="flex justify-between items-center mb-1.5">
                  <div>
                    <span className="text-xs font-bold text-white">Method 2: Custom GPT (ChatGPT Web / Custom Actions)</span>
                    <span className="block text-[11px] text-zinc-400 mt-0.5">
                      OpenAI GPTs → Configure → Create new action → Paste OpenAPI 3.1 Schema
                    </span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(customGptSchemaJson, 'Custom GPT OpenAPI Schema')}
                    className="text-xs px-3 py-1 bg-emerald-400 text-black font-semibold rounded hover:bg-emerald-300 transition-colors shadow-[0_0_15px_rgba(52,211,153,0.3)]"
                  >
                    {copiedLabel === 'Custom GPT OpenAPI Schema' ? '✓ Copied!' : 'Copy OpenAPI Schema'}
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-black/60 border border-white/10 text-cyan-300 font-mono text-xs overflow-x-auto max-h-64">
                  {customGptSchemaJson}
                </pre>
                <div className="mt-2 text-[11px] text-zinc-400 bg-white/[0.03] p-3 rounded-lg border border-white/5 space-y-1">
                  <p>🔑 <strong>Authentication in Custom GPT:</strong></p>
                  <p>1. In Custom GPT Actions, select <strong>Authentication</strong>: <em>API Key</em></p>
                  <p>2. Auth Type: <em>Custom Header</em> → Header Name: <code className="text-white bg-white/10 px-1 rounded">x-api-key</code></p>
                  <p>3. API Key Value: <code className="text-white bg-white/10 px-1 rounded">{effectiveApiKey}</code></p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'http' && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-zinc-400">Endpoint: <code>POST /api/mcp</code></span>
                <button
                  onClick={() =>
                    copyToClipboard(
                      `curl -X POST http://localhost:3000/api/mcp -H "Content-Type: application/json" -H "x-api-key: ${effectiveApiKey}" -d '{"method":"tools/call","params":{"name":"list_streams"}}'`,
                      'cURL command'
                    )
                  }
                  className="text-xs px-3 py-1 bg-white text-black font-semibold rounded hover:bg-zinc-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                >
                  {copiedLabel === 'cURL command' ? '✓ Copied!' : 'Copy cURL'}
                </button>
              </div>
              <pre className="p-4 rounded-xl bg-black/60 border border-white/10 text-cyan-400 font-mono text-xs overflow-x-auto">
                {`curl -X POST http://localhost:3000/api/mcp \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${effectiveApiKey}" \\
  -d '{"method":"tools/call","params":{"name":"list_streams"}}'`}
              </pre>
            </div>
          )}
        </div>

        {/* Interactive In-Browser MCP Tool Console */}
        <div className="backdrop-blur-2xl bg-white/[0.03] border border-white/10 rounded-2xl p-6 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
          <div className="mb-6 pb-3 border-b border-white/10 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Interactive MCP Tool Tester</h2>
              <p className="text-xs text-zinc-400">Execute any Model Context Protocol tool in real-time</p>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-white font-mono">
              13 Tools Ready
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tool Selection & Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                  Select MCP Tool
                </label>
                <select
                  value={selectedTool}
                  onChange={(e) => {
                    setSelectedTool(e.target.value);
                    setToolParams({});
                  }}
                  className="w-full px-3.5 py-2.5 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-white focus:bg-zinc-900 transition-all font-mono"
                >
                  <option value="list_streams" className="bg-zinc-900 text-white">list_streams - List all streams &amp; telemetry</option>
                  <option value="import_youtube_video" className="bg-zinc-900 text-white">import_youtube_video - Download YouTube video to library</option>
                  <option value="get_system_stats" className="bg-zinc-900 text-white">get_system_stats - CPU, RAM &amp; disk usage</option>
                  <option value="get_rtmp_status" className="bg-zinc-900 text-white">get_rtmp_status - RTMP Ingest &amp; OBS connections</option>
                  <option value="generate_rtmp_key" className="bg-zinc-900 text-white">generate_rtmp_key - Generate new OBS stream key</option>
                  <option value="list_videos" className="bg-zinc-900 text-white">list_videos - List video files library</option>
                  <option value="get_stream" className="bg-zinc-900 text-white">get_stream - Inspect specific stream by ID</option>
                  <option value="start_stream" className="bg-zinc-900 text-white">start_stream - Start broadcast by ID</option>
                  <option value="stop_stream" className="bg-zinc-900 text-white">stop_stream - Stop broadcast by ID</option>
                  <option value="switch_stream_video" className="bg-zinc-900 text-white">switch_stream_video - Zero-drop hot-swap video</option>
                  <option value="delete_stream" className="bg-zinc-900 text-white">delete_stream - Delete stream</option>
                </select>
              </div>

              {/* Dynamic Arguments Input */}
              {selectedTool === 'import_youtube_video' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      YouTube URL (url) *
                    </label>
                    <input
                      type="text"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={toolParams.url || ''}
                      onChange={(e) => setToolParams({ ...toolParams, url: e.target.value })}
                      className="w-full px-3.5 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Custom Title (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. My Intro Video"
                      value={toolParams.custom_title || ''}
                      onChange={(e) => setToolParams({ ...toolParams, custom_title: e.target.value })}
                      className="w-full px-3.5 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white"
                    />
                  </div>
                </div>
              )}

              {(selectedTool === 'get_stream' || selectedTool === 'start_stream' || selectedTool === 'stop_stream' || selectedTool === 'delete_stream') && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Stream ID (stream_id)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 1"
                    value={toolParams.stream_id || ''}
                    onChange={(e) => setToolParams({ ...toolParams, stream_id: parseInt(e.target.value, 10) })}
                    className="w-full px-3.5 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white font-mono"
                  />
                </div>
              )}

              {selectedTool === 'switch_stream_video' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">Stream ID</label>
                    <input
                      type="number"
                      placeholder="e.g. 1"
                      value={toolParams.stream_id || ''}
                      onChange={(e) => setToolParams({ ...toolParams, stream_id: parseInt(e.target.value, 10) })}
                      className="w-full px-3.5 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">New Video ID</label>
                    <input
                      type="number"
                      placeholder="e.g. 2"
                      value={toolParams.video_id || ''}
                      onChange={(e) => setToolParams({ ...toolParams, video_id: parseInt(e.target.value, 10) })}
                      className="w-full px-3.5 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-white font-mono"
                    />
                  </div>
                </div>
              )}

              <button
                onClick={executeTool}
                disabled={isExecuting}
                className="w-full py-3 px-4 bg-white text-black font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.25)] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isExecuting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                    Executing Tool...
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    Execute Tool via MCP
                  </>
                )}
              </button>
            </div>

            {/* Live Result Output */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  MCP Tool Execution Output
                </span>
                {executionResult && (
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(executionResult, null, 2), 'Result')}
                    className="text-[11px] text-zinc-400 hover:text-white underline"
                  >
                    {copiedLabel === 'Result' ? '✓ Copied Output!' : 'Copy Output'}
                  </button>
                )}
              </div>
              <div className="p-4 rounded-xl bg-black/60 border border-white/10 h-64 overflow-y-auto font-mono text-xs text-zinc-300 shadow-inner">
                {executionResult ? (
                  <pre className="text-emerald-400 whitespace-pre-wrap">
                    {JSON.stringify(executionResult, null, 2)}
                  </pre>
                ) : (
                  <div className="h-full flex items-center justify-center text-zinc-600 text-xs italic">
                    Select a tool and click execute to view live MCP response...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
