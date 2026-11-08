# DEV KRAKEN

Landing estática en HTML, CSS y JavaScript. Se publica desde el monorepo `dev-kraken-portal` en `https://devkraken.xyz/`; GitHub Actions combina esta carpeta con el portal en `/portal/`. No requiere compilación, Node.js en producción ni dependencias de ejecución adicionales.

## Desarrollo y verificación

Servir la raíz del repositorio, por ejemplo:

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory landing
```

Comprobaciones de sintaxis:

```sh
node --check catalog.js
node --check contact-api.js
node --check script.js
git diff --check
```

Pruebas de navegador (requieren Playwright para Python y Chromium, solo para desarrollo):

```sh
python landing/tests/browser_checks.py
```

La suite utiliza `http://127.0.0.1:4173` por defecto; puede cambiarse con `TEST_BASE_URL`. Intercepta los envíos y comprueba confirmación, error, respuesta inválida, cancelación, preselecciones, validaciones, teclado, tamaños móviles, rutas legales y animaciones. No envía datos reales. Las capturas se guardan en `/tmp/dev-kraken-desktop.png` y `/tmp/dev-kraken-mobile.png`.

## Archivos y contenido

- `index.html`: posicionamiento empresarial, enfoque, metodología, demos, SEO y formulario de tres pasos.
- `catalog.js`: fuente única de servicios, capacidades, opciones y demos. Los IDs de servicio son `automation`, `enterprise-software`, `cloud`, `integrations`, `consulting` y `support`.
- `script.js`: renderizado del catálogo, animaciones existentes y estado del formulario. Los datos personales se mantienen únicamente en memoria durante el modal y se descartan al cerrarlo.
- `contact-api.js`: límite de integración del envío, sin endpoint configurado.
- `styles.css`: identidad visual original y extensiones responsive.
- `privacy.html`: documentos existentes; solo se ajustaron navegación y enlaces, no el texto legal.

## Envío: pendiente de configurar

El código anterior NO tenía un proveedor de envío: esperaba 650 ms y mostraba éxito. Se eliminó ese comportamiento. Sin receptor configurado, el envío en línea se deshabilita y se explica la alternativa de preparar un correo a la dirección existente. Abrir el correo no registra la solicitud ni muestra éxito; la persona debe enviarlo en su aplicación.

Para habilitar el envío:

1. Disponer de un receptor real bajo control de DEV KRAKEN.
2. Configurar `endpoint` en `contact-api.js` con su URL. No poner claves privadas en archivos públicos.
3. El receptor debe validar y registrar el payload antes de responder JSON `{ "accepted": true }`. Un HTTP 200 por sí solo no confirma recepción. Adaptar el adaptador si el proveedor real tiene otro contrato.
4. Configurar HTTPS, CORS cuando corresponda, validación del lado servidor, límites de tamaño, protección contra bots y limitación de solicitudes. No registrar información personal innecesaria.
5. Verificar entrega real y manejo de fallos antes de publicar. Esta integración no se pudo comprobar porque no existe receptor en el repositorio.

Payload:

```json
{
  "fullName": "Persona de ejemplo",
  "email": "test@example.com",
  "company": "Empresa de ejemplo",
  "phone": null,
  "industry": null,
  "companySize": null,
  "serviceId": "consulting",
  "description": null,
  "demoRequested": true,
  "demoId": "operations",
  "source": "hero"
}
```

`serviceId` será `demo` para solicitudes exclusivamente de demostración. `demoId` admite `operations`, `field-service` o `null`. `source` admite `hero`, `services`, `demo` y `contact`. El CTA principal de navegación utiliza el contexto `hero` y preselecciona consultoría. Una selección de demo requiere indicar cuál; las solicitudes de servicio pueden no incluir demo.

## Demos: interfaz de solicitud, sin acceso público

Ambas demostraciones están identificadas como no disponibles y sus funciones se presentan como alcance previsto. No existen sistemas de demo, enlaces ni autorización en este repositorio. Tras una recepción confirmada, una solicitud de demo muestra **Acceso pendiente**; sin receptor no se afirma haber registrado interés.

Contrato futuro sugerido: `{ "accepted": true, "demoAccess": { "status": "pending" } }`. Antes de habilitar un botón de acceso, implementar el servidor de la demo y su autenticación real. La landing actual no utiliza URLs o tokens devueltos por el receptor para conceder acceso.

El servicio de demos deberá emitir y validar sesiones o autorizaciones temporales, con expiración y permisos limitados. Preferir cookies seguras HttpOnly; no incluir datos personales ni credenciales en URLs. Usar solo datos ficticios, aislar las demos de producción, aplicar controles de privacidad, protección contra bots y límites de solicitudes. Incorporar después el flujo autorizado y sus pruebas end-to-end contra el servidor real.

## Enlaces y revisión legal pendientes

- Privacidad y Términos apuntan al documento existente; Términos usa `privacy.html#web-terms`.
- LinkedIn y GitHub eran enlaces `#` sin perfiles reales. Se muestran como pendientes, sin inventar destinos. Configurar las URLs verificadas cuando estén disponibles.
- La política web ya menciona formularios, comunicación, proveedores y conservación de forma general. Requiere revisión profesional para concretar los campos empresariales, solicitudes de demo, finalidad de contacto comercial, proveedor elegido, plazos de conservación, eliminación y condiciones de acceso a demos. No se añadieron declaraciones legales ni certificaciones.
- No había sitemap ni configuración de build. Se añadieron canonical, Open Graph, metadatos sociales y datos estructurados limitados al nombre, dominio, logo y correo existentes.

No se ha realizado ningún despliegue.
