import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type PushEvent = {
  id?: string;
  event_type?: string;
  event_key?: string;
  source_table?: string;
  source_id?: string;
  account_role?: string | null;
  title?: string;
  message?: string;
  admin_target?: string;
  target_id?: string | null;
};

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: PushEvent;
  old_record?: unknown;
};

const ADMIN_BASE_URL = "https://roobelhalatalab.github.io/hala-talab-admin/";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  try {
    const appId = Deno.env.get("ONESIGNAL_APP_ID");
    const apiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    const webhookSecret = Deno.env.get("ADMIN_PUSH_WEBHOOK_SECRET");

    if (!appId || !apiKey || !webhookSecret) {
      return json({ ok: false, error: "Required server secrets are missing" }, 500);
    }

    const suppliedSecret = req.headers.get("x-hala-admin-push-secret") || "";
    if (suppliedSecret !== webhookSecret) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const payload = (await req.json()) as WebhookPayload | PushEvent;
    const isWebhook = typeof payload === "object" && payload !== null && "record" in payload;

    if (isWebhook) {
      const hook = payload as WebhookPayload;
      if (hook.type !== "INSERT" || hook.schema !== "public" || hook.table !== "admin_push_events" || !hook.record) {
        return json({ ok: true, ignored: true });
      }
    }

    const event: PushEvent = isWebhook ? (payload as WebhookPayload).record! : (payload as PushEvent);

    const allowedTypes = new Set(["pin_reset", "store_signup", "driver_signup"]);
    const eventType = String(event.event_type || "").trim();
    if (!allowedTypes.has(eventType)) return json({ ok: true, ignored: true, reason: "event_type" });

    const title = String(event.title || "هلا طلب - الإدارة").trim();
    const message = String(event.message || "لديك تنبيه جديد في لوحة الإدارة").trim();
    const target = String(event.admin_target || "").trim();
    const targetId = String(event.target_id || event.source_id || "").trim();

    const url = new URL(ADMIN_BASE_URL);
    if (target) url.searchParams.set("admin_target", target);
    if (targetId) url.searchParams.set("target_id", targetId);

    const response = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Key ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        target_channel: "push",
        included_segments: ["Subscribed Users"],
        headings: { ar: title, en: title },
        contents: { ar: message, en: message },
        url: url.toString(),
        data: {
          event_type: eventType,
          event_key: event.event_key || "",
          source_table: event.source_table || "admin_push_events",
          source_id: event.source_id || targetId,
          admin_target: target,
          target_id: targetId,
        },
        name: `hala-talab-${eventType}-${event.event_key || event.source_id || Date.now()}`,
      }),
    });

    const text = await response.text();
    let result: unknown = text;
    try { result = JSON.parse(text); } catch (_) {}

    if (!response.ok) {
      console.error("OneSignal error", response.status, result);
      return json({ ok: false, onesignal_status: response.status, result }, 502);
    }

    return json({ ok: true, event_type: eventType, result });
  } catch (error) {
    console.error("admin-onesignal-push error", error);
    return json({ ok: false, error: String(error) }, 500);
  }
});
