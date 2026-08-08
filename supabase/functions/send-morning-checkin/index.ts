// Supabase Edge Function — envía el push matutino de check-in a todos los clientes activos.
// Se ejecuta por un cron job de Postgres (ver README.md de esta carpeta), no manualmente.
//
// Requiere estos secrets en el proyecto (Project Settings → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY normalmente ya existen por defecto en todo proyecto)

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;

webpush.setVapidDetails("mailto:sergio@src-training.app", vapidPublic, vapidPrivate);

Deno.serve(async (_req) => {
  const supabase = createClient(supabaseUrl, serviceKey);

  // Suscripciones de clientes activos únicamente
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, cliente_id, endpoint, p256dh, auth, clientes!inner(activo)")
    .eq("clientes.activo", true);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = JSON.stringify({
    title: "SRC Training 💪",
    body: "Buenos días — rellena tu check-in de hoy antes de entrenar",
    url: "/src-training/",
    tag: "checkin-matutino",
  });

  let sent = 0;
  let failed = 0;
  const toRemove: string[] = [];

  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      sent++;
    } catch (e) {
      failed++;
      // 404/410 = el navegador invalidó la suscripción (desinstaló la app, etc.) — limpiar
      const statusCode = (e as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) toRemove.push(s.endpoint);
    }
  }

  if (toRemove.length) {
    await supabase.from("push_subscriptions").delete().in("endpoint", toRemove);
  }

  return new Response(
    JSON.stringify({ sent, failed, removed: toRemove.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});
