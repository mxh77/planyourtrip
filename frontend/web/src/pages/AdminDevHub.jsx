import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api.js';
import {
  GitBranch, GitPullRequest, GitCommit, Play, ExternalLink,
  ChevronDown, ChevronUp, RefreshCw, Circle, CheckCircle, XCircle,
  Clock, Zap, GitMerge, FileCode, Plus, Minus, ChevronRight, Rocket,
  Bot, X, Bug, Send, MessageSquare, RotateCcw, AlertTriangle, ShieldCheck, ShieldX, Wrench, ImagePlus, AlertCircle,
} from 'lucide-react';

// ─── Constantes ──────────────────────────────────────────────────────────────

const AI_MODELS = ['gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini', 'claude-sonnet-4-6', 'deepseek-v4-flash'];

const REVIEW_VERDICT_CONFIG = {
  approved: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', label: 'Approuvé' },
  warning:  { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   label: 'Avertissement' },
  blocked:  { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     label: 'Bloqué' },
  pending:  { bg: 'bg-gray-50',    border: 'border-gray-200',    text: 'text-gray-500',    label: 'En cours' },
};

const PIPELINE_META = [
  { id: 'spec',    num: 1, label: 'Spécification Produit', headBg: 'bg-blue-50',    headText: 'text-blue-700',    dotBg: 'bg-blue-500',    selBorder: 'border-blue-300',    boxBg: 'bg-blue-50',    boxTitle: 'text-blue-600'    },
  { id: 'dev',     num: 2, label: 'Développement',         headBg: 'bg-emerald-50', headText: 'text-emerald-700', dotBg: 'bg-emerald-500', selBorder: 'border-emerald-300', boxBg: 'bg-emerald-50', boxTitle: 'text-emerald-600' },
  { id: 'review',  num: 3, label: 'Code Review',           headBg: 'bg-orange-50',  headText: 'text-orange-700',  dotBg: 'bg-orange-500',  selBorder: 'border-orange-300',  boxBg: 'bg-orange-50',  boxTitle: 'text-orange-600'  },
  { id: 'fix',     num: 4, label: 'Fix Reviews',            headBg: 'bg-violet-50',  headText: 'text-violet-700',  dotBg: 'bg-violet-500',  selBorder: 'border-violet-300',  boxBg: 'bg-violet-50',  boxTitle: 'text-violet-600'  },
  { id: 'preview', num: 5, label: 'Delivery Preview',      headBg: 'bg-sky-50',     headText: 'text-sky-700',     dotBg: 'bg-sky-500',     selBorder: 'border-sky-300',     boxBg: 'bg-sky-50',     boxTitle: 'text-sky-600'     },
  { id: 'qa',      num: 6, label: 'Testing (QA)',           headBg: 'bg-amber-50',   headText: 'text-amber-700',   dotBg: 'bg-amber-500',   selBorder: 'border-amber-300',   boxBg: 'bg-amber-50',   boxTitle: 'text-amber-600'   },
  { id: 'merge',   num: 7, label: 'Merge PR',               headBg: 'bg-purple-50',  headText: 'text-purple-700',  dotBg: 'bg-purple-500',  selBorder: 'border-purple-300',  boxBg: 'bg-purple-50',  boxTitle: 'text-purple-600'  },
  { id: 'prod',    num: 8, label: 'Delivery Production',    headBg: 'bg-blue-50',    headText: 'text-blue-700',    dotBg: 'bg-blue-700',    selBorder: 'border-blue-400',    boxBg: 'bg-blue-50',    boxTitle: 'text-blue-700'    },
];

