import { Suspense, lazy, useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/context";
import type { Fit } from "../spec";
import type { BoxDesign } from "./types";
import { OptionCard, OptionGroup } from "../ui";
import { PARAM_LABELS, PRESETS, paramLimits, STOCKS, STRUCTURES, STRUCTURE_GROUPS, STRUCTURE_LIMITS, T_LIMITS, autoStructure, clampT, defaultParams, defaultThickness, downloadFile, resolveStructure, stockFor, structureById, structureFileName, structureSvg, svgSheet, type BoxStructure, type ParamKey, type StructureType } from "@/lib/packaging";
import type { StructureViewerApi } from "./StructureViewer";

const StructureViewer = lazy(() => import("./StructureViewer"));

const input = "w-full bg-white border border-paper-200 focus:border-ink-900 rounded-xl px-3 py-2 text-sm outline-none";
const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-xs border transition-colors ${on ? "bg-ink-900 text-white border-ink-900" : "bg-white/70 border-paper-200 text-paper-700 hover:border-ink-900"}`;

/** حقل معامل بالمليمتر: كتابة حرة ثم تقييد بالحدود عند الخروج */
function Param({ k, value, onChange }: { k: ParamKey; value: number; onChange: (v: number) => void }) {
  const { t, pick } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  const id = useId();
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    const { min, max } = paramLimits(k);
    if (Number.isFinite(n) && n >= 0) onChange(Math.min(max, Math.max(min, Math.round(n * 2) / 2)));
    setDraft(null);
  };
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-[11px] text-paper-500 mb-1 truncate">{pick(PARAM_LABELS[k])} <span className="font-mono text-paper-400">{k}</span></label>
      <div className="relative">
        <input id={id} type="number" inputMode="decimal" step={0.5} min={paramLimits(k).min} max={paramLimits(k).max} value={draft ?? value} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} className={`${input} pe-9 font-mono`} />
        <span aria-hidden="true" className="absolute end-3 top-1/2 -translate-y-1/2 text-[11px] text-paper-400 pointer-events-none">{t("مم", "mm")}</span>
      </div>
    </div>
  );
}

export interface StructurePanelProps {
  design: BoxDesign;
  fit: Fit | null;
  onChange: (structure: BoxStructure | null) => void;
}

/** مكتبة هياكل التغليف: اختيار الهيكل والمقاس والسماكة، معاينة الطي مجسّماً، وتصدير قالب القص */
export default function StructurePanel({ design: d, fit, onChange }: StructurePanelProps) {
  const { t, pick, num } = useI18n();
  const auto = useMemo(() => autoStructure(d, fit), [d, fit]);
  const s = useMemo(() => resolveStructure(d, fit), [d, fit]);
  const custom = !!d.structure;
  const [fold, setFold] = useState(1);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  const api = useRef<StructureViewerApi | null>(null);
  const [note, setNote] = useState("");
  const uid = useId();

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const play = () => {
    cancelAnimationFrame(raf.current);
    if (playing) {
      setPlaying(false);
      return;
    }
    setPlaying(true);
    const t0 = performance.now(), ms = 3200;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      // تباطؤ في النهاية
      setFold(1 - Math.pow(1 - k, 3));
      if (k < 1) raf.current = requestAnimationFrame(step);
      else setPlaying(false);
    };
    setFold(0);
    raf.current = requestAnimationFrame(step);
  };

  const pickType = (type: StructureType) => {
    if (s?.type === type) return;
    onChange({ type, params: defaultParams(type, d, fit), t: defaultThickness(type, d) });
  };
  const setParam = (k: ParamKey, v: number) => s && onChange({ ...s, params: { ...s.params, [k]: v } });
  const setT = (v: number) => s && onChange({ ...s, t: clampT(v) });
  const refit = () => s && onChange({ ...s, params: defaultParams(s.type, d, fit) });

  const applyPreset = (id: string) => {
    const pre = PRESETS.find((p) => p.id === id);
    if (!pre) return;
    const type = (s && pre.types[s.type] ? s.type : (Object.keys(pre.types)[0] as StructureType | undefined)) ?? null;
    if (!type) return;
    onChange({ type, params: { ...defaultParams(type, null, fit), ...pre.types[type] }, t: s?.type === type ? s.t : defaultThickness(type, d) });
  };

  const svg = useMemo(() => (s ? structureSvg(s) : ""), [s]);
  const sheet = useMemo(() => svgSheet(svg), [svg]);
  const meta = s ? structureById(s.type)! : null;

  const exportSvg = () => {
    if (!s) return;
    downloadFile(svg, structureFileName(s, "svg"));
    setNote(t("نُزّل قالب القص SVG", "Dieline SVG downloaded"));
  };
  const exportPng = () => {
    if (!s || !api.current) return;
    const url = api.current.snapshot(1600);
    const a = document.createElement("a");
    a.href = url;
    a.download = structureFileName(s, "png");
    a.click();
    setNote(t("نُزّلت صورة المعاينة", "Preview image downloaded"));
  };

  return (
    <div className="space-y-4" data-testid="structure-panel">
      <div className="flex flex-wrap items-center gap-2 text-xs text-paper-600 leading-[1.7]">
        <i className="ri-shape-2-line text-ink-900" aria-hidden="true"></i>
        {custom ? (
          <>
            <span>{t("اختيارك من المكتبة", "Your pick from the library")}</span>
            {auto && (
              <button type="button" onClick={() => onChange(null)} className={chip(false)}>
                <i className="ri-magic-line me-1" aria-hidden="true"></i>
                {t(`عُد للتلقائي: ${pick(structureById(auto.type)!.name)}`, `Back to automatic: ${pick(structureById(auto.type)!.name)}`)}
              </button>
            )}
          </>
        ) : s ? (
          <span>{t(`القالب التلقائي لنوع العلبة: ${pick(meta!.name)} — غيّره من المكتبة إن أردت.`, `Automatic for this box style: ${pick(meta!.name)} — change it below if you like.`)}</span>
        ) : (
          <span>{t("لا قالب في المكتبة للأسطوانة؛ يُستخدم مخطط القص الأساسي أعلاه. اختر هيكلاً إن أردت تغليفاً ثانوياً.", "The library has no tube dieline; the main dieline above applies. Pick a structure for secondary packaging if you like.")}</span>
        )}
      </div>

      {STRUCTURE_GROUPS.map((g) => (
        <div key={g.id}>
          <p className="text-[11px] text-paper-500 mb-1.5">{pick(g.name)}</p>
          <OptionGroup label={pick(g.name)} cols={2}>
            {STRUCTURES.filter((x) => x.group === g.id).map((x) => (
              <OptionCard key={x.id} compact selected={s?.type === x.id} onSelect={() => pickType(x.id)} title={pick(x.name)} note={`${x.code} · ${pick(x.note)}`} icon={x.icon} testId={`structure-${x.id}`} />
            ))}
          </OptionGroup>
        </div>
      ))}

      {s && meta && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block flex-1 min-w-[11rem]">
              <span className="block text-[11px] text-paper-500 mb-1">{t("مقاس جاهز من كتالوج المصنع", "Factory preset size")}</span>
              <select value="" onChange={(e) => applyPreset(e.target.value)} className={input} aria-label={t("مقاس جاهز", "Preset size")}>
                <option value="">{t("— اختر مقاساً —", "— choose a size —")}</option>
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{pick(p.label)}{!p.types[s.type] ? ` (${Object.keys(p.types).map((k) => pick(structureById(k)!.name)).join("، ")})` : ""}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={refit} className={chip(false)}>
              <i className="ri-ruler-line me-1" aria-hidden="true"></i>
              {t("طابق مقاس العلبة", "Match the box size")}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2" data-testid="structure-params">
            {meta.fields.map((k) => (
              <Param key={k} k={k} value={s.params[k] ?? 0} onChange={(v) => setParam(k, v)} />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor={`${uid}-t`} className="text-[11px] text-paper-500">{t("سماكة الخامة", "Board thickness")} <b className="font-mono text-ink-900" dir="ltr">{num(s.t, 2)} {t("مم", "mm")}</b></label>
            <input id={`${uid}-t`} type="range" min={T_LIMITS.min} max={T_LIMITS.max} step={0.05} value={s.t} onChange={(e) => setT(Number(e.target.value))} className="flex-1 min-w-[8rem] accent-ink-900" />
            <span className="text-[11px] text-paper-500">{pick(STOCKS[stockFor(s.type, d)].name)}</span>
          </div>

          <div className="rounded-2xl overflow-hidden border border-paper-200 bg-[#F3F1EC]">
            <div className="relative h-56">
              <Suspense fallback={<div className="absolute inset-0 shimmer" />}>
                <StructureViewer className="absolute inset-0" design={d} structure={s} fold={fold} onReady={(a) => (api.current = a)} ariaLabel={t(`معاينة طي ${pick(meta.name)}`, `${pick(meta.name)} fold preview`)} />
              </Suspense>
              <p className="absolute top-2 start-2 rounded-lg bg-ink-900/70 text-white text-[10px] px-2 py-1 font-mono" dir="ltr">{s.type} · t={s.t}mm</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-white/70">
              <i className="ri-collage-line text-paper-500" aria-hidden="true"></i>
              <input type="range" min={0} max={100} step={1} value={Math.round(fold * 100)} onChange={(e) => { cancelAnimationFrame(raf.current); setPlaying(false); setFold(Number(e.target.value) / 100); }} className="flex-1 min-w-0 accent-ink-900" aria-label={t("طي القالب", "Dieline fold")} />
              <button type="button" onClick={play} className={chip(playing)} aria-pressed={playing}>
                <i className={`${playing ? "ri-stop-line" : "ri-play-line"} me-1`} aria-hidden="true"></i>
                {t("حركة الطي", "Fold animation")}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-paper-500 font-mono" data-testid="structure-sheet">
              {t("فرخ القالب", "Dieline sheet")}: <bdi dir="ltr">{num(Math.round(sheet.w))} × {num(Math.round(sheet.h))}</bdi> {t("مم", "mm")} · <span className="font-sans">{meta.code}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={exportSvg} className="rounded-full bg-ink-900 text-white px-4 py-2 text-sm inline-flex items-center gap-2" data-testid="structure-svg">
                <i className="ri-scissors-cut-line" aria-hidden="true"></i>
                {t("قالب القص SVG", "Dieline SVG")}
              </button>
              <button type="button" onClick={exportPng} className="rounded-full bg-white border border-paper-200 px-4 py-2 text-sm text-ink-900 inline-flex items-center gap-2">
                <i className="ri-image-line" aria-hidden="true"></i>
                {t("صورة PNG", "PNG image")}
              </button>
            </div>
          </div>
          {note && <p role="status" className="text-xs text-accent3-ink">{note}</p>}
          <details className="text-[11px] text-paper-500 leading-[1.7]">
            <summary className="cursor-pointer text-paper-600">{t("حدود المعاينة وملاحظات المطبعة", "Preview limits & printer notes")}</summary>
            <ul className="mt-1 list-disc ps-4 space-y-0.5">
              {STRUCTURE_LIMITS.map((l) => <li key={l.en}>{pick(l)}</li>)}
              <li>{t("يُرسل هذا القالب مع طلبك بطبقات قص/طي/غراء مسمّاة، وتُراجَع التعويضات مع المطبعة على نموذج ورقي قبل الإنتاج.", "This dieline is sent with your request with named cut/fold/glue layers; allowances are confirmed with the printer on a paper mock-up before production.")}</li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
