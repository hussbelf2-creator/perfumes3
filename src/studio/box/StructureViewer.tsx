import { useEffect, useRef, useState } from "react";
import { Box3, Color, Group, Vector3 } from "three";
import { createStage, disposeGroup, type Stage } from "../stage";
import type { BoxDesign } from "./types";
import type { BoxStructure } from "@/lib/packaging";
import { buildStructure, lookOf } from "./structure3d";

// مكوّن React لمعاينة هيكل القالب: الخشبة المشتركة + المجسم من structure3d.ts

export interface StructureViewerApi {
  snapshot: (maxWidth?: number) => string;
}
export default function StructureViewer({ design, structure, fold, onReady, ariaLabel, className = "" }: { design: BoxDesign; structure: BoxStructure; fold: number; onReady?: (api: StructureViewerApi) => void; ariaLabel: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const built = useRef<ReturnType<typeof buildStructure> | null>(null);
  const foldRef = useRef(fold);
  foldRef.current = fold;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const s = createStage(el);
    s.scene.background = new Color("#F3F1EC");
    s.controls.autoRotate = false;
    stage.current = s;
    return () => {
      s.dispose();
      stage.current = null;
      built.current = null;
    };
  }, []);

  // إعادة البناء عند تغيّر الهيكل أو مظهر العلبة
  const key = JSON.stringify([structure, design.board, design.customColor, design.finish, design.foil, design.brand, design.effects, design.interior, design.style]);
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    setBusy(true);
    const timer = window.setTimeout(() => {
      disposeGroup(s.product);
      const look = lookOf(design, structure);
      const b = buildStructure(structure, look);
      // نؤطّر على العلبة المغلقة ثم نطبّق الطي الحالي
      b.setFold(1);
      const wrap = new Group();
      wrap.add(b.group);
      wrap.scale.setScalar(0.001);
      wrap.updateMatrixWorld(true);
      const box = new Box3().setFromObject(wrap);
      const size = box.getSize(new Vector3());
      const c = box.getCenter(new Vector3());
      wrap.position.set(-c.x, -box.min.y, -c.z);
      s.product.add(wrap);
      s.frame(size.y, Math.max(size.x, size.z));
      // زاوية ثلاثة أرباع من الأعلى: تُقرأ منها الصواني المنخفضة والعلب الطويلة معاً
      const dist = s.camera.position.distanceTo(s.controls.target);
      s.camera.position.copy(s.controls.target).add(new Vector3(0.5, 0.5, 0.85).normalize().multiplyScalar(dist * 1.2));
      s.controls.update();
      b.setFold(foldRef.current);
      built.current = b;
      s.invalidate();
      setBusy(false);
      readyRef.current?.({
        snapshot: (maxWidth = 1200) => {
          s.renderer.render(s.scene, s.camera);
          const src = s.renderer.domElement;
          const k = Math.min(1, maxWidth / src.width);
          if (k === 1) return src.toDataURL("image/png");
          const out = document.createElement("canvas");
          out.width = Math.round(src.width * k);
          out.height = Math.round(src.height * k);
          out.getContext("2d")!.drawImage(src, 0, 0, out.width, out.height);
          return out.toDataURL("image/png");
        },
      });
    }, 120);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    built.current?.setFold(fold);
    stage.current?.invalidate();
  }, [fold]);

  return (
    <div className={`overflow-hidden touch-none ${className || "relative"}`} aria-label={ariaLabel} role="img" aria-busy={busy} data-testid="structure-viewer">
      <div ref={host} className="absolute inset-0" />
    </div>
  );
}
