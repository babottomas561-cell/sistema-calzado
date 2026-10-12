-- Códigos de barras por variante (talle × color).
--
-- En ropa y calzado cada talle y color tiene SU código: el del fabricante (EAN-13 de Nike, Adidas…) o uno propio. Se carga
-- en la ficha del artículo, y la venta, las compras, el stock y las etiquetas lo buscan por ahí.
--   · `variantes.sku` sigue siendo el código interno legible (ZAP-0001-42-NEG): no se toca.
--   · `variantes.codigo_barras` es opcional y único. Un número de 8, 12, 13 o 14 cifras tiene dígito verificador (GS1): si no
--     coincide, casi seguro es un error de tipeo y se rechaza. Cualquier otro código (letras, números, . - _) se acepta tal cual.
--   · Para lo que no trae código, `generar_codigos_barras()` arma uno propio: EAN-13 que empieza en 200, el rango que GS1
--     reserva para uso interno de cada comercio (ningún fabricante lo usa), así que nunca choca con un código real.

create sequence public.seq_codigo_barras;

alter table public.variantes add column codigo_barras text;
create unique index variantes_codigo_barras_key on public.variantes (upper(codigo_barras)) where codigo_barras is not null;

-- Dígito verificador GS1 de un cuerpo numérico (el código sin su último dígito): pesos 3 y 1 alternados desde la derecha
create function public._gs1_digito(p_cuerpo text) returns int
language plpgsql immutable set search_path = public as $$
declare v_suma int := 0; v_n int := coalesce(length(p_cuerpo), 0); i int;
begin
  if v_n = 0 or p_cuerpo !~ '^[0-9]+$' then return null; end if;
  for i in 1..v_n loop
    v_suma := v_suma + substr(p_cuerpo, i, 1)::int * case when (v_n - i) % 2 = 0 then 3 else 1 end;
  end loop;
  return (10 - v_suma % 10) % 10;
end $$;

-- ¿Es un EAN-8, UPC-A, EAN-13 o GTIN-14 con su dígito verificador bien?
create function public._gs1_valido(p_codigo text) returns boolean
language sql immutable set search_path = public as $$
  select p_codigo ~ '^[0-9]+$' and length(p_codigo) in (8, 12, 13, 14)
     and substr(p_codigo, length(p_codigo))::int = _gs1_digito(substr(p_codigo, 1, length(p_codigo) - 1))
$$;

-- Reglas del código de una variante (las mismas que valida lib/codigos.ts antes de mandarlo)
create function public._variante_codigo_barras() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_otro text;
begin
  new.codigo_barras := nullif(regexp_replace(coalesce(new.codigo_barras, ''), '\s+', '', 'g'), '');
  if new.codigo_barras is null then return new; end if;
  if new.codigo_barras !~ '^[A-Za-z0-9._-]{4,32}$' then
    raise exception 'El código de barras solo lleva letras, números, punto, guion y guion bajo (de 4 a 32 caracteres)';
  end if;
  if new.codigo_barras ~ '^[0-9]+$' and length(new.codigo_barras) in (8, 12, 13, 14) and not _gs1_valido(new.codigo_barras) then
    raise exception 'El dígito verificador de % no coincide: revisá que esté bien escrito', new.codigo_barras;
  end if;
  select sku into v_otro from variantes where upper(codigo_barras) = upper(new.codigo_barras) and id is distinct from new.id limit 1;
  if found then raise exception 'Ese código de barras ya lo tiene la variante %', v_otro; end if;
  select sku into v_otro from variantes where upper(sku) = upper(new.codigo_barras) and id is distinct from new.id limit 1;
  if found then raise exception 'Ese código coincide con el código interno de la variante %', v_otro; end if;
  return new;
end $$;
create trigger variante_codigo_barras before insert or update of codigo_barras on public.variantes
  for each row execute function public._variante_codigo_barras();

-- Códigos propios para las variantes que no tienen (las demás no se tocan). Devuelve cuántas se asignaron.
create function public.generar_codigos_barras(p_variantes bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_cuerpo text; v_cod text; v_n int := 0;
begin
  if not tiene_permiso('productos.editar') then raise exception 'No tenés permiso para editar productos'; end if;
  if cardinality(p_variantes) > 5000 then raise exception 'Son demasiadas variantes de una vez (el máximo es 5000)'; end if;
  for v_id in select id from variantes where id = any (p_variantes) and codigo_barras is null order by id loop
    loop
      v_cuerpo := '200' || lpad(nextval('seq_codigo_barras')::text, 9, '0');
      v_cod := v_cuerpo || _gs1_digito(v_cuerpo)::text;
      exit when not exists (select 1 from variantes where upper(codigo_barras) = v_cod or upper(sku) = v_cod);
    end loop;
    update variantes set codigo_barras = v_cod where id = v_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke execute on function public._gs1_digito(text), public._gs1_valido(text), public._variante_codigo_barras() from public, anon, authenticated;
revoke execute on function public.generar_codigos_barras(bigint[]) from public, anon;
grant execute on function public.generar_codigos_barras(bigint[]) to authenticated;

-- v_stock trae el código de barras (al final: las pantallas que ya la usan siguen igual)
create or replace view public.v_stock with (security_invoker = false) as
select v.id as variante_id, p.id as producto_id, p.codigo, p.nombre, m.nombre as marca, c.nombre as categoria,
       t.nombre as talle, t.orden as talle_orden, co.nombre as color, co.hex as color_hex,
       v.sku, d.id as deposito_id, d.nombre as deposito,
       coalesce(s.cantidad, 0) as stock, coalesce(s.reservado, 0) as reservado,
       coalesce(s.cantidad, 0) - coalesce(s.reservado, 0) as disponible, v.stock_minimo,
       case when tiene_permiso('costos.ver') then p.precio_compra end as precio_compra,
       coalesce(v.precio_venta, p.precio_venta) as precio_venta,
       case when tiene_permiso('costos.ver') then coalesce(s.cantidad, 0) * p.precio_compra end as valor_costo,
       coalesce(s.cantidad, 0) - coalesce(s.reservado, 0) <= v.stock_minimo as stock_bajo,
       p.escala, p.genero, p.temporada, c.linea,
       v.codigo_barras
from variantes v
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
cross join depositos d
left join stock s on s.variante_id = v.id and s.deposito_id = d.id
left join marcas m on m.id = p.marca_id
left join categorias c on c.id = p.categoria_id
-- Solo los depósitos que venden: lo fallado se ve en v_fallados (así ninguna pantalla duplica filas)
where d.vendible and (tiene_permiso('stock.ver') or tiene_permiso('ventas.registrar'));
