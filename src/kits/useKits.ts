import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { can } from "@/lib/rbac";
import { usePActor } from "@/projects/useProjects";
import { kitsRepo } from "./repo";
import type { KitOrder } from "./types";

/** شارة القائمة: شحنات عينات تنتظر التجهيز (جديدة أو قيد التجهيز) — تُحدَّث مع كل تنقّل */
export function useKitsToPrepare() {
  const actor = usePActor();
  const { pathname } = useLocation();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!actor || !(can(actor.role, "inventory.view") || can(actor.role, "payments.view"))) return;
    let live = true;
    kitsRepo
      .list(actor)
      .then((os) => live && setN(os.filter((o) => o.status === "new" || o.status === "preparing").length))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [actor, pathname]);
  return n;
}

/** شحنات العميل الحالي ببريده (بطاقة «عيناتي») */
export function useMyKits() {
  const actor = usePActor();
  const [kits, setKits] = useState<KitOrder[] | null>(null);
  useEffect(() => {
    if (!actor) return;
    let live = true;
    kitsRepo
      .mine(actor)
      .then((os) => live && setKits(os))
      .catch(() => live && setKits([]));
    return () => {
      live = false;
    };
  }, [actor]);
  return kits;
}
