import React, { useState } from 'react';
import { requestChat } from '../lib/xbo-chat-client.js';
import { requestV0Chat } from '../lib/v0-chat-client.js';
import { PlanChecklist } from './PlanChecklist.tsx';
import { CodeProposalView } from './CodeProposalView.tsx';
import { ArrowUp, Bot, Check, CheckCircle2, ChevronDown, Code2, Copy, Github, LayoutDashboard, ListChecks, MessageSquare, Paperclip, PanelLeft, Sparkles, X } from 'lucide-react';
import { createBuildPlan } from '../utils/buildPlanner.js';

const MODEL_OPTIONS = [
  { value: 'zsk', label: 'Agents' },
  { value: 'ohmaba', label: 'Ohmaba Agent' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'qwen', label: 'Qwen' },
  { value: 'claude', label: 'Claude' },
  { value: 'v0', label: 'v0 Builder' }
];

const STARTER_PROMPTS = [
  {
    title: 'SaaS Landing Page',
    description: 'Trang giới thiệu sản phẩm có pricing',
    icon: LayoutDashboard,
    prompt: 'Tạo SaaS landing page responsive theo phong cách OCODE.js, gồm hero, tính năng, pricing và CTA.'
  },
  {
    title: 'Analytics Dashboard',
    description: 'KPI, biểu đồ và bộ lọc',
    icon: Code2,
    prompt: 'Thiết kế dashboard phân tích doanh thu dark mode với KPI cards, biểu đồ và bộ lọc; dùng dữ liệu mẫu được ghi rõ.'
  },
  {
    title: 'Contact Form',
    description: 'Form có validation và trạng thái lỗi',
    icon: MessageSquare,
    prompt: 'Tạo contact form responsive, có label accessible, validation, trạng thái gửi thành công và lỗi.'
  }
];

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  workspaceMode?: 'chat' | 'plan';
}

interface AIChatPanelProps {
  selectedModel: string;
  onSelectModel: (model: string) => void;
}

