
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
            "aceptaciones_legales": {
                  Row: {
                    "aceptado_en": string,"documento_id": number,"id": number,"origen": string,"pedido_id": number | null,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aceptado_en"?: string,"documento_id": number,"id"?: never,"origen": string,"pedido_id"?: number | null,"usuario_id": string
                  }
                  Update: {
                    "aceptado_en"?: string,"documento_id"?: number,"id"?: never,"origen"?: string,"pedido_id"?: number | null,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "aceptaciones_legales_documento_id_fkey"
      columns: ["documento_id"]
isOneToOne: false
      referencedRelation: "documentos_legales"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "aceptaciones_legales_documento_id_fkey"
      columns: ["documento_id"]
isOneToOne: false
      referencedRelation: "v_documentos_vigentes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "aceptaciones_legales_pedido_id_fkey"
      columns: ["pedido_id"]
isOneToOne: false
      referencedRelation: "pedidos"
      referencedColumns: ["id"]
    }
                  ]
                },"ajuste_precio_items": {
                  Row: {
                    "ajuste_id": number,"id": number,"precio_anterior": number,"precio_nuevo": number,"producto_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ajuste_id": number,"id"?: never,"precio_anterior": number,"precio_nuevo": number,"producto_id": number
                  }
                  Update: {
                    "ajuste_id"?: number,"id"?: never,"precio_anterior"?: number,"precio_nuevo"?: number,"producto_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ajuste_precio_items_ajuste_id_fkey"
      columns: ["ajuste_id"]
isOneToOne: false
      referencedRelation: "ajustes_precios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ajuste_precio_items_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "productos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ajuste_precio_items_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_catalogo"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "ajuste_precio_items_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_fallados"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "ajuste_precio_items_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_promos_tienda"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "ajuste_precio_items_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "ajuste_precio_items_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_venta_items"
      referencedColumns: ["producto_id"]
    }
                  ]
                },"ajustes_precios": {
                  Row: {
                    "cantidad": number,"descripcion": string | null,"deshecho_en": string | null,"deshecho_por": string | null,"fecha": string,"id": number,"modo": string,"proveedor_id": number | null,"que": string,"redondeo": string,"usuario_id": string | null,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad"?: number,"descripcion"?: string | null,"deshecho_en"?: string | null,"deshecho_por"?: string | null,"fecha"?: string,"id"?: never,"modo": string,"proveedor_id"?: number | null,"que": string,"redondeo"?: string,"usuario_id"?: string | null,"valor": number
                  }
                  Update: {
                    "cantidad"?: number,"descripcion"?: string | null,"deshecho_en"?: string | null,"deshecho_por"?: string | null,"fecha"?: string,"id"?: never,"modo"?: string,"proveedor_id"?: number | null,"que"?: string,"redondeo"?: string,"usuario_id"?: string | null,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ajustes_precios_deshecho_por_fkey"
      columns: ["deshecho_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ajustes_precios_proveedor_id_fkey"
      columns: ["proveedor_id"]
isOneToOne: false
      referencedRelation: "proveedores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ajustes_precios_proveedor_id_fkey"
      columns: ["proveedor_id"]
isOneToOne: false
      referencedRelation: "v_credito_proveedores"
      referencedColumns: ["proveedor_id"]
    },{
      foreignKeyName: "ajustes_precios_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"arrepentimientos": {
                  Row: {
                    "codigo": string,"comprobante": string | null,"creado_en": string,"detalle": string | null,"email": string,"estado": string,"id": number,"nombre": string,"pedido_id": number | null,"resolucion": string | null,"resuelto_en": string | null,"resuelto_por": string | null,"telefono": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "codigo"?: string,"comprobante"?: string | null,"creado_en"?: string,"detalle"?: string | null,"email": string,"estado"?: string,"id"?: never,"nombre": string,"pedido_id"?: number | null,"resolucion"?: string | null,"resuelto_en"?: string | null,"resuelto_por"?: string | null,"telefono"?: string | null
                  }
                  Update: {
                    "codigo"?: string,"comprobante"?: string | null,"creado_en"?: string,"detalle"?: string | null,"email"?: string,"estado"?: string,"id"?: never,"nombre"?: string,"pedido_id"?: number | null,"resolucion"?: string | null,"resuelto_en"?: string | null,"resuelto_por"?: string | null,"telefono"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "arrepentimientos_pedido_id_fkey"
      columns: ["pedido_id"]
isOneToOne: false
      referencedRelation: "pedidos"
      referencedColumns: ["id"]
    }
                  ]
                },"categorias": {
                  Row: {
                    "codigo": string,"id": number,"linea": string,"nombre": string
                  }
                  ComputedFields: never
                  Insert: {
                    "codigo": string,"id"?: never,"linea"?: string,"nombre": string
                  }
                  Update: {
                    "codigo"?: string,"id"?: never,"linea"?: string,"nombre"?: string
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
                    "comprobante": string | null,"comprobante_proveedor": string | null,"credito_aplicado": number,"deposito_id": number,"fecha": string,"fecha_comprobante": string | null,"id": number,"notas": string | null,"numero": number | null,"proveedor_id": number | null,"punto_venta": number,"total": number,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "comprobante"?: never,"comprobante_proveedor"?: string | null,"credito_aplicado"?: number,"deposito_id": number,"fecha"?: string,"fecha_comprobante"?: string | null,"id"?: never,"notas"?: string | null,"numero"?: number | null,"proveedor_id"?: number | null,"punto_venta"?: number,"total": number,"usuario_id"?: string | null
                  }
                  Update: {
                    "comprobante"?: never,"comprobante_proveedor"?: string | null,"credito_aplicado"?: number,"deposito_id"?: number,"fecha"?: string,"fecha_comprobante"?: string | null,"id"?: never,"notas"?: string | null,"numero"?: number | null,"proveedor_id"?: number | null,"punto_venta"?: number,"total"?: number,"usuario_id"?: string | null
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
    },{
      foreignKeyName: "compras_proveedor_id_fkey"
      columns: ["proveedor_id"]
isOneToOne: false
      referencedRelation: "v_credito_proveedores"
      referencedColumns: ["proveedor_id"]
    },{
      foreignKeyName: "compras_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"configuracion_cuentas": {
                  Row: {
                    "actualizado_en": string,"actualizado_por": string | null,"clave_exige_mayuscula": boolean,"clave_exige_numero": boolean,"clave_min": number,"confirmar_email": boolean,"direccion": string,"documento": string,"dominios_bloqueados": (string)[],"dominios_permitidos": (string)[],"exigir_terminos": boolean,"nacimiento": string,"ofrecer_novedades": boolean,"registro": string,"telefono": string,"terminos_url": string | null,"texto_confirmado": string | null,"texto_registro": string | null,"unica": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"actualizado_por"?: string | null,"clave_exige_mayuscula"?: boolean,"clave_exige_numero"?: boolean,"clave_min"?: number,"confirmar_email"?: boolean,"direccion"?: string,"documento"?: string,"dominios_bloqueados"?: (string)[],"dominios_permitidos"?: (string)[],"exigir_terminos"?: boolean,"nacimiento"?: string,"ofrecer_novedades"?: boolean,"registro"?: string,"telefono"?: string,"terminos_url"?: string | null,"texto_confirmado"?: string | null,"texto_registro"?: string | null,"unica"?: boolean
                  }
                  Update: {
                    "actualizado_en"?: string,"actualizado_por"?: string | null,"clave_exige_mayuscula"?: boolean,"clave_exige_numero"?: boolean,"clave_min"?: number,"confirmar_email"?: boolean,"direccion"?: string,"documento"?: string,"dominios_bloqueados"?: (string)[],"dominios_permitidos"?: (string)[],"exigir_terminos"?: boolean,"nacimiento"?: string,"ofrecer_novedades"?: boolean,"registro"?: string,"telefono"?: string,"terminos_url"?: string | null,"texto_confirmado"?: string | null,"texto_registro"?: string | null,"unica"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"configuracion_gastos": {
                  Row: {
                    "dolar": number,"dolar_actualizado": string,"id": boolean,"wa_precio_authentication": number,"wa_precio_marketing": number,"wa_precio_utility": number
                  }
                  ComputedFields: never
                  Insert: {
                    "dolar"?: number,"dolar_actualizado"?: string,"id"?: boolean,"wa_precio_authentication"?: number,"wa_precio_marketing"?: number,"wa_precio_utility"?: number
                  }
                  Update: {
                    "dolar"?: number,"dolar_actualizado"?: string,"id"?: boolean,"wa_precio_authentication"?: number,"wa_precio_marketing"?: number,"wa_precio_utility"?: number
                  }
                  Relationships: [
                    
                  ]
                },"configuracion_tienda": {
                  Row: {
                    "aviso_enlace": string | null,"avisos": (string)[],"dias_cambio": number,"dias_retiro": number,"dias_saldo": number,"direccion_retiro": string | null,"envio_requiere_pago": boolean,"horario": string | null,"ia_modelo": string,"ia_plan": string,"icono_ruta": string | null,"icono_url": string | null,"id": number,"instagram": string | null,"mp_cuotas_max": number,"mp_modo": string,"nombre": string,"unica": boolean,"wa_bot_activo": boolean,"wa_idioma_plantilla": string,"wa_notificaciones_pedidos": boolean,"wa_plantilla_estado": string | null,"whatsapp": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aviso_enlace"?: string | null,"avisos"?: (string)[],"dias_cambio"?: number,"dias_retiro"?: number,"dias_saldo"?: number,"direccion_retiro"?: string | null,"envio_requiere_pago"?: boolean,"horario"?: string | null,"ia_modelo"?: string,"ia_plan"?: string,"icono_ruta"?: string | null,"icono_url"?: string | null,"id"?: never,"instagram"?: string | null,"mp_cuotas_max"?: number,"mp_modo"?: string,"nombre"?: string,"unica"?: boolean,"wa_bot_activo"?: boolean,"wa_idioma_plantilla"?: string,"wa_notificaciones_pedidos"?: boolean,"wa_plantilla_estado"?: string | null,"whatsapp"?: string | null
                  }
                  Update: {
                    "aviso_enlace"?: string | null,"avisos"?: (string)[],"dias_cambio"?: number,"dias_retiro"?: number,"dias_saldo"?: number,"direccion_retiro"?: string | null,"envio_requiere_pago"?: boolean,"horario"?: string | null,"ia_modelo"?: string,"ia_plan"?: string,"icono_ruta"?: string | null,"icono_url"?: string | null,"id"?: never,"instagram"?: string | null,"mp_cuotas_max"?: number,"mp_modo"?: string,"nombre"?: string,"unica"?: boolean,"wa_bot_activo"?: boolean,"wa_idioma_plantilla"?: string,"wa_notificaciones_pedidos"?: boolean,"wa_plantilla_estado"?: string | null,"whatsapp"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "configuracion_tienda_ia_modelo_fkey"
      columns: ["ia_modelo"]
isOneToOne: false
      referencedRelation: "ia_modelos"
      referencedColumns: ["id"]
    }
                  ]
                },"creditos_proveedor": {
                  Row: {
                    "compra_id": number | null,"fallado_id": number | null,"fecha": string,"id": number,"monto": number,"nota": string | null,"proveedor_id": number,"tipo": string,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "compra_id"?: number | null,"fallado_id"?: number | null,"fecha"?: string,"id"?: never,"monto": number,"nota"?: string | null,"proveedor_id": number,"tipo": string,"usuario_id"?: string | null
                  }
                  Update: {
                    "compra_id"?: number | null,"fallado_id"?: number | null,"fecha"?: string,"id"?: never,"monto"?: number,"nota"?: string | null,"proveedor_id"?: number,"tipo"?: string,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "creditos_proveedor_compra_id_fkey"
      columns: ["compra_id"]
isOneToOne: false
      referencedRelation: "compras"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creditos_proveedor_fallado_id_fkey"
      columns: ["fallado_id"]
isOneToOne: true
      referencedRelation: "fallados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creditos_proveedor_fallado_id_fkey"
      columns: ["fallado_id"]
isOneToOne: true
      referencedRelation: "v_fallados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creditos_proveedor_proveedor_id_fkey"
      columns: ["proveedor_id"]
isOneToOne: false
      referencedRelation: "proveedores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creditos_proveedor_proveedor_id_fkey"
      columns: ["proveedor_id"]
isOneToOne: false
      referencedRelation: "v_credito_proveedores"
      referencedColumns: ["proveedor_id"]
    },{
      foreignKeyName: "creditos_proveedor_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"datos_legales": {
                  Row: {
                    "actualizado_en": string,"actualizado_por": string | null,"condicion_iva": string | null,"cuit": string | null,"defensa_consumidor_url": string,"domicilio_legal": string | null,"email_contacto": string | null,"jurisdiccion": string,"razon_social": string | null,"telefono_contacto": string | null,"unica": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"actualizado_por"?: string | null,"condicion_iva"?: string | null,"cuit"?: string | null,"defensa_consumidor_url"?: string,"domicilio_legal"?: string | null,"email_contacto"?: string | null,"jurisdiccion"?: string,"razon_social"?: string | null,"telefono_contacto"?: string | null,"unica"?: boolean
                  }
                  Update: {
                    "actualizado_en"?: string,"actualizado_por"?: string | null,"condicion_iva"?: string | null,"cuit"?: string | null,"defensa_consumidor_url"?: string,"domicilio_legal"?: string | null,"email_contacto"?: string | null,"jurisdiccion"?: string,"razon_social"?: string | null,"telefono_contacto"?: string | null,"unica"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"depositos": {
                  Row: {
                    "activo": boolean,"id": number,"nombre": string,"vendible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"id"?: never,"nombre": string,"vendible"?: boolean
                  }
                  Update: {
                    "activo"?: boolean,"id"?: never,"nombre"?: string,"vendible"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"devolucion_items": {
                  Row: {
                    "cantidad": number,"devolucion_id": number,"estado": string,"id": number,"monto": number,"venta_item_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad": number,"devolucion_id": number,"estado"?: string,"id"?: never,"monto": number,"venta_item_id": number
                  }
                  Update: {
                    "cantidad"?: number,"devolucion_id"?: number,"estado"?: string,"id"?: never,"monto"?: number,"venta_item_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "devolucion_items_devolucion_id_fkey"
      columns: ["devolucion_id"]
isOneToOne: false
      referencedRelation: "devoluciones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "devolucion_items_venta_item_id_fkey"
      columns: ["venta_item_id"]
isOneToOne: false
      referencedRelation: "v_venta_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "devolucion_items_venta_item_id_fkey"
      columns: ["venta_item_id"]
isOneToOne: false
      referencedRelation: "venta_items"
      referencedColumns: ["id"]
    }
                  ]
                },"devoluciones": {
                  Row: {
                    "bruto": number,"cliente_id": number,"comentario": string | null,"comprobante": string | null,"fecha": string,"fuera_de_plazo": boolean,"id": number,"motivo": string,"numero": number | null,"punto_venta": number,"total": number,"usuario_id": string | null,"venta_cambio_id": number | null,"venta_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "bruto": number,"cliente_id": number,"comentario"?: string | null,"comprobante"?: never,"fecha"?: string,"fuera_de_plazo"?: boolean,"id"?: never,"motivo": string,"numero"?: number | null,"punto_venta"?: number,"total": number,"usuario_id"?: string | null,"venta_cambio_id"?: number | null,"venta_id": number
                  }
                  Update: {
                    "bruto"?: number,"cliente_id"?: number,"comentario"?: string | null,"comprobante"?: never,"fecha"?: string,"fuera_de_plazo"?: boolean,"id"?: never,"motivo"?: string,"numero"?: number | null,"punto_venta"?: number,"total"?: number,"usuario_id"?: string | null,"venta_cambio_id"?: number | null,"venta_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "devoluciones_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "devoluciones_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "v_mi_ficha"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "devoluciones_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "devoluciones_venta_cambio_id_fkey"
      columns: ["venta_cambio_id"]
isOneToOne: true
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "devoluciones_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                },"documentos_legales": {
                  Row: {
                    "contenido": string,"id": number,"publicado_en": string,"publicado_por": string | null,"tipo": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "contenido": string,"id"?: never,"publicado_en"?: string,"publicado_por"?: string | null,"tipo": string,"version": number
                  }
                  Update: {
                    "contenido"?: string,"id"?: never,"publicado_en"?: string,"publicado_por"?: string | null,"tipo"?: string,"version"?: number
                  }
                  Relationships: [
                    
                  ]
                },"dominios": {
                  Row: {
                    "configurado": boolean,"creado_en": string,"error": string | null,"id": number,"nombre": string,"principal": boolean,"registros": NonNullable<Json>,"revisado_en": string | null,"verificado": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "configurado"?: boolean,"creado_en"?: string,"error"?: string | null,"id"?: never,"nombre": string,"principal"?: boolean,"registros"?: NonNullable<Json>,"revisado_en"?: string | null,"verificado"?: boolean
                  }
                  Update: {
                    "configurado"?: boolean,"creado_en"?: string,"error"?: string | null,"id"?: never,"nombre"?: string,"principal"?: boolean,"registros"?: NonNullable<Json>,"revisado_en"?: string | null,"verificado"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"envios": {
                  Row: {
                    "actualizado_en": string,"actualizado_por": string | null,"costo_real": number | null,"id": number,"notas": string | null,"pedido_id": number,"proveedor": string | null,"seguimiento": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"actualizado_por"?: string | null,"costo_real"?: number | null,"id"?: never,"notas"?: string | null,"pedido_id": number,"proveedor"?: string | null,"seguimiento"?: string | null
                  }
                  Update: {
                    "actualizado_en"?: string,"actualizado_por"?: string | null,"costo_real"?: number | null,"id"?: never,"notas"?: string | null,"pedido_id"?: number,"proveedor"?: string | null,"seguimiento"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "envios_actualizado_por_fkey"
      columns: ["actualizado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "envios_pedido_id_fkey"
      columns: ["pedido_id"]
isOneToOne: true
      referencedRelation: "pedidos"
      referencedColumns: ["id"]
    }
                  ]
                },"fallados": {
                  Row: {
                    "cantidad": number,"costo_unitario": number,"deposito_origen_id": number,"estado": string,"fecha": string,"id": number,"motivo": string,"nota": string | null,"origen": string,"proveedor_id": number | null,"resuelto_en": string | null,"resuelto_por": string | null,"usuario_id": string | null,"variante_id": number,"venta_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad": number,"costo_unitario"?: number,"deposito_origen_id": number,"estado"?: string,"fecha"?: string,"id"?: never,"motivo": string,"nota"?: string | null,"origen": string,"proveedor_id"?: number | null,"resuelto_en"?: string | null,"resuelto_por"?: string | null,"usuario_id"?: string | null,"variante_id": number,"venta_id"?: number | null
                  }
                  Update: {
                    "cantidad"?: number,"costo_unitario"?: number,"deposito_origen_id"?: number,"estado"?: string,"fecha"?: string,"id"?: never,"motivo"?: string,"nota"?: string | null,"origen"?: string,"proveedor_id"?: number | null,"resuelto_en"?: string | null,"resuelto_por"?: string | null,"usuario_id"?: string | null,"variante_id"?: number,"venta_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fallados_deposito_origen_id_fkey"
      columns: ["deposito_origen_id"]
isOneToOne: false
      referencedRelation: "depositos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fallados_deposito_origen_id_fkey"
      columns: ["deposito_origen_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["deposito_id"]
    },{
      foreignKeyName: "fallados_proveedor_id_fkey"
      columns: ["proveedor_id"]
isOneToOne: false
      referencedRelation: "proveedores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fallados_proveedor_id_fkey"
      columns: ["proveedor_id"]
isOneToOne: false
      referencedRelation: "v_credito_proveedores"
      referencedColumns: ["proveedor_id"]
    },{
      foreignKeyName: "fallados_resuelto_por_fkey"
      columns: ["resuelto_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fallados_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fallados_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_catalogo"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "fallados_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "fallados_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "variantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fallados_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                },"gasto_categorias": {
                  Row: {
                    "activo": boolean,"id": number,"nombre": string,"orden": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"id"?: never,"nombre": string,"orden"?: number
                  }
                  Update: {
                    "activo"?: boolean,"id"?: never,"nombre"?: string,"orden"?: number
                  }
                  Relationships: [
                    
                  ]
                },"gastos": {
                  Row: {
                    "categoria_id": number,"cotizacion": number,"creado_en": string,"descripcion": string,"fecha": string,"gasto_fijo_id": number | null,"id": number,"importe": number,"moneda": string,"monto": number | null,"nota": string | null,"origen": string,"periodo": string | null,"proveedor_id": number | null,"referencia": string | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "categoria_id": number,"cotizacion"?: number,"creado_en"?: string,"descripcion": string,"fecha"?: string,"gasto_fijo_id"?: number | null,"id"?: never,"importe": number,"moneda"?: string,"monto"?: never,"nota"?: string | null,"origen"?: string,"periodo"?: string | null,"proveedor_id"?: number | null,"referencia"?: string | null,"usuario_id"?: string | null
                  }
                  Update: {
                    "categoria_id"?: number,"cotizacion"?: number,"creado_en"?: string,"descripcion"?: string,"fecha"?: string,"gasto_fijo_id"?: number | null,"id"?: never,"importe"?: number,"moneda"?: string,"monto"?: never,"nota"?: string | null,"origen"?: string,"periodo"?: string | null,"proveedor_id"?: number | null,"referencia"?: string | null,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "gastos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "gasto_categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gastos_gasto_fijo_id_fkey"
      columns: ["gasto_fijo_id"]
isOneToOne: false
      referencedRelation: "gastos_fijos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gastos_proveedor_id_fkey"
      columns: ["proveedor_id"]
isOneToOne: false
      referencedRelation: "proveedores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gastos_proveedor_id_fkey"
      columns: ["proveedor_id"]
isOneToOne: false
      referencedRelation: "v_credito_proveedores"
      referencedColumns: ["proveedor_id"]
    },{
      foreignKeyName: "gastos_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"gastos_fijos": {
                  Row: {
                    "activo": boolean,"categoria_id": number,"descripcion": string,"desde": string,"dia": number,"id": number,"importe": number,"moneda": string,"proveedor_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"categoria_id": number,"descripcion": string,"desde"?: string,"dia"?: number,"id"?: never,"importe": number,"moneda"?: string,"proveedor_id"?: number | null
                  }
                  Update: {
                    "activo"?: boolean,"categoria_id"?: number,"descripcion"?: string,"desde"?: string,"dia"?: number,"id"?: never,"importe"?: number,"moneda"?: string,"proveedor_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "gastos_fijos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "gasto_categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gastos_fijos_proveedor_id_fkey"
      columns: ["proveedor_id"]
isOneToOne: false
      referencedRelation: "proveedores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gastos_fijos_proveedor_id_fkey"
      columns: ["proveedor_id"]
isOneToOne: false
      referencedRelation: "v_credito_proveedores"
      referencedColumns: ["proveedor_id"]
    }
                  ]
                },"ia_modelos": {
                  Row: {
                    "disponible": boolean,"id": string,"limite_diario_gratis": number | null,"nombre": string,"nota": string | null,"nuevo": boolean,"orden": number,"precio_entrada": number | null,"precio_salida": number | null,"tiene_gratis": boolean,"verificado": string
                  }
                  ComputedFields: never
                  Insert: {
                    "disponible"?: boolean,"id": string,"limite_diario_gratis"?: number | null,"nombre": string,"nota"?: string | null,"nuevo"?: boolean,"orden"?: number,"precio_entrada"?: number | null,"precio_salida"?: number | null,"tiene_gratis"?: boolean,"verificado"?: string
                  }
                  Update: {
                    "disponible"?: boolean,"id"?: string,"limite_diario_gratis"?: number | null,"nombre"?: string,"nota"?: string | null,"nuevo"?: boolean,"orden"?: number,"precio_entrada"?: number | null,"precio_salida"?: number | null,"tiene_gratis"?: boolean,"verificado"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ia_usos": {
                  Row: {
                    "consultas": number,"costo_estimado_usd": number,"costo_usd": number,"fecha": string,"id": number,"modelo": string,"plan": string,"tokens_entrada": number,"tokens_salida": number
                  }
                  ComputedFields: never
                  Insert: {
                    "consultas"?: number,"costo_estimado_usd"?: number,"costo_usd"?: number,"fecha"?: string,"id"?: never,"modelo": string,"plan"?: string,"tokens_entrada": number,"tokens_salida": number
                  }
                  Update: {
                    "consultas"?: number,"costo_estimado_usd"?: number,"costo_usd"?: number,"fecha"?: string,"id"?: never,"modelo"?: string,"plan"?: string,"tokens_entrada"?: number,"tokens_salida"?: number
                  }
                  Relationships: [
                    
                  ]
                },"inicio_secciones": {
                  Row: {
                    "actualizado_en": string,"bajada": string | null,"boton_enlace": string | null,"boton_texto": string | null,"contenido": NonNullable<Json>,"id": number,"imagen_ruta": string | null,"imagen_url": string | null,"orden": number,"tipo": string,"titulo": string | null,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"bajada"?: string | null,"boton_enlace"?: string | null,"boton_texto"?: string | null,"contenido"?: NonNullable<Json>,"id"?: never,"imagen_ruta"?: string | null,"imagen_url"?: string | null,"orden"?: number,"tipo": string,"titulo"?: string | null,"visible"?: boolean
                  }
                  Update: {
                    "actualizado_en"?: string,"bajada"?: string | null,"boton_enlace"?: string | null,"boton_texto"?: string | null,"contenido"?: NonNullable<Json>,"id"?: never,"imagen_ruta"?: string | null,"imagen_url"?: string | null,"orden"?: number,"tipo"?: string,"titulo"?: string | null,"visible"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"integraciones": {
                  Row: {
                    "actualizado_en": string,"actualizado_por": string | null,"andreani_clave": string | null,"andreani_cliente": string | null,"andreani_contrato": string | null,"andreani_prueba": Json | null,"andreani_usuario": string | null,"correo_aplicado_en": string | null,"correo_aplicado_error": string | null,"gemini_api_key": string | null,"ia_modelos_error": string | null,"ia_modelos_req": number | null,"ia_modelos_revisado": string | null,"ia_ultima_prueba": number | null,"mp_access_token": string | null,"mp_cuenta": Json | null,"mp_webhook_secret": string | null,"sitio_original": string | null,"sitio_url": string | null,"smtp_clave": string | null,"smtp_email": string | null,"smtp_host": string | null,"smtp_nombre": string | null,"smtp_puerto": number | null,"smtp_usuario": string | null,"supabase_ref": string | null,"supabase_token": string | null,"uber_client_id": string | null,"uber_client_secret": string | null,"uber_customer_id": string | null,"uber_prueba": Json | null,"unica": boolean,"vercel_equipo": string | null,"vercel_proyecto": string | null,"vercel_token": string | null,"wa_access_token": string | null,"wa_app_secret": string | null,"wa_phone_number_id": string | null,"wa_verify_token": string,"wa_waba_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"actualizado_por"?: string | null,"andreani_clave"?: string | null,"andreani_cliente"?: string | null,"andreani_contrato"?: string | null,"andreani_prueba"?: Json | null,"andreani_usuario"?: string | null,"correo_aplicado_en"?: string | null,"correo_aplicado_error"?: string | null,"gemini_api_key"?: string | null,"ia_modelos_error"?: string | null,"ia_modelos_req"?: number | null,"ia_modelos_revisado"?: string | null,"ia_ultima_prueba"?: number | null,"mp_access_token"?: string | null,"mp_cuenta"?: Json | null,"mp_webhook_secret"?: string | null,"sitio_original"?: string | null,"sitio_url"?: string | null,"smtp_clave"?: string | null,"smtp_email"?: string | null,"smtp_host"?: string | null,"smtp_nombre"?: string | null,"smtp_puerto"?: number | null,"smtp_usuario"?: string | null,"supabase_ref"?: string | null,"supabase_token"?: string | null,"uber_client_id"?: string | null,"uber_client_secret"?: string | null,"uber_customer_id"?: string | null,"uber_prueba"?: Json | null,"unica"?: boolean,"vercel_equipo"?: string | null,"vercel_proyecto"?: string | null,"vercel_token"?: string | null,"wa_access_token"?: string | null,"wa_app_secret"?: string | null,"wa_phone_number_id"?: string | null,"wa_verify_token"?: string,"wa_waba_id"?: string | null
                  }
                  Update: {
                    "actualizado_en"?: string,"actualizado_por"?: string | null,"andreani_clave"?: string | null,"andreani_cliente"?: string | null,"andreani_contrato"?: string | null,"andreani_prueba"?: Json | null,"andreani_usuario"?: string | null,"correo_aplicado_en"?: string | null,"correo_aplicado_error"?: string | null,"gemini_api_key"?: string | null,"ia_modelos_error"?: string | null,"ia_modelos_req"?: number | null,"ia_modelos_revisado"?: string | null,"ia_ultima_prueba"?: number | null,"mp_access_token"?: string | null,"mp_cuenta"?: Json | null,"mp_webhook_secret"?: string | null,"sitio_original"?: string | null,"sitio_url"?: string | null,"smtp_clave"?: string | null,"smtp_email"?: string | null,"smtp_host"?: string | null,"smtp_nombre"?: string | null,"smtp_puerto"?: number | null,"smtp_usuario"?: string | null,"supabase_ref"?: string | null,"supabase_token"?: string | null,"uber_client_id"?: string | null,"uber_client_secret"?: string | null,"uber_customer_id"?: string | null,"uber_prueba"?: Json | null,"unica"?: boolean,"vercel_equipo"?: string | null,"vercel_proyecto"?: string | null,"vercel_token"?: string | null,"wa_access_token"?: string | null,"wa_app_secret"?: string | null,"wa_phone_number_id"?: string | null,"wa_verify_token"?: string,"wa_waba_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "integraciones_actualizado_por_fkey"
      columns: ["actualizado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
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
    },{
      foreignKeyName: "interacciones_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"invitaciones_cuenta": {
                  Row: {
                    "creada_por": string | null,"creado_en": string,"email": string,"id": number,"rol_id": number | null,"token": string,"usada_en": string | null,"usada_por": string | null,"vence_en": string
                  }
                  ComputedFields: never
                  Insert: {
                    "creada_por"?: string | null,"creado_en"?: string,"email": string,"id"?: never,"rol_id"?: number | null,"token"?: string,"usada_en"?: string | null,"usada_por"?: string | null,"vence_en"?: string
                  }
                  Update: {
                    "creada_por"?: string | null,"creado_en"?: string,"email"?: string,"id"?: never,"rol_id"?: number | null,"token"?: string,"usada_en"?: string | null,"usada_por"?: string | null,"vence_en"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitaciones_cuenta_rol_id_fkey"
      columns: ["rol_id"]
isOneToOne: false
      referencedRelation: "roles"
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
                    "activo": boolean,"ajuste_pct": number,"codigo": string,"cuotas": number,"en_mostrador": boolean,"en_tienda": boolean,"es_saldo": boolean,"id": number,"nombre": string,"orden": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"ajuste_pct"?: number,"codigo": string,"cuotas"?: number,"en_mostrador"?: boolean,"en_tienda"?: boolean,"es_saldo"?: boolean,"id"?: never,"nombre": string,"orden"?: number,"tipo": string
                  }
                  Update: {
                    "activo"?: boolean,"ajuste_pct"?: number,"codigo"?: string,"cuotas"?: number,"en_mostrador"?: boolean,"en_tienda"?: boolean,"es_saldo"?: boolean,"id"?: never,"nombre"?: string,"orden"?: number,"tipo"?: string
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
      foreignKeyName: "movimientos_stock_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
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
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                },"pagos_online": {
                  Row: {
                    "actualizado_en": string,"comision": number,"comision_registrada": boolean,"creado_en": string,"cuotas": number | null,"detalle_estado": string | null,"estado": string,"id": number,"medio": string | null,"monto": number,"neto": number | null,"pago_externo": string,"pedido_id": number,"proveedor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"comision"?: number,"comision_registrada"?: boolean,"creado_en"?: string,"cuotas"?: number | null,"detalle_estado"?: string | null,"estado": string,"id"?: never,"medio"?: string | null,"monto": number,"neto"?: number | null,"pago_externo": string,"pedido_id": number,"proveedor"?: string
                  }
                  Update: {
                    "actualizado_en"?: string,"comision"?: number,"comision_registrada"?: boolean,"creado_en"?: string,"cuotas"?: number | null,"detalle_estado"?: string | null,"estado"?: string,"id"?: never,"medio"?: string | null,"monto"?: number,"neto"?: number | null,"pago_externo"?: string,"pedido_id"?: number,"proveedor"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pagos_online_pedido_id_fkey"
      columns: ["pedido_id"]
isOneToOne: false
      referencedRelation: "pedidos"
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
    },{
      foreignKeyName: "pedido_estados_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pedido_items": {
                  Row: {
                    "cantidad": number,"descuento_promo": number,"id": number,"pedido_id": number,"precio_unitario": number,"promocion_id": number | null,"variante_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad": number,"descuento_promo"?: number,"id"?: never,"pedido_id": number,"precio_unitario": number,"promocion_id"?: number | null,"variante_id": number
                  }
                  Update: {
                    "cantidad"?: number,"descuento_promo"?: number,"id"?: never,"pedido_id"?: number,"precio_unitario"?: number,"promocion_id"?: number | null,"variante_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pedido_items_pedido_id_fkey"
      columns: ["pedido_id"]
isOneToOne: false
      referencedRelation: "pedidos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedido_items_promocion_id_fkey"
      columns: ["promocion_id"]
isOneToOne: false
      referencedRelation: "promociones"
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
                },"pedido_pagos": {
                  Row: {
                    "fecha": string,"id": number,"monto": number,"pedido_id": number,"referencia": string | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "fecha"?: string,"id"?: never,"monto": number,"pedido_id": number,"referencia"?: string | null,"usuario_id"?: string | null
                  }
                  Update: {
                    "fecha"?: string,"id"?: never,"monto"?: number,"pedido_id"?: number,"referencia"?: string | null,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pedido_pagos_pedido_id_fkey"
      columns: ["pedido_id"]
isOneToOne: false
      referencedRelation: "pedidos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedido_pagos_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pedidos": {
                  Row: {
                    "ajuste_medio_pago": number,"ajuste_pct": number,"canal": string,"cancelado_por": string | null,"cliente_id": number,"comprobante": string | null,"costo_envio": number,"deposito_id": number,"descuento_promociones": number,"direccion_envio": string | null,"entrega": string,"estado": string,"fecha": string,"id": number,"medio_pago_id": number,"motivo_cancelacion": string | null,"notas": string | null,"numero": number | null,"pagado_online": boolean,"punto_venta": number,"subtotal": number,"total": number,"zona_envio_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ajuste_medio_pago"?: number,"ajuste_pct"?: number,"canal"?: string,"cancelado_por"?: string | null,"cliente_id": number,"comprobante"?: never,"costo_envio"?: number,"deposito_id": number,"descuento_promociones"?: number,"direccion_envio"?: string | null,"entrega"?: string,"estado"?: string,"fecha"?: string,"id"?: never,"medio_pago_id": number,"motivo_cancelacion"?: string | null,"notas"?: string | null,"numero"?: number | null,"pagado_online"?: boolean,"punto_venta"?: number,"subtotal"?: number,"total"?: number,"zona_envio_id"?: number | null
                  }
                  Update: {
                    "ajuste_medio_pago"?: number,"ajuste_pct"?: number,"canal"?: string,"cancelado_por"?: string | null,"cliente_id"?: number,"comprobante"?: never,"costo_envio"?: number,"deposito_id"?: number,"descuento_promociones"?: number,"direccion_envio"?: string | null,"entrega"?: string,"estado"?: string,"fecha"?: string,"id"?: never,"medio_pago_id"?: number,"motivo_cancelacion"?: string | null,"notas"?: string | null,"numero"?: number | null,"pagado_online"?: boolean,"punto_venta"?: number,"subtotal"?: number,"total"?: number,"zona_envio_id"?: number | null
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
    },{
      foreignKeyName: "pedidos_zona_envio_id_fkey"
      columns: ["zona_envio_id"]
isOneToOne: false
      referencedRelation: "zonas_envio"
      referencedColumns: ["id"]
    }
                  ]
                },"perfiles": {
                  Row: {
                    "id": string,"nombre": string | null,"rol": string,"rol_id": number | null,"terminos_aceptados_en": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"nombre"?: string | null,"rol"?: string,"rol_id"?: number | null,"terminos_aceptados_en"?: string | null
                  }
                  Update: {
                    "id"?: string,"nombre"?: string | null,"rol"?: string,"rol_id"?: number | null,"terminos_aceptados_en"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "perfiles_rol_id_fkey"
      columns: ["rol_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"permisos": {
                  Row: {
                    "codigo": string,"descripcion": string | null,"grupo": string,"id": number,"nombre": string,"orden": number
                  }
                  ComputedFields: never
                  Insert: {
                    "codigo": string,"descripcion"?: string | null,"grupo": string,"id"?: never,"nombre": string,"orden"?: number
                  }
                  Update: {
                    "codigo"?: string,"descripcion"?: string | null,"grupo"?: string,"id"?: never,"nombre"?: string,"orden"?: number
                  }
                  Relationships: [
                    
                  ]
                },"presupuesto_items": {
                  Row: {
                    "cantidad": number,"descuento_promo": number,"id": number,"precio_unitario": number,"presupuesto_id": number,"promocion_id": number | null,"variante_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad": number,"descuento_promo"?: number,"id"?: never,"precio_unitario": number,"presupuesto_id": number,"promocion_id"?: number | null,"variante_id": number
                  }
                  Update: {
                    "cantidad"?: number,"descuento_promo"?: number,"id"?: never,"precio_unitario"?: number,"presupuesto_id"?: number,"promocion_id"?: number | null,"variante_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "presupuesto_items_presupuesto_id_fkey"
      columns: ["presupuesto_id"]
isOneToOne: false
      referencedRelation: "presupuestos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "presupuesto_items_promocion_id_fkey"
      columns: ["promocion_id"]
isOneToOne: false
      referencedRelation: "promociones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "presupuesto_items_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_catalogo"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "presupuesto_items_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "presupuesto_items_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "variantes"
      referencedColumns: ["id"]
    }
                  ]
                },"presupuestos": {
                  Row: {
                    "ajuste_medio_pago": number,"ajuste_pct": number,"canal": string,"cliente_id": number | null,"comprobante": string | null,"descuento": number,"descuento_promociones": number,"estado": string,"fecha": string,"id": number,"medio_pago_id": number | null,"notas": string | null,"numero": number | null,"punto_venta": number,"subtotal": number,"total": number,"usuario_id": string | null,"valido_hasta": string,"venta_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ajuste_medio_pago"?: number,"ajuste_pct"?: number,"canal"?: string,"cliente_id"?: number | null,"comprobante"?: never,"descuento"?: number,"descuento_promociones"?: number,"estado"?: string,"fecha"?: string,"id"?: never,"medio_pago_id"?: number | null,"notas"?: string | null,"numero"?: number | null,"punto_venta"?: number,"subtotal": number,"total": number,"usuario_id"?: string | null,"valido_hasta": string,"venta_id"?: number | null
                  }
                  Update: {
                    "ajuste_medio_pago"?: number,"ajuste_pct"?: number,"canal"?: string,"cliente_id"?: number | null,"comprobante"?: never,"descuento"?: number,"descuento_promociones"?: number,"estado"?: string,"fecha"?: string,"id"?: never,"medio_pago_id"?: number | null,"notas"?: string | null,"numero"?: number | null,"punto_venta"?: number,"subtotal"?: number,"total"?: number,"usuario_id"?: string | null,"valido_hasta"?: string,"venta_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "presupuestos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "presupuestos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "v_mi_ficha"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "presupuestos_medio_pago_id_fkey"
      columns: ["medio_pago_id"]
isOneToOne: false
      referencedRelation: "medios_pago"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "presupuestos_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "presupuestos_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: true
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
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
      referencedRelation: "v_fallados"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "producto_imagenes_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_promos_tienda"
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
      referencedRelation: "v_fallados"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "producto_proveedores_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_promos_tienda"
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
    },{
      foreignKeyName: "producto_proveedores_proveedor_id_fkey"
      columns: ["proveedor_id"]
isOneToOne: false
      referencedRelation: "v_credito_proveedores"
      referencedColumns: ["proveedor_id"]
    }
                  ]
                },"productos": {
                  Row: {
                    "activo": boolean,"categoria_id": number | null,"codigo": string,"creado_en": string,"descripcion": string | null,"escala": string,"genero": string | null,"id": number,"imagen_url": string | null,"marca_id": number | null,"material": string | null,"nombre": string,"precio_compra": number,"precio_venta": number,"publicado_web": boolean,"subcategoria_id": number | null,"temporada": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"categoria_id"?: number | null,"codigo": string,"creado_en"?: string,"descripcion"?: string | null,"escala"?: string,"genero"?: string | null,"id"?: never,"imagen_url"?: string | null,"marca_id"?: number | null,"material"?: string | null,"nombre": string,"precio_compra"?: number,"precio_venta"?: number,"publicado_web"?: boolean,"subcategoria_id"?: number | null,"temporada"?: string | null
                  }
                  Update: {
                    "activo"?: boolean,"categoria_id"?: number | null,"codigo"?: string,"creado_en"?: string,"descripcion"?: string | null,"escala"?: string,"genero"?: string | null,"id"?: never,"imagen_url"?: string | null,"marca_id"?: number | null,"material"?: string | null,"nombre"?: string,"precio_compra"?: number,"precio_venta"?: number,"publicado_web"?: boolean,"subcategoria_id"?: number | null,"temporada"?: string | null
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
                },"promocion_alcances": {
                  Row: {
                    "categoria_id": number | null,"excluir": boolean,"id": number,"marca_id": number | null,"producto_id": number | null,"promocion_id": number,"subcategoria_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "categoria_id"?: number | null,"excluir"?: boolean,"id"?: never,"marca_id"?: number | null,"producto_id"?: number | null,"promocion_id": number,"subcategoria_id"?: number | null
                  }
                  Update: {
                    "categoria_id"?: number | null,"excluir"?: boolean,"id"?: never,"marca_id"?: number | null,"producto_id"?: number | null,"promocion_id"?: number,"subcategoria_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "promocion_alcances_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promocion_alcances_marca_id_fkey"
      columns: ["marca_id"]
isOneToOne: false
      referencedRelation: "marcas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promocion_alcances_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "productos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promocion_alcances_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_catalogo"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "promocion_alcances_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_fallados"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "promocion_alcances_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_promos_tienda"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "promocion_alcances_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "promocion_alcances_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_venta_items"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "promocion_alcances_promocion_id_fkey"
      columns: ["promocion_id"]
isOneToOne: false
      referencedRelation: "promociones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promocion_alcances_subcategoria_id_fkey"
      columns: ["subcategoria_id"]
isOneToOne: false
      referencedRelation: "subcategorias"
      referencedColumns: ["id"]
    }
                  ]
                },"promociones": {
                  Row: {
                    "activa": boolean,"acumula_medio_pago": boolean,"creado_en": string,"descuento_pct": number | null,"desde": string | null,"en_mostrador": boolean,"en_tienda": boolean,"hasta": string | null,"id": number,"lleva": number | null,"mezcla": boolean,"nombre": string,"paga": number | null,"precio_fijo": number | null,"prioridad": number,"tipo": string,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activa"?: boolean,"acumula_medio_pago"?: boolean,"creado_en"?: string,"descuento_pct"?: number | null,"desde"?: string | null,"en_mostrador"?: boolean,"en_tienda"?: boolean,"hasta"?: string | null,"id"?: never,"lleva"?: number | null,"mezcla"?: boolean,"nombre": string,"paga"?: number | null,"precio_fijo"?: number | null,"prioridad"?: number,"tipo": string,"usuario_id"?: string | null
                  }
                  Update: {
                    "activa"?: boolean,"acumula_medio_pago"?: boolean,"creado_en"?: string,"descuento_pct"?: number | null,"desde"?: string | null,"en_mostrador"?: boolean,"en_tienda"?: boolean,"hasta"?: string | null,"id"?: never,"lleva"?: number | null,"mezcla"?: boolean,"nombre"?: string,"paga"?: number | null,"precio_fijo"?: number | null,"prioridad"?: number,"tipo"?: string,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "promociones_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
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
                },"roles": {
                  Row: {
                    "activo": boolean,"creado_en": string,"descripcion": string | null,"descuento_max_pct": number | null,"id": number,"nombre": string,"permisos": (string)[],"todos": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"creado_en"?: string,"descripcion"?: string | null,"descuento_max_pct"?: number | null,"id"?: never,"nombre": string,"permisos"?: (string)[],"todos"?: boolean
                  }
                  Update: {
                    "activo"?: boolean,"creado_en"?: string,"descripcion"?: string | null,"descuento_max_pct"?: number | null,"id"?: never,"nombre"?: string,"permisos"?: (string)[],"todos"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"saldos_cliente": {
                  Row: {
                    "cliente_id": number,"credito_id": number | null,"devolucion_id": number | null,"fecha": string,"id": number,"monto": number,"tipo": string,"usuario_id": string | null,"vence": string | null,"venta_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id": number,"credito_id"?: number | null,"devolucion_id"?: number | null,"fecha"?: string,"id"?: never,"monto": number,"tipo": string,"usuario_id"?: string | null,"vence"?: string | null,"venta_id"?: number | null
                  }
                  Update: {
                    "cliente_id"?: number,"credito_id"?: number | null,"devolucion_id"?: number | null,"fecha"?: string,"id"?: never,"monto"?: number,"tipo"?: string,"usuario_id"?: string | null,"vence"?: string | null,"venta_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "saldos_cliente_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saldos_cliente_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "v_mi_ficha"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saldos_cliente_credito_id_fkey"
      columns: ["credito_id"]
isOneToOne: false
      referencedRelation: "saldos_cliente"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saldos_cliente_credito_id_fkey"
      columns: ["credito_id"]
isOneToOne: false
      referencedRelation: "v_creditos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saldos_cliente_credito_id_fkey"
      columns: ["credito_id"]
isOneToOne: false
      referencedRelation: "v_mi_saldo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saldos_cliente_devolucion_id_fkey"
      columns: ["devolucion_id"]
isOneToOne: false
      referencedRelation: "devoluciones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saldos_cliente_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saldos_cliente_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
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
      referencedRelation: "v_fallados"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "variantes_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_promos_tienda"
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
                    "cantidad": number,"costo_unitario": number,"descuento_promo": number,"id": number,"precio_unitario": number,"promocion_id": number | null,"variante_id": number,"venta_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad": number,"costo_unitario"?: number,"descuento_promo"?: number,"id"?: never,"precio_unitario": number,"promocion_id"?: number | null,"variante_id": number,"venta_id": number
                  }
                  Update: {
                    "cantidad"?: number,"costo_unitario"?: number,"descuento_promo"?: number,"id"?: never,"precio_unitario"?: number,"promocion_id"?: number | null,"variante_id"?: number,"venta_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "venta_items_promocion_id_fkey"
      columns: ["promocion_id"]
isOneToOne: false
      referencedRelation: "promociones"
      referencedColumns: ["id"]
    },{
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
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                },"ventas": {
                  Row: {
                    "ajuste_medio_pago": number,"anulada_en": string | null,"anulada_por": string | null,"canal": string,"cliente_id": number | null,"comentario_anulacion": string | null,"comprobante": string | null,"deposito_id": number,"descuento": number,"descuento_promociones": number,"fecha": string,"id": number,"motivo_anulacion": string | null,"notas": string | null,"numero": number | null,"pedido_id": number | null,"punto_venta": number,"subtotal": number,"total": number,"usuario_id": string | null,"vendedor_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ajuste_medio_pago"?: number,"anulada_en"?: string | null,"anulada_por"?: string | null,"canal"?: string,"cliente_id"?: number | null,"comentario_anulacion"?: string | null,"comprobante"?: never,"deposito_id": number,"descuento"?: number,"descuento_promociones"?: number,"fecha"?: string,"id"?: never,"motivo_anulacion"?: string | null,"notas"?: string | null,"numero"?: number | null,"pedido_id"?: number | null,"punto_venta"?: number,"subtotal": number,"total": number,"usuario_id"?: string | null,"vendedor_id"?: string | null
                  }
                  Update: {
                    "ajuste_medio_pago"?: number,"anulada_en"?: string | null,"anulada_por"?: string | null,"canal"?: string,"cliente_id"?: number | null,"comentario_anulacion"?: string | null,"comprobante"?: never,"deposito_id"?: number,"descuento"?: number,"descuento_promociones"?: number,"fecha"?: string,"id"?: never,"motivo_anulacion"?: string | null,"notas"?: string | null,"numero"?: number | null,"pedido_id"?: number | null,"punto_venta"?: number,"subtotal"?: number,"total"?: number,"usuario_id"?: string | null,"vendedor_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ventas_anulada_por_fkey"
      columns: ["anulada_por"]
isOneToOne: false
      referencedRelation: "perfiles"
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
    },{
      foreignKeyName: "ventas_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"whatsapp_cobros": {
                  Row: {
                    "categoria": string,"fecha": string,"message_id": string,"precio_usd": number
                  }
                  ComputedFields: never
                  Insert: {
                    "categoria": string,"fecha"?: string,"message_id": string,"precio_usd": number
                  }
                  Update: {
                    "categoria"?: string,"fecha"?: string,"message_id"?: string,"precio_usd"?: number
                  }
                  Relationships: [
                    
                  ]
                },"whatsapp_envios": {
                  Row: {
                    "detalle": string | null,"fecha": string,"id": number,"pedido_id": number | null,"request_id": number | null,"telefono": string,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "detalle"?: string | null,"fecha"?: string,"id"?: never,"pedido_id"?: number | null,"request_id"?: number | null,"telefono": string,"tipo": string
                  }
                  Update: {
                    "detalle"?: string | null,"fecha"?: string,"id"?: never,"pedido_id"?: number | null,"request_id"?: number | null,"telefono"?: string,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "whatsapp_envios_pedido_id_fkey"
      columns: ["pedido_id"]
isOneToOne: false
      referencedRelation: "pedidos"
      referencedColumns: ["id"]
    }
                  ]
                },"zonas_envio": {
                  Row: {
                    "activo": boolean,"descripcion": string | null,"id": number,"nombre": string,"orden": number,"precio": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"descripcion"?: string | null,"id"?: never,"nombre": string,"orden"?: number,"precio"?: number | null
                  }
                  Update: {
                    "activo"?: boolean,"descripcion"?: string | null,"id"?: never,"nombre"?: string,"orden"?: number,"precio"?: number | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "v_catalogo": {
                  Row: {
                    "categoria": string | null,"color": string | null,"color_hex": string | null,"creado_en": string | null,"descripcion": string | null,"disponible": number | null,"escala": string | null,"genero": string | null,"imagen_url": string | null,"linea": string | null,"marca": string | null,"material": string | null,"nombre": string | null,"precio": number | null,"producto_id": number | null,"talle": string | null,"talle_orden": number | null,"temporada": string | null,"variante_id": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_credito_proveedores": {
                  Row: {
                    "a_favor": number | null,"nombre": string | null,"proveedor_id": number | null,"saldo": number | null,"ultimo": string | null,"usado": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_creditos": {
                  Row: {
                    "cliente_id": number | null,"devolucion": string | null,"devolucion_id": number | null,"fecha": string | null,"id": number | null,"monto": number | null,"restante": number | null,"vence": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "saldos_cliente_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saldos_cliente_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "v_mi_ficha"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saldos_cliente_devolucion_id_fkey"
      columns: ["devolucion_id"]
isOneToOne: false
      referencedRelation: "devoluciones"
      referencedColumns: ["id"]
    }
                  ]
                },"v_documentos_vigentes": {
                  Row: {
                    "contenido": string | null,"id": number | null,"publicado_en": string | null,"tipo": string | null,"version": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_envios_cobrados": {
                  Row: {
                    "cobrado": number | null,"dia": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_fallados": {
                  Row: {
                    "cantidad": number | null,"cargado_por": string | null,"codigo": string | null,"color": string | null,"color_hex": string | null,"costo_unitario": number | null,"estado": string | null,"fecha": string | null,"id": number | null,"imagen_url": string | null,"marca": string | null,"motivo": string | null,"nombre": string | null,"nota": string | null,"origen": string | null,"producto_id": number | null,"proveedor": string | null,"proveedor_id": number | null,"proveedor_principal": string | null,"proveedor_principal_id": number | null,"resuelto_en": string | null,"resuelto_por": string | null,"sku": string | null,"talle": string | null,"talle_orden": number | null,"valor_costo": number | null,"variante_id": number | null,"venta_comprobante": string | null,"venta_id": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "fallados_proveedor_id_fkey"
      columns: ["proveedor_id"]
isOneToOne: false
      referencedRelation: "proveedores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fallados_proveedor_id_fkey"
      columns: ["proveedor_id"]
isOneToOne: false
      referencedRelation: "v_credito_proveedores"
      referencedColumns: ["proveedor_id"]
    },{
      foreignKeyName: "fallados_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_catalogo"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "fallados_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "v_stock"
      referencedColumns: ["variante_id"]
    },{
      foreignKeyName: "fallados_variante_id_fkey"
      columns: ["variante_id"]
isOneToOne: false
      referencedRelation: "variantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fallados_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "producto_proveedores_proveedor_id_fkey"
      columns: ["proveedor_principal_id"]
isOneToOne: false
      referencedRelation: "proveedores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "producto_proveedores_proveedor_id_fkey"
      columns: ["proveedor_principal_id"]
isOneToOne: false
      referencedRelation: "v_credito_proveedores"
      referencedColumns: ["proveedor_id"]
    }
                  ]
                },"v_hechos_ventas": {
                  Row: {
                    "anio": number | null,"articulo": string | null,"canal": string | null,"cantidad": number | null,"cliente": string | null,"cliente_codigo": number | null,"cliente_origen": string | null,"color": string | null,"comprobante": string | null,"costo": number | null,"costo_unitario": number | null,"deposito": string | null,"descuento_promo": number | null,"devolucion_id": number | null,"dia": string | null,"dia_semana": number | null,"es_devolucion": boolean | null,"escala": string | null,"fecha": string | null,"genero": string | null,"id": number | null,"importe": number | null,"importe_neto": number | null,"linea": string | null,"marca": string | null,"margen": number | null,"margen_neto": number | null,"material": string | null,"mes": number | null,"modelo": string | null,"precio_unitario": number | null,"promocion": string | null,"promocion_id": number | null,"rubro": string | null,"rubro_codigo": string | null,"sku": string | null,"subrubro": string | null,"talle": string | null,"talle_orden": number | null,"temporada": string | null,"vendedor": string | null,"vendedor_id": string | null,"venta_id": number | null,"vino_de_pedido": boolean | null
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
      referencedRelation: "v_fallados"
      referencedColumns: ["producto_id"]
    },{
      foreignKeyName: "producto_imagenes_producto_id_fkey"
      columns: ["producto_id"]
isOneToOne: false
      referencedRelation: "v_promos_tienda"
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
                },"v_mi_saldo": {
                  Row: {
                    "devolucion": string | null,"fecha": string | null,"id": number | null,"restante": number | null,"vence": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_mis_pedido_items": {
                  Row: {
                    "cantidad": number | null,"color": string | null,"descuento_promo": number | null,"id": number | null,"modelo": string | null,"pedido_id": number | null,"precio_unitario": number | null,"promocion": string | null,"talle": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "pedido_items_pedido_id_fkey"
      columns: ["pedido_id"]
isOneToOne: false
      referencedRelation: "pedidos"
      referencedColumns: ["id"]
    }
                  ]
                },"v_perdidas_fallados": {
                  Row: {
                    "cantidad": number | null,"costo": number | null,"dia": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "cantidad"?: number | null,"costo"?: never,"dia"?: never
                         }
                        Update: {
                           "cantidad"?: number | null,"costo"?: never,"dia"?: never
                         }
                        Relationships: [
                    
                  ]
                },"v_promos_tienda": {
                  Row: {
                    "etiqueta": string | null,"hasta": string | null,"mezcla": boolean | null,"nombre": string | null,"producto_id": number | null,"promocion_id": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_saldo_clientes": {
                  Row: {
                    "cliente_id": number | null,"disponible": number | null,"proximo_vencimiento": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "saldos_cliente_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saldos_cliente_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "v_mi_ficha"
      referencedColumns: ["id"]
    }
                  ]
                },"v_stock": {
                  Row: {
                    "categoria": string | null,"codigo": string | null,"color": string | null,"color_hex": string | null,"deposito": string | null,"deposito_id": number | null,"disponible": number | null,"escala": string | null,"genero": string | null,"linea": string | null,"marca": string | null,"nombre": string | null,"precio_compra": number | null,"precio_venta": number | null,"producto_id": number | null,"reservado": number | null,"sku": string | null,"stock": number | null,"stock_bajo": boolean | null,"stock_minimo": number | null,"talle": string | null,"talle_orden": number | null,"temporada": string | null,"valor_costo": number | null,"variante_id": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_venta_items": {
                  Row: {
                    "anulada": boolean | null,"canal": string | null,"cantidad": number | null,"cliente_id": number | null,"color": string | null,"costo_unitario": number | null,"descuento_promo": number | null,"fecha": string | null,"id": number | null,"marca": string | null,"margen": number | null,"nombre": string | null,"precio_unitario": number | null,"producto_id": number | null,"promocion": string | null,"promocion_id": number | null,"subtotal": number | null,"talle": string | null,"variante_id": number | null,"venta_id": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "venta_items_promocion_id_fkey"
      columns: ["promocion_id"]
isOneToOne: false
      referencedRelation: "promociones"
      referencedColumns: ["id"]
    },{
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
            "_aplicar_promociones":
{ Args: { "p_promos": (number)[] }; Returns: undefined
                           },
"_armar_cambio":
{ Args: { "p_devueltos": Json,"p_lleva": Json }; Returns: Json
                           },
"_avisos_cortos":
{ Args: { "p": (string)[] }; Returns: boolean
                           },
"_calcular_devolucion":
{ Args: { "p_items": Json,"p_venta": number }; Returns: {
              "bruto": number,"total": number
            }[]
                           },
"_cancelar_pedido":
{ Args: { "p_comentario": string,"p_motivo": string,"p_pedido": number,"p_por": string }; Returns: undefined
                           },
"_codigo_corto":
{ Args: { "p_largo"?: number,"p_nombre": string,"p_prefijo"?: string,"p_tabla": string }; Returns: string
                           },
"_correo_plantilla":
{ Args: { "p_tienda": string,"p_tipo": string }; Returns: Json
                           },
"_cotizar":
{ Args: { "p_canal": string,"p_items": Json }; Returns: {
              "acumula": boolean,"cantidad": number,"descuento_promo": number,"precio_unitario": number,"producto_id": number,"promocion_id": number,"variante_id": number
            }[]
                           },
"_crear_unidades":
{ Args: { "p_items": Json }; Returns: undefined
                           },
"_creditos":
{ Args: Record<PropertyKey, never>; Returns: {
              "cliente_id": number,"id": number,"restante": number,"vence": string
            }[]
                           },
"_dominio_revisar":
{ Args: { "p_id": number }; Returns: undefined
                           },
"_dominios_revisar_pendientes":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_en_promocion":
{ Args: { "p_producto": number,"p_promocion": number }; Returns: boolean
                           },
"_generar_gastos_fijos":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_hoy_ar":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_ia_pedir_modelos":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_ia_procesar_modelos":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"_mover_stock":
{ Args: { "p_cantidad": number,"p_compra"?: number,"p_deposito": number,"p_motivo"?: string,"p_tipo": string,"p_variante": number,"p_venta"?: number }; Returns: undefined
                           },
"_mp_firma_valida":
{ Args: { "p_data_id": string,"p_firma": string,"p_request_id": string }; Returns: boolean
                           },
"_mp_pedir":
{ Args: { "p_cuerpo"?: Json,"p_idempotencia"?: string,"p_metodo": string,"p_ruta": string }; Returns: Json
                           },
"_mp_reembolsar":
{ Args: { "p_pedido": number }; Returns: undefined
                           },
"_pagado_con_promos":
{ Args: { "p_items": Json,"p_promos": (number)[] }; Returns: number
                           },
"_pedir_http":
{ Args: { "p_cabeceras"?: Json,"p_cuerpo"?: string,"p_metodo": string,"p_tipo"?: string,"p_url": string }; Returns: Json
                           },
"_promociones_vigentes":
{ Args: { "p_canal": string }; Returns: {
              "activa": boolean,
"acumula_medio_pago": boolean,
"creado_en": string,
"descuento_pct": number | null,
"desde": string | null,
"en_mostrador": boolean,
"en_tienda": boolean,
"hasta": string | null,
"id": number,
"lleva": number | null,
"mezcla": boolean,
"nombre": string,
"paga": number | null,
"precio_fijo": number | null,
"prioridad": number,
"tipo": string,
"usuario_id": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "promociones"
        isOneToOne: false
        isSetofReturn: true
      } },
"_queda_administrador":
{ Args: { "p_sin": string }; Returns: boolean
                           },
"_registrar_aceptacion":
{ Args: { "p_origen": string,"p_pedido"?: number,"p_usuario": string }; Returns: undefined
                           },
"_registrar_venta":
{ Args: { "p_canal": string,"p_cliente": number,"p_deposito": number,"p_descuento": number,"p_items": Json,"p_notas": string,"p_pagos": Json }; Returns: number
                           },
"_registro_error":
{ Args: { "p_email": string,"p_meta": Json }; Returns: string
                           },
"_renglones_cotizados":
{ Args: { "p_canal": string,"p_items": Json }; Returns: Json
                           },
"_repartir_devolucion":
{ Args: { "p_items": Json,"p_total": number }; Returns: {
              "cantidad": number,"costo_unitario": number,"estado": string,"monto": number,"producto_id": number,"variante_id": number,"venta_item_id": number
            }[]
                           },
"_saldo_proveedor":
{ Args: { "p_proveedor": number }; Returns: number
                           },
"_sumar_gasto_automatico":
{ Args: { "p_categoria": string,"p_descripcion": string,"p_fecha"?: string,"p_importe": number,"p_moneda"?: string,"p_referencia": string }; Returns: number
                           },
"_vercel":
{ Args: { "p_cuerpo"?: Json,"p_metodo": string,"p_ruta": string }; Returns: Json
                           },
"_vincular_cliente":
{ Args: { "p_usuario": unknown }; Returns: undefined
                           },
"_wa_enviar":
{ Args: { "p_detalle"?: string,"p_mensaje": Json,"p_pedido"?: number,"p_telefono": string,"p_tipo": string }; Returns: number
                           },
"_wa_firma_valida":
{ Args: { "p_firma": string,"p_payload": string }; Returns: boolean
                           },
"aceptar_documentos_compra":
{ Args: { "p_pedido": number }; Returns: undefined
                           },
"actualizar_mi_ficha":
{ Args: { "p_acepta_promos"?: boolean,"p_direccion"?: string,"p_documento"?: string,"p_fecha_nacimiento"?: string,"p_localidad"?: string,"p_nombre": string,"p_telefono"?: string }; Returns: undefined
                           },
"ajustar_credito_proveedor":
{ Args: { "p_monto": number,"p_nota": string,"p_proveedor": number }; Returns: undefined
                           },
"ajustar_precios":
{ Args: { "p_aplicar"?: boolean,"p_descripcion"?: string,"p_modo": string,"p_productos": (number)[],"p_proveedor"?: number,"p_que": string,"p_redondeo"?: string,"p_valor": number }; Returns: {
              "codigo": string,"nombre": string,"precio_anterior": number,"precio_nuevo": number,"producto_id": number
            }[]
                           },
"ajustar_stock":
{ Args: { "p_deposito"?: number,"p_motivo": string,"p_stock_nuevo": number,"p_variante": number }; Returns: undefined
                           },
"anular_invitacion":
{ Args: { "p_id": number }; Returns: undefined
                           },
"anular_presupuesto":
{ Args: { "p_presupuesto": number }; Returns: undefined
                           },
"anular_venta":
{ Args: { "p_comentario"?: string,"p_motivo": string,"p_venta": number }; Returns: undefined
                           },
"aplicar_credito_proveedor":
{ Args: { "p_compra": number,"p_monto": number }; Returns: number
                           },
"asignar_rol":
{ Args: { "p_email": string,"p_rol": number }; Returns: string
                           },
"buscar_color":
{ Args: { "p_nombre": string }; Returns: number
                           },
"buscar_talle":
{ Args: { "p_escala"?: string,"p_nombre": string }; Returns: number
                           },
"cambiar_estado_pedido":
{ Args: { "p_comentario"?: string,"p_estado": string,"p_motivo"?: string,"p_pagos"?: Json,"p_pedido": number }; Returns: number
                           },
"cancelar_mi_pedido":
{ Args: { "p_comentario"?: string,"p_motivo"?: string,"p_pedido": number }; Returns: undefined
                           },
"consultar_pedido_whatsapp":
{ Args: { "p_comprobante": string,"p_telefono": string }; Returns: {
              "comprobante": string,"entrega": string,"estado": string,"total": number
            }[]
                           },
"convertir_presupuesto":
{ Args: { "p_medio_pago"?: number,"p_presupuesto": number }; Returns: number
                           },
"cotizar":
{ Args: { "p_canal"?: string,"p_items": Json,"p_medio_pago"?: number }; Returns: Json
                           },
"cotizar_cambio":
{ Args: { "p_devuelve": Json,"p_lleva": Json,"p_medio"?: number,"p_venta": number }; Returns: Json
                           },
"cotizar_devolucion":
{ Args: { "p_items": Json,"p_venta": number }; Returns: Json
                           },
"crear_invitacion":
{ Args: { "p_email": string,"p_rol"?: number }; Returns: string
                           },
"crear_pedido":
{ Args: { "p_canal"?: string,"p_cliente"?: number,"p_direccion"?: string,"p_entrega"?: string,"p_items": Json,"p_medio_pago"?: number,"p_notas"?: string,"p_zona"?: number }; Returns: number
                           },
"crear_presupuesto":
{ Args: { "p_canal"?: string,"p_cliente"?: number,"p_descuento"?: number,"p_items": Json,"p_medio_pago"?: number,"p_notas"?: string,"p_validez_dias"?: number }; Returns: number
                           },
"cuentas_aplicar":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"deposito_fallados":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"deposito_principal":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"deshacer_ajuste_precios":
{ Args: { "p_ajuste": number }; Returns: number
                           },
"documentos_pendientes":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"dominio_agregar":
{ Args: { "p_nombre": string }; Returns: undefined
                           },
"dominio_principal":
{ Args: { "p_id": number }; Returns: string
                           },
"dominio_quitar":
{ Args: { "p_id": number }; Returns: undefined
                           },
"dominio_revisar":
{ Args: { "p_id": number }; Returns: undefined
                           },
"equipo":
{ Args: Record<PropertyKey, never>; Returns: {
              "desde": string,"email": string,"nombre": string,"rol": string,"rol_id": number,"usuario_id": string
            }[]
                           },
"es_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"estado_correo":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"estado_dominio":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"estado_envios":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"estado_integraciones":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"estado_mercadopago":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"etiqueta_promocion":
{ Args: { "p_lleva": number,"p_paga": number,"p_pct": number,"p_tipo": string }; Returns: string
                           },
"generar_gastos_fijos":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"guardar_conexion_hosting":
{ Args: { "p_supabase_ref"?: string,"p_supabase_token"?: string,"p_vercel_equipo"?: string,"p_vercel_proyecto"?: string,"p_vercel_token"?: string }; Returns: undefined
                           },
"guardar_correo":
{ Args: { "p_clave"?: string,"p_email"?: string,"p_host"?: string,"p_nombre"?: string,"p_puerto"?: number,"p_usuario"?: string }; Returns: undefined
                           },
"guardar_envios_credenciales":
{ Args: { "p_andreani_clave"?: string,"p_andreani_cliente"?: string,"p_andreani_contrato"?: string,"p_andreani_usuario"?: string,"p_quitar"?: (string)[],"p_uber_client_id"?: string,"p_uber_client_secret"?: string,"p_uber_customer_id"?: string }; Returns: undefined
                           },
"guardar_integraciones":
{ Args: { "p_access_token"?: string,"p_app_secret"?: string,"p_gemini_api_key"?: string,"p_phone_number_id"?: string,"p_quitar"?: (string)[],"p_waba_id"?: string }; Returns: undefined
                           },
"guardar_mercadopago":
{ Args: { "p_access_token"?: string,"p_quitar"?: (string)[],"p_sitio_url"?: string,"p_webhook_secret"?: string }; Returns: undefined
                           },
"ia_probar":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"ia_registrar_uso":
{ Args: { "p_consultas"?: number,"p_firma": string,"p_payload": string,"p_tokens_entrada": number,"p_tokens_salida": number }; Returns: boolean
                           },
"ia_revisar_modelos":
{ Args: { "p_pedir"?: boolean }; Returns: undefined
                           },
"invitacion_info":
{ Args: { "p_token": string }; Returns: Json
                           },
"legales_completos":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"mas_vendidos_tienda":
{ Args: { "p_dias"?: number }; Returns: {
              "producto_id": number
            }[]
                           },
"mi_cliente_id":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"mi_equipo":
{ Args: Record<PropertyKey, never>; Returns: {
              "descuento_max_pct": number,"permisos": (string)[],"rol": string
            }[]
                           },
"mover_a_fallados":
{ Args: { "p_cantidad": number,"p_deposito"?: number,"p_motivo": string,"p_variante": number }; Returns: number
                           },
"mp_notificacion":
{ Args: { "p_data_id": string,"p_firma": string,"p_request_id": string,"p_tipo": string }; Returns: string
                           },
"mp_pagar_pedido":
{ Args: { "p_pedido": number }; Returns: string
                           },
"mp_probar":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"orden_escala":
{ Args: { "p_escala": string }; Returns: number
                           },
"pedido_pagado":
{ Args: { "p_pedido": number }; Returns: boolean
                           },
"precio_ajustado":
{ Args: { "p_actual": number,"p_costo": number,"p_modo": string,"p_redondeo": string,"p_valor": number }; Returns: number
                           },
"precio_de":
{ Args: { "p_variante": number }; Returns: number
                           },
"probar_andreani":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"probar_uber":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"publicar_documento":
{ Args: { "p_contenido": string,"p_tipo": string }; Returns: number
                           },
"puede_ver_venta":
{ Args: { "p_usuario": string }; Returns: boolean
                           },
"quitar_del_equipo":
{ Args: { "p_usuario": string }; Returns: undefined
                           },
"registrar_arrepentimiento":
{ Args: { "p_comprobante"?: string,"p_detalle"?: string,"p_email": string,"p_nombre": string,"p_telefono"?: string }; Returns: string
                           },
"registrar_cambio":
{ Args: { "p_cliente"?: number,"p_comentario"?: string,"p_devuelve": Json,"p_lleva": Json,"p_motivo"?: string,"p_pagos"?: Json,"p_venta": number }; Returns: Json
                           },
"registrar_compra":
{ Args: { "p_actualizar_costo"?: boolean,"p_comprobante_proveedor"?: string,"p_deposito"?: number,"p_fecha_comprobante"?: string,"p_items": Json,"p_notas"?: string,"p_proveedor"?: number }; Returns: number
                           },
"registrar_devolucion":
{ Args: { "p_cliente"?: number,"p_comentario"?: string,"p_items": Json,"p_motivo": string,"p_venta": number }; Returns: number
                           },
"registrar_envio":
{ Args: { "p_costo_real"?: number,"p_notas"?: string,"p_pedido": number,"p_proveedor": string,"p_seguimiento"?: string }; Returns: undefined
                           },
"registrar_pago_pedido":
{ Args: { "p_monto": number,"p_pedido": number,"p_referencia"?: string }; Returns: undefined
                           },
"registrar_venta":
{ Args: { "p_canal"?: string,"p_cliente"?: number,"p_deposito"?: number,"p_descuento"?: number,"p_items": Json,"p_notas"?: string,"p_pagos"?: Json }; Returns: number
                           },
"reposicion_sugerida":
{ Args: { "p_dias_cobertura"?: number,"p_dias_ventas"?: number }; Returns: {
              "codigo": string,"color": string,"color_hex": string,"costo_unitario": number,"disponible": number,"marca": string,"nombre": string,"producto_id": number,"proveedor": string,"proveedor_id": number,"sugerido": number,"talle": string,"talle_orden": number,"variante_id": number,"vendidos": number
            }[]
                           },
"resolver_arrepentimiento":
{ Args: { "p_estado": string,"p_id": number,"p_resolucion"?: string }; Returns: undefined
                           },
"resolver_fallado":
{ Args: { "p_cantidad"?: number,"p_fallado": number,"p_nota"?: string,"p_proveedor"?: number,"p_salida": string }; Returns: number
                           },
"retirar_hasta":
{ Args: { "p_pedido": number }; Returns: string
                           },
"saldo_disponible":
{ Args: { "p_cliente": number }; Returns: number
                           },
"tienda_pagos":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"tiene_permiso":
{ Args: { "p_permiso": string }; Returns: boolean
                           },
"validar_registro":
{ Args: { "p_email": string,"p_meta": Json }; Returns: string
                           },
"vencer_pedidos_sin_retirar":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"vencer_saldos":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"venta_para_cambio":
{ Args: { "p_venta": number }; Returns: Json
                           },
"ventas_para_cambio":
{ Args: { "p_buscar": string }; Returns: Json
                           },
"wa_envios_recientes":
{ Args: { "p_limite"?: number }; Returns: {
              "detalle": string,"error": string,"estado": string,"fecha": string,"id": number,"telefono": string,"tipo": string
            }[]
                           },
"wa_mensaje_prueba":
{ Args: { "p_telefono": string }; Returns: number
                           },
"wa_recibir":
{ Args: { "p_firma": string,"p_payload": string }; Returns: Json
                           },
"wa_responder":
{ Args: { "p_firma": string,"p_para": string,"p_payload": string,"p_texto": string }; Returns: boolean
                           },
"wa_verificar_token":
{ Args: { "p_token": string }; Returns: boolean
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
