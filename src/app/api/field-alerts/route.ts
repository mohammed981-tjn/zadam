import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bearerMatches } from "@/lib/cronAuth";
import { fetchDiseaseEvents } from "@/lib/animalDisease";
import { fetchLocustSightings } from "@/lib/locust";
import {
  MAX_ALERTS_PER_RUN,
  SENT_LOOKBACK_DAYS,
  diseaseAlerts,
  isoDaysBefore,
  locustAlerts,
  sentKey,
  type AlertLand,
} from "@/lib/fieldAlerts";
import { stageReminders, type PlannedCycle } from "@/lib/stageReminders";
import { pushToUser } from "@/lib/push";
import { dispatchPushes } from "@/lib/fcm";

/**
 * التنبيهاتُ الحقليّة اليوميّة (البند ١١٥): جرادٌ قرب الأرض، ومرضُ ماشيةٍ في الولاية؛
 * ومعها (البند ١١٩) تذكيرُ الموسم والقطيع حين يحين موعد مرحلة.
 *
 * Once a day (vercel.json) this reads FAO's locust sightings and EMPRES-i's
 * disease events, every land with a place or a state, and what each owner was
 * already told; then it writes a notification for what is new. What counts as
 * new and what it says is in lib/fieldAlerts; the write — key and notification
 * together, or neither — is field_alert_send in the database.
 *
 * WHY THE SECRET IS NOT OPTIONAL HERE
 *
 * /api/health runs without CRON_SECRET because all it writes is its own check.
 * This writes into people's inboxes, with the service-role key: an open door
 * would let anyone make it run. So no secret, no run.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const PAGE = 1000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET غير مضبوط، فالتنبيهات معطّلة." }, { status: 503 });
  }
  if (!bearerMatches(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    console.error("field-alerts: SUPABASE_SERVICE_ROLE_KEY is not set");
    return NextResponse.json({ ok: false, error: "التنبيهات غير مهيّأة على هذا النشر." }, { status: 500 });
  }

  const { data: rows, error: landsError } = await supabase
    .from("lands")
    .select("id, owner_id, name, state, latitude, longitude")
    .not("owner_id", "is", null);
  if (landsError) {
    console.error("field-alerts: lands", landsError);
    return NextResponse.json({ ok: false, error: landsError.message }, { status: 500 });
  }

  const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const lands: AlertLand[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    ownerId: r.owner_id as string,
    name: (r.name as string) || "أرضك",
    state: (r.state as string | null) || null,
    latitude: num(r.latitude),
    longitude: num(r.longitude),
  }));
  const located = lands.some((l) => l.latitude !== null && l.longitude !== null);
  const stated = lands.some((l) => l.state);

  const [sightings, events] = await Promise.all([
    located ? fetchLocustSightings(true) : Promise.resolve([]),
    stated ? fetchDiseaseEvents(true) : Promise.resolve([]),
  ]);

  // What each person was already told. Only recent keys can match what FAO
  // returns today; the database refuses a repeat even if one slipped past.
  const today = new Date().toISOString().slice(0, 10);
  const sent = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("field_alerts_sent")
      .select("recipient_id, alert_key")
      .gte("sent_at", isoDaysBefore(today, SENT_LOOKBACK_DAYS))
      .order("sent_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("field-alerts: sent keys", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    for (const r of data ?? []) sent.add(sentKey(r.recipient_id as string, r.alert_key as string));
    if (!data || data.length < PAGE) break;
  }

  // Running seasons and herds with their stages, for «حان موعد المرحلة».
  const cycles: PlannedCycle[] = [];
  const [{ data: seasonRows, error: seasonsError }, { data: herdRows, error: herdsError }] = await Promise.all([
    supabase.from("seasons").select("id, owner_id, name, season_stages(id, stage_key, stage_order, planned_start, completed)").eq("status", "active"),
    supabase.from("herds").select("id, owner_id, name, herd_stages(id, stage_key, stage_order, planned_start, completed)").eq("status", "active"),
  ]);
  if (seasonsError) console.error("field-alerts: seasons", seasonsError);
  if (herdsError) console.error("field-alerts: herds", herdsError);
  type StageRow = { id: string; stage_key: string; stage_order: number; planned_start: string | null; completed: boolean };
  const toCycle = (kind: PlannedCycle["kind"], r: Record<string, unknown>, stages: StageRow[]): PlannedCycle => ({
    id: r.id as string,
    ownerId: r.owner_id as string,
    name: (r.name as string) || (kind === "season" ? "موسمك" : "قطيعك"),
    kind,
    stages: stages.map((s) => ({ id: s.id, key: s.stage_key, order: s.stage_order, plannedStart: s.planned_start, completed: s.completed })),
  });
  for (const r of seasonRows ?? []) cycles.push(toCycle("season", r, (r.season_stages ?? []) as StageRow[]));
  for (const r of herdRows ?? []) cycles.push(toCycle("herd", r, (r.herd_stages ?? []) as StageRow[]));

  const alerts = [
    ...(sightings ? locustAlerts(lands, sightings, sent) : []),
    ...(events ? diseaseAlerts(lands, events, sent, today) : []),
    ...stageReminders(cycles, sent, today),
  ];

  const written = { locust_near: 0, animal_disease: 0, stage_due: 0 };
  const pushed = { sent: 0, failed: 0 };
  let failed = 0;
  const toPush: typeof alerts = [];
  for (const a of alerts.slice(0, MAX_ALERTS_PER_RUN)) {
    const { data, error } = await supabase.rpc("field_alert_send", {
      p_recipient: a.recipient,
      p_keys: a.keys,
      p_kind: a.kind,
      p_title: a.title,
      p_body: a.body,
      p_link: a.link,
    });
    if (error) {
      failed++;
      console.error("field-alerts: send", a.kind, error);
    } else if (data === true) {
      written[a.kind]++;
      toPush.push(a);
    }
  }

  // To the phone's screen too, for whoever turned that on. A push that fails changes nothing: the notification is
  // already in their inbox. Five people at a time, each send under its own deadline (public-api-3), so a slow push
  // service cannot spend the run's sixty seconds.
  for (let i = 0; i < toPush.length; i += 5) {
    const batch = await Promise.all(
      toPush.slice(i, i + 5).map((a) => pushToUser(supabase, a.recipient, { title: a.title, body: a.body, url: a.link })),
    );
    for (const p of batch) {
      pushed.sent += p.sent;
      pushed.failed += p.failed;
    }
  }

  // And to the phone app (backlog 207): whatever any notification of the day left for it — the bell from the database
  // sends at once; this is the sweep for what it missed. Nothing without FCM_SERVICE_ACCOUNT, and never twice.
  const app = await dispatchPushes(supabase, { budgetMs: 15_000 });

  return NextResponse.json({
    ok: failed === 0,
    checkedAt: new Date().toISOString(),
    app,
    lands: lands.length,
    cycles: cycles.length,
    // null: FAO could not be read this run, so that half was skipped, not empty.
    sightings: sightings === null ? null : sightings.length,
    events: events === null ? null : events.length,
    due: alerts.length,
    capped: alerts.length > MAX_ALERTS_PER_RUN,
    written,
    pushed,
    failed,
  });
}
