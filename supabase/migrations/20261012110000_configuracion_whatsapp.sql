-- Opciones de activación y desactivación de funciones de WhatsApp
alter table public.configuracion_tienda
  add column if not exists wa_bot_activo boolean not null default false,
  add column if not exists wa_notificaciones_pedidos boolean not null default false;