const PREVIEW_URL = 'http://192.168.1.111:6111';
const GITHUB_ACTIONS_URL = 'https://github.com/mxh77/PlanYourRide/actions/workflows/delivery-agent.yml';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtShortDate(d) {
  const dt = new Date(d);
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
    + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function fileStatusColor(status) {
  if (status === 'added')   return 'text-emerald-600';
  if (status === 'removed') return 'text-red-600';
  if (status === 'renamed') return 'text-blue-600';
  return 'text-amber-600';
}
function fileStatusLabel(status) {
  if (status === 'added')   return 'A';
  if (status === 'removed') return 'D';
  if (status === 'renamed') return 'R';
  return 'M';
}

function classifyRun(run) {
  const n = (run.name ?? '').toLowerCase();
  if (n.includes('product-spec') || (n.includes('spec') && !n.includes('code'))) return 'spec';
  if (n.includes('feature-dev') || n.includes('feature')) return 'dev';
  if (n.includes('deploy-prod') || n.includes('production')) return 'prod';
  if (n.includes('delivery') || (n.includes('preview') && !n.includes('production'))) return 'preview';
  if (n.includes('qa') || (n.includes('bug') && !n.includes('debug'))) return 'qa';
  if (n.includes('fix') && n.includes('review')) return 'fix';
  if (n.includes('review')) return 'review';
  return null;
}

function runAgentName(run) {
  return (run.name ?? run.display_title ?? '')
    .replace(/\s+Issue\s+#\d+/gi, '')  // supprimer "Issue #N" (redondant avec le header)
    .replace(/-/g, ' ')
    .replace(/\b(\w)/g, (_, c) => c.toUpperCase());
}

function runStageBadgeCls(run) {
  const s = classifyRun(run);
  const m = {
    spec: 'bg-blue-100 text-blue-700', dev: 'bg-emerald-100 text-emerald-700',
    review: 'bg-orange-100 text-orange-700', fix: 'bg-violet-100 text-violet-700',
    preview: 'bg-sky-100 text-sky-700',
    qa: 'bg-amber-100 text-amber-700', merge: 'bg-purple-100 text-purple-700',
    prod: 'bg-blue-100 text-blue-800',
  };
  return s ? m[s] : 'bg-gray-100 text-gray-600';
}

function runPipelineStatus(run) {
  if (!run) return 'pending';
  if (run.status === 'in_progress' || run.status === 'queued') return 'running';
  if (run.status === 'completed') {
    if (run.conclusion === 'success') return 'success';
    if (['failure', 'cancelled', 'timed_out'].includes(run.conclusion)) return 'failure';
  }
  return 'pending';
}

function matchRunToCommit(run, commit) {
  const author = commit.commit.author.name.toLowerCase();
  const name = (run.name ?? '').toLowerCase();
  if (author.includes('qa-fix') && name.includes('qa')) return true;
  if (author.includes('fix-review') && name.includes('fix')) return true;
  if (author.includes('feature-dev') && name.includes('feature')) return true;
  if (author.includes('product-spec') && name.includes('spec')) return true;
  if (author.includes('code-review') && name.includes('code')) return true;
  if (author.includes('delivery') && name.includes('delivery')) return true;
  return false;
}

function stepDuration(job) {
  if (!job.started_at) return null;
  const end = job.completed_at ? new Date(job.completed_at) : new Date();
  const secs = Math.round((end.getTime() - new Date(job.started_at).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function renderMarkdown(md) {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^###### (.+)$/gm, '<h6 class="text-xs font-bold mt-3 mb-1">$1</h6>')
    .replace(/^##### (.+)$/gm, '<h5 class="text-xs font-bold mt-3 mb-1">$1</h5>')
    .replace(/^#### (.+)$/gm, '<h4 class="text-sm font-bold mt-4 mb-1">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold mt-5 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1 rounded font-mono text-[0.8em]">$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-gray-300 pl-3 text-gray-500 italic my-1">$1</blockquote>')
    .replace(/^---$/gm, '<hr class="my-3 border-gray-200" />')
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, (m) => `<ul class="my-1 space-y-0.5">${m}</ul>`)
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
    .replace(/\n{2,}/g, '</p><p class="my-2">')
    .replace(/^(?!<)(.+)$/gm, (m) => m.trim() ? `<p class="my-1">${m}</p>` : '')
    .trim();
}

// ─── Hook SSE DevHub ──────────────────────────────────────────────────────────
// S'abonne aux événements SSE du backend.
// onEvent(data) est appelé pour chaque event 'run_updated' reçu.
// La connexion est automatiquement rétablie en cas de déconnexion.

function useDevHubSSE(onEvent) {
  const onEventRef = React.useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const es = new EventSource('/api/admin/devhub/events');

    es.addEventListener('run_updated', (e) => {
      try {
        const data = JSON.parse(e.data);
        onEventRef.current(data);
      } catch { /* ignore JSON malformé */ }
    });

    es.onerror = () => {
      // EventSource se reconnecte automatiquement — pas besoin de gérer
    };

    return () => es.close();
  }, []); // [] : ouvrir une seule connexion SSE par montage du composant parent
}

// ─── Hook API générique ───────────────────────────────────────────────────────

function useApiGet(url, deps = []) {
  const [data, setData] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const baseUrl = url ? url.replace(/[?&]_r=\d+/, '') : null;
  const prevBaseUrl = useRef(baseUrl);
  const isFirstFetch = useRef(true);

  const fetch = useCallback(async () => {
    if (!url) { setData(undefined); return; }
    // loading visible uniquement au premier chargement, pas lors des refreshs silencieux
    if (isFirstFetch.current) setLoading(true);
    try {
      const res = await api.get(url);
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
      isFirstFetch.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps.length ? deps : [url]);

  // Vider data + reset isFirstFetch seulement si l'URL de base change
  useEffect(() => {
    if (baseUrl !== prevBaseUrl.current) {
      setData(undefined);
      isFirstFetch.current = true;
      prevBaseUrl.current = baseUrl;
    }
  }, [baseUrl]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ─── Icones statut ────────────────────────────────────────────────────────────

function StatusIcon({ status, conclusion, size = 'h-4 w-4' }) {
  if (status === 'completed') {
    if (conclusion === 'success')   return <CheckCircle className={`${size} text-emerald-500`} />;
    if (conclusion === 'failure')   return <XCircle className={`${size} text-red-500`} />;
    if (conclusion === 'skipped')   return <Circle className={`${size} text-gray-300`} />;
    if (conclusion === 'cancelled') return <XCircle className={`${size} text-gray-400`} />;
    return <Circle className={`${size} text-gray-400`} />;
  }
  if (status === 'in_progress') return <RefreshCw className={`${size} animate-spin text-blue-500`} />;
  return <Clock className={`${size} text-amber-400`} />;
}

function PipelineStatusIcon({ status }) {
  if (status === 'success') return <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />;
  if (status === 'failure') return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
  if (status === 'running') return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin shrink-0" />;
  return <Circle className="h-4 w-4 text-gray-200 shrink-0" />;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

// ─── ReviewBadge ──────────────────────────────────────────────────────────────

function VerdictIcon({ verdict, className = 'h-3.5 w-3.5' }) {
  if (verdict === 'approved') return <ShieldCheck className={className} />;
  if (verdict === 'warning')  return <AlertTriangle className={className} />;
  if (verdict === 'blocked')  return <ShieldX className={className} />;
  return <Clock className={className} />;
}

function ReviewBadge({ scope, verdict }) {
  const cfg = verdict ? REVIEW_VERDICT_CONFIG[verdict] : REVIEW_VERDICT_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.border} ${cfg.text}`}>
      <VerdictIcon verdict={verdict} className="h-3 w-3 shrink-0" />
      <span className="capitalize">{scope}</span>
    </span>
  );
}

// ─── ReviewReportBlock ────────────────────────────────────────────────────────
// mode='view'   → lecture seule
// mode='select' → checkboxes par problème (bullet `-`) pour cibler le fix
// Sections "Points positifs" et "Exigences couvertes" ne sont pas sélectionnables.
// Format attendu : ### sections contenant des `- item\n  > sub` bullet problems

const SEV_BADGE = {
  error:   'bg-red-100 text-red-600 border border-red-200',
  warning: 'bg-amber-100 text-amber-600 border border-amber-200',
  info:    'bg-gray-100 text-gray-500 border border-gray-200',
};
const SEV_LABEL = { error: '🔴 Bloquant', warning: '⚠️ Avertissement', info: 'ℹ️ Info' };

function sectionSeverity(title) {
  if (/🔴/.test(title)) return 'error';
  if (/🟡|⚠️/.test(title)) return 'warning';
  return 'info';
}

const NON_SELECTABLE_SECTION = /Points positifs|Exigences couvertes|✔️|👍|✨|✅/;

// Retourne les IDs des problèmes dans les sections 🔴 (bloquants) du commentaire
function getBlockingProblemIds(comment) {
  const rawLines = (comment.body || '').split('\n').filter(l => !/^\s*<!--/.test(l));
  const ids = [];
  let inBlocking = false;
  let pIdx = 0;
  for (const line of rawLines) {
    if (/^### /.test(line)) {
      inBlocking = /🔴/.test(line);
    } else if (/^- /.test(line)) {
      if (inBlocking) ids.push(`${comment.id}-p${pIdx}`);
      pIdx++;
    }
  }
  return ids;
}

// Parse all `- item` bullet problems from section lines, collecting their sub-lines (indented `> ...`)
function parseBulletItems(lines) {
  const items = [];
  let cur = null;
  for (const line of lines) {
    if (/^- /.test(line)) {
      if (cur) items.push(cur);
      cur = { header: line.slice(2).trim(), subLines: [] };
    } else if (cur) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('>') || (line.startsWith('  ') && trimmed)) {
        cur.subLines.push(trimmed);
      }
    }
  }
  if (cur) items.push(cur);
  return items;
}

function ReviewReportBlock({ comment, mode = 'view', selectedIds = new Set(), ignoredIds = new Set(), onToggle, onIgnore }) {
  const [blockOpen, setBlockOpen] = useState(true);
  const [openSections, setOpenSections] = useState({});
  const isSectionOpen = (si) => openSections[si] !== false;

  const rawLines = (comment.body || '').split('\n').filter(l => !/^\s*<!--/.test(l));
  const mainHeader = rawLines.find(l => /^## /.test(l)) || '';
  const mainTitle = mainHeader.replace(/^##\s+/, '').trim();

  // Parse ### sections, each containing bullet problems
  const sections = [];
  let curSec = null;
  for (const line of rawLines) {
    if (/^## /.test(line)) continue;
    if (/^### /.test(line)) {
      if (curSec) sections.push(curSec);
      curSec = { title: line.replace(/^###\s+/, '').trim(), lines: [] };
    } else if (curSec) {
      curSec.lines.push(line);
    }
  }
  if (curSec) sections.push(curSec);

  let pIdx = 0;
  const sectionsData = sections.map(sec => {
    const problems = parseBulletItems(sec.lines).map(item => ({ ...item, idx: pIdx++ }));
    return { ...sec, problems };
  });

  const allProblemIds = sectionsData.flatMap(s => s.problems.map(p => `${comment.id}-p${p.idx}`));
  const ignoredCount = allProblemIds.filter(id => ignoredIds.has(id)).length;

  const SCOPE_COLOR = { backend: 'orange', frontend: 'blue', functional: 'emerald', fix: 'amber' };
  const color = SCOPE_COLOR[comment.scope] || 'gray';
  const headBg = { orange: 'bg-orange-50 border-orange-200', blue: 'bg-blue-50 border-blue-200', emerald: 'bg-emerald-50 border-emerald-200', amber: 'bg-amber-50 border-amber-200', gray: 'bg-gray-50 border-gray-200' }[color];
  const headText = { orange: 'text-orange-700', blue: 'text-blue-700', emerald: 'text-emerald-700', amber: 'text-amber-700', gray: 'text-gray-700' }[color];

  return (
    <div className="rounded border border-gray-200 overflow-hidden text-xs">
      <button
        onClick={() => setBlockOpen(v => !v)}
        className={`flex w-full items-center justify-between px-3 py-2 border-b ${headBg} transition-colors hover:brightness-95`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {blockOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
          <span className={`font-semibold truncate ${headText}`}>{mainTitle || comment.scope}</span>
          {ignoredCount > 0 && (
            <span className="shrink-0 rounded bg-gray-200 px-1 text-[9px] text-gray-500">{ignoredCount} ignoré{ignoredCount > 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 ml-2" onClick={e => e.stopPropagation()}>
          {comment.run_url && (
            <a href={comment.run_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-400 hover:text-blue-600">
              <ExternalLink className="h-3 w-3" /> Run #{comment.run_id}
            </a>
          )}
          <a href={comment.html_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-gray-400 hover:text-gray-600">
            <ExternalLink className="h-3 w-3" /> GitHub
          </a>
        </div>
      </button>

      {blockOpen && (
        <div className="divide-y divide-gray-100 bg-white">
          {sectionsData.map((sec, si) => {
            const isPositive = NON_SELECTABLE_SECTION.test(sec.title);
            const sev = sectionSeverity(sec.title);
            return (
              <div key={si}>
                <button
                  onClick={() => setOpenSections(v => ({ ...v, [si]: !isSectionOpen(si) }))}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-left"
                >
                  {isSectionOpen(si) ? <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" /> : <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />}
                  <span className="font-medium text-gray-600 text-[11px]">{sec.title}</span>
                </button>
                {isSectionOpen(si) && (
                  <div className="divide-y divide-gray-50">
                    {sec.problems.length === 0 && (
                      <pre className="whitespace-pre-wrap font-sans px-5 py-2 text-xs text-gray-500 leading-relaxed">{sec.lines.join('\n').trim()}</pre>
                    )}
                    {sec.problems.map((prob) => {
                      const problemId = `${comment.id}-p${prob.idx}`;
                      const isIgnored = ignoredIds.has(problemId);
                      const isSelected = selectedIds.has(problemId);
                      return (
                        <div key={prob.idx} className={`${isIgnored ? 'opacity-40' : ''}`}>
                          <div className="flex items-start gap-1.5 px-3 py-1.5 hover:bg-gray-50">
                            {mode === 'select' && !isPositive && !isIgnored && (
                              <button
                                onClick={() => onToggle?.(problemId)}
                                className={`mt-0.5 shrink-0 h-3.5 w-3.5 rounded border flex items-center justify-center transition-colors ${
                                  isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 hover:border-blue-400'
                                }`}
                              >
                                {isSelected && <span className="text-[8px] leading-none">✓</span>}
                              </button>
                            )}
                            <div className="flex-1 min-w-0">
                              <span className={`text-[11px] break-words ${isIgnored ? 'line-through text-gray-400' : 'text-gray-700'}`}>{prob.header}</span>
                              {prob.subLines.length > 0 && (
                                <div className="mt-0.5 space-y-0.5">
                                  {prob.subLines.map((sl, sli) => (
                                    <p key={sli} className="text-[10px] text-gray-500 leading-relaxed">{sl}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1 ml-1 mt-0.5">
                              <span className={`rounded px-1 py-0.5 text-[9px] font-medium ${SEV_BADGE[sev]}`}>{SEV_LABEL[sev]}</span>
                              {mode === 'select' && !isPositive && (
                                <button
                                  onClick={() => onIgnore?.(problemId, comment)}
                                  title={isIgnored ? 'Restaurer ce problème' : 'Ignorer ce problème pour le fix'}
                                  className={`rounded px-1 py-0.5 text-[9px] border transition-colors ${
                                    isIgnored
                                      ? 'border-gray-300 bg-gray-100 text-gray-500 hover:bg-gray-200'
                                      : 'border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200'
                                  }`}
                                >
                                  {isIgnored ? 'Restaurer' : 'Ignorer'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── CommitRow ────────────────────────────────────────────────────────────────

function CommitRow({ sha, message, authorName, htmlUrl }) {
  const [open, setOpen] = useState(false);
  const [showPatch, setShowPatch] = useState(null);
  const { data: files, loading } = useApiGet(open ? `/admin/devhub/commits/${sha}/files` : null, [open, sha]);

  return (
    <div className="rounded border border-gray-100 bg-white overflow-hidden">
      <button className="flex w-full items-center gap-1.5 px-2 py-1.5 hover:bg-gray-50 transition-colors text-xs"
        onClick={() => setOpen(v => !v)}>
        <a href={htmlUrl} target="_blank" rel="noopener noreferrer"
          className="font-mono shrink-0 bg-gray-100 px-1 py-0.5 rounded text-gray-600 hover:text-blue-600"
          onClick={e => e.stopPropagation()}>{sha.slice(0, 7)}</a>
        <span className="flex-1 truncate text-left text-gray-700">{message.split('\n')[0]}</span>
        <span className="shrink-0 text-gray-400">{authorName}</span>
        {open ? <ChevronUp className="h-3 w-3 text-gray-400 shrink-0" /> : <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 px-2 py-1.5 bg-gray-50">
          {loading ? <Skeleton className="h-4 w-full" />
          : !files?.length ? <p className="text-xs text-gray-400">Aucun fichier</p>
          : (
            <div className="space-y-0.5">
              {files.map(f => (
                <div key={f.filename}>
                  <button className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-gray-100 transition-colors text-xs"
                    onClick={() => setShowPatch(showPatch === f.filename ? null : f.filename)}>
                    <span className={`w-4 shrink-0 text-center font-bold ${fileStatusColor(f.status)}`}>{fileStatusLabel(f.status)}</span>
                    <FileCode className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="flex-1 truncate font-mono text-gray-700">{f.filename}</span>
                    <span className="shrink-0 flex items-center gap-1">
                      <span className="text-emerald-600 flex items-center"><Plus className="h-2.5 w-2.5" />{f.additions}</span>
                      <span className="text-red-500 flex items-center"><Minus className="h-2.5 w-2.5" />{f.deletions}</span>
                    </span>
                  </button>
                  {showPatch === f.filename && f.patch && (
                    <pre className="mt-1 overflow-x-auto rounded bg-gray-900 px-3 py-2 text-xs leading-5 text-gray-100 mb-1">
                      {f.patch.split('\n').map((line, i) => (
                        <div key={i} className={
                          line.startsWith('+') && !line.startsWith('++') ? 'text-emerald-400'
                          : line.startsWith('-') && !line.startsWith('--') ? 'text-red-400'
                          : line.startsWith('@@') ? 'text-blue-400' : ''
                        }>{line}</div>
                      ))}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── RunCommitFiles ────────────────────────────────────────────────────────────

function RunCommitFiles({ sha }) {
  const [showPatch, setShowPatch] = useState(null);
  const { data: files, loading } = useApiGet(`/admin/devhub/commits/${sha}/files`, [sha]);
  if (loading) return <div className="space-y-1"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div>;
  if (!files?.length) return <p className="text-xs italic text-gray-400">Aucun fichier modifié</p>;
  return (
    <div className="space-y-0.5">
      {files.map(f => (
        <div key={f.filename}>
          <button className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-gray-50"
            onClick={() => setShowPatch(showPatch === f.filename ? null : f.filename)}>
            <span className={`w-4 shrink-0 text-center text-xs font-bold ${fileStatusColor(f.status)}`}>{fileStatusLabel(f.status)}</span>
            <FileCode className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="min-w-0 flex-1 break-all font-mono text-xs text-gray-700">{f.filename}</span>
            <span className="shrink-0 flex items-center gap-1 text-xs">
              <span className="text-emerald-600 flex items-center"><Plus className="h-2.5 w-2.5" />{f.additions}</span>
              <span className="text-red-500 flex items-center"><Minus className="h-2.5 w-2.5" />{f.deletions}</span>
            </span>
            {showPatch === f.filename ? <ChevronUp className="h-3 w-3 shrink-0 text-gray-400" /> : <ChevronRight className="h-3 w-3 shrink-0 text-gray-400" />}
          </button>
          {showPatch === f.filename && f.patch && (
            <pre className="mt-0.5 mb-1 overflow-x-auto rounded bg-gray-900 px-3 py-2 text-[11px] leading-5 text-gray-100">
              {f.patch.split('\n').map((line, i) => (
                <div key={i} className={
                  line.startsWith('+') && !line.startsWith('++') ? 'text-emerald-400'
                  : line.startsWith('-') && !line.startsWith('--') ? 'text-red-400'
                  : line.startsWith('@@') ? 'text-blue-400' : 'text-gray-300'
                }>{line}</div>
              ))}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── RunDetail ────────────────────────────────────────────────────────────────

function RunDetail({ run, commits }) {
  const [open, setOpen] = useState(false);
  const { data: jobs, loading } = useApiGet(open ? `/admin/devhub/runs/${run.id}/jobs` : null, [open, run.id]);
  return (
    <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
      <button className="flex w-full items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(v => !v)}>
        <StatusIcon status={run.status} conclusion={run.conclusion} />
        <span className="min-w-0 flex-1 truncate text-sm text-left">
          {(run.display_title || run.name || '').replace(/#\d+/, `#${run.run_number}`)}
        </span>
        <span className="text-xs text-gray-400 font-mono shrink-0">
          {new Date(run.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="text-xs text-gray-400 font-mono shrink-0">#{run.run_number}</span>
        <a href={run.html_url} target="_blank" rel="noopener noreferrer"
          className="text-gray-400 hover:text-gray-600 shrink-0" onClick={e => e.stopPropagation()}>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 bg-gray-50 px-3 py-2">
          {run.head_commit && (
            <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-500">
              <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-gray-600">{run.head_commit.id.slice(0, 7)}</span>
              <span className="truncate">{run.head_commit.message.split('\n')[0]}</span>
              <span className="shrink-0 text-gray-400">— {run.head_commit.author.name}</span>
            </div>
          )}
          {commits && commits.length > 0 && (
            <div className="mb-2 space-y-1">
              {commits.map(c => <CommitRow key={c.sha} sha={c.sha} message={c.commit.message} authorName={c.commit.author.name} htmlUrl={c.html_url} />)}
            </div>
          )}
          {loading ? (
            <div className="space-y-1.5 py-1"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-3/4" /></div>
          ) : !jobs?.length ? (
            <p className="py-1 text-xs text-gray-400">Aucun job trouvé</p>
          ) : (
            <div className="space-y-2">
              {jobs.map(job => (
                <div key={job.id}>
                  <div className="flex items-center gap-2 py-0.5">
                    <StatusIcon status={job.status} conclusion={job.conclusion} size="h-3.5 w-3.5" />
                    <span className="flex-1 text-xs font-medium text-gray-800">{job.name}</span>
                    <span className="text-xs text-gray-400">{stepDuration(job)}</span>
                    <a href={job.html_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600"><ExternalLink className="h-3 w-3" /></a>
                  </div>
                  <div className="ml-5 space-y-0.5 border-l border-gray-200 pl-3">
                    {(job.steps ?? []).filter(s => s.name !== 'Set up job' && s.name !== 'Complete job').map(step => (
                      <div key={step.number} className="flex items-center gap-2 py-0.5">
                        <StatusIcon status={step.status} conclusion={step.conclusion} size="h-3 w-3" />
                        <span className={`text-xs ${step.conclusion === 'skipped' ? 'text-gray-400' : 'text-gray-700'}`}>{step.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FileViewerModal ──────────────────────────────────────────────────────────

function FileViewerModal({ filePath, gitRef, isSpec, issueTitle, issueBody, aiModel, onClose }) {
  const { data: fileData, loading, error } = useApiGet(`/admin/devhub/file-content?path=${encodeURIComponent(filePath)}&ref=${encodeURIComponent(gitRef)}`, [filePath, gitRef]);
  const isMarkdown = filePath.endsWith('.md') || filePath.endsWith('.mdx');
  const [localContent, setLocalContent] = useState(null);
  const [proposedContent, setProposedContent] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatPending, setChatPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const displayContent = localContent ?? fileData?.content ?? '';

  async function handleSave() {
    if (!localContent || saving) return;
    setSaving(true);
    try {
      await api.put('/admin/devhub/file-content', { path: filePath, content: localContent, branch: gitRef });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      alert('Erreur lors de la sauvegarde : ' + (e?.response?.data?.error || e.message));
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    const text = chatInput.trim();
    if (!text || chatPending) return;
    const next = [...chatMessages, { role: 'user', content: text }];
    setChatInput('');
    setChatMessages(next);
    setChatPending(true);
    try {
      const { data } = await api.post('/admin/devhub/spec-chat', {
        messages: next,
        specContent: displayContent,
        issueTitle: issueTitle ?? '',
        issueBody: issueBody ?? '',
        aiModel: aiModel ?? 'gpt-4.1',
      });
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      if (data.proposedContent) setProposedContent(data.proposedContent);
    } catch {
      setChatMessages(prev => prev.slice(0, -1));
      setChatInput(text);
    } finally {
      setChatPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${isSpec ? 'max-w-6xl' : 'max-w-4xl'}`}>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2 min-w-0">
            <FileCode className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="truncate font-mono text-sm text-gray-700">{filePath}</span>
            <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 font-mono text-[10px] text-gray-500">{gitRef.slice(0, 12)}</span>
            {localContent && <span className="shrink-0 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Modifié localement</span>}
          </div>
          <div className="ml-4 flex items-center gap-2">
            {localContent && (
              <button onClick={() => { setLocalContent(null); setProposedContent(null); setSaveSuccess(false); }}
                className="rounded-lg px-3 py-1 text-xs text-gray-500 hover:bg-gray-100">Réinitialiser</button>
            )}
            {localContent && (
              <button onClick={handleSave} disabled={saving}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50 ${saveSuccess ? 'bg-emerald-500' : 'bg-indigo-500 hover:bg-indigo-600'}`}>
                {saving ? '…' : saveSuccess ? '✓ Sauvegardé' : '⬆ Sauvegarder'}
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {/* Body */}
        <div className={`flex min-h-0 flex-1 overflow-hidden ${isSpec ? 'divide-x divide-gray-100' : ''}`}>
          <div className={`overflow-y-auto ${isSpec ? 'w-3/5' : 'w-full'}`}>
            {loading && <div className="flex items-center justify-center py-20"><RefreshCw className="h-6 w-6 animate-spin text-gray-400" /></div>}
            {error && <div className="flex items-center justify-center py-20 text-sm text-red-500">Impossible de charger le fichier</div>}
            {fileData && (
              isMarkdown
                ? <div className="prose prose-sm max-w-none px-8 py-6 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(displayContent) }} />
                : <pre className="overflow-x-auto px-8 py-6 font-mono text-xs leading-relaxed text-gray-800">{displayContent}</pre>
            )}
          </div>
          {isSpec && (
            <div className="flex w-2/5 flex-col overflow-hidden">
              {proposedContent && (
                <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700"><Bot className="h-3.5 w-3.5" />Proposition de l'IA</span>
                    <div className="flex gap-2">
                      <button onClick={() => { setLocalContent(proposedContent); setProposedContent(null); }}
                        className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600">✓ Accepter</button>
                      <button onClick={() => setProposedContent(null)}
                        className="rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50">Ignorer</button>
                    </div>
                  </div>
                  <div className="max-h-32 overflow-y-auto rounded-lg bg-white p-3 font-mono text-[10px] leading-relaxed text-gray-600">
                    {proposedContent.slice(0, 400)}{proposedContent.length > 400 ? '…' : ''}
                  </div>
                </div>
              )}
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {chatMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                    <MessageSquare className="h-7 w-7 text-gray-200" />
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Posez une question sur la spec<br />ou demandez des modifications.<br />
                      <span className="text-[10px]">L'IA peut vous proposer une version révisée à accepter ou ignorer.</span>
                    </p>
                  </div>
                )}
                {chatMessages.map((m, i) => (
                  <div key={i} className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${m.role === 'user' ? 'ml-6 bg-indigo-50 text-indigo-900' : 'mr-2 bg-gray-50 text-gray-800'}`}>
                    {m.role === 'assistant'
                      ? <div className="prose prose-xs max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                      : m.content}
                  </div>
                ))}
                {chatPending && (
                  <div className="mr-2 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                    <RefreshCw className="h-3 w-3 animate-spin text-gray-400" />
                    <span className="text-xs text-gray-400">L'IA réfléchit…</span>
                  </div>
                )}
              </div>
              <div className="shrink-0 border-t border-gray-100 p-3">
                <div className="flex gap-2">
                  <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                    placeholder="Ex : Il manque le cas d'usage de suppression…" rows={2}
                    className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-xs placeholder-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200" />
                  <button onClick={handleSend} disabled={!chatInput.trim() || chatPending}
                    className="flex shrink-0 items-center justify-center rounded-lg bg-indigo-500 px-3 text-white hover:bg-indigo-600 disabled:opacity-40">
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PRDetail ─────────────────────────────────────────────────────────────────

function PRDetail({ pr, issueNumber, aiModel, outerRefreshKey = 0 }) {
  const [open, setOpen] = useState(false);
  const [showPatch, setShowPatch] = useState(null);
  const [previewState, setPreviewState] = useState('idle');
  const [deployTriggeredAt, setDeployTriggeredAt] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showBugModal, setShowBugModal] = useState(false);
  const [bugDescription, setBugDescription] = useState('');
  const [bugCategory, setBugCategory] = useState('missing_feature');
  const [bugScreenshots, setBugScreenshots] = useState([]);
  const bugFileInputRef = useRef(null);
  const [merging, setMerging] = useState(false);
  const [closingPR, setClosingPR] = useState(false);
  const [triggeringReview, setTriggeringReview] = useState(false);
  const [fixingReview, setFixingReview] = useState(false);
  const [overridingScope, setOverridingScope] = useState(null);
  const [reportingBug, setReportingBug] = useState(false);
  const [deployingPreview, setDeployingPreview] = useState(false);
  const [repairingPreview, setRepairingPreview] = useState(false);
  const [selectedIssuesPR, setSelectedIssuesPR] = useState(new Set());
  const [fixingSelectedPR, setFixingSelectedPR] = useState(false);
  const [fixTriggeredAt, setFixTriggeredAt] = useState(null);
  const [savingExceptions, setSavingExceptions] = useState(false);
  const preloadedBlockingRef = useRef(false);
  const appliedExceptionsRef = useRef(false);
  const prevReviewRunKeyRef = useRef(null);
  const previewInitializedRef = useRef(false);
  const [ignoredIssuesPR, setIgnoredIssuesPR] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`review-ignored-${pr.number}`) || '[]')); }
    catch { return new Set(); }
  });

  const { data: files, loading: filesLoading } = useApiGet(open ? `/admin/devhub/prs/${pr.number}/files` : null, [open, pr.number]);
  const { data: prCommits } = useApiGet(open ? `/admin/devhub/prs/${pr.number}/commits` : null, [open, pr.number]);
  const { data: prRuns, refetch: refetchPRRuns } = useApiGet(
    `/admin/devhub/prs/${pr.number}/runs`,
    [pr.number, open, refreshKey, outerRefreshKey]
  );
  const { data: reviewStatus, refetch: refetchReviewStatus } = useApiGet(`/admin/devhub/prs/${pr.number}/review-status`, [pr.number, refreshKey, outerRefreshKey]);
  const { data: reviewComments, loading: reportLoading } = useApiGet(showReport ? `/admin/devhub/prs/${pr.number}/review-comments` : null, [showReport, pr.number]);
  const { data: exceptionsData, refetch: refetchExceptions } = useApiGet(
    showReport ? `/admin/devhub/prs/${pr.number}/review-exceptions` : null,
    [showReport, pr.number]
  );



  // Réinitialiser les refs quand le rapport est fermé/rouvert
  useEffect(() => {
    if (!showReport) {
      preloadedBlockingRef.current = false;
      appliedExceptionsRef.current = false;
    }
  }, [showReport]);

  // Appliquer les exceptions GitHub persistantes + pré-cocher les bloquants restants
  useEffect(() => {
    if (!reviewComments?.length) return;
    // Exceptions : on les applique une seule fois par chargement de rapport
    if (!appliedExceptionsRef.current && exceptionsData !== undefined) {
      appliedExceptionsRef.current = true;
      const excSet = new Set((exceptionsData?.exceptions ?? []));
      const idsToIgnore = [];
      for (const comment of reviewComments.filter(c => c.scope !== 'fix')) {
        const rawLines = (comment.body || '').split('\n').filter(l => !/^\s*<!--/.test(l));
        let pIdx = 0;
        for (const line of rawLines) {
          if (/^- /.test(line)) {
            if (excSet.has(line.slice(2).trim())) idsToIgnore.push(`${comment.id}-p${pIdx}`);
            pIdx++;
          }
        }
      }
      // Pré-cocher tous les bloquants sauf ceux dans les exceptions
      const ignoredSet = new Set(idsToIgnore);
      const blockingIds = reviewComments
        .filter(c => c.scope !== 'fix')
        .flatMap(c => getBlockingProblemIds(c))
        .filter(id => !ignoredSet.has(id));
      setIgnoredIssuesPR(prev => {
        const n = new Set(prev);
        idsToIgnore.forEach(id => n.add(id));
        return n;
      });
      setSelectedIssuesPR(prev => {
        const n = new Set(prev);
        idsToIgnore.forEach(id => n.delete(id));
        blockingIds.forEach(id => n.add(id));
        return n;
      });
    } else if (!preloadedBlockingRef.current) {
      // Pas d'exceptions chargées encore : pré-cocher quand même les bloquants
      preloadedBlockingRef.current = true;
      const blockingIds = reviewComments
        .filter(c => c.scope !== 'fix')
        .flatMap(c => getBlockingProblemIds(c));
      if (blockingIds.length > 0) {
        setSelectedIssuesPR(prev => { const n = new Set(prev); blockingIds.forEach(id => n.add(id)); return n; });
      }
    }
  }, [reviewComments, exceptionsData]);

  // Surveiller le run Fix Reviews — refresh reviews + relance deploy si venu d'une réparation
  useEffect(() => {
    if (!fixTriggeredAt || !prRuns) return;
    const triggerMs = new Date(fixTriggeredAt).getTime() - 60_000;
    const fixRun = prRuns.find(r =>
      r.name?.toLowerCase().includes('fix') &&
      new Date(r.created_at).getTime() >= triggerMs
    );
    if (fixRun?.status === 'completed' && fixRun.conclusion === 'success') {
      refetchReviewStatus && refetchReviewStatus();
      // Si la réparation a été déclenchée depuis la barre d'échec, relancer le deploy
      if (repairingPreview) {
        setRepairingPreview(false);
        setPreviewState('deploying');
        setDeployTriggeredAt(new Date().toISOString());
        api.post(`/admin/devhub/prs/${pr.number}/deploy-preview`).catch(() => {
          setPreviewState('failed');
        });
      }
    }
  }, [prRuns, fixTriggeredAt]);

  // Surveiller les runs de review — refresh reviewStatus quand un run de review se termine
  useEffect(() => {
    if (!prRuns) return;
    const reviewRun = prRuns.find(r => {
      const n = (r.name ?? r.display_title ?? '').toLowerCase();
      return n.includes('review') && !n.includes('fix');
    });
    if (!reviewRun) return;
    const key = `${reviewRun.id}-${reviewRun.status}-${reviewRun.conclusion}`;
    if (prevReviewRunKeyRef.current !== key) {
      prevReviewRunKeyRef.current = key;
      if (reviewRun.status === 'completed') {
        refetchReviewStatus && refetchReviewStatus();
      }
    }
  }, [prRuns]);

  // Surveiller le run Delivery Agent
  useEffect(() => {
    if (previewState !== 'deploying' || !deployTriggeredAt || !prRuns) return;
    const triggerMs = new Date(deployTriggeredAt).getTime() - 30_000;
    const deliveryRun = prRuns.find(r => (r.name ?? r.display_title ?? '').toLowerCase().includes('delivery') && new Date(r.created_at).getTime() >= triggerMs);
    if (!deliveryRun) return;
    if (deliveryRun.status === 'completed') {
      if (deliveryRun.conclusion === 'success') {
        setPreviewState('done');
      } else {
        setPreviewState('failed');
      }
      setDeployTriggeredAt(null);
    }
  }, [prRuns, previewState, deployTriggeredAt]);

  useEffect(() => {
    if (previewState !== 'deploying') return;
    const timer = setTimeout(() => { setPreviewState('failed'); setDeployTriggeredAt(null); }, 15 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [previewState]);

  async function saveExceptions() {
    const headers = [];
    for (const comment of (reviewComments || []).filter(c => c.scope !== 'fix')) {
      const rawLines = (comment.body || '').split('\n').filter(l => !/^\s*<!--/.test(l));
      let pIdx = 0;
      for (const line of rawLines) {
        if (/^- /.test(line)) {
          if (ignoredIssuesPR.has(`${comment.id}-p${pIdx}`)) headers.push(line.slice(2).trim());
          pIdx++;
        }
      }
    }
    setSavingExceptions(true);
    try {
      await api.post(`/admin/devhub/prs/${pr.number}/review-exceptions`, { exceptions: headers });
      refetchExceptions && refetchExceptions();
    } catch {
      alert('Erreur lors de la sauvegarde des exceptions');
    } finally {
      setSavingExceptions(false);
    }
  }

  async function overrideReview(scope) {
    setOverridingScope(scope);
    try {
      await api.post(`/admin/devhub/prs/${pr.number}/override-review`, { scope });
      refetchReviewStatus && refetchReviewStatus();
    } catch {
      alert('Erreur lors du passage en avertissement');
    } finally {
      setOverridingScope(null);
    }
  }

  function handleRefresh(e) {
    e.stopPropagation();
    setRefreshKey(k => k + 1);
    refetchPRRuns && refetchPRRuns();
    refetchReviewStatus && refetchReviewStatus();
  }

  async function handleMerge() {
    try {
      setMerging(true);
      await api.post(`/admin/devhub/prs/${pr.number}/merge`, { mergeMethod: 'squash' });
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.details?.message || 'Erreur lors du merge de la PR';
      alert(`Erreur lors du merge de la PR\n\n${msg}`);
    } finally {
      setMerging(false);
    }
  }

  async function handleDeployPreview() {
    try {
      setDeployingPreview(true);
      setPreviewState('deploying');
      setDeployTriggeredAt(new Date().toISOString());
      await api.post(`/admin/devhub/prs/${pr.number}/deploy-preview`);
    } catch {
      setPreviewState('idle');
      setDeployTriggeredAt(null);
      alert('Erreur lors du déclenchement du preview');
    } finally {
      setDeployingPreview(false);
    }
  }

  async function addBugImages(files) {
    const remaining = 5 - bugScreenshots.length;
    if (remaining <= 0) return;
    const toAdd = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, remaining);
    const encoded = await Promise.all(toAdd.map(f => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ data: reader.result, mimeType: f.type || 'image/png', preview: reader.result });
      reader.onerror = reject;
      reader.readAsDataURL(f);
    })));
    setBugScreenshots(prev => [...prev, ...encoded]);
  }

  async function handleBugPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) { const f = item.getAsFile(); if (f) imageFiles.push(f); }
    }
    if (imageFiles.length > 0) { e.preventDefault(); await addBugImages(imageFiles); }
  }

  async function handleReportBug() {
    if (bugDescription.trim().length < 10) { alert('Description trop courte (10 car. min)'); return; }
    try {
      setReportingBug(true);
      await api.post(`/admin/devhub/prs/${pr.number}/report-bug`, {
        bug_description: bugDescription.trim(),
        bug_category: bugCategory,
        ai_model: aiModel,
        screenshots: bugScreenshots.map(s => ({ data: s.data, mimeType: s.mimeType })),
      });
      setShowBugModal(false);
      setBugDescription('');
      setBugScreenshots([]);
    } catch {
      alert('Erreur lors du signalement du bug');
    } finally {
      setReportingBug(false);
    }
  }

  const canMerge = pr.state === 'open' && !pr.merged_at;

  return (
    <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
      <button className="flex w-full items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(v => !v)}>
        {pr.merged_at
          ? <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">Mergé</span>
          : pr.state === 'open'
          ? <span className="rounded-full border border-emerald-500 px-2 py-0.5 text-xs font-medium text-emerald-700">Ouvert</span>
          : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Fermé</span>}
        <span className="font-mono text-xs text-gray-400 shrink-0">#{pr.number}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-left">{pr.title}</span>
        <button onClick={handleRefresh} className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Actualiser">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <a href={pr.html_url} target="_blank" rel="noopener noreferrer"
          className="text-gray-400 hover:text-gray-600 shrink-0" onClick={e => e.stopPropagation()}>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {/* Actions */}
          <div className="flex flex-col gap-2 bg-gray-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <span className="text-xs text-gray-500">Branche : <span className="font-mono">{pr.head.ref}</span></span>
            <div className="flex flex-wrap items-center gap-2">
              {!pr.merged_at && (
                <button
                  onClick={async () => {
                    setTriggeringReview(true);
                    try { await api.post(`/admin/devhub/prs/${pr.number}/trigger-reviews`, { reviewModel: aiModel, fixModel: aiModel }); }
                    catch { alert('Erreur lors du déclenchement des reviews'); }
                    finally { setTriggeringReview(false); }
                  }}
                  disabled={triggeringReview}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  <Bot className="h-3.5 w-3.5" />
                  {triggeringReview ? 'Lancement…' : 'Relancer Review'}
                </button>
              )}
              {(previewState === 'deploying' ? (
                <button onClick={() => { setPreviewState('idle'); setDeployTriggeredAt(null); }}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50">
                  <X className="h-3.5 w-3.5" />Annuler attente
                </button>
              ) : (
                <button onClick={handleDeployPreview} disabled={deployingPreview}
                  className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50">
                  <Rocket className="h-3.5 w-3.5" />
                  {deployingPreview ? 'Déclenchement…' : 'Deploy Preview'}
                </button>
              ))}
              {pr.state === 'open' && !pr.merged_at && (
                <button onClick={() => setShowBugModal(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-100">
                  <Bug className="h-3.5 w-3.5" />Signaler un bug
                </button>
              )}
              {canMerge && (
                <button onClick={() => { if (!confirm(`Fermer la PR #${pr.number} ?`)) return;
                    setClosingPR(true);
                    api.post(`/admin/devhub/prs/${pr.number}/close`).catch(() => alert('Erreur')).finally(() => setClosingPR(false)); }}
                  disabled={closingPR}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                  <X className="h-3.5 w-3.5" />{closingPR ? 'Fermeture…' : 'Fermer la PR'}
                </button>
              )}
              {canMerge && (
                <button onClick={handleMerge} disabled={merging}
                  className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50">
                  <GitMerge className="h-3.5 w-3.5" />{merging ? 'Merge en cours…' : 'Squash & Merge'}
                </button>
              )}
              {pr.merged_at && (
                <span className="flex items-center gap-1 text-xs text-purple-600 font-medium">
                  <GitMerge className="h-3.5 w-3.5" />Mergée le {new Date(pr.merged_at).toLocaleDateString('fr-FR')}
                </span>
              )}
            </div>
          </div>

          {/* Review status badges — uniquement si au moins un verdict réel (pas juste pending) */}
          {reviewStatus && (['approved','warning','blocked'].some(v => reviewStatus.backend === v || reviewStatus.frontend === v || reviewStatus.functional === v)) && (
            <div className="flex flex-col border-t bg-gray-50">
              <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs">
                <span className="text-gray-500">Code reviews :</span>
                {reviewStatus.backend && (
                  <span className="inline-flex items-center gap-1">
                    <ReviewBadge scope="backend" verdict={reviewStatus.backend} />
                  </span>
                )}
                {reviewStatus.frontend && (
                  <span className="inline-flex items-center gap-1">
                    <ReviewBadge scope="frontend" verdict={reviewStatus.frontend} />
                  </span>
                )}
                {reviewStatus.functional && (
                  <span className="inline-flex items-center gap-1">
                    <ReviewBadge scope="functional" verdict={reviewStatus.functional} />
                  </span>
                )}
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <button onClick={() => setShowReport(v => !v)}
                    className="flex items-center gap-1 h-6 px-2 text-xs text-gray-500 hover:text-gray-700 rounded hover:bg-gray-100">
                    <FileCode className="h-3 w-3" />{showReport ? 'Masquer rapport' : 'Voir rapport'}
                  </button>
                </div>
              </div>
              {showReport && (
                <div className="border-t border-gray-200 bg-white px-3 py-2">
                  {reportLoading ? (
                    <div className="space-y-1"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
                  ) : !reviewComments || reviewComments.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Aucun rapport de review disponible — relancez une review.</p>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {reviewComments.filter(c => c.scope !== 'fix').map(c => (
                          <ReviewReportBlock
                            key={c.id} comment={c} mode="select"
                            selectedIds={selectedIssuesPR} ignoredIds={ignoredIssuesPR}
                            onToggle={(id) => setSelectedIssuesPR(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                            onIgnore={(id, c) => {
                              const blockingIds = getBlockingProblemIds(c);
                              setIgnoredIssuesPR(prev => {
                                const n = new Set(prev);
                                const wasIgnored = n.has(id);
                                wasIgnored ? n.delete(id) : n.add(id);
                                localStorage.setItem(`review-ignored-${pr.number}`, JSON.stringify([...n]));
                                // Si on vient d'ignorer et que tous les bloquants sont désormais ignorés → override auto
                                if (!wasIgnored && blockingIds.length > 0 && blockingIds.every(bid => n.has(bid))) {
                                  overrideReview(c.scope);
                                }
                                return n;
                              });
                              setSelectedIssuesPR(prev => { const n = new Set(prev); n.delete(id); return n; });
                            }}
                          />
                        ))}
                      </div>
                      <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-gray-500">
                            {selectedIssuesPR.size > 0
                              ? <><span className="font-semibold text-blue-600">{selectedIssuesPR.size}</span> sélectionné{selectedIssuesPR.size > 1 ? 's' : ''}</>
                              : ignoredIssuesPR.size > 0
                              ? <><span className="font-semibold text-amber-600">{ignoredIssuesPR.size}</span> ignoré{ignoredIssuesPR.size > 1 ? 's' : ''}</>
                              : 'Cochez les problèmes à corriger'}
                          </p>
                          <div className="flex items-center gap-1.5">
                            {ignoredIssuesPR.size > 0 && (
                              <button
                                disabled={savingExceptions}
                                onClick={saveExceptions}
                                title="Persister ces downgrades sur GitHub — les prochaines reviews ne rebloquent plus ces points"
                                className="flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40">
                                <ShieldCheck className="h-3 w-3" />
                                {savingExceptions ? 'Sauvegarde…' : `Confirmer ${ignoredIssuesPR.size} downgrade${ignoredIssuesPR.size > 1 ? 's' : ''}`}
                              </button>
                            )}
                            <button
                              disabled={selectedIssuesPR.size === 0 || fixingSelectedPR}
                              onClick={async () => {
                                const issueTitles = [];
                                for (const comment of (reviewComments || [])) {
                                  const rawLines = (comment.body || '').split('\n').filter(l => !/^\s*<!--/.test(l));
                                  let pIdx = 0;
                                  for (const line of rawLines) {
                                    if (/^- /.test(line)) {
                                      if (selectedIssuesPR.has(`${comment.id}-p${pIdx}`)) {
                                        issueTitles.push(`[${comment.scope}] ${line.slice(2).trim()}`);
                                      }
                                      pIdx++;
                                    }
                                  }
                                }
                                setFixingSelectedPR(true);
                                try {
                                  await api.post(`/admin/devhub/prs/${pr.number}/fix-reviews`, { aiModel, issuesToFix: issueTitles });
                                  setSelectedIssuesPR(new Set());
                                  setShowReport(false);
                                  setFixTriggeredAt(new Date().toISOString());
                                  // Refresh automatique des runs toutes les 10s pendant 5 min
                                  let attempts = 0;
                                  const poll = setInterval(() => {
                                    attempts++;
                                    refetchPRRuns && refetchPRRuns();
                                    if (attempts >= 30) clearInterval(poll);
                                  }, 10000);
                                } catch { alert('Erreur lors du déclenchement du fix ciblé'); }
                                finally { setFixingSelectedPR(false); }
                              }}
                              className="flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40">
                              <Zap className="h-3 w-3" />
                              {fixingSelectedPR ? 'Lancement…' : 'Corriger la sélection (IA)'}
                            </button>
                          </div>
                        </div>
                        {exceptionsData?.exceptions?.length > 0 && (
                          <p className="text-[10px] text-amber-600 flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3 shrink-0" />
                            {exceptionsData.exceptions.length} exception{exceptionsData.exceptions.length > 1 ? 's' : ''} persistante{exceptionsData.exceptions.length > 1 ? 's' : ''} — ces bloquants sont downgradés automatiquement.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Fix en cours */}
          {fixTriggeredAt && (() => {
            const fixRun = prRuns?.find(r =>
              r.name?.toLowerCase().includes('fix') &&
              new Date(r.created_at).getTime() >= new Date(fixTriggeredAt).getTime() - 60000
            );
            const isDone = fixRun?.status === 'completed';
            if (isDone && fixRun && new Date().getTime() - new Date(fixRun.updated_at).getTime() > 30000) {
              // Plus de 30s après la fin → masquer
              return null;
            }
            return (
              <div className={`flex items-center justify-between gap-3 border-t px-3 py-2 text-xs ${isDone ? (fixRun?.conclusion === 'success' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100') : 'bg-violet-50 border-violet-100'}`}>
                <span className={`flex items-center gap-1.5 font-medium ${isDone ? (fixRun?.conclusion === 'success' ? 'text-emerald-700' : 'text-red-700') : 'text-violet-700'}`}>
                  {!fixRun && <><RefreshCw className="h-3 w-3 animate-spin" /> Fix ciblé en attente de démarrage…</>}
                  {fixRun && !isDone && <><RefreshCw className="h-3 w-3 animate-spin" /> Fix ciblé en cours…</>}
                  {fixRun && isDone && fixRun.conclusion === 'success' && <><CheckCircle className="h-3 w-3" /> Fix terminé — corrections poussées</>}
                  {fixRun && isDone && fixRun.conclusion !== 'success' && <><XCircle className="h-3 w-3" /> Fix échoué ({fixRun.conclusion})</>}
                </span>
                <div className="flex items-center gap-2">
                  {fixRun && (
                    <a href={fixRun.html_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-gray-500 hover:text-gray-700 underline underline-offset-2">
                      <ExternalLink className="h-3 w-3" /> Run #{fixRun.run_number}
                    </a>
                  )}
                  <button onClick={() => setFixTriggeredAt(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Historique runs */}
          <div className="border-t border-gray-100 px-3 py-2">
            <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <RefreshCw className="h-3 w-3" />Historique reviews
            </h4>
            {!prRuns?.length ? <p className="text-xs text-gray-400">Aucun run de review</p>
            : (
              <div className="space-y-1">
                {prRuns.map(run => (
                  <RunDetail key={run.id} run={run} commits={prCommits?.filter(c => matchRunToCommit(run, c))} />
                ))}
              </div>
            )}
          </div>

          {/* Commits non associés */}
          {(() => {
            const unmatched = (prCommits ?? []).filter(c => !prRuns?.some(run => matchRunToCommit(run, c)));
            if (!unmatched.length) return null;
            return (
              <div className="border-t border-gray-100 px-3 py-2">
                <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <GitCommit className="h-3 w-3" />Commits ({unmatched.length})
                </h4>
                <div className="space-y-1">{unmatched.map(c => <CommitRow key={c.sha} sha={c.sha} message={c.commit.message} authorName={c.commit.author.name} htmlUrl={c.html_url} />)}</div>
              </div>
            );
          })()}

          {/* Files */}
          <div className="px-3 py-2">
            {filesLoading ? (
              <div className="space-y-1"><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-4/5" /></div>
            ) : !files?.length ? (
              <p className="text-xs text-gray-400">Aucun fichier modifié</p>
            ) : (
              <div>
                <p className="mb-1.5 text-xs font-medium text-gray-500">
                  {files.length} fichier{files.length > 1 ? 's' : ''} modifié{files.length > 1 ? 's' : ''}
                  {' — '}<span className="text-emerald-600">+{files.reduce((a, f) => a + f.additions, 0)}</span>
                  {' / '}<span className="text-red-500">-{files.reduce((a, f) => a + f.deletions, 0)}</span>
                </p>
                <div className="space-y-0.5">
                  {files.map(f => (
                    <div key={f.filename}>
                      <button className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-gray-50 transition-colors"
                        onClick={() => setShowPatch(showPatch === f.filename ? null : f.filename)}>
                        <span className={`w-4 shrink-0 text-center text-xs font-bold ${fileStatusColor(f.status)}`}>{fileStatusLabel(f.status)}</span>
                        <FileCode className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="min-w-0 flex-1 break-all font-mono text-xs text-gray-700">{f.filename}</span>
                        <span className="shrink-0 flex items-center gap-1 text-xs">
                          <span className="text-emerald-600 flex items-center"><Plus className="h-2.5 w-2.5" />{f.additions}</span>
                          <span className="text-red-500 flex items-center"><Minus className="h-2.5 w-2.5" />{f.deletions}</span>
                        </span>
                      </button>
                      {showPatch === f.filename && f.patch && (
                        <pre className="mt-1 overflow-x-auto rounded bg-gray-900 px-3 py-2 text-xs leading-5 text-gray-100 mb-1">
                          {f.patch.split('\n').map((line, i) => (
                            <div key={i} className={
                              line.startsWith('+') && !line.startsWith('++') ? 'text-emerald-400'
                              : line.startsWith('-') && !line.startsWith('--') ? 'text-red-400'
                              : line.startsWith('@@') ? 'text-blue-400' : ''
                            }>{line}</div>
                          ))}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal bug QA */}
      {showBugModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowBugModal(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                <Bug className="h-4 w-4 text-amber-500" />Signaler un bug — PR #{pr.number}
              </h3>
              <button onClick={() => setShowBugModal(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 px-4 py-4" onPaste={handleBugPaste}>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Catégorie</label>
                <select value={bugCategory} onChange={e => setBugCategory(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="missing_feature">🔴 Fonctionnalité manquante</option>
                  <option value="functional_bug">🟠 Erreur fonctionnelle</option>
                  <option value="visual_bug">🟡 Bug visuel</option>
                  <option value="other">⚪ Autre</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Description du problème</label>
                <textarea rows={4} placeholder="Décrivez ce qui manque ou ne fonctionne pas…"
                  value={bugDescription} onChange={e => setBugDescription(e.target.value)}
                  onPaste={handleBugPaste}
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <p className="mt-0.5 text-right text-xs text-gray-400">{bugDescription.length} / 2000</p>
              </div>
              {/* Zone screenshots */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700">Screenshots <span className="font-normal text-gray-400">({bugScreenshots.length}/5)</span></label>
                  {bugScreenshots.length < 5 && (
                    <button type="button" onClick={() => bugFileInputRef.current?.click()}
                      className="flex items-center gap-1 rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50">
                      <ImagePlus className="h-3.5 w-3.5" />Ajouter
                    </button>
                  )}
                </div>
                <input ref={bugFileInputRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={e => { if (e.target.files) addBugImages(e.target.files); e.target.value = ''; }} />
                {bugScreenshots.length === 0 ? (
                  <div onClick={() => bugFileInputRef.current?.click()}
                    className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-400 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-500 transition-colors">
                    <ImagePlus className="h-5 w-5" />
                    Cliquer ou coller (Ctrl+V) pour ajouter un screenshot
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {bugScreenshots.map((s, i) => (
                      <div key={i} className="group relative h-16 w-24 overflow-hidden rounded-md border border-gray-200">
                        <img src={s.preview} alt={`screenshot-${i + 1}`} className="h-full w-full object-cover" />
                        <button type="button" onClick={() => setBugScreenshots(prev => prev.filter((_, j) => j !== i))}
                          className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                    {bugScreenshots.length < 5 && (
                      <button type="button" onClick={() => bugFileInputRef.current?.click()}
                        className="flex h-16 w-24 items-center justify-center rounded-md border border-dashed border-gray-200 text-gray-400 hover:border-amber-300 hover:text-amber-400 transition-colors">
                        <Plus className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400">Modèle : <span className="font-mono">{aiModel}</span></p>
            </div>
            <div className="flex justify-end gap-2 border-t px-4 py-3">
              <button onClick={() => setShowBugModal(false)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
              <button onClick={handleReportBug} disabled={reportingBug || bugDescription.trim().length < 10}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50">
                <Bug className="h-3.5 w-3.5" />{reportingBug ? 'Signalement…' : 'Déclencher le fix'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── StageDetailPanel ─────────────────────────────────────────────────────────

function StageDetailPanel({ meta, runs, prCommits, specPR, specPRFiles, devPRFiles, devPRRef, issueTitle, issueBody, onClose, onFileClick }) {
  const [activeRunId, setActiveRunId] = useState(runs[0]?.id ?? null);
  const [showFiles, setShowFiles] = useState(true);
  const activeRun = runs.find(r => r.id === activeRunId) ?? runs[0];
  const { data: jobs = [] } = useApiGet(activeRun?.id ? `/admin/devhub/runs/${activeRun.id}/jobs` : null, [activeRun?.id]);

  // Détecte le job auto-fix intégré dans le run de review (code-reviews.yml)
  const autoFixJob = meta.id === 'review'
    ? jobs.find(j => { const jn = j.name.toLowerCase(); return jn.includes('auto-fix') || jn.includes('fix-pr-review'); }) ?? null
    : null;
  // Commits poussés par l'agent fix-reviews
  const fixCommits = meta.id === 'review'
    ? prCommits.filter(c => c.commit.author.name.toLowerCase().includes('fix-review'))
    : [];

  useEffect(() => {
    if (runs.length > 0 && !runs.find(r => r.id === activeRunId)) {
      setActiveRunId(runs[0].id);
    }
  }, [runs, activeRunId]);

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border-2 bg-white ${meta.selBorder}`} style={{ maxHeight: 580 }}>
      <div className={`flex shrink-0 items-center justify-between px-4 py-2.5 ${meta.headBg}`}>
        <span className={`text-xs font-semibold ${meta.headText}`}>Détails de l'étape</span>
        <button onClick={onClose} className="rounded p-0.5 text-gray-400 hover:bg-white/60"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!activeRun ? (
          <div className="flex items-center justify-center py-10 text-xs text-gray-400">Aucune exécution pour cette étape</div>
        ) : (
          <>
            {runs.length > 1 && (
              <div className="border-b border-gray-100 px-4 py-2">
                <select className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs"
                  value={activeRunId ?? ''} onChange={e => setActiveRunId(Number(e.target.value))}>
                  {runs.map(r => (
                    <option key={r.id} value={r.id}>#{r.run_number} — {fmtShortDate(r.created_at)} — {r.conclusion ?? r.status}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="px-4 pt-3 pb-2">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold leading-snug text-gray-900">{runAgentName(activeRun)} #{activeRun.run_number}</h4>
                  <p className="mt-0.5 text-[11px] text-gray-400">{fmtShortDate(activeRun.created_at)}</p>
                </div>
                <StatusIcon status={activeRun.status} conclusion={activeRun.conclusion} />
              </div>
            </div>
            {(() => {
              const matched = prCommits.filter(c => matchRunToCommit(activeRun, c));
              return matched.length > 0 ? (
                <div className="border-t border-gray-100 px-4 py-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Commits ({matched.length})</p>
                  <div className="space-y-1">{matched.map(c => <CommitRow key={c.sha} sha={c.sha} message={c.commit.message} authorName={c.commit.author.name} htmlUrl={c.html_url} />)}</div>
                </div>
              ) : null;
            })()}
            <div className="border-t border-gray-100 px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Jobs & Étapes</p>
              {jobs.length === 0 ? <p className="text-xs italic text-gray-400">Chargement…</p> : (
                <div className="space-y-2">
                  {jobs.map(job => (
                    <div key={job.id}>
                      <div className="flex items-center gap-2 py-0.5">
                        <StatusIcon status={job.status} conclusion={job.conclusion} size="h-3.5 w-3.5" />
                        <span className="flex-1 truncate text-xs font-medium text-gray-800">{job.name}</span>
                        <span className="shrink-0 text-xs text-gray-400">{stepDuration(job)}</span>
                        <a href={job.html_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-gray-400 hover:text-gray-600"><ExternalLink className="h-3 w-3" /></a>
                      </div>
                      <div className="ml-5 space-y-0.5 border-l border-gray-100 pl-3">
                        {(job.steps ?? []).filter(s => s.name !== 'Set up job' && s.name !== 'Complete job').map(step => (
                          <div key={step.number} className="flex items-center gap-2 py-0.5">
                            <StatusIcon status={step.status} conclusion={step.conclusion} size="h-3 w-3" />
                            <span className={`text-xs ${step.conclusion === 'skipped' ? 'text-gray-400' : 'text-gray-700'}`}>{step.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 px-4 py-3">
              <a href={activeRun.html_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> Voir le rapport complet
              </a>
            </div>
            {autoFixJob && (
              <div className="border-t border-orange-100 bg-orange-50/50 px-4 py-3">
                <p className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-orange-500">
                  <Zap className="h-3 w-3" /> Auto-fix appliqué
                </p>
                <div className="rounded border border-orange-200 bg-white px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={autoFixJob.status} conclusion={autoFixJob.conclusion} />
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{autoFixJob.name}</span>
                    <a href={autoFixJob.html_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-gray-400 hover:text-gray-600"><ExternalLink className="h-3 w-3" /></a>
                  </div>
                  {fixCommits.length > 0 && (
                    <div className="mt-1.5 space-y-0.5 border-t border-orange-100 pt-1.5">
                      <p className="mb-1 text-[10px] text-orange-400">{fixCommits.length} commit{fixCommits.length > 1 ? 's' : ''} poussé{fixCommits.length > 1 ? 's' : ''}</p>
                      {fixCommits.map(c => <CommitRow key={c.sha} sha={c.sha} message={c.commit.message} authorName={c.commit.author.name} htmlUrl={c.html_url} />)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── StageCard ────────────────────────────────────────────────────────────────

function StageCard({ meta, run, pr, prFiles, reviewStatus, prCommits, specPR, fixJob, isSelected, onClick, onFileClick, onViewReport, onRetriggerReview, retriggerPending, onOverrideReview, overridingScope, onRetriggerPreview, retriggerPreviewPending, onRepairPreview, repairingPreview }) {
  const prStatus = !pr ? 'pending' : pr.merged_at ? 'success' : pr.state === 'open' ? 'pending' : 'failure';
  const status = meta.id === 'merge' ? prStatus : runPipelineStatus(run);
  const isEmpty = meta.id === 'merge' ? !pr : !run;

  // Pour les cartes dev et fix : n'afficher que les fichiers des commits de ce run
  // Endpoint DB : /runs/:runId/files (alimenté par le webhook au moment du completed)
  const isAgentWithCommits = meta.id === 'dev' || meta.id === 'fix';
  const { data: agentRunFiles } = useApiGet(
    isAgentWithCommits && run?.id && run?.status === 'completed'
      ? `/admin/devhub/runs/${run.id}/files`
      : null,
    [run?.id, run?.status]
  );
  // Afficher uniquement les fichiers du run (depuis github_run_commits) — jamais de fallback sur prFiles
  const displayFiles = isAgentWithCommits
    ? (agentRunFiles?.length > 0 ? agentRunFiles : null)
    : prFiles;

  return (
    <div onClick={onClick}
      className={`flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 bg-white transition-all hover:shadow-md ${
        isSelected ? `${meta.selBorder} shadow-sm`
        : isEmpty ? 'border-dashed border-gray-200 opacity-70 hover:opacity-100 hover:border-gray-300'
        : 'border-gray-200 hover:border-gray-300'
      } shrink-0 w-[175px]`}>
      <div className={`flex items-start gap-2 px-3 py-2 ${isSelected ? meta.headBg : 'bg-gray-50'}`}>
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${isSelected ? meta.dotBg : 'bg-gray-300'}`}>
          {meta.num}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold leading-snug ${isSelected ? meta.headText : 'text-gray-600'}`}>{meta.num}. {meta.label}</p>
          {(run?.created_at ?? pr?.created_at) && (
            <p className="text-[10px] text-gray-400">{fmtShortDate(run?.created_at ?? pr?.created_at)}</p>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-3 py-2.5">
        <div className="flex items-start justify-between gap-1">
          {run ? (
            <p className="flex-1 text-xs font-semibold leading-snug text-gray-800">{runAgentName(run)} <span className="font-mono text-gray-400">#{run.run_number}</span></p>
          ) : pr ? (
            <div className="flex flex-1 flex-wrap items-center gap-1">
              <span className="text-xs font-semibold text-gray-800">PR #{pr.number}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${pr.merged_at ? 'bg-purple-100 text-purple-700' : pr.state === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {pr.merged_at ? 'Mergée' : pr.state === 'open' ? 'Ouverte' : 'Fermée'}
              </span>
            </div>
          ) : (
            <span className="text-xs italic text-gray-400">En attente…</span>
          )}
          <PipelineStatusIcon status={status} />
        </div>
        {pr?.head?.ref && (
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <GitBranch className="h-3 w-3 shrink-0 text-gray-300" />
            <span className="truncate font-mono text-[10px]">{pr.head.ref}</span>
          </div>
        )}
        {meta.id === 'dev' && displayFiles && displayFiles.length > 0 && (
          <div className={`rounded border px-2 py-1.5 ${meta.boxBg}`}>
            <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${meta.boxTitle}`}>Livrables</p>
            <ul className="space-y-0.5 text-[11px]">
              <li className="text-gray-600">• {displayFiles.length} fichier{displayFiles.length > 1 ? 's' : ''} modifié{displayFiles.length > 1 ? 's' : ''}</li>
              <li className="text-emerald-600">• +{displayFiles.reduce((s, f) => s + f.additions, 0)} ajouts</li>
              <li className="text-red-500">• -{displayFiles.reduce((s, f) => s + f.deletions, 0)} suppressions</li>
            </ul>
          </div>
        )}
        {meta.id === 'spec' && run?.conclusion === 'success' && (
          <div className={`rounded border px-2 py-1.5 ${meta.boxBg}`}>
            <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${meta.boxTitle}`}>Livrables</p>
            {prFiles && prFiles.length > 0 ? (
              <ul className="space-y-0.5">
                {prFiles.map(f => (
                  <li key={f.filename} className="flex items-center gap-1">
                    <button onClick={e => { e.stopPropagation(); onFileClick?.(f.filename, specPR?.head?.ref ?? 'master'); }}
                      className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline truncate text-left">
                      <FileCode className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{f.filename.split('/').pop()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-0.5 text-[11px] text-gray-600">
                <li>• Spécification fonctionnelle</li>
                {specPR ? <li className="text-emerald-600">✓ PR #{specPR.number}</li> : <li className="text-emerald-600">✓ Validée</li>}
              </ul>
            )}
          </div>
        )}
        {meta.id === 'review' && reviewStatus && (['approved','warning','blocked'].some(v => reviewStatus.backend === v || reviewStatus.frontend === v || reviewStatus.functional === v)) && (
          <div className={`rounded border px-2 py-1.5 ${meta.boxBg}`}>
            <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${meta.boxTitle}`}>Résultat</p>
            <div className="flex flex-col gap-1">
              {reviewStatus.backend && (
                <span className="inline-flex items-center gap-1 flex-wrap">
                  <ReviewBadge scope="backend" verdict={reviewStatus.backend} />
                </span>
              )}
              {reviewStatus.frontend && (
                <span className="inline-flex items-center gap-1 flex-wrap">
                  <ReviewBadge scope="frontend" verdict={reviewStatus.frontend} />
                </span>
              )}
              {reviewStatus.functional && (
                <span className="inline-flex items-center gap-1 flex-wrap">
                  <ReviewBadge scope="functional" verdict={reviewStatus.functional} />
                </span>
              )}
            </div>
          </div>
        )}
        {meta.id === 'preview' && run && (
          <div className={`rounded border px-2 py-1.5 ${meta.boxBg}`}>
            <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${meta.boxTitle}`}>Environnement</p>
            <p className="text-[11px] text-gray-600">Preview</p>
            <a href={PREVIEW_URL} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-sky-600 hover:underline">
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />{PREVIEW_URL.replace('http://', '')}
            </a>
          </div>
        )}
        {meta.id === 'prod' && run && (
          <div className={`rounded border px-2 py-1.5 ${meta.boxBg}`}>
            <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${meta.boxTitle}`}>Environnement</p>
            <p className="text-[11px] text-gray-600">Production</p>
          </div>
        )}
        <div className="flex-1" />
        {meta.id === 'fix' && displayFiles && displayFiles.length > 0 && (
          <div className={`rounded border px-2 py-1.5 ${meta.boxBg}`}>
            <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${meta.boxTitle}`}>Livrables</p>
            <ul className="space-y-0.5 text-[11px]">
              <li className="text-gray-600">• {displayFiles.length} fichier{displayFiles.length > 1 ? 's' : ''} corrigé{displayFiles.length > 1 ? 's' : ''}</li>
              <li className="text-emerald-600">• +{displayFiles.reduce((s, f) => s + f.additions, 0)} ajouts</li>
              <li className="text-red-500">• -{displayFiles.reduce((s, f) => s + f.deletions, 0)} suppressions</li>
            </ul>
          </div>
        )}
        {meta.id === 'fix' && run && (
          <div className={`rounded border px-2 py-1.5 ${meta.boxBg}`}>
            <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${meta.boxTitle}`}>Résultat</p>
            <p className="text-[11px] text-gray-600">
              {run.conclusion === 'success' ? '✅ Corrections appliquées' : run.conclusion === 'failure' ? '❌ Échec du fix' : '⏳ En cours…'}
            </p>
          </div>
        )}
        {meta.id === 'fix' && run?.conclusion === 'success' && onRetriggerReview ? (
          <button onClick={e => { e.stopPropagation(); onRetriggerReview(); }} disabled={retriggerPending}
            className="flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:underline disabled:opacity-50">
            {retriggerPending ? <RefreshCw className="h-2.5 w-2.5 shrink-0 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5 shrink-0" />}
            Relancer la review (périmètre fix)
          </button>
        ) : meta.id === 'fix' && run?.conclusion === 'success' && (
          <p className="text-[10px] italic text-violet-500">→ Relancer la review via la carte Code Review</p>
        )}
        {meta.id === 'review' && fixJob?.conclusion === 'success' && (
          <div className="rounded border border-orange-200 bg-orange-50 px-2 py-1.5">
            <p className="flex items-center gap-1 text-[10px] font-semibold text-orange-600">
              <Zap className="h-2.5 w-2.5 shrink-0" /> Auto-fix appliqué
            </p>
            <p className="text-[10px] text-orange-500">→ Relancer la review</p>
          </div>
        )}
        {meta.id === 'review' && onRetriggerReview && (
          <button onClick={e => { e.stopPropagation(); onRetriggerReview(); }} disabled={retriggerPending}
            className="flex items-center gap-1 text-[11px] font-medium text-orange-600 hover:underline disabled:opacity-50">
            {retriggerPending ? <RefreshCw className="h-2.5 w-2.5 shrink-0 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5 shrink-0" />}
            Relancer la review
          </button>
        )}
        {meta.id === 'preview' && onRetriggerPreview && (
          <button onClick={e => { e.stopPropagation(); onRetriggerPreview(); }} disabled={retriggerPreviewPending}
            className="flex items-center gap-1 text-[11px] font-medium text-sky-600 hover:underline disabled:opacity-50">
            {retriggerPreviewPending ? <RefreshCw className="h-2.5 w-2.5 shrink-0 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5 shrink-0" />}
            Relancer le preview
          </button>
        )}
        {meta.id === 'preview' && run?.status === 'completed' && run?.conclusion !== 'success' && onRepairPreview && (
          <button onClick={e => { e.stopPropagation(); onRepairPreview(); }} disabled={repairingPreview}
            className="flex items-center gap-1 text-[11px] font-medium text-red-600 hover:underline disabled:opacity-50">
            {repairingPreview ? <RefreshCw className="h-2.5 w-2.5 shrink-0 animate-spin" /> : <Wrench className="h-2.5 w-2.5 shrink-0" />}
            {repairingPreview ? 'Réparation…' : 'Réparer'}
          </button>
        )}
        {run && meta.id === 'review' && onViewReport ? (
          <button onClick={e => { e.stopPropagation(); onViewReport(); }}
            className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline">
            <FileCode className="h-2.5 w-2.5 shrink-0" />Voir le rapport
          </button>
        ) : run ? (
          <a href={run.html_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline">
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            {meta.id === 'preview' || meta.id === 'prod' ? 'Voir le déploiement' : 'Voir le résultat'}
          </a>
        ) : null}
        {meta.id === 'merge' && pr && (
          <a href={pr.html_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 text-[11px] font-medium text-purple-600 hover:underline">
            <ExternalLink className="h-2.5 w-2.5 shrink-0" /> Voir la PR
          </a>
        )}
      </div>
    </div>
  );
}

// ─── RunTimelineItem ──────────────────────────────────────────────────────────

const mdClasses = `prose prose-sm max-w-none text-gray-700
  [&_h1]:text-sm [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1
  [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1
  [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-gray-600
  [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5
  [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-0.5
  [&_li]:text-xs [&_li]:text-gray-700
  [&_p]:text-xs [&_p]:leading-relaxed [&_p]:mb-1
  [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_code]:font-mono [&_code]:text-gray-800
  [&_a]:text-blue-500 [&_a]:underline [&_a:hover]:text-blue-700
  [&_hr]:border-gray-200 [&_hr]:my-2`;

function RunTimelineItem({ run, pr, runComments = [] }) {
  const [open, setOpen] = useState(false);
  // La PR est considérée comme le résultat de ce run seulement si elle a été créée après le run
  const prIsResult = pr && run.created_at && pr.created_at && new Date(pr.created_at) >= new Date(run.created_at);
  // Commentaires postés par le bot github-actions (reviews) pour ce run
  const botComments = runComments.filter(c => c.user?.login === 'github-actions[bot]' || c.user?.type === 'Bot');

  const hasContent = (prIsResult && pr.body) || botComments.length > 0;

  return (
    <div className="overflow-hidden rounded-md border border-gray-100">
      <button
        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-50"
        onClick={() => setOpen(v => !v)}
      >
        <span className="w-[78px] shrink-0 font-mono text-[11px] text-gray-400">{fmtShortDate(run.created_at)}</span>
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gray-100">
          <StatusIcon status={run.status} conclusion={run.conclusion} size="h-3.5 w-3.5" />
        </div>
        <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${runStageBadgeCls(run)}`}>{runAgentName(run)}</span>
        <span className="shrink-0 font-mono text-[11px] text-gray-400">#{run.run_number}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-gray-600">{run.display_title ?? run.name ?? ''}</span>
        {hasContent && <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-blue-400" title="Contenu disponible" />}
        <a href={run.html_url} target="_blank" rel="noopener noreferrer"
          className="shrink-0 text-gray-400 hover:text-gray-600" onClick={e => e.stopPropagation()}>
          <ExternalLink className="h-3 w-3" />
        </a>
        {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-3">
          {/* Corps de PR (Product Spec Agent, Feature Dev Agent) */}
          {prIsResult && pr.body && (
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2">
                <span className="text-[11px] font-medium text-gray-500">PR #{pr.number} — {pr.user?.login}</span>
                <a href={pr.html_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-600">
                  Voir sur GitHub <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
              <div className={mdClasses}>
                <ReactMarkdown>{pr.body}</ReactMarkdown>
              </div>
            </div>
          )}
          {/* Commentaires de review postés par le bot */}
          {botComments.map(c => (
            <div key={c.id} className="rounded border border-gray-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2">
                <span className="text-[11px] font-medium text-gray-500">{fmtShortDate(c.created_at)} — {c.user?.login}</span>
                <a href={c.html_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-600">
                  Voir sur GitHub <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
              <div className={mdClasses}>
                <ReactMarkdown>{c.body}</ReactMarkdown>
              </div>
            </div>
          ))}
          {!hasContent && (
            <p className="text-xs italic text-gray-400">Aucun commentaire posté par l'agent pour ce run.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ActivityTimeline ─────────────────────────────────────────────────────────

function ActivityTimeline({ runs, prs, agentComments = [], prComments = [] }) {
  const [showAll, setShowAll] = useState(false);
  const PAGE = 15;
  const items = [
    ...runs.map(r => ({ key: `r-${r.id}`, date: r.created_at, kind: 'run', run: r })),
    ...prs.map(p => ({ key: `p-${p.number}`, date: p.created_at, kind: 'pr', pr: p })),
    ...agentComments.map(c => ({ key: `c-${c.id}`, date: c.created_at, kind: 'comment', comment: c })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const visible = showAll ? items : items.slice(0, PAGE);

  // Associer les PR comments à chaque run par fenêtre temporelle
  const runsSorted = [...runs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const runCommentsMap = new Map();
  runsSorted.forEach((run, idx) => {
    const start = new Date(run.created_at).getTime();
    const end = idx < runsSorted.length - 1 ? new Date(runsSorted[idx + 1].created_at).getTime() : Infinity;
    const comments = prComments.filter(c => {
      const t = new Date(c.created_at).getTime();
      return t >= start && t < end;
    });
    runCommentsMap.set(run.id, comments);
  });

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          <Clock className="h-4 w-4 text-gray-400" />Activité &amp; Historique
        </h4>
        <span className="text-xs text-gray-400">{items.length} événement{items.length > 1 ? 's' : ''}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {visible.map(item => (
          <div key={item.key} className="px-4 py-2">
            {item.kind === 'run' ? (
              <RunTimelineItem run={item.run} pr={prs[0] ?? null} runComments={runCommentsMap.get(item.run.id) ?? []} />
            ) : (
              <div className="flex items-center gap-3 transition-colors hover:bg-gray-50">
                <span className="w-[78px] shrink-0 font-mono text-[11px] text-gray-400">{fmtShortDate(item.date)}</span>
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gray-100">
                  {item.kind === 'comment' ? <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                    : <GitPullRequest className="h-3.5 w-3.5 text-purple-500" />}
                </div>
                {item.kind === 'pr' ? (
                  <>
                    <span className="inline-flex shrink-0 items-center rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">PR #{item.pr.number}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-600">Pull request créée</span>
                    <a href={item.pr.html_url} target="_blank" rel="noopener noreferrer"
                      className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-purple-500 hover:text-purple-700">
                      Voir la PR <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                ) : (
                  <>
                    <span className="inline-flex shrink-0 items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">🔴 Orchestrateur</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-600">
                      {item.comment.body.split('\n').find(l => l.startsWith('**Raison'))?.replace('**Raison :**', '').trim()
                        ?? item.comment.body.slice(0, 80)}
                    </span>
                    <a href={item.comment.html_url} target="_blank" rel="noopener noreferrer"
                      className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-red-400 hover:text-red-600">
                      Voir <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {!showAll && items.length > PAGE && (
        <div className="border-t border-gray-100 px-4 py-2.5 text-center">
          <button onClick={() => setShowAll(true)} className="text-xs font-medium text-blue-500 hover:text-blue-700">
            ↓ Voir tout l'historique ({items.length - PAGE} événements cachés)
          </button>
        </div>
      )}
    </div>
  );
}

// ─── PipelineLegend ───────────────────────────────────────────────────────────

function PipelineLegend() {
  const stages = [
    { label: 'Spécification', dot: 'bg-blue-400' },
    { label: 'Développement', dot: 'bg-emerald-400' },
    { label: 'Code Review',   dot: 'bg-orange-400' },
    { label: 'Fix Reviews',   dot: 'bg-violet-400' },
    { label: 'Delivery Prev', dot: 'bg-sky-400' },
    { label: 'Testing',       dot: 'bg-amber-400' },
    { label: 'Merge PR',      dot: 'bg-purple-400' },
    { label: 'Production',    dot: 'bg-blue-600' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-gray-500">
      <span className="font-medium text-gray-600">Légende :</span>
      {stages.map(({ label, dot }) => (
        <span key={label} className="flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />{label}
        </span>
      ))}
      <span className="ml-2 flex items-center gap-1"><CheckCircle className="h-3 w-3 text-emerald-400" /> Succès</span>
      <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3 text-blue-400" /> En cours</span>
      <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-400" /> Échec</span>
      <span className="flex items-center gap-1"><Circle className="h-3 w-3 text-gray-300" /> Ignoré</span>
    </div>
  );
}

// ─── PipelineBoard ────────────────────────────────────────────────────────────

function PipelineBoard({ issueNumber, issueRuns, prs, issue, aiModel, agentComments = [], prComments = [], onRefresh, onTriggerActive, outerRefreshKey = 0 }) {
  const [selectedStageId, setSelectedStageId] = useState(null);
  const [viewerFile, setViewerFile] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [showQAModal, setShowQAModal] = useState(false);
  const [qaDescription, setQADescription] = useState('');
  const [qaCategory, setQACategory] = useState('missing_feature');
  const [sendingQA, setSendingQA] = useState(false);
  const [selectedBugIds, setSelectedBugIds] = useState(new Set());
  const [dispatchingQAFix, setDispatchingQAFix] = useState(false);
  const [triggeringNext, setTriggeringNext] = useState({});
  const [triggeringFixReview, setTriggeringFixReview] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [repairingPreview, setRepairingPreview] = useState(false);
  const [previewRepairDismissed, setPreviewRepairDismissed] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreCommitSha, setRestoreCommitSha] = useState('');
  const [restoreFiles, setRestoreFiles] = useState('frontend/web/src/pages/AdminDevHub.jsx\nfrontend/web/src/components/MobileBottomNav.jsx\nfrontend/web/src/hooks/useMobile.js');
  const [restoringCommit, setRestoringCommit] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);

  async function triggerFixScopedReview() {
    if (!activePRNumber) return;
    setTriggeringFixReview(true);
    try {
      const { files } = await api.get(`/admin/devhub/prs/${activePRNumber}/fix-commit-files`).then(r => r.data);
      await api.post(`/admin/devhub/prs/${activePRNumber}/trigger-reviews`, {
        reviewModel: aiModel, fixModel: aiModel,
        filesFilter: files,
      });
      refreshAfterTrigger();
    } catch {
      alert('Erreur lors du déclenchement de la re-review ciblée');
    } finally {
      setTriggeringFixReview(false);
    }
  }

  function openFile(path, ref) { setViewerFile({ path, ref }); }
  function refreshAfterTrigger() { setRefreshKey(k => k + 1); onRefresh?.(); }

  async function sendQAReport() {
    if (!qaDescription.trim() || !activePRNumber) return;
    setSendingQA(true);
    try {
      await api.post(`/admin/devhub/prs/${activePRNumber}/report-qa-bug`, {
        bug_description: qaDescription.trim(),
        bug_category: qaCategory,
        ai_model: aiModel,
      });
      setShowQAModal(false);
      setQADescription('');
      setQACategory('missing_feature');
      refreshAfterTrigger();
    } catch {
      alert('Erreur lors du déclenchement du QA agent');
    } finally {
      setSendingQA(false);
    }
  }

  async function dispatchQAFixForSelected() {
    if (!activePRNumber || selectedBugIds.size === 0) return;
    setDispatchingQAFix(true);
    try {
      const selected = qaBugs.filter(b => selectedBugIds.has(b.id));
      const combinedDescription = selected.map((b, i) => `${i + 1}. [${b.category}] ${b.description}`).join('\n\n');
      await api.post(`/admin/devhub/prs/${activePRNumber}/report-qa-bug`, {
        bug_description: combinedDescription,
        bug_category: selected[0]?.category || 'other',
        ai_model: aiModel,
      });
      setShowQAModal(false);
      setSelectedBugIds(new Set());
      refreshAfterTrigger();
    } catch {
      alert('Erreur lors du déclenchement du QA Fix agent');
    } finally {
      setDispatchingQAFix(false);
    }
  }

  async function sendSelectedBugsToDev() {
    if (!activePRNumber || selectedBugIds.size === 0) return;
    const selected = qaBugs.filter(b => selectedBugIds.has(b.id));
    const combinedFeedback = selected.map((b, i) => `${i + 1}. [${b.category}] ${b.description}`).join('\n\n');
    setFeedbackText(combinedFeedback);
    setShowQAModal(false);
    setSelectedBugIds(new Set());
    setShowFeedbackModal(true);
  }

  async function sendFeedbackToDev() {
    if (!feedbackText.trim()) return;
    setSendingFeedback(true);
    try {
      await api.post(`/admin/devhub/issues/${issueNumber}/feedback-to-dev`, {
        feedback: feedbackText.trim(),
        aiModel,
        prNumber: activePRNumber,
      });
      setShowFeedbackModal(false);
      setFeedbackText('');
      // Polling pour détecter le redémarrage du feature-dev agent
      let count = 0;
      const poll = setInterval(() => {
        setRefreshKey(k => k + 1);
        onRefresh?.();
        count++;
        if (count >= 8) clearInterval(poll);
      }, 2500);
    } catch (e) {
      alert('Erreur : ' + (e.response?.data?.error || e.message));
    } finally {
      setSendingFeedback(false);
    }
  }

  async function restoreFromCommit() {
    if (!activePRNumber || !restoreCommitSha.trim()) return;
    const files = restoreFiles.split('\n').map(f => f.trim()).filter(Boolean);
    if (files.length === 0) return;
    setRestoringCommit(true);
    setRestoreResult(null);
    try {
      const { data } = await api.post(`/admin/devhub/prs/${activePRNumber}/restore-from-commit`, {
        commitSha: restoreCommitSha.trim(),
        files,
      });
      setRestoreResult({ success: true, count: data.results?.length ?? files.length });
      setTimeout(() => {
        setShowRestoreModal(false);
        setRestoreResult(null);
        refreshAfterTrigger();
      }, 2000);
    } catch (e) {
      setRestoreResult({ success: false, error: e.response?.data?.error || e.message });
    } finally {
      setRestoringCommit(false);
    }
  }

  // Tous les agents (spec, dev, review…) travaillent sur la même branche branch_issue_N
  const latestDevPR = prs.find(p => {
    const ref = p.head?.ref ?? '';
    return (ref.startsWith('feature-dev') || /branch[_-]issue[_-]\d+/i.test(ref))
      && (p.state === 'open' || p.merged_at);
  }) ?? null;
  const specPR = latestDevPR; // même PR pour tous les agents
  const latestPR = latestDevPR ?? prs[0] ?? null;
  const prNumber = latestDevPR?.number ?? null;
  const specPRNumber = specPR?.number ?? null;
  const activePRNumber = prNumber ?? specPRNumber;

  const { data: prRuns = [] } = useApiGet(activePRNumber ? `/admin/devhub/prs/${activePRNumber}/runs` : null, [activePRNumber, refreshKey, outerRefreshKey]);
  const { data: prCommits = [] } = useApiGet(activePRNumber ? `/admin/devhub/prs/${activePRNumber}/commits` : null, [activePRNumber, refreshKey, selectedStageId]);
  const { data: specPRCommits = [] } = useApiGet(specPRNumber && specPRNumber !== activePRNumber ? `/admin/devhub/prs/${specPRNumber}/commits` : null, [specPRNumber, refreshKey, selectedStageId]);
  const { data: prFiles = [] } = useApiGet(prNumber ? `/admin/devhub/prs/${prNumber}/files` : null, [prNumber, refreshKey]);
  // specPR?.updated_at change quand un nouveau commit est poussé sur la branche spec
  // (ex: le job generate-acceptance-criteria commit acceptance_criteria.json après le job principal)
  // → cela force le re-fetch des fichiers PR même si refreshKey ne change pas
  const { data: specPRFiles = [] } = useApiGet(specPRNumber ? `/admin/devhub/prs/${specPRNumber}/files` : null, [specPRNumber, refreshKey, specPR?.updated_at ?? null]);
  const { data: reviewStatus, refetch: refetchTopReviewStatus } = useApiGet(activePRNumber ? `/admin/devhub/prs/${activePRNumber}/review-status` : null, [activePRNumber, refreshKey, outerRefreshKey]);
  const { data: reviewComments, loading: reviewCommentsLoading } = useApiGet(showReviewModal && activePRNumber ? `/admin/devhub/prs/${activePRNumber}/review-comments` : null, [showReviewModal, activePRNumber]);
  const { data: qaBugs = [], loading: qaBugsLoading } = useApiGet(showQAModal && activePRNumber ? `/admin/devhub/prs/${activePRNumber}/qa-bugs` : null, [showQAModal, activePRNumber, refreshKey]);

  // Sélection + ignorés pour le fix ciblé (modal rapport)
  const [selectedIssuesModal, setSelectedIssuesModal] = useState(new Set());
  const [fixingSelectedModal, setFixingSelectedModal] = useState(false);
  const [ignoredIssuesModal, setIgnoredIssuesModal] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`review-ignored-${activePRNumber}`) || '[]')); }
    catch { return new Set(); }
  });
  // Sync ignoredIssues quand la PR change
  useEffect(() => {
    try { setIgnoredIssuesModal(new Set(JSON.parse(localStorage.getItem(`review-ignored-${activePRNumber}`) || '[]'))); }
    catch { setIgnoredIssuesModal(new Set()); }
    setSelectedIssuesModal(new Set());
  }, [activePRNumber]);

  function toggleSelectModal(id) {
    setSelectedIssuesModal(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleIgnoreModal(id, comment) {
    const blockingIds = comment ? getBlockingProblemIds(comment) : [];
    setIgnoredIssuesModal(prev => {
      const n = new Set(prev);
      const wasIgnored = n.has(id);
      wasIgnored ? n.delete(id) : n.add(id);
      localStorage.setItem(`review-ignored-${activePRNumber}`, JSON.stringify([...n]));
      // Si on vient d'ignorer et que tous les bloquants du commentaire sont désormais ignorés → override auto
      if (!wasIgnored && blockingIds.length > 0 && blockingIds.every(bid => n.has(bid))) {
        overrideReviewFromCard(comment.scope);
      }
      return n;
    });
    // Si on ignore un problème sélectionné, le désélectionner
    setSelectedIssuesModal(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  async function fixSelectedModal() {
    if (!activePRNumber || selectedIssuesModal.size === 0) return;
    // Reconstituer les titres des problèmes à partir des IDs sélectionnés
    const issueTitles = [];
    if (reviewComments) {
      for (const comment of reviewComments) {
        const rawLines = (comment.body || '').split('\n').filter(l => !/^\s*<!--/.test(l));
        let pIdx = 0;
        for (const line of rawLines) {
          if (/^- /.test(line)) {
            const problemId = `${comment.id}-p${pIdx}`;
            if (selectedIssuesModal.has(problemId)) {
              issueTitles.push(`[${comment.scope}] ${line.slice(2).trim()}`);
            }
            pIdx++;
          }
        }
      }
    }
    setFixingSelectedModal(true);
    try {
      await api.post(`/admin/devhub/prs/${activePRNumber}/fix-reviews`, { aiModel, issuesToFix: issueTitles });
      setSelectedIssuesModal(new Set());
      setShowReviewModal(false);
    } catch { alert('Erreur lors du déclenchement du fix ciblé'); }
    finally { setFixingSelectedModal(false); }
  }

  const specDisplayFiles = specPRFiles.filter(f => f.filename.startsWith('.ai/'));

  const sortDesc = arr => [...arr].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const allRunsRaw = [...issueRuns, ...prRuns].filter(r => r.conclusion !== 'skipped');
  const seenIds = new Set();
  const allRuns = allRunsRaw.filter(r => { if (seenIds.has(r.id)) return false; seenIds.add(r.id); return true; });

  const stageRuns = {
    spec:    sortDesc(allRuns.filter(r => classifyRun(r) === 'spec')),
    dev:     sortDesc(allRuns.filter(r => classifyRun(r) === 'dev')),
    review:  sortDesc(allRuns.filter(r => classifyRun(r) === 'review')),
    fix:     sortDesc(allRuns.filter(r => classifyRun(r) === 'fix')),
    preview: sortDesc(allRuns.filter(r => classifyRun(r) === 'preview')),
    qa:      sortDesc(allRuns.filter(r => classifyRun(r) === 'qa')),
    merge:   [],
    prod:    sortDesc(allRuns.filter(r => classifyRun(r) === 'prod')),
  };

  const allRunsSorted = sortDesc(allRuns);

  const specInProgress = stageRuns.spec[0]?.status === 'in_progress' || stageRuns.spec[0]?.status === 'queued';
  const specDone    = stageRuns.spec[0]?.conclusion === 'success';
  // Le run dev n'est affiché que si le spec est terminé (évite l'affichage prématuré
  // quand le spec agent chaîne le feature-dev-agent avant ses propres post-steps)
  const specRunTime = stageRuns.spec[0]?.created_at;
  const validDevRuns = (specDone && specRunTime)
    ? stageRuns.dev.filter(r => new Date(r.created_at) >= new Date(specRunTime))
    : specDone ? stageRuns.dev : [];
  const [overridingScopeCard, setOverridingScopeCard] = useState(null);
  async function overrideReviewFromCard(scope) {
    if (!activePRNumber) return;
    setOverridingScopeCard(scope);
    try {
      await api.post(`/admin/devhub/prs/${activePRNumber}/override-review`, { scope });
      refetchTopReviewStatus && refetchTopReviewStatus();
    } catch {
      alert('Erreur lors du passage en avertissement');
    } finally {
      setOverridingScopeCard(null);
    }
  }

  const devDone     = validDevRuns[0]?.conclusion === 'success';
  // N'afficher les fichiers dev que si le run dev est terminé avec succès —
  // évite d'afficher les stats de l'ancienne PR pendant qu'un nouveau run est en cours
  const devDisplayFiles  = devDone
    ? (prNumber ? prFiles : specPRFiles.filter(f => !f.filename.startsWith('.ai/')))
    : [];

  // Les runs de review ne comptent que s'ils sont postérieurs au run dev
  // (évite que la review de la spec PR soit confondue avec la review du code dev)
  const devRunTime = validDevRuns[0]?.created_at;
  const validReviewRuns = devRunTime
    ? stageRuns.review.filter(r => new Date(r.created_at) > new Date(devRunTime))
    : stageRuns.review;
  const reviewDone  = validReviewRuns[0]?.conclusion === 'success';

  // Jobs du dernier run de review → pour détecter le job auto-fix intégré dans code-reviews.yml
  const latestValidReviewRunId = validReviewRuns[0]?.id ?? null;
  const { data: latestReviewJobs = [] } = useApiGet(
    latestValidReviewRunId ? `/admin/devhub/runs/${latestValidReviewRunId}/jobs` : null,
    [latestValidReviewRunId]
  );
  const reviewAutoFixJob = latestReviewJobs.find(j => {
    const jn = j.name.toLowerCase();
    return jn.includes('auto-fix') || jn.includes('fix-pr-review');
  }) ?? null;

  const previewDone = stageRuns.preview.some(r => r.conclusion === 'success');
  const fixDone     = stageRuns.fix[0]?.conclusion === 'success';
  // Un fix postérieur à la dernière review valide → la review doit être relancée
  const fixNewerThanReview = stageRuns.fix[0] && (!validReviewRuns[0] || new Date(stageRuns.fix[0].created_at) > new Date(validReviewRuns[0].created_at));
  const qaDone      = stageRuns.qa[0]?.conclusion === 'success';
  const mergedDone  = !!latestPR?.merged_at;
  const failed = id => {
    const runs = id === 'review' ? validReviewRuns : stageRuns[id];
    return runs[0]?.conclusion === 'failure' || runs[0]?.conclusion === 'cancelled';
  };

  const [pollingUntil, setPollingUntil] = useState(0);

  // Polling interne 2s après un trigger, pendant 3 min
  useEffect(() => {
    if (Date.now() >= pollingUntil) return;
    const timer = setInterval(() => {
      if (Date.now() >= pollingUntil) { clearInterval(timer); return; }
      setRefreshKey(k => k + 1);
      onRefresh?.();
    }, 2_000);
    return () => clearInterval(timer);
  }, [pollingUntil]);

  // Notifier IssueRow si des prRuns sont en cours (code review, delivery…)
  // pour forcer le polling rapide même sans trigger manuel
  const hasPrRunInProgress = prRuns.some(r => r.status === 'in_progress' || r.status === 'queued');
  useEffect(() => {
    if (hasPrRunInProgress) {
      onTriggerActive?.(180_000);
    }
  }, [hasPrRunInProgress]);

  // Refresh reviewStatus dès qu'un run de review se termine (sans attendre le poll suivant)
  const prevTopReviewRunKeyRef = React.useRef(null);
  useEffect(() => {
    if (!prRuns) return;
    const reviewRun = prRuns.find(r => {
      const n = (r.name ?? r.display_title ?? '').toLowerCase();
      return n.includes('review') && !n.includes('fix');
    });
    if (!reviewRun) return;
    const key = `${reviewRun.id}-${reviewRun.status}-${reviewRun.conclusion}`;
    if (prevTopReviewRunKeyRef.current !== key) {
      prevTopReviewRunKeyRef.current = key;
      if (reviewRun.status === 'completed') {
        refetchTopReviewStatus?.();
      }
    }
  }, [prRuns]);

  async function triggerAction(id, fn) {
    setTriggeringNext(v => ({ ...v, [id]: true }));
    try {
      await fn();
      // Refresh immédiat + polling rapide interne ET dans le parent
      refreshAfterTrigger();
      setPollingUntil(Date.now() + 180_000);
      onTriggerActive?.(180_000);
    }
    catch (e) { alert('Erreur lors du déclenchement : ' + (e.response?.data?.error || e.message || 'Erreur inconnue')); }
    finally { setTriggeringNext(v => ({ ...v, [id]: false })); }
  }

  const nextActions = {
    spec: {
      label: 'Lancer Dev', icon: <Zap className="h-3 w-3" />,
      condition: specDone && (!validDevRuns[0] || failed('dev')),
      onTrigger: () => triggerAction('spec', () => api.post(`/admin/devhub/issues/${issueNumber}/trigger-agent`, { workflow: 'feature-dev-agent', aiModel })),
      isRetry: failed('dev'),
    },
    dev: {
      label: 'Lancer Review', icon: <Play className="h-3 w-3" />,
      condition: devDone && (!validReviewRuns[0] || failed('review')) && !!activePRNumber,
      onTrigger: () => triggerAction('dev', () => api.post(`/admin/devhub/prs/${activePRNumber}/trigger-reviews`, { reviewModel: aiModel, fixModel: aiModel })),
      isRetry: failed('review'),
    },
    review: {
      label: 'Déployer Preview', icon: <Rocket className="h-3 w-3" />,
      // S'il y a eu un fix, le Deployer Preview passe dans la flèche fix→preview
      condition: reviewDone && !stageRuns.fix[0] && (!stageRuns.preview[0] || failed('preview')) && !!activePRNumber,
      onTrigger: () => triggerAction('review', () => api.post(`/admin/devhub/prs/${activePRNumber}/deploy-preview`)),
      isRetry: failed('preview'),
    },
    fix: {
      // Pas de bouton dans la flèche fix→preview : l'action dépend de la re-review
      // Si le fix est postérieur à la review → l'utilisateur doit relancer la review via la carte Code Review
      // Si la review post-fix est ok → on peut déployer
      label: 'Déployer Preview', icon: <Rocket className="h-3 w-3" />,
      condition: !!stageRuns.fix[0] && !fixNewerThanReview && reviewDone && (!stageRuns.preview[0] || failed('preview')) && !!activePRNumber,
      onTrigger: () => triggerAction('fix', () => api.post(`/admin/devhub/prs/${activePRNumber}/deploy-preview`)),
      isRetry: failed('preview'),
    },
    preview: {
      label: 'Lancer QA', icon: <Bot className="h-3 w-3" />,
      condition: previewDone && !!activePRNumber,
      onTrigger: () => setShowQAModal(true),
    },
    qa: {
      label: 'Merger la PR', icon: <GitMerge className="h-3 w-3" />,
      condition: (qaDone || previewDone) && !mergedDone && !!activePRNumber,
      onTrigger: () => { if (confirm(`Merger la PR #${activePRNumber} ?`)) triggerAction('qa', () => api.post(`/admin/devhub/prs/${activePRNumber}/merge`, { mergeMethod: 'squash' })); },
    },
    merge: {
      label: 'Deploy Prod', icon: <Rocket className="h-3 w-3" />,
      condition: mergedDone && !stageRuns.prod[0],
      onTrigger: () => { if (confirm('Déployer master en production ?')) triggerAction('merge', () => api.post('/admin/devhub/deploy-production')); },
    },
  };

  function toggle(id) { setSelectedStageId(prev => prev === id ? null : id); }
  const selectedMeta = PIPELINE_META.find(m => m.id === selectedStageId);

  return (
    <div className="flex gap-4">
      <div className="min-w-0 flex-1 space-y-4">
        {/* Stage cards */}
        <div className="flex items-stretch overflow-x-auto pb-1">
          {PIPELINE_META.flatMap((meta, i) => [
            <StageCard
              key={meta.id}
              meta={meta}
              run={meta.id === 'review' ? (validReviewRuns[0] ?? stageRuns[meta.id][0]) : meta.id === 'dev' ? validDevRuns[0] : stageRuns[meta.id][0]}
              pr={meta.id === 'merge' ? (latestPR ?? undefined) : undefined}
              prFiles={meta.id === 'dev' ? (validDevRuns[0] ? devDisplayFiles : undefined) : meta.id === 'spec' ? specDisplayFiles : undefined}
              reviewStatus={meta.id === 'review' ? (reviewStatus ?? undefined) : undefined}
              prCommits={meta.id === 'dev' || meta.id === 'fix' ? prCommits : undefined}
              specPR={meta.id === 'spec' ? (specPR ?? undefined) : undefined}
              fixJob={meta.id === 'review' ? (reviewAutoFixJob ?? undefined) : undefined}
              isSelected={selectedStageId === meta.id}
              onClick={() => toggle(meta.id)}
              onFileClick={openFile}
              onViewReport={meta.id === 'review' && (validReviewRuns[0] ?? stageRuns.review[0]) ? () => setShowReviewModal(true) : undefined}
              onRetriggerReview={
                meta.id === 'review' && activePRNumber
                  ? () => triggerAction('dev', () => api.post(`/admin/devhub/prs/${activePRNumber}/trigger-reviews`, { reviewModel: aiModel, fixModel: aiModel }))
                  : meta.id === 'fix' && fixNewerThanReview && fixDone && activePRNumber
                  ? triggerFixScopedReview
                  : undefined
              }
              retriggerPending={meta.id === 'review' && triggeringNext['dev'] || meta.id === 'fix' && triggeringFixReview}
              onOverrideReview={meta.id === 'review' && activePRNumber ? overrideReviewFromCard : undefined}
              overridingScope={meta.id === 'review' ? overridingScopeCard : null}
              onRetriggerPreview={meta.id === 'preview' && activePRNumber ? () => triggerAction('review', () => api.post(`/admin/devhub/prs/${activePRNumber}/deploy-preview`)) : undefined}
              retriggerPreviewPending={meta.id === 'preview' && triggeringNext['review']}
              onRepairPreview={meta.id === 'preview' && activePRNumber ? async () => {
                try {
                  setRepairingPreview(true);
                  await api.post(`/admin/devhub/prs/${activePRNumber}/fix-reviews`, { aiModel });
                  refreshAfterTrigger();
                } catch {
                  alert('Erreur lors du déclenchement de la réparation');
                } finally {
                  setRepairingPreview(false);
                }
              } : undefined}
              repairingPreview={meta.id === 'preview' && repairingPreview}
            />,
            ...(i < PIPELINE_META.length - 1 ? [
              <div key={`arrow-${i}`} className="flex shrink-0 flex-col items-center justify-center gap-1 self-center px-0.5">
                {(() => {
                  const action = nextActions[meta.id];
                  if (action?.condition) {
                    const isRetry = action.isRetry;
                    const isPending = triggeringNext[meta.id];
                    return (
                      <button onClick={e => { e.stopPropagation(); action.onTrigger(); }} disabled={isPending}
                        title={isRetry ? `Relancer : ${action.label}` : action.label}
                        className={`flex flex-col items-center gap-0.5 rounded-lg border px-1.5 py-1 shadow-sm transition-colors disabled:opacity-50 ${
                          isRetry ? 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        }`}>
                        {isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : isRetry ? <RefreshCw className="h-3 w-3" /> : action.icon}
                        <span className="text-[8px] font-semibold leading-none whitespace-nowrap">{isRetry ? 'Relancer' : action.label}</span>
                      </button>
                    );
                  }
                  return <ChevronRight className="h-5 w-5 text-gray-200" />;
                })()}
              </div>
            ] : []),
          ])}
        </div>

        {/* Delivery Preview — bannière échec */}
        {(() => {
          const deliveryRun = stageRuns.preview?.[0];
          if (!deliveryRun || deliveryRun.status !== 'completed' || deliveryRun.conclusion === 'success') return null;
          if (previewRepairDismissed) return null;
          return (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-red-700">
                <XCircle className="h-3.5 w-3.5" /> Échec du déploiement preview
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    if (!activePRNumber) return;
                    try {
                      setRepairingPreview(true);
                      await api.post(`/admin/devhub/prs/${activePRNumber}/fix-reviews`, { aiModel });
                      refreshAfterTrigger();
                    } catch {
                      alert('Erreur lors du déclenchement de la réparation');
                    } finally {
                      setRepairingPreview(false);
                    }
                  }}
                  disabled={repairingPreview || !activePRNumber}
                  className="flex items-center gap-1 font-medium text-red-700 hover:text-red-900 underline underline-offset-2 disabled:opacity-50"
                >
                  <Wrench className="h-3 w-3" /> {repairingPreview ? 'Réparation en cours…' : 'Réparer'}
                </button>
                <a href={GITHUB_ACTIONS_URL} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-gray-500 hover:text-gray-700 underline underline-offset-2">
                  <ExternalLink className="h-3 w-3" /> GitHub Actions
                </a>
                <button onClick={() => setPreviewRepairDismissed(true)} className="text-red-400 hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })()}

        {/* Bug feedback */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setShowFeedbackModal(true)}
            className="flex items-center gap-2 rounded-full border border-dashed border-amber-300 bg-amber-50/60 px-4 py-1.5 transition-colors hover:border-amber-400 hover:bg-amber-100/60"
          >
            <Bug className="h-3 w-3 text-amber-500" />
            <span className="text-[11px] font-medium text-amber-600">Manquement détecté ? ↑ Retour vers Dev</span>
          </button>
          <button
            onClick={() => { setRestoreResult(null); setShowRestoreModal(true); }}
            className="flex items-center gap-2 rounded-full border border-dashed border-red-300 bg-red-50/60 px-4 py-1.5 transition-colors hover:border-red-400 hover:bg-red-100/60"
          >
            <Wrench className="h-3 w-3 text-red-500" />
            <span className="text-[11px] font-medium text-red-600">Restaurer depuis commit</span>
          </button>
        </div>

        {/* Modal feedback vers Dev */}
        {showFeedbackModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b px-5 py-3">
                <div className="flex items-center gap-2">
                  <Bug className="h-4 w-4 text-amber-500" />
                  <span className="font-semibold text-gray-800">Retour vers Dev — Signaler un manquement</span>
                </div>
                <button onClick={() => setShowFeedbackModal(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-xs text-gray-500">Décris ce qui manque ou ce qui doit être corrigé. Ce message sera posté en commentaire sur la PR et transmis au feature-dev agent lors de sa relance.</p>
                <textarea
                  autoFocus
                  rows={6}
                  value={feedbackText}
                  onChange={e => setFeedbackText(e.target.value)}
                  placeholder={"Exemple : Aucun fichier frontend n'a été modifié. Le modal de suggestion (SuggestionModal.jsx) doit être mis à jour pour permettre le collage d'image via Ctrl+V dans le champ de description."}
                  className="w-full rounded-lg border border-gray-200 p-3 text-sm text-gray-700 focus:border-amber-400 focus:outline-none resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 border-t px-5 py-3">
                <button onClick={() => setShowFeedbackModal(false)} className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
                <button
                  onClick={sendFeedbackToDev}
                  disabled={!feedbackText.trim() || sendingFeedback}
                  className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {sendingFeedback ? <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path fill="currentColor" d="M4 12a8 8 0 018-8v8z" className="opacity-75"/></svg>
                    Envoi…
                  </> : <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Envoyer et relancer le Dev
                  </>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Restaurer depuis commit */}
        {showRestoreModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b px-5 py-3">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-red-500" />
                  <span className="font-semibold text-gray-800">Restaurer des fichiers depuis un commit</span>
                </div>
                <button onClick={() => setShowRestoreModal(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-xs text-gray-500">Restaure un ou plusieurs fichiers à leur état dans un commit donné (SHA complet ou court) et les pousse sur la branche de la PR active.</p>
                <div>
                  <label className="text-xs font-medium text-gray-700">SHA du commit source</label>
                  <input
                    autoFocus
                    value={restoreCommitSha}
                    onChange={e => setRestoreCommitSha(e.target.value)}
                    placeholder="ex: 03b66e1a8d975bdd26ce002f0123be9d8552ab75"
                    className="mt-1 w-full rounded-lg border border-gray-200 p-2 font-mono text-sm focus:border-red-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Fichiers à restaurer (un par ligne)</label>
                  <textarea
                    rows={5}
                    value={restoreFiles}
                    onChange={e => setRestoreFiles(e.target.value)}
                    className="mt-1 w-full resize-none rounded-lg border border-gray-200 p-2 font-mono text-xs focus:border-red-400 focus:outline-none"
                  />
                </div>
                {restoreResult && (
                  <p className={`text-xs font-medium ${restoreResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
                    {restoreResult.success
                      ? `✓ ${restoreResult.count} fichier(s) restauré(s) avec succès`
                      : `✗ Erreur : ${restoreResult.error}`}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t px-5 py-3">
                <button onClick={() => setShowRestoreModal(false)} className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
                <button
                  onClick={restoreFromCommit}
                  disabled={restoringCommit || !restoreCommitSha.trim() || !activePRNumber}
                  className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {restoringCommit ? <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path fill="currentColor" d="M4 12a8 8 0 018-8v8z" className="opacity-75"/></svg>
                    Restauration…
                  </> : <>
                    <Wrench className="h-3.5 w-3.5" />
                    Restaurer
                  </>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal QA */}
        {showQAModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b px-5 py-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-sky-500" />
                  <span className="font-semibold text-gray-800">Bugs QA reportés — PR #{activePRNumber}</span>
                </div>
                <button onClick={() => { setShowQAModal(false); setSelectedBugIds(new Set()); }} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
              </div>

              <div className="max-h-[420px] overflow-y-auto p-4 space-y-2">
                {qaBugsLoading ? (
                  <div className="flex items-center justify-center py-8 text-sm text-gray-400">
                    <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path fill="currentColor" d="M4 12a8 8 0 018-8v8z" className="opacity-75"/></svg>
                    Chargement…
                  </div>
                ) : qaBugs.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-gray-400">Aucun bug reporté sur cette PR.</p>
                    <p className="mt-1 text-xs text-gray-300">Les bugs sont reportés depuis le FAB QA dans la preview.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 mb-2">Sélectionne les bugs à traiter puis choisis une action.</p>
                    {qaBugs.map(bug => (
                      <label key={bug.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${selectedBugIds.has(bug.id) ? 'border-sky-400 bg-sky-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-sky-500"
                          checked={selectedBugIds.has(bug.id)}
                          onChange={() => setSelectedBugIds(prev => { const n = new Set(prev); n.has(bug.id) ? n.delete(bug.id) : n.add(bug.id); return n; })} />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">{bug.category}</span>
                            <span className="text-[10px] text-gray-400">{new Date(bug.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            <a href={bug.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-gray-300 hover:text-gray-500" onClick={e => e.stopPropagation()}>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                          <p className="text-xs text-gray-700 whitespace-pre-wrap">{bug.description}</p>
                        </div>
                      </label>
                    ))}
                  </>
                )}
              </div>

              {qaBugs.length > 0 && (
                <div className="flex items-center justify-between border-t px-5 py-3 gap-2 flex-wrap">
                  <button
                    onClick={() => setSelectedBugIds(prev => prev.size === qaBugs.length ? new Set() : new Set(qaBugs.map(b => b.id)))}
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    {selectedBugIds.size === qaBugs.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={sendSelectedBugsToDev}
                      disabled={selectedBugIds.size === 0}
                      className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-40"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Renvoyer au Dev ({selectedBugIds.size})
                    </button>
                    <button
                      onClick={dispatchQAFixForSelected}
                      disabled={selectedBugIds.size === 0 || dispatchingQAFix}
                      className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-40"
                    >
                      {dispatchingQAFix ? <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path fill="currentColor" d="M4 12a8 8 0 018-8v8z" className="opacity-75"/></svg> : <Bot className="h-3 w-3" />}
                      QA Fix ({selectedBugIds.size})
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Activity */}
        {(allRunsSorted.length > 0 || agentComments.length > 0) && <ActivityTimeline runs={allRunsSorted} prs={prs} agentComments={agentComments} prComments={prComments} />}

        {/* Legend */}
        <PipelineLegend />
      </div>

      {/* Detail panel */}
      {selectedStageId && selectedMeta && (
        <div className="w-[420px] shrink-0">
          {selectedStageId === 'merge' ? (
            <div className={`flex flex-col overflow-hidden rounded-xl border-2 bg-white ${selectedMeta.selBorder}`} style={{ maxHeight: 580 }}>
              <div className={`flex shrink-0 items-center justify-between px-4 py-2.5 ${selectedMeta.headBg}`}>
                <span className={`text-xs font-semibold ${selectedMeta.headText}`}>Détails — Merge PR</span>
                <button onClick={() => setSelectedStageId(null)} className="rounded p-0.5 text-gray-400 hover:bg-white/60"><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {prs.length === 0 ? <p className="text-xs italic text-gray-400">Aucune Pull Request associée</p>
                : prs.map(pr => <PRDetail key={pr.number} pr={pr} issueNumber={issueNumber} aiModel={aiModel} outerRefreshKey={refreshKey + outerRefreshKey} />)}
              </div>
            </div>
          ) : (
            <StageDetailPanel
              meta={selectedMeta}
              runs={selectedStageId === 'dev' ? validDevRuns : stageRuns[selectedStageId]}
              prCommits={selectedStageId === 'dev' ? prCommits : selectedStageId === 'spec' ? (specPRNumber !== activePRNumber ? specPRCommits : prCommits) : selectedStageId === 'review' ? prCommits : selectedStageId === 'fix' ? prCommits : []}
              specPR={selectedStageId === 'spec' ? (specPR ?? undefined) : undefined}
              specPRFiles={selectedStageId === 'spec' ? specDisplayFiles : []}
              devPRFiles={selectedStageId === 'dev' ? devDisplayFiles : []}
              devPRRef={selectedStageId === 'dev' ? (latestDevPR?.head?.ref ?? specPR?.head?.ref ?? 'master') : undefined}
              issueTitle={issue.title}
              issueBody={issue.body ?? ''}
              onClose={() => setSelectedStageId(null)}
              onFileClick={openFile}
            />
          )}
        </div>
      )}

      {/* File viewer */}
      {viewerFile && (
        <FileViewerModal
          filePath={viewerFile.path}
          gitRef={viewerFile.ref}
          isSpec={specPR?.head?.ref === viewerFile.ref}
          issueTitle={issue.title}
          issueBody={issue.body ?? ''}
          aiModel={aiModel}
          onClose={() => setViewerFile(null)}
        />
      )}

      {/* Review report modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setShowReviewModal(false)}>
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-orange-500" />
                <span className="text-sm font-semibold text-gray-800">Rapport de Code Review</span>
                {(validReviewRuns[0] ?? stageRuns.review[0]) && (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                    {runAgentName(validReviewRuns[0] ?? stageRuns.review[0])} #{(validReviewRuns[0] ?? stageRuns.review[0]).run_number}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activePRNumber && (
                  <button
                    onClick={() => triggerAction('dev', () => api.post(`/admin/devhub/prs/${activePRNumber}/trigger-reviews`, { reviewModel: aiModel, fixModel: aiModel }))}
                    disabled={triggeringNext['dev']}
                    className="flex items-center gap-1 rounded border border-orange-300 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-100 disabled:opacity-50 transition-colors"
                  >
                    {triggeringNext['dev'] ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Relancer
                  </button>
                )}
                {(validReviewRuns[0] ?? stageRuns.review[0]) && (
                  <a href={(validReviewRuns[0] ?? stageRuns.review[0]).html_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                    <ExternalLink className="h-3 w-3" /> GitHub
                  </a>
                )}
                <button onClick={() => setShowReviewModal(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {reviewCommentsLoading ? (
                <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
              ) : !reviewComments || reviewComments.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <FileCode className="h-8 w-8 text-gray-300" />
                  <p className="text-sm text-gray-500">Aucun rapport disponible</p>
                  <p className="text-xs text-gray-400">Relancez une code review pour générer un rapport.</p>
                </div>
              ) : (
                (() => {
                  const reviewBlocks = reviewComments.filter(c => c.scope !== 'fix');
                  const fixBlock = reviewComments.find(c => c.scope === 'fix');
                  return (
                    <div className="space-y-3">
                      {reviewBlocks.map(c => (
                        <ReviewReportBlock
                          key={c.id} comment={c} mode="select"
                          selectedIds={selectedIssuesModal} ignoredIds={ignoredIssuesModal}
                          onToggle={toggleSelectModal} onIgnore={toggleIgnoreModal}
                        />
                      ))}
                      {fixBlock && (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="h-px flex-1 bg-amber-200" />
                            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                              <Zap className="h-3 w-3" /> Dernier fix appliqué
                            </span>
                            <div className="h-px flex-1 bg-amber-200" />
                          </div>
                          <ReviewReportBlock key={fixBlock.id} comment={fixBlock} />
                        </>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
            {/* Pied de modal — actions fix */}
            {reviewComments && reviewComments.filter(c => c.scope !== 'fix').length > 0 && (
              <div className="flex items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-4 py-2.5">
                <p className="text-[11px] text-gray-500">
                  {selectedIssuesModal.size > 0
                    ? <><span className="font-semibold text-blue-600">{selectedIssuesModal.size}</span> problème{selectedIssuesModal.size > 1 ? 's' : ''} sélectionné{selectedIssuesModal.size > 1 ? 's' : ''}</>
                    : 'Cochez les problèmes à corriger'
                  }
                </p>
                <button
                  disabled={selectedIssuesModal.size === 0 || fixingSelectedModal}
                  onClick={fixSelectedModal}
                  className="flex items-center gap-1.5 rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                >
                  <Zap className="h-3 w-3" />
                  {fixingSelectedModal ? 'Lancement…' : `Corriger la sélection (IA)`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── IssueRow ─────────────────────────────────────────────────────────────────

// ─── WorkflowBadge ────────────────────────────────────────────────────────────

const WF_STATE_LABELS = {
  IDLE: { label: 'En attente', color: 'bg-gray-100 text-gray-500' },
  SPEC_RUNNING: { label: 'Spec en cours', color: 'bg-blue-100 text-blue-700' },
  SPEC_DONE: { label: 'Spec OK', color: 'bg-blue-100 text-blue-700' },
  DEV_RUNNING: { label: 'Dev en cours', color: 'bg-indigo-100 text-indigo-700' },
  DEV_DONE: { label: 'Dev OK', color: 'bg-indigo-100 text-indigo-700' },
  REVIEW_PENDING: { label: 'Review à lancer', color: 'bg-yellow-100 text-yellow-700' },
  REVIEW_RUNNING: { label: 'Review en cours', color: 'bg-yellow-100 text-yellow-700' },
  REVIEW_OK: { label: 'Review OK', color: 'bg-yellow-100 text-yellow-700' },
  FIX_RUNNING: { label: 'Fix en cours', color: 'bg-orange-100 text-orange-700' },
  PREVIEW_RUNNING: { label: 'Preview en cours', color: 'bg-purple-100 text-purple-700' },
  PREVIEW_OK: { label: 'Preview OK', color: 'bg-purple-100 text-purple-700' },
  QA_RUNNING: { label: 'QA en cours', color: 'bg-pink-100 text-pink-700' },
  QA_OK: { label: 'QA OK', color: 'bg-pink-100 text-pink-700' },
  MERGE_READY: { label: 'Prêt à merger', color: 'bg-emerald-100 text-emerald-700' },
  MERGED: { label: 'Mergé', color: 'bg-emerald-100 text-emerald-700' },
  DEPLOY_RUNNING: { label: 'Déploiement…', color: 'bg-teal-100 text-teal-700' },
  DEPLOYED: { label: 'Déployé ✓', color: 'bg-teal-100 text-teal-700' },
  STUCK: { label: '⚠ Bloqué', color: 'bg-red-100 text-red-700' },
  PAUSED: { label: 'En pause', color: 'bg-gray-100 text-gray-400' },
};

function WorkflowBadge({ issueNumber, onRefresh }) {
  const { data: wf, refetch } = useApiGet(`/admin/devhub/issues/${issueNumber}/workflow`, [issueNumber]);
  const [saving, setSaving] = useState(false);

  if (!wf) return null;

  const { label, color } = WF_STATE_LABELS[wf.state] || { label: wf.state, color: 'bg-gray-100 text-gray-500' };

  async function toggleAuto(e) {
    e.stopPropagation();
    setSaving(true);
    try {
      await api.post(`/admin/devhub/issues/${issueNumber}/workflow`, { autoMode: !wf.autoMode });
      refetch();
    } finally { setSaving(false); }
  }

  async function handleUnstuck(e) {
    e.stopPropagation();
    if (!confirm('Débloquer le workflow et relancer depuis la review ?')) return;
    await api.post(`/admin/devhub/issues/${issueNumber}/workflow/unstuck`);
    refetch();
    onRefresh?.();
  }

  async function handleTick(e) {
    e.stopPropagation();
    await api.post(`/admin/devhub/issues/${issueNumber}/workflow/tick`);
    refetch();
    onRefresh?.();
  }

  return (
    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${color}`}>{label}</span>
      {wf.state === 'STUCK' && (
        <button onClick={handleUnstuck}
          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50 border border-red-200">
          Débloquer
        </button>
      )}
      <button
        onClick={toggleAuto}
        disabled={saving}
        title={wf.autoMode ? 'Mode auto activé — cliquer pour désactiver' : 'Mode manuel — cliquer pour activer l\'auto'}
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors ${
          wf.autoMode
            ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
            : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
        }`}>
        {wf.autoMode ? '⚡ Auto' : '◎ Manuel'}
      </button>
      <button onClick={handleTick} title="Forcer une évaluation maintenant"
        className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-700 border border-gray-200 hover:bg-gray-50">
        ↻
      </button>
    </div>
  );
}

function IssueRow({ issue, onClosed }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('devhub_ai_model') || 'gpt-4.1');
  const [triggeringAgent, setTriggeringAgent] = useState(false);
  const [closingIssue, setClosingIssue] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: prs = [], loading: prsLoading } = useApiGet(expanded ? `/admin/devhub/issues/${issue.number}/prs` : null, [expanded, issue.number, refreshKey]);
  const { data: runs = [], loading: runsLoading } = useApiGet(expanded ? `/admin/devhub/issues/${issue.number}/runs` : null, [expanded, issue.number, refreshKey]);
  const { data: agentComments = [] } = useApiGet(expanded ? `/admin/devhub/issues/${issue.number}/agent-comments` : null, [expanded, issue.number, refreshKey]);
  const firstPrNumber = prs.find(p => p.state === 'open')?.number ?? prs[0]?.number;
  const { data: prComments = [] } = useApiGet(expanded && firstPrNumber ? `/admin/devhub/prs/${firstPrNumber}/all-comments` : null, [expanded, firstPrNumber, refreshKey]);

  // Synchroniser prNumber dans le workflow quand une PR est détectée
  const firstOpenPr = prs.find(p => p.state === 'open');
  useEffect(() => {
    if (!firstOpenPr) return;
    api.post(`/admin/devhub/issues/${issue.number}/workflow`, { prNumber: firstOpenPr.number }).catch(() => {});
  }, [firstOpenPr?.number]);

  // Auto-refresh : 2s si un run est en cours ou si un trigger vient d'être lancé, 30s sinon
  const [forcedPollingUntil, setForcedPollingUntil] = useState(0);
  const hasRunInProgress = runs.some(r => r.status === 'in_progress' || r.status === 'queued');
  const fastPolling = hasRunInProgress || Date.now() < forcedPollingUntil;
  useEffect(() => {
    if (!expanded) return;
    const interval = fastPolling ? 2_000 : 30_000;
    const timer = setInterval(() => setRefreshKey(k => k + 1), interval);
    return () => clearInterval(timer);
  }, [expanded, fastPolling]);

  // SSE — refresh immédiat si l'event concerne cette issue ou ses PRs
  const prNumbers = prs.map(p => p.number);
  useDevHubSSE(React.useCallback((evt) => {
    if (!expanded) return;
    const concernsIssue = evt.issueNumber === issue.number;
    const concernsPR    = evt.prNumber != null && prNumbers.includes(evt.prNumber);
    const concernsBranch = evt.headBranch && prs.some(p => p.head?.ref === evt.headBranch);
    if (concernsIssue || concernsPR || concernsBranch) {
      setRefreshKey(k => k + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, issue.number, prNumbers.join(',')]));

  function handleTriggerActive(durationMs) {
    setForcedPollingUntil(Date.now() + durationMs);
    setRefreshKey(k => k + 1);
  }

  function handleModelChange(model) {
    setSelectedModel(model);
    localStorage.setItem('devhub_ai_model', model);
  }

  async function handleTrigger() {
    setTriggeringAgent(true);
    try {
      await api.post(`/admin/devhub/issues/${issue.number}/trigger-agent`, { workflow: 'product-spec-agent', aiModel: selectedModel });
      setExpanded(true);
      handleTriggerActive(180_000);
    } catch (e) {
      alert("Erreur lors du déclenchement de l'agent : " + (e.response?.data?.error || e.response?.data?.detail?.message || e.message));
    } finally {
      setTriggeringAgent(false);
    }
  }

  const latestBranch = prs[0]?.head?.ref;

  return (
    <div className={`mb-4 overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow ${expanded ? 'border-gray-300 shadow-md' : 'border-gray-200'}`}>
      {/* Header */}
      <div className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-gray-50">
        <div onClick={() => setExpanded(v => !v)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
          {issue.state === 'open'
            ? <span className="rounded-full border border-emerald-500 px-2 py-0.5 text-xs font-medium text-emerald-700">Ouvert</span>
            : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Fermé</span>}
          <span className="shrink-0 font-mono text-xs text-gray-400">#{issue.number}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{issue.title}</span>
          <span className="hidden shrink-0 text-xs text-gray-400 lg:block">Créée le {fmtShortDate(issue.created_at)}</span>
          {latestBranch && (
            <div className="hidden max-w-[200px] shrink-0 items-center gap-1 rounded bg-gray-100 px-2 py-1 font-mono text-[10px] text-gray-500 xl:flex">
              <GitBranch className="h-3 w-3 shrink-0 text-gray-400" /><span className="truncate">{latestBranch}</span>
            </div>
          )}
        </div>
        {issue.state === 'open' && (
          <WorkflowBadge issueNumber={issue.number} onRefresh={() => setRefreshKey(k => k + 1)} />
        )}
        <div onClick={e => e.stopPropagation()}>
          <select value={selectedModel} onChange={e => handleModelChange(e.target.value)}
            className="rounded border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-700 focus:outline-none">
            {AI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <a href={issue.html_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          className="hidden shrink-0 items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 transition-colors hover:text-gray-700 sm:flex">
          <ExternalLink className="h-3 w-3" />Voir sur GitHub
        </a>
        <div onClick={() => setExpanded(v => !v)} className="cursor-pointer">
          {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />}
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-gray-100 p-5">
          {issue.state === 'open' && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <button onClick={handleTrigger} disabled={triggeringAgent}
                className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50">
                <Zap className="h-3.5 w-3.5" />{triggeringAgent ? 'Déclenchement…' : '📋 Spec produit'}
              </button>
              <button onClick={() => {
                if (!confirm(`Fermer l'issue #${issue.number} "${issue.title}" ?`)) return;
                setClosingIssue(true);
                api.post(`/admin/devhub/issues/${issue.number}/close`).then(() => onClosed?.()).catch(() => alert('Erreur')).finally(() => setClosingIssue(false));
              }} disabled={closingIssue}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50">
                <X className="h-3.5 w-3.5" />{closingIssue ? 'Fermeture…' : "Fermer l'issue"}
              </button>
              <button onClick={async () => {
                await api.post(`/admin/devhub/issues/${issue.number}/workflow`, { state: 'SPEC_RUNNING' }).catch(() => {});
                setRefreshKey(k => k + 1);
              }}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50">
                ⚙ Init workflow
              </button>
            </div>
          )}

          {runsLoading || prsLoading ? (
            <div className="flex items-stretch gap-2 overflow-x-auto">
              {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-52 w-[175px] shrink-0 rounded-xl" />)}
            </div>
          ) : (
            <PipelineBoard issueNumber={issue.number} issueRuns={runs} prs={prs} issue={issue} aiModel={selectedModel} agentComments={agentComments} prComments={prComments} onRefresh={() => setRefreshKey(k => k + 1)} onTriggerActive={handleTriggerActive} outerRefreshKey={refreshKey} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── DeployProductionButton ───────────────────────────────────────────────────

function DeployProductionButton() {
  const [pending, setPending] = useState(false);
  async function handleDeploy() {
    if (!confirm('Déployer la branche master en production ?')) return;
    try {
      setPending(true);
      await api.post('/admin/devhub/deploy-production');
      alert('Déploiement production déclenché — voir GitHub Actions');
    } catch {
      alert('Erreur lors du déclenchement du déploiement');
    } finally {
      setPending(false);
    }
  }
  return (
    <button onClick={handleDeploy} disabled={pending}
      className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
      <Rocket className="h-4 w-4" />{pending ? 'Déclenchement…' : 'Deploy Production'}
    </button>
  );
}

// ─── AdminDevHub (main) ───────────────────────────────────────────────────────

export default function AdminDevHub() {
  const navigate = useNavigate();
  const [stateFilter, setStateFilter] = useState('open');
  const [refreshKey, setRefreshKey] = useState(0);

  // Pas de polling global — chaque IssueRow ouvert gère son propre polling
  // Vérification admin
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login'); return; }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (!payload.isAdmin) navigate('/');
    } catch { navigate('/login'); }
  }, [navigate]);

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  const { data: issues, loading, error: issuesError, refetch } = useApiGet(`/admin/devhub/issues?_r=${refreshKey}`, [refreshKey]);

  const filtered = (issues ?? []).filter(i => stateFilter === 'all' ? true : i.state === stateFilter);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-sm font-bold text-gray-900 hover:text-amber-600 transition-colors">
            🗺 PlanYourRide
          </Link>
          <div className="flex items-center gap-1 text-sm">
            <Link to="/admin/suggestions" className="px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">Suggestions</Link>
            <Link to="/admin/users" className="px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">Utilisateurs</Link>
            <Link to="/admin/devhub" className="px-3 py-1.5 rounded-lg font-medium text-blue-700 bg-blue-50 transition-colors">Dev Hub</Link>
          </div>
        </div>
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Déconnexion</button>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dev Hub</h1>
            <p className="mt-0.5 text-sm text-gray-500">Gestion des issues GitHub et pilotage des agents IA</p>
          </div>
          <div className="flex items-center gap-2">
            <DeployProductionButton />
            <button onClick={() => setRefreshKey(k => k + 1)} disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualiser
            </button>
          </div>
        </div>

        {/* Filtres */}
        <div className="mb-5 flex gap-2">
          {['open', 'closed', 'all'].map(s => {
            const label = s === 'open' ? 'Ouvertes' : s === 'closed' ? 'Fermées' : 'Toutes';
            const count = s === 'all' ? (issues ?? []).length : (issues ?? []).filter(i => i.state === s).length;
            return (
              <button key={s} onClick={() => setStateFilter(s)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors border ${
                  stateFilter === s ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {label}
                <span className="ml-1 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs leading-none text-gray-700">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Liste */}
        {loading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
        ) : issuesError ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-6 py-12 text-center">
            <XCircle className="h-10 w-10 text-red-400" />
            <p className="text-sm font-medium text-red-700">Impossible de charger les issues GitHub</p>
            <p className="text-xs text-red-500 max-w-sm">Vérifiez que le backend est connecté à GitHub (GITHUB_PAT, GITHUB_OWNER, GITHUB_REPO)</p>
          </div>
        ) : !filtered.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-gray-400">
            <GitBranch className="h-10 w-10 opacity-40" />
            <p className="text-sm">Aucune issue{stateFilter !== 'all' ? ` ${stateFilter === 'open' ? 'ouverte' : 'fermée'}` : ''}</p>
          </div>
        ) : (
          <div>{filtered.map(issue => <IssueRow key={issue.number} issue={issue} onClosed={() => setRefreshKey(k => k + 1)} />)}</div>
        )}
      </div>
    </div>
  );
}
