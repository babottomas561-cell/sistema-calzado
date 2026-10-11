-- Escalas de talles: cada artículo es de UNA escala (Adulto, Niños o Bebé) y solo puede tener talles
-- de esa escala. Así una zapatilla de nene no termina con un 42, y el "34" de niños y el "34" de
-- adulto pueden ser dos talles distintos (cada uno con su orden y su stock).
--
-- La escala es independiente del género: una zapatilla juvenil puede ser escala Niños aunque
-- llegue al 36, y un artículo "Unisex" puede ser de adultos.

-- Talles: suma la escala Bebé, y el nombre deja de ser único en toda la tabla: es único por escala
alter table public.talles drop constraint talles_tipo_check;
alter table public.talles add constraint talles_tipo_check check (tipo in ('Adulto', 'Niños', 'Bebé'));
alter table public.talles drop constraint talles_nombre_key;
drop index public.talles_nombre_sin_mayus;
create unique index talles_nombre_por_escala on public.talles (tipo, upper(nombre));

-- Artículos: su escala. Los que ya existen toman la de sus talles (si tienen de una sola).
alter table public.productos add column escala text not null default 'Adulto' check (escala in ('Adulto', 'Niños', 'Bebé'));
update public.productos p set escala = x.tipo
  from (select v.producto_id, min(t.tipo) as tipo from variantes v join talles t on t.id = v.talle_id
         group by v.producto_id having count(distinct t.tipo) = 1) x
 where x.producto_id = p.id;

-- Un talle de otra escala no entra en el artículo
create or replace function public._talle_de_su_escala() returns trigger
language plpgsql set search_path = public as $$
declare v_talle talles; v_escala text;
begin
  select * into v_talle from talles where id = new.talle_id;
  select escala into v_escala from productos where id = new.producto_id;
  if v_talle.tipo <> v_escala then
    raise exception 'El talle % es de la escala %, y el artículo es de la escala %', v_talle.nombre, v_talle.tipo, v_escala;
  end if;
  return new;
end $$;
create trigger talle_de_su_escala before insert or update of talle_id, producto_id on public.variantes
  for each row execute function public._talle_de_su_escala();

-- Y un artículo no cambia de escala si ya tiene talles de la anterior
create or replace function public._escala_con_talles() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from variantes v join talles t on t.id = v.talle_id where v.producto_id = new.id and t.tipo <> new.escala) then
    raise exception 'El artículo ya tiene talles de la escala %: no se puede pasar a %', old.escala, new.escala;
  end if;
  return new;
end $$;
create trigger escala_con_talles before update of escala on public.productos
  for each row when (old.escala is distinct from new.escala) execute function public._escala_con_talles();

revoke execute on function public._talle_de_su_escala, public._escala_con_talles from public, anon, authenticated;

-- El catálogo público muestra la escala (la tienda filtra "Niños" sin mezclar el 34 de nene con el de adulto)
drop view public.v_catalogo;
create view public.v_catalogo as
select v.id as variante_id, p.id as producto_id, p.nombre, m.nombre as marca, c.nombre as categoria,
       p.genero, p.escala, p.descripcion, p.imagen_url, t.nombre as talle, t.orden as talle_orden, co.nombre as color, co.hex as color_hex,
       coalesce(v.precio_venta, p.precio_venta) as precio,
       greatest(coalesce(sum(s.cantidad - s.reservado), 0), 0)::int as disponible
from variantes v
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
left join marcas m on m.id = p.marca_id
left join categorias c on c.id = p.categoria_id
left join stock s on s.variante_id = v.id
where p.publicado_web and p.activo
group by v.id, p.id, m.nombre, c.nombre, t.nombre, t.orden, co.nombre, co.hex;
grant select on public.v_catalogo to anon, authenticated;

-- buscar_talle: con dos "34" (niños y adulto) el nombre solo ya no alcanza. Ahora recibe la escala;
-- si no viene, la deduce como antes (número menor a 35 = Niños).
drop function public.buscar_talle(text);
create function public.buscar_talle(p_nombre text, p_escala text default null) returns bigint
language plpgsql set search_path = public as $$
declare v_id bigint; v_n text := upper(replace(trim(p_nombre), ',', '.'));   -- "xl" → XL, "38,5" → 38.5
        v_num numeric := case when v_n ~ '^[0-9]+([.][0-9]+)?$' then v_n::numeric end;
        v_escala text := coalesce(p_escala, case when v_num < 35 then 'Niños' else 'Adulto' end);
begin
  if v_escala not in ('Adulto', 'Niños', 'Bebé') then raise exception 'Escala de talles inválida'; end if;
  select id into v_id from talles where upper(nombre) = v_n and tipo = v_escala;
  if v_id is null then
    insert into talles (nombre, orden, tipo)
    -- numérico: su valor; letras: después de los números, en orden de talle de ropa
    values (v_n, coalesce(v_num, 1000 + coalesce(array_position(array['XS','S','M','L','XL','XXL'], v_n), 50)), v_escala)
    returning id into v_id;
  end if;
  return v_id;
end $$;
revoke execute on function public.buscar_talle from public, anon;
grant execute on function public.buscar_talle to authenticated;
