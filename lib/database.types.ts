
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "categorias": {
                  Row: {
                    "codigo": string,"id": number,"nombre": string
                  }
                  ComputedFields: never
                  Insert: {
                    "codigo": string,"id"?: never,"nombre": string
                  }
                  Update: {
                    "codigo"?: string,"id"?: never,"nombre"?: string
                  }
                  Relationships: [
                    
                  ]
                },"clientes": {
                  Row: {
                    "acepta_promos": boolean,"codigo": number,"creado_en": string,"direccion": string | null,"documento": string | null,"email": string | null,"etiquetas": (string)[],"fecha_nacimiento": string | null,"id": number,"localidad": string | null,"nombre": string,"notas": string | null,"origen": string | null,"telefono": string | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acepta_promos"?: boolean,"codigo"?: number,"creado_en"?: string,"direccion"?: string | null,"documento"?: string | null,"email"?: string | null,"etiquetas"?: (string)[],"fecha_nacimiento"?: string | null,"id"?: never,"localidad"?: string | null,"nombre": string,"notas"?: string | null,"origen"?: string | null,"telefono"?: string | null,"usuario_id"?: string | null
                  }
                  Update: {
                    "acepta_promos"?: boolean,"codigo"?: number,"creado_en"?: string,"direccion"?: string | null,"documento"?: string | null,"email"?: string | null,"etiquetas"?: (string)[],"fecha_nacimiento"?: string | null,"id"?: never,"localidad"?: string | null,"nombre"?: string,"notas"?: string | null,"origen"?: string | null,"telefono"?: string | null,"usuario_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"colores": {
                  Row: {
                    "codigo": string,"hex": string | null,"id": number,"nombre": string
                  }
                  ComputedFields: never
                  Insert: {
                    "codigo": string,"hex"?: string | null,"id"?: never,"nombre": string
                  }
                  Update: {
                    "codigo"?: string,"hex"?: string | null,"id"?: never,"nombre"?: string
                  }
                  Relationships: [
                    
                  ]
                },"compra_items": {
                  Row: {
                    "cantidad": number,"compra_id": number,"costo_unitario": number,"id": number,"variante_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad": number,"compra_id": number,"costo_unitario": number,"id"?: never,"variante_id": number
                  }
                  Update: {
                    "cantidad"?: number,"compra_id"?: number,"costo_unitario"?: number,"id"?: never,"variante_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "compra_items_compra_id_fkey"
      columns: ["compra_id"]
isOneToOne: false
      referencedRelation: "compras"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compra_items_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_catalogo"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "compra_items_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "compra_items_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "variantes"
      referencedColumns: ["id"]
    }
                  ]
                },"compras": {
                  Row: {
                    "comprobante": string | null,"comprobante_proveedor": string | null,"deposito_id": number,"fecha": string,"fecha_comprobante": string | null,"id": number,"notas": string | null,"numero": number | null,"proveedor_id": number | null,"punto_venta": number,"total": number,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "comprobante"?: never,"comprobante_proveedor"?: string | null,"deposito_id": number,"fecha"?: string,"fecha_comprobante"?: string | null,"id"?: never,"notas"?: string | null,"numero"?: number | null,"proveedor_id"?: number | null,"punto_venta"?: number,"total": number,"usuario_id"?: string | null
                  }
                  Update: {
                    "comprobante"?: never,"comprobante_proveedor"?: string | null,"deposito_id"?: number,"fecha"?: string,"fecha_comprobante"?: string | null,"id"?: never,"notas"?: string | null,"numero"?: number | null,"proveedor_id"?: number | null,"punto_venta"?: number,"total"?: number,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "compras_deposito_id_fkey"
      columns: ["deposito_id"]
isOneToOne: false
      referencedRelation: "depositos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_deposito_id_fkey"
      columns: ["deposito_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["deposito_id"]
    },{
      foreignKeyName: "compras_proveedor_id_fkey"
      columns: ["proveedor_id"]
isOneToOne: false
      referencedRelation: "proveedores"
      referencedColumns: ["id"]
    }
                  ]
                },"depositos": {
                  Row: {
                    "activo": boolean,"id": number,"nombre": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"id"?: never,"nombre": string
                  }
                  Update: {
                    "activo"?: boolean,"id"?: never,"nombre"?: string
                  }
                  Relationships: [
                    
                  ]
                },"interacciones": {
                  Row: {
                    "canal": string | null,"cliente_id": number,"detalle": string,"fecha": string,"hecha": boolean,"id": number,"proxima_accion": string | null,"proxima_fecha": string | null,"tipo": string,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "canal"?: string | null,"cliente_id": number,"detalle": string,"fecha"?: string,"hecha"?: boolean,"id"?: never,"proxima_accion"?: string | null,"proxima_fecha"?: string | null,"tipo": string,"usuario_id"?: string | null
                  }
                  Update: {
                    "canal"?: string | null,"cliente_id"?: number,"detalle"?: string,"fecha"?: string,"hecha"?: boolean,"id"?: never,"proxima_accion"?: string | null,"proxima_fecha"?: string | null,"tipo"?: string,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "interacciones_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interacciones_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "v_mi_ficha"
      referencedColumns: ["id"]
    }
                  ]
                },"marcas": {
                  Row: {
                    "codigo": string,"id": number,"nombre": string
                  }
                  ComputedFields: never
                  Insert: {
                    "codigo": string,"id"?: never,"nombre": string
                  }
                  Update: {
                    "codigo"?: string,"id"?: never,"nombre"?: string
                  }
                  Relationships: [
                    
                  ]
                },"medios_pago": {
                  Row: {
                    "activo": boolean,"ajuste_pct": number,"codigo": string,"cuotas": number,"en_mostrador": boolean,"en_tienda": boolean,"id": number,"nombre": string,"orden": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"ajuste_pct"?: number,"codigo": string,"cuotas"?: number,"en_mostrador"?: boolean,"en_tienda"?: boolean,"id"?: never,"nombre": string,"orden"?: number,"tipo": string
                  }
                  Update: {
                    "activo"?: boolean,"ajuste_pct"?: number,"codigo"?: string,"cuotas"?: number,"en_mostrador"?: boolean,"en_tienda"?: boolean,"id"?: never,"nombre"?: string,"orden"?: number,"tipo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"movimientos_stock": {
                  Row: {
                    "cantidad": number,"compra_id": number | null,"deposito_id": number,"fecha": string,"id": number,"motivo": string | null,"tipo": string,"usuario_id": string | null,"variante_id": number,"venta_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad": number,"compra_id"?: number | null,"deposito_id": number,"fecha"?: string,"id"?: never,"motivo"?: string | null,"tipo": string,"usuario_id"?: string | null,"variante_id": number,"venta_id"?: number | null
                  }
                  Update: {
                    "cantidad"?: number,"compra_id"?: number | null,"deposito_id"?: number,"fecha"?: string,"id"?: never,"motivo"?: string | null,"tipo"?: string,"usuario_id"?: string | null,"variante_id"?: number,"venta_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "movimientos_stock_compra_id_fkey"
      columns: ["compra_id"]
isOneToOne: false
      referencedRelation: "compras"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_stock_deposito_id_fkey"
      columns: ["deposito_id"]
isOneToOne: false
      referencedRelation: "depositos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_stock_deposito_id_fkey"
      columns: ["deposito_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["deposito_id"]
    },{
      foreignKeyName: "movimientos_stock_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_catalogo"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "movimientos_stock_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "movimientos_stock_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "variantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_stock_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "v_hechos_ventas"
      referencedColumns: ["venta_id"]
    },{
      foreignKeyName: "movimientos_stock_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                },"numeradores": {
                  Row: {
                    "punto_venta": number,"tipo": string,"ultimo": number
                  }
                  ComputedFields: never
                  Insert: {
                    "punto_venta"?: number,"tipo": string,"ultimo"?: number
                  }
                  Update: {
                    "punto_venta"?: number,"tipo"?: string,"ultimo"?: number
                  }
                  Relationships: [
                    
                  ]
                },"pagos": {
                  Row: {
                    "ajuste": number,"ajuste_pct": number,"base": number,"cuotas": number,"fecha": string,"id": number,"medio_pago_id": number,"monto": number | null,"referencia": string | null,"venta_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ajuste"?: number,"ajuste_pct"?: number,"base": number,"cuotas"?: number,"fecha"?: string,"id"?: never,"medio_pago_id": number,"monto"?: never,"referencia"?: string | null,"venta_id": number
                  }
                  Update: {
                    "ajuste"?: number,"ajuste_pct"?: number,"base"?: number,"cuotas"?: number,"fecha"?: string,"id"?: never,"medio_pago_id"?: number,"monto"?: never,"referencia"?: string | null,"venta_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pagos_medio_pago_id_fkey"
      columns: ["medio_pago_id"]
isOneToOne: false
      referencedRelation: "medios_pago"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "v_hechos_ventas"
      referencedColumns: ["venta_id"]
    },{
      foreignKeyName: "pagos_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                },"pedido_estados": {
                  Row: {
                    "comentario": string | null,"estado": string,"fecha": string,"id": number,"pedido_id": number,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "comentario"?: string | null,"estado": string,"fecha"?: string,"id"?: never,"pedido_id": number,"usuario_id"?: string | null
                  }
                  Update: {
                    "comentario"?: string | null,"estado"?: string,"fecha"?: string,"id"?: never,"pedido_id"?: number,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pedido_estados_pedido_id_fkey"
      columns: ["pedido_id"]
isOneToOne: false
      referencedRelation: "pedidos"
      referencedColumns: ["id"]
    }
                  ]
                },"pedido_items": {
                  Row: {
                    "cantidad": number,"id": number,"pedido_id": number,"precio_unitario": number,"variante_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad": number,"id"?: never,"pedido_id": number,"precio_unitario": number,"variante_id": number
                  }
                  Update: {
                    "cantidad"?: number,"id"?: never,"pedido_id"?: number,"precio_unitario"?: number,"variante_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pedido_items_pedido_id_fkey"
      columns: ["pedido_id"]
isOneToOne: false
      referencedRelation: "pedidos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedido_items_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_catalogo"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "pedido_items_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "pedido_items_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "variantes"
      referencedColumns: ["id"]
    }
                  ]
                },"pedidos": {
                  Row: {
                    "ajuste_medio_pago": number,"ajuste_pct": number,"canal": string,"cliente_id": number,"comprobante": string | null,"deposito_id": number,"direccion_envio": string | null,"entrega": string,"estado": string,"fecha": string,"id": number,"medio_pago_id": number,"notas": string | null,"numero": number | null,"punto_venta": number,"subtotal": number,"total": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ajuste_medio_pago"?: number,"ajuste_pct"?: number,"canal"?: string,"cliente_id": number,"comprobante"?: never,"deposito_id": number,"direccion_envio"?: string | null,"entrega"?: string,"estado"?: string,"fecha"?: string,"id"?: never,"medio_pago_id": number,"notas"?: string | null,"numero"?: number | null,"punto_venta"?: number,"subtotal"?: number,"total"?: number
                  }
                  Update: {
                    "ajuste_medio_pago"?: number,"ajuste_pct"?: number,"canal"?: string,"cliente_id"?: number,"comprobante"?: never,"deposito_id"?: number,"direccion_envio"?: string | null,"entrega"?: string,"estado"?: string,"fecha"?: string,"id"?: never,"medio_pago_id"?: number,"notas"?: string | null,"numero"?: number | null,"punto_venta"?: number,"subtotal"?: number,"total"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pedidos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "v_mi_ficha"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_deposito_id_fkey"
      columns: ["deposito_id"]
isOneToOne: false
      referencedRelation: "depositos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_deposito_id_fkey"
      columns: ["deposito_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["deposito_id"]
    },{
      foreignKeyName: "pedidos_medio_pago_id_fkey"
      columns: ["medio_pago_id"]
isOneToOne: false
      referencedRelation: "medios_pago"
      referencedColumns: ["id"]
    }
                  ]
                },"perfiles": {
                  Row: {
                    "id": string,"nombre": string | null,"rol": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"nombre"?: string | null,"rol"?: string
                  }
                  Update: {
                    "id"?: string,"nombre"?: string | null,"rol"?: string
                  }
                  Relationships: [
                    
                  ]
                },"producto_imagenes": {
                  Row: {
                    "creado_en": string,"id": number,"orden": number,"principal": boolean,"producto_id": number,"ruta": string | null,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "creado_en"?: string,"id"?: never,"orden"?: number,"principal"?: boolean,"producto_id": number,"ruta"?: string | null,"url": string
                  }
                  Update: {
                    "creado_en"?: string,"id"?: never,"orden"?: number,"principal"?: boolean,"producto_id"?: number,"ruta"?: string | null,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "producto_imagenes_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "productos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "producto_imagenes_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_catalogo"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "producto_imagenes_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "producto_imagenes_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_venta_items"
      referencedColumns: ["producto_id"]
    }
                  ]
                },"producto_proveedores": {
                  Row: {
                    "actualizado_en": string,"bonificacion_pct": number,"codigo_proveedor": string | null,"id": number,"precio_compra": number | null,"precio_lista": number,"principal": boolean,"producto_id": number,"proveedor_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"bonificacion_pct"?: number,"codigo_proveedor"?: string | null,"id"?: never,"precio_compra"?: never,"precio_lista": number,"principal"?: boolean,"producto_id": number,"proveedor_id": number
                  }
                  Update: {
                    "actualizado_en"?: string,"bonificacion_pct"?: number,"codigo_proveedor"?: string | null,"id"?: never,"precio_compra"?: never,"precio_lista"?: number,"principal"?: boolean,"producto_id"?: number,"proveedor_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "producto_proveedores_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "productos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "producto_proveedores_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_catalogo"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "producto_proveedores_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "producto_proveedores_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_venta_items"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "producto_proveedores_proveedor_id_fkey"
      columns: ["proveedor_id"]
isOneToOne: false
      referencedRelation: "proveedores"
      referencedColumns: ["id"]
    }
                  ]
                },"productos": {
                  Row: {
                    "activo": boolean,"categoria_id": number | null,"codigo": string,"creado_en": string,"descripcion": string | null,"genero": string | null,"id": number,"imagen_url": string | null,"marca_id": number | null,"nombre": string,"precio_compra": number,"precio_venta": number,"publicado_web": boolean,"subcategoria_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"categoria_id"?: number | null,"codigo": string,"creado_en"?: string,"descripcion"?: string | null,"genero"?: string | null,"id"?: never,"imagen_url"?: string | null,"marca_id"?: number | null,"nombre": string,"precio_compra"?: number,"precio_venta"?: number,"publicado_web"?: boolean,"subcategoria_id"?: number | null
                  }
                  Update: {
                    "activo"?: boolean,"categoria_id"?: number | null,"codigo"?: string,"creado_en"?: string,"descripcion"?: string | null,"genero"?: string | null,"id"?: never,"imagen_url"?: string | null,"marca_id"?: number | null,"nombre"?: string,"precio_compra"?: number,"precio_venta"?: number,"publicado_web"?: boolean,"subcategoria_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "productos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "productos_marca_id_fkey"
      columns: ["marca_id"]
isOneToOne: false
      referencedRelation: "marcas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "productos_subcategoria_id_fkey"
      columns: ["subcategoria_id"]
isOneToOne: false
      referencedRelation: "subcategorias"
      referencedColumns: ["id"]
    }
                  ]
                },"proveedores": {
                  Row: {
                    "codigo": number,"creado_en": string,"documento": string | null,"email": string | null,"id": number,"nombre": string,"notas": string | null,"telefono": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "codigo"?: number,"creado_en"?: string,"documento"?: string | null,"email"?: string | null,"id"?: never,"nombre": string,"notas"?: string | null,"telefono"?: string | null
                  }
                  Update: {
                    "codigo"?: number,"creado_en"?: string,"documento"?: string | null,"email"?: string | null,"id"?: never,"nombre"?: string,"notas"?: string | null,"telefono"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"stock": {
                  Row: {
                    "cantidad": number,"deposito_id": number,"reservado": number,"variante_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad"?: number,"deposito_id": number,"reservado"?: number,"variante_id": number
                  }
                  Update: {
                    "cantidad"?: number,"deposito_id"?: number,"reservado"?: number,"variante_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_deposito_id_fkey"
      columns: ["deposito_id"]
isOneToOne: false
      referencedRelation: "depositos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_deposito_id_fkey"
      columns: ["deposito_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["deposito_id"]
    },{
      foreignKeyName: "stock_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_catalogo"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "stock_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "stock_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "variantes"
      referencedColumns: ["id"]
    }
                  ]
                },"subcategorias": {
                  Row: {
                    "categoria_id": number,"codigo": string,"id": number,"nombre": string
                  }
                  ComputedFields: never
                  Insert: {
                    "categoria_id": number,"codigo": string,"id"?: never,"nombre": string
                  }
                  Update: {
                    "categoria_id"?: number,"codigo"?: string,"id"?: never,"nombre"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subcategorias_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id"]
    }
                  ]
                },"talles": {
                  Row: {
                    "id": number,"nombre": string,"orden": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"nombre": string,"orden": number,"tipo"?: string
                  }
                  Update: {
                    "id"?: never,"nombre"?: string,"orden"?: number,"tipo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"variantes": {
                  Row: {
                    "color_id": number,"id": number,"precio_venta": number | null,"producto_id": number,"sku": string | null,"stock_minimo": number,"talle_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "color_id": number,"id"?: never,"precio_venta"?: number | null,"producto_id": number,"sku"?: string | null,"stock_minimo"?: number,"talle_id": number
                  }
                  Update: {
                    "color_id"?: number,"id"?: never,"precio_venta"?: number | null,"producto_id"?: number,"sku"?: string | null,"stock_minimo"?: number,"talle_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "variantes_color_id_fkey"
      columns: ["color_id"]
isOneToOne: false
      referencedRelation: "colores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "variantes_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "productos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "variantes_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_catalogo"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "variantes_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "variantes_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_venta_items"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "variantes_talle_id_fkey"
      columns: ["talle_id"]
isOneToOne: false
      referencedRelation: "talles"
      referencedColumns: ["id"]
    }
                  ]
                },"venta_items": {
                  Row: {
                    "cantidad": number,"costo_unitario": number,"id": number,"precio_unitario": number,"variante_id": number,"venta_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad": number,"costo_unitario"?: number,"id"?: never,"precio_unitario": number,"variante_id": number,"venta_id": number
                  }
                  Update: {
                    "cantidad"?: number,"costo_unitario"?: number,"id"?: never,"precio_unitario"?: number,"variante_id"?: number,"venta_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "venta_items_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_catalogo"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "venta_items_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "venta_items_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "variantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venta_items_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "v_hechos_ventas"
      referencedColumns: ["venta_id"]
    },{
      foreignKeyName: "venta_items_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                },"ventas": {
                  Row: {
                    "ajuste_medio_pago": number,"canal": string,"cliente_id": number | null,"comprobante": string | null,"deposito_id": number,"descuento": number,"fecha": string,"id": number,"notas": string | null,"numero": number | null,"pedido_id": number | null,"punto_venta": number,"subtotal": number,"total": number,"vendedor_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ajuste_medio_pago"?: number,"canal"?: string,"cliente_id"?: number | null,"comprobante"?: never,"deposito_id": number,"descuento"?: number,"fecha"?: string,"id"?: never,"notas"?: string | null,"numero"?: number | null,"pedido_id"?: number | null,"punto_venta"?: number,"subtotal": number,"total": number,"vendedor_id"?: string | null
                  }
                  Update: {
                    "ajuste_medio_pago"?: number,"canal"?: string,"cliente_id"?: number | null,"comprobante"?: never,"deposito_id"?: number,"descuento"?: number,"fecha"?: string,"id"?: never,"notas"?: string | null,"numero"?: number | null,"pedido_id"?: number | null,"punto_venta"?: number,"subtotal"?: number,"total"?: number,"vendedor_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ventas_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ventas_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "v_mi_ficha"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ventas_deposito_id_fkey"
      columns: ["deposito_id"]
isOneToOne: false
      referencedRelation: "depositos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ventas_deposito_id_fkey"
      columns: ["deposito_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["deposito_id"]
    },{
      foreignKeyName: "ventas_pedido_id_fkey"
      columns: ["pedido_id"]
isOneToOne: true
      referencedRelation: "pedidos"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_catalogo": {
                  Row: {
                    "categoria": string | null,"color": string | null,"color_hex": string | null,"descripcion": string | null,"disponible": number | null,"genero": string | null,"imagen_url": string | null,"marca": string | null,"nombre": string | null,"precio": number | null,"producto_id": number | null,"talle": string | null,"talle_orden": number | null,"variante_id": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_hechos_ventas": {
                  Row: {
                    "anio": number | null,"articulo": string | null,"canal": string | null,"cantidad": number | null,"cliente": string | null,"cliente_codigo": number | null,"cliente_origen": string | null,"color": string | null,"comprobante": string | null,"costo": number | null,"costo_unitario": number | null,"deposito": string | null,"dia": string | null,"dia_semana": number | null,"fecha": string | null,"genero": string | null,"id": number | null,"importe": number | null,"importe_neto": number | null,"marca": string | null,"margen": number | null,"margen_neto": number | null,"mes": number | null,"modelo": string | null,"precio_unitario": number | null,"rubro": string | null,"rubro_codigo": string | null,"sku": string | null,"subrubro": string | null,"talle": string | null,"talle_orden": number | null,"venta_id": number | null,"vino_de_pedido": boolean | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_imagenes_tienda": {
                  Row: {
                    "id": number | null,"orden": number | null,"principal": boolean | null,"producto_id": number | null,"url": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "producto_imagenes_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "productos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "producto_imagenes_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_catalogo"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "producto_imagenes_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "producto_imagenes_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_venta_items"
      referencedColumns: ["producto_id"]
    }
                  ]
                },"v_mi_ficha": {
                  Row: {
                    "acepta_promos": boolean | null,"codigo": number | null,"direccion": string | null,"documento": string | null,"email": string | null,"fecha_nacimiento": string | null,"id": number | null,"localidad": string | null,"nombre": string | null,"telefono": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "acepta_promos"?: boolean | null,"codigo"?: number | null,"direccion"?: string | null,"documento"?: string | null,"email"?: string | null,"fecha_nacimiento"?: string | null,"id"?: number | null,"localidad"?: string | null,"nombre"?: string | null,"telefono"?: string | null
                         }
                        Update: {
                           "acepta_promos"?: boolean | null,"codigo"?: number | null,"direccion"?: string | null,"documento"?: string | null,"email"?: string | null,"fecha_nacimiento"?: string | null,"id"?: number | null,"localidad"?: string | null,"nombre"?: string | null,"telefono"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"v_stock": {
                  Row: {
                    "categoria": string | null,"codigo": string | null,"color": string | null,"color_hex": string | null,"deposito": string | null,"deposito_id": number | null,"disponible": number | null,"marca": string | null,"nombre": string | null,"precio_compra": number | null,"precio_venta": number | null,"producto_id": number | null,"reservado": number | null,"sku": string | null,"stock": number | null,"stock_bajo": boolean | null,"stock_minimo": number | null,"talle": string | null,"talle_orden": number | null,"valor_costo": number | null,"variante_id": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_venta_items": {
                  Row: {
                    "canal": string | null,"cantidad": number | null,"cliente_id": number | null,"color": string | null,"costo_unitario": number | null,"fecha": string | null,"id": number | null,"marca": string | null,"margen": number | null,"nombre": string | null,"precio_unitario": number | null,"producto_id": number | null,"subtotal": number | null,"talle": string | null,"variante_id": number | null,"venta_id": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "venta_items_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_catalogo"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "venta_items_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "venta_items_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "variantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venta_items_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "v_hechos_ventas"
      referencedColumns: ["venta_id"]
    },{
      foreignKeyName: "venta_items_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ventas_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ventas_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "v_mi_ficha"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "_codigo_corto":
{ Args: { "p_largo"?: number,"p_nombre": string,"p_prefijo"?: string,"p_tabla": string }; Returns: string
                           },
"_mover_stock":
{ Args: { "p_cantidad": number,"p_compra"?: number,"p_deposito": number,"p_motivo"?: string,"p_tipo": string,"p_variante": number,"p_venta"?: number }; Returns: undefined
                           },
"_vincular_cliente":
{ Args: { "p_usuario": unknown }; Returns: undefined
                           },
"actualizar_mi_ficha":
{ Args: { "p_acepta_promos"?: boolean,"p_direccion"?: string,"p_documento"?: string,"p_fecha_nacimiento"?: string,"p_localidad"?: string,"p_nombre": string,"p_telefono"?: string }; Returns: undefined
                           },
"ajustar_stock":
{ Args: { "p_deposito"?: number,"p_motivo": string,"p_stock_nuevo": number,"p_variante": number }; Returns: undefined
                           },
"buscar_color":
{ Args: { "p_nombre": string }; Returns: number
                           },
"buscar_talle":
{ Args: { "p_nombre": string }; Returns: number
                           },
"cambiar_estado_pedido":
{ Args: { "p_comentario"?: string,"p_estado": string,"p_pagos"?: Json,"p_pedido": number }; Returns: number
                           },
"crear_pedido":
{ Args: { "p_canal"?: string,"p_cliente"?: number,"p_direccion"?: string,"p_entrega"?: string,"p_items": Json,"p_medio_pago"?: number,"p_notas"?: string }; Returns: number
                           },
"deposito_principal":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"es_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"mi_cliente_id":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"precio_de":
{ Args: { "p_variante": number }; Returns: number
                           },
"registrar_compra":
{ Args: { "p_actualizar_costo"?: boolean,"p_comprobante_proveedor"?: string,"p_deposito"?: number,"p_fecha_comprobante"?: string,"p_items": Json,"p_notas"?: string,"p_proveedor"?: number }; Returns: number
                           },
"registrar_venta":
{ Args: { "p_canal"?: string,"p_cliente"?: number,"p_deposito"?: number,"p_descuento"?: number,"p_items": Json,"p_notas"?: string,"p_pagos"?: Json }; Returns: number
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
