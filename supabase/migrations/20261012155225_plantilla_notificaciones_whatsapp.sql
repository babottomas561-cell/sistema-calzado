-- Las notificaciones iniciadas por el local usan una plantilla aprobada por Meta.
-- El nombre y el idioma no son secretos y se administran desde el panel.
alter table public.configuracion_tienda
  add column wa_plantilla_estado text,
  add column wa_idioma_plantilla text not null default 'es_AR';

alter table public.configuracion_tienda
  add constraint configuracion_tienda_wa_plantilla_estado_valida
    check (wa_plantilla_estado is null or wa_plantilla_estado ~ '^[a-z0-9_]{1,512}$'),
  add constraint configuracion_tienda_wa_idioma_valido
    check (wa_idioma_plantilla ~ '^[a-z]{2}(_[A-Z]{2})?$');
