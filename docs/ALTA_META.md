# Alta de WhatsApp e Instagram para un cliente (camino «app de cada cliente»)

Hoy cada local usa **su propia app de Meta** (decisión del 14/10/2026: ver la memoria «Meta: app por cliente o plataforma»). Para que el alta no se frene a mitad de camino,
**pedile esto al cliente ANTES** de sentarse a hacerlo. La app queda en **modo de desarrollo**: para usarla con su propio número y su propia cuenta **no hace falta** pasarla
a modo en vivo, ni subir política de privacidad, términos ni verificar el negocio (eso lo pide Meta solo para publicar o pedir permisos avanzados).

## Lo que tiene que tener el cliente

| Para | Qué | Por qué |
|---|---|---|
| Todo | Un **Facebook personal** con su nombre real | Meta lo exige para crear el portfolio comercial y la app; no se publica nada en su perfil |
| Todo | El **email del negocio**, al que pueda entrar | Confirmaciones de Meta |
| WhatsApp | Un **número de celular que NO use WhatsApp** (conviene un chip nuevo solo para el bot) | Un número no puede estar en la app de WhatsApp y en la API a la vez |
| WhatsApp | Una **tarjeta** para lo que cobra Meta por conversación | Meta cobra aparte de este sistema |
| Instagram | Su cuenta de Instagram **profesional** (comercial o creador) | La conexión no anda con cuentas personales |
| Opcional | CUIT, dirección y web del local | Solo para la verificación del negocio (sube el límite de mensajes) |

## Quién hace qué

1. **El instalador** hace el alta de la instalación (Supabase + Vercel) y entrega la clave al dueño.
2. **El dueño** habilita lo que usa en **Parametrización** (WhatsApp, Instagram): sin eso, su configuración no aparece.
3. **Juntos**, con la compu (las pantallas de Meta son incómodas en el celular): seguir `docs/integraciones/whatsapp.md` e `instagram.md` (30 a 45 minutos cada uno).
   El token y las claves los pega el dueño en el panel (**nunca** por chat): quedan guardados y nadie los puede volver a leer.

## Errores comunes

- «Meta me pide política de privacidad / términos / verificar el negocio»: dejá esos campos vacíos; es para publicar la app, no para usarla con tu propia cuenta.
- El token temporal (24 h) en vez del permanente: el manual de WhatsApp explica cómo generar el de «usuario del sistema».
- Instagram con cuenta personal: pasarla a profesional (Configuración → Tipo de cuenta) antes de empezar.
- Meta cambia el nombre de sus pantallas seguido: buscar el nombre parecido.

## Cuando haya varios clientes

El camino de escala es **una sola app de la empresa** (Tech Provider) con registro integrado y un servicio central: pide verificar la empresa en Meta, pasar la revisión de la app
y tener política de privacidad, términos y eliminación de datos. Se retoma junto con la plataforma central (CLAUDE.md, regla 18). Verificar los requisitos vigentes de Meta antes de planificarlo.
