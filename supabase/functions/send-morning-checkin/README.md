# Aviso push matutino del check-in

Notificación push real (llega aunque la app esté cerrada) que se envía cada
mañana a todos los clientes activos recordándoles rellenar el check-in.

Tiene 4 piezas. Las 3 primeras ya están hechas y subidas (index.html, sw.js,
este archivo). La única parte que falta es que **tú** ejecutes estos pasos en
Supabase — no tengo acceso para hacerlo por ti.

## 1. Crear la tabla `push_subscriptions`

En el SQL Editor de Supabase:

```sql
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

-- La app solo necesita poder insertar/actualizar su propia suscripción.
-- Usamos la clave anon, así que permitimos insert/update abiertos (igual que el resto de tablas de la app).
create policy "push_subscriptions_insert" on push_subscriptions
  for insert with check (true);
create policy "push_subscriptions_update" on push_subscriptions
  for update using (true);
```

Si `clientes.id` no es de tipo `uuid` en tu esquema, cambia `cliente_id uuid`
por el tipo que corresponda (ej. `bigint`, `text`) antes de ejecutar.

## 2. Desplegar esta función

Necesitas la [Supabase CLI](https://supabase.com/docs/guides/cli) instalada y
sesión iniciada (`supabase login`).

```bash
cd /Users/Sergio/Desktop/src-performance-app
supabase link --project-ref eqzyvutedejpstmpnfqr
supabase functions deploy send-morning-checkin
```

## 3. Configurar los secrets de la función

En el dashboard: **Project Settings → Edge Functions → Secrets**, añade:

| Nombre | Valor |
|---|---|
| `VAPID_PUBLIC_KEY` | `BHMW4NhEZoLM06XqxHVfXiuduV2sdbV4ofQ0nlgH8SOmJ_Q7qxiqHSnatCtx9ylmFTlYczygX4_Zuow5nSB5suw` |
| `VAPID_PRIVATE_KEY` | `JPnz-oF4cjmNn4lUVBUk7W1A61TfyMmF3nmYxr6E-SU` |

(`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya existen automáticamente en
todo proyecto Supabase — no hace falta añadirlos.)

**Guarda la clave privada en un sitio seguro tuyo también** (gestor de
contraseñas). Si se pierde, hay que regenerar el par de claves y todos los
clientes tendrían que volver a activar las notificaciones.

## 4. Programar el envío diario (cron)

En el SQL Editor, habilita las extensiones si no lo están ya:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

Luego programa el cron (ejemplo: 8:00 de la mañana, hora de España peninsular
= 6:00 UTC en horario de verano, 7:00 UTC en horario de invierno — ajusta el
`'0 6 * * *'` según la época del año, o usa `'0 7 * * *'` como término medio):

```sql
select cron.schedule(
  'morning-checkin-push',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://eqzyvutedejpstmpnfqr.supabase.co/functions/v1/send-morning-checkin',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Si `current_setting('app.settings.service_role_key', true)` da error (no
todos los proyectos lo tienen configurado), sustitúyelo directamente por tu
Service Role Key pegada como texto — es menos elegante pero funciona igual:

```sql
headers := jsonb_build_object('Authorization', 'Bearer TU_SERVICE_ROLE_KEY_AQUI', 'Content-Type', 'application/json')
```

## 5. Probar que funciona

Puedes disparar la función a mano para probarla sin esperar al cron:

```bash
curl -X POST 'https://eqzyvutedejpstmpnfqr.supabase.co/functions/v1/send-morning-checkin' \
  -H "Authorization: Bearer TU_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

Debería devolver algo como `{"sent":3,"failed":0,"removed":0}`.

## Cómo se activa para cada cliente

Cada cliente tiene que pulsar el botón 🔔 (notificaciones) en la app **una
vez** — ahí se piden permisos del navegador y se guarda su suscripción push
en la tabla. Sin ese paso no recibe nada, por mucho que el cron esté
funcionando.