export const AIChatPanel: React.FC<AIChatPanelProps> = ({ selectedModel, onSelectModel }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'system',
      content: 'Ask OCode.js sẵn sàng nhận yêu cầu. Mô tả ứng dụng bạn muốn xây dựng để bắt đầu.'
    }
  ]);
  const [input, setInput] = useState('');
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<'chat' | 'plan'>('chat');
  const [status, setStatus] = useState<{ type: 'info' | 'error'; text: string } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const [v0Chat, setV0Chat] = useState<{ chatId: string; chatToken: string } | null>(null);
  const isWelcome = messages.length <= 1;
  const localBuildPlan = createBuildPlan(input);

  const handleSend = async () => {
    const trimmed = input.trim();
    if ((!trimmed && !attachedFile) || isSending) return;
    const visibleMessage = `${trimmed}${attachedFile ? `\n\n[Tệp đính kèm: ${attachedFile.name}]` : ''}`.trim();

    setMessages(prev => [...prev, { role: 'user', content: visibleMessage }]);
    setInput('');
    setIsSending(true);
    setStatus(null);

    try {
      const promptWithAttachment = attachedFile
        ? `${trimmed || 'Hãy đọc và phân tích tệp đính kèm.'}\n\nNỘI DUNG TỆP: ${attachedFile.name}\n\`\`\`\n${attachedFile.content}\n\`\`\``
        : trimmed;
      const requestMessage = workspaceMode === 'plan'
        ? `Yêu cầu sản phẩm: ${promptWithAttachment}\n\nHãy lập kế hoạch gồm mục tiêu, giả định, file dự kiến, tác vụ theo thứ tự, kiểm thử, rủi ro/bảo mật và tiêu chí nghiệm thu. Không tuyên bố đã tạo/sửa file và không triển khai production.`
        : promptWithAttachment;
      let content: string;
      if (selectedModel === 'v0') {
        const result = await requestV0Chat({
          message: requestMessage,
          chat: v0Chat,
          apiBase: import.meta.env.VITE_API_BASE_URL || '',
        });
        setV0Chat(result.chat);
        content = result.response;
      } else {
        content = await requestChat({
          message: requestMessage,
          model: selectedModel,
          apiBase: import.meta.env.VITE_API_BASE_URL || ''
        });
      }
      setMessages(prev => [...prev, { role: 'assistant', content, workspaceMode }]);
      setAttachedFile(null);
      setStatus({ type: 'info', text: workspaceMode === 'plan' ? 'Đã nhận kế hoạch đề xuất; chưa sửa file hay triển khai.' : 'Đã nhận phản hồi từ agent.' });
    } catch (err) {
      // Keep the prompt available for retry without leaving a duplicate failed message in history.
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        return lastMessage?.role === 'user' && lastMessage.content === visibleMessage
          ? prev.slice(0, -1)
          : prev;
      });
      setInput(trimmed);
      setStatus({ type: 'error', text: err instanceof Error ? err.message : 'Lỗi khi gọi agent.' });
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyMessage = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessage(index);
      setStatus({ type: 'info', text: 'Đã sao chép nội dung phản hồi.' });
    } catch {
      setStatus({ type: 'error', text: 'Không thể truy cập clipboard. Hãy chọn và sao chép nội dung thủ công.' });
    }
  };
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const allowed = /\.(txt|md|mdx|json|csv|tsv|js|jsx|ts|tsx|html|css|scss|xml|yaml|yml|toml|ini|log|py|go|rs|java|sql|sh|diff|patch)$/i;
    if (!allowed.test(file.name)) {
      setStatus({ type: 'error', text: 'Tệp chưa được hỗ trợ. Hãy chọn tệp văn bản, Markdown, CSV, JSON hoặc mã nguồn.' });
      return;
    }
    if (file.size > 1024 * 1024) {
      setStatus({ type: 'error', text: 'Tệp vượt giới hạn 1 MB. Hãy chọn tệp nhỏ hơn.' });
      return;
    }
    try {
      const content = await file.text();
      setAttachedFile({ name: file.name, content });
      setStatus({ type: 'info', text: `Đã đính kèm ${file.name}; nội dung sẽ được gửi cho agent.` });
    } catch {
      setStatus({ type: 'error', text: 'Không đọc được tệp. Hãy thử tệp văn bản UTF-8.' });
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleSend();
    }
  };

  const useTemplate = (prompt: string) => {
    setInput(prompt);
    setStatus({ type: 'info', text: 'Đã thêm prompt mẫu. Xem lại rồi gửi để bắt đầu.' });
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#070910] text-white">
      {workspaceMode === 'plan' && input.trim() && (
        <section aria-label="Kế hoạch xây dựng sơ bộ" className="mx-4 mt-3 border border-indigo-400/20 bg-indigo-400/[0.035] p-4 sm:mx-6 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100"><ListChecks size={16} className="text-indigo-300" /> Kế hoạch đề xuất</div>
              <p className="mt-1 text-xs leading-5 text-neutral-500">Tạo tại trình duyệt từ prompt hiện tại. Chỉ là kế hoạch sơ bộ, chưa tạo hoặc sửa mã nguồn.</p>
            </div>
            <span className="shrink-0 border border-white/10 px-2 py-1 text-[10px] text-neutral-400">{localBuildPlan.length} bước</span>
          </div>
          <ol className="mt-4 space-y-3">
            {localBuildPlan.map((task, index) => (
              <li key={task.id} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-indigo-400/25 text-[10px] text-indigo-200">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <div className="text-xs font-medium text-neutral-200">{task.title}</div>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">{task.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-center gap-2 border-t border-white/[0.07] pt-3 text-[11px] text-neutral-500"><CheckCircle2 size={13} className="text-indigo-300" /> Xem lại prompt rồi gửi cho agent khi sẵn sàng.</div>
        </section>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {isWelcome ? (
          <main className="ocode-home mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-8 sm:px-8">
            <div className="ocode-home-content mx-auto w-full">
              <div className="mb-7 flex flex-col items-center gap-3 text-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-neutral-300">
                  <Sparkles size={14} aria-hidden="true" /> Open-source AI App Builder
                </span>
                <h1 className="ocode-home-title">Build something remarkable.</h1>
                <p className="max-w-xl text-sm leading-6 text-neutral-400">Describe your idea in plain language. Start with a prompt and refine your app with AI.</p>
              </div>
              <div className="ocode-prompt-box">
                <label htmlFor="xbo-prompt" className="sr-only">Mô tả ứng dụng muốn xây dựng</label>
                <textarea id="xbo-prompt" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder="Ask OCode.js to build..."
                  className="ocode-prompt-input" />
                <div className="ocode-prompt-toolbar">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 border border-white/10 px-3 py-2 text-xs text-neutral-300 transition hover:border-indigo-300/40 hover:text-white" title="Đính kèm tệp văn bản cho agent"><Paperclip size={14} /> <span>Úp file</span><input type="file" className="sr-only" accept=".txt,.md,.mdx,.json,.csv,.tsv,.js,.jsx,.ts,.tsx,.html,.css,.scss,.xml,.yaml,.yml,.toml,.ini,.log,.py,.go,.rs,.java,.sql,.sh,.diff,.patch" onChange={handleFileChange} /></label>
                    {attachedFile && <span className="max-w-[150px] truncate text-xs text-indigo-200" title={attachedFile.name}>{attachedFile.name}<button type="button" onClick={() => setAttachedFile(null)} className="ml-1 inline-flex align-middle" aria-label="Bỏ tệp đính kèm"><X size={12} /></button></span>}
                    <label className="flex items-center gap-2 text-xs text-neutral-400">Provider<select aria-label="AI provider" value={selectedModel} onChange={event => onSelectModel(event.target.value)} className="max-w-[150px] border border-white/10 bg-[#0b0d15] px-2 py-2 text-xs text-white"><option value="zsk">Agents</option><option value="ohmaba">Ohmaba Agent</option><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="qwen">Qwen</option><option value="claude">Claude</option><option value="v0">v0 Builder</option></select></label><span className="ocode-prompt-hint hidden sm:inline">⌘/Ctrl + Enter</span>
                  </div>
                  <button type="button" onClick={() => void handleSend()} disabled={(!input.trim() && !attachedFile) || isSending}
                    className="ocode-send-button" aria-label={isSending ? 'Đang gửi yêu cầu' : 'Gửi yêu cầu'}>
                    {isSending ? 'Đang gửi...' : <><span className="hidden sm:inline">Bắt đầu</span><ArrowUp size={18} /></>}
                  </button>
                </div>
              </div>
              {status && <div role={status.type === 'error' ? 'alert' : 'status'} className={`mt-3 rounded-lg border px-3 py-2 text-xs ${status.type === 'error' ? 'border-rose-500/30 bg-rose-950/30 text-rose-200' : 'border-white/10 bg-white/[0.03] text-neutral-400'}`}>{status.text}</div>}
              <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Prompt mẫu">
                {STARTER_PROMPTS.map(template => {
                  const TemplateIcon = template.icon;
                  return <button key={template.title} type="button" onClick={() => useTemplate(template.prompt)} className="group flex min-h-[112px] flex-col items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-left transition hover:border-white/25 hover:bg-white/[0.05]">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-neutral-200"><TemplateIcon size={18} /></span>
                    <span><strong className="block text-sm font-medium text-neutral-100">{template.title}</strong><small className="mt-1 block text-xs leading-5 text-neutral-500">{template.description}</small></span>
                  </button>;
                })}
              </div>
              <p className="mt-3 text-center text-[11px] text-neutral-600">AI responses depend on backend configuration. The prompt planner does not generate app files by itself.</p>
            </div>
          </main>
        ) : (
          <section aria-live="polite" aria-relevant="additions text" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 sm:px-8">
            <div className="mb-1 flex items-center justify-between gap-3 text-xs text-neutral-500"><span className="flex items-center gap-2"><Sparkles size={14} className="text-neutral-300" /> Ask OCode.js · {selectedModel === 'v0' ? 'v0 Builder' : 'Agents'}</span><label className="flex items-center gap-2">Provider<select aria-label="AI provider" value={selectedModel} onChange={event => onSelectModel(event.target.value)} className="border border-white/10 bg-[#0b0d15] px-2 py-2 text-xs text-white"><option value="zsk">Agents</option><option value="ohmaba">Ohmaba Agent</option><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="qwen">Qwen</option><option value="claude">Claude</option><option value="v0">v0 Builder</option></select></label></div>
            {messages.filter(message => message.role !== 'system').map((message, index) => (
              <article key={`${message.role}-${index}`} className={`max-w-[92%] border p-4 sm:max-w-[85%] ${message.role === 'user' ? 'ml-auto border-indigo-400/20 bg-indigo-400/[0.08]' : 'border-white/10 bg-white/[0.025]'}`}>
                <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  <span className="flex items-center gap-2">{message.role === 'user' ? 'Bạn' : <><Bot size={13} className="text-indigo-300" /> Agents</>}</span>
                  {message.role === 'assistant' && <button type="button" onClick={() => void handleCopyMessage(message.content, index)} aria-label="Sao chép phản hồi" className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[10px] normal-case tracking-normal text-neutral-400 transition hover:border-cyan-300/40 hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">{copiedMessage === index ? <Check size={12} /> : <Copy size={12} />} {copiedMessage === index ? "Đã sao chép" : "Sao chép"}</button>}
                </div>
                <div className="text-sm leading-6 text-neutral-200">{message.role === 'assistant' && message.workspaceMode === 'plan' ? <PlanChecklist content={message.content} /> : message.role === 'assistant' ? <CodeProposalView content={message.content} /> : <div className="whitespace-pre-wrap break-words">{message.content}</div>}</div>
              </article>
            ))}
            {isSending && <div className="flex items-center gap-2 text-xs text-indigo-200"><span className="h-2 w-2 animate-pulse rounded-full bg-indigo-300" /> Đang chờ phản hồi từ agent…</div>}
          </section>
        )}
      </div>

      {!isWelcome && (
        <div className="border-t border-white/10 bg-[#090b13] px-4 py-4 sm:px-8">
          {status && <div role={status.type === 'error' ? 'alert' : 'status'} className={`mx-auto mb-3 max-w-4xl border px-3 py-2 text-xs ${status.type === 'error' ? 'border-rose-500/30 bg-rose-950/30 text-rose-200' : 'border-white/10 bg-white/[0.03] text-neutral-400'}`}>{status.text}</div>}
          {attachedFile && <div className="mx-auto mb-2 flex max-w-4xl items-center gap-2 text-xs text-indigo-200"><Paperclip size={14} /><span className="truncate">{attachedFile.name}</span><button type="button" onClick={() => setAttachedFile(null)} aria-label="Bỏ tệp đính kèm"><X size={13} /></button></div>}
          <div className="mx-auto flex max-w-4xl items-end gap-2 border border-white/10 bg-[#0c0f18] p-2 focus-within:border-indigo-400/40">
            <label className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center border border-white/10 px-3 text-neutral-300 hover:border-indigo-300/40" title="Đính kèm tệp cho agent" aria-label="Úp file cho agent"><Paperclip size={17} /><input type="file" className="sr-only" accept=".txt,.md,.mdx,.json,.csv,.tsv,.js,.jsx,.ts,.tsx,.html,.css,.scss,.xml,.yaml,.yml,.toml,.ini,.log,.py,.go,.rs,.java,.sql,.sh,.diff,.patch" onChange={handleFileChange} /></label>
            <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Tiếp tục yêu cầu hoặc tinh chỉnh ứng dụng..." aria-label="Tin nhắn cho Agents" maxLength={8000}
              className="max-h-40 min-h-12 flex-1 resize-y bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-neutral-600" />
            <button type="button" onClick={() => void handleSend()} disabled={(!input.trim() && !attachedFile) || isSending} aria-label="Gửi yêu cầu"
              className="flex h-10 shrink-0 items-center gap-2 bg-indigo-400 px-3 text-xs font-semibold text-[#080a10] hover:bg-indigo-300 disabled:opacity-40">
              <ArrowUp size={16} /><span className="hidden sm:inline">{isSending ? 'Đang gửi' : 'Gửi'}</span>
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-4xl text-[10px] text-neutral-600">Ctrl/Cmd + Enter để gửi · Shift + Enter để xuống dòng</p>
        </div>
      )}

      <nav className="xbo-bottom-nav mx-auto grid w-full max-w-4xl grid-cols-5 sm:hidden" aria-label="Điều hướng nhanh"><span className="selected"><MessageSquare size={17}/><small>Chat</small></span><span><LayoutDashboard size={17}/><small>Templates</small></span><span><Code2 size={17}/><small>Workspace</small></span><span><Sparkles size={17}/><small>Deploy</small></span><a href="https://github.com/zskbot/ask-ocodejs" target="_blank" rel="noreferrer"><Github size={17}/><small>GitHub</small></a></nav>
    </div>
  );
};
