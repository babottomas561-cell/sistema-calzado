# Conectar con ARCA (factura electrónica)

Se hace **una sola vez**, primero en el **ambiente de pruebas** de ARCA (nada tiene validez fiscal) y, cuando todo anda, en **producción**.
Necesitás la **clave fiscal nivel 3** del titular del CUIT (o de quien lo represente). Conviene hacerlo con tu contador.

> Los nombres de los servicios y menús de ARCA pueden cambiar. Si algo no coincide, buscá el servicio por su nombre en el buscador de
> «Mis servicios» o consultá a tu contador.

## 1. Datos fiscales

Completá CUIT, razón social, categoría frente al IVA, domicilio comercial, Ingresos Brutos e inicio de actividades. Son los que van impresos en
cada factura. La **categoría** decide la letra: responsable inscripto emite A o B; monotributo y exento emiten C.

## 2. Ambiente

Dejá **Pruebas (homologación)** hasta terminar el paso 4. Después se repiten los pasos 3 y 4 en **Producción**.

## 3. Certificado

El certificado es la «firma digital» del comercio ante ARCA. Se genera en el sistema y ARCA lo autoriza.

1. Tocá **Generar pedido de certificado** y **descargá el pedido** (archivo `.csr`). La llave privada queda guardada en el sistema, cifrada: nunca
   la ves ni la tenés que guardar.
2. **En pruebas:** en ARCA, con tu clave fiscal, adherí el servicio **«WSASS - Autogestión Certificados Homologación»** (desde *Administrador de
   Relaciones de Clave Fiscal* → *Adherir servicio*). Entrá a WSASS:
   - *Nuevo certificado*: poné un nombre y pegá el contenido del `.csr`. Copiá el certificado que te muestra.
   - *Crear autorización a servicio*: elegí ese certificado y el servicio **wsfe** (Facturación electrónica).
3. **En producción:** entrá a **«Administración de Certificados Digitales»**, agregá un alias, subí el `.csr` y **descargá el certificado** (`.crt`).
   Después, en **«Administrador de Relaciones de Clave Fiscal»** → *Nueva relación* → buscá *Facturación Electrónica* (web services) y elegí como
   representante ese certificado (el alias que creaste).
4. Volvé al sistema y **pegá el certificado** (abrí el `.crt` con el Bloc de notas y copiá todo, desde `-----BEGIN CERTIFICATE-----`).

El certificado dura unos dos años. El sistema avisa antes de que venza; se renueva repitiendo este paso.

## 4. Probar y elegir el punto de venta

Tocá **Probar la conexión**: el sistema se fija que ARCA responda, que el certificado ande y trae los puntos de venta habilitados.

**Punto de venta (en producción):** creá uno **exclusivo para el sistema** en ARCA → **«Administración de puntos de venta y domicilios»** →
*Agregar*, con el sistema de facturación para **web services** (por ejemplo *«RECE para aplicativo y web services»* o *«Factura Electrónica -
Monotributo - Web Services»*, según tu categoría). No uses el mismo que «Comprobantes en línea» u otro programa: se pisan los números.
Después volvé a **Probar la conexión** para traerlo, ponele un nombre y marcá **el de siempre**.

**En pruebas** ARCA suele no listar puntos de venta: agregá uno a mano (cualquier número sirve).

## Si algo falla

| Mensaje | Qué hacer |
|---|---|
| «ARCA no reconoce el certificado» | El certificado es de otro ambiente: el de pruebas no sirve en producción ni al revés. |
| «El certificado no está autorizado para Factura electrónica» | Falta asociarle el servicio **wsfe** (paso 3). |
| «ARCA ya dio un acceso que el sistema no tiene guardado» | Esperá: el acceso dura hasta 12 horas y después se puede pedir otro. |
| «No hay puntos de venta para web services» | Creá uno en ARCA (paso 4) y volvé a probar. |
| «Falta la dirección del sitio en la instalación» | Avisale a quien instaló el sistema. |

## Qué guarda el sistema

- La **llave privada**, cifrada en el Vault de la base: nadie la puede leer desde el panel.
- El **certificado** y el **acceso** de cada día (dura 12 horas), sin mostrarlos.
- Un registro de cada comunicación con ARCA (sin claves), para revisar si algo falla.
