# jldv1508.com

Proyecto Next.js para el catalogo y el editor privado.

## Acceso privado por email

Toda la web queda protegida por `sign-in` con email:

- El visitante entra en `/sign-in`
- Solicita acceso con su email
- La solicitud llega a `bisut2U@icloud.com`
- La aprobacion o denegacion se hace desde el enlace recibido por correo
- Si el email esta aprobado, se crea una sesion por cookie y ya puede entrar

Las solicitudes se guardan en:

- `data/access-requests.json`
- `data/approved-access.json`

## Variables de entorno

Crea un `.env.local` basado en `.env.example`.

```text
SESSION_SECRET=una_clave_larga_y_privada
ACCESS_APPROVER_EMAIL=bisut2U@icloud.com
SMTP_HOST=smtp.tu-proveedor.com
SMTP_PORT=587
SMTP_USER=tu-usuario-smtp
SMTP_PASS=tu-password-o-app-password
SMTP_FROM=bisut2U@icloud.com
```

Notas:

- `SESSION_SECRET` firma las cookies y los enlaces de aprobacion
- `ACCESS_APPROVER_EMAIL` es el destinatario que recibe las solicitudes
- `SMTP_*` debe corresponder al proveedor desde el que se enviaran los correos
- Si falta SMTP, la solicitud se guarda igualmente, pero no se enviara el email de aprobacion

## Rutas principales

- ` /sign-in ` acceso con email
- ` /catalogo ` catalogo protegido
- ` /edicion ` editor protegido
- ` /admin ` panel protegido

No subas los ZIP grandes a GitHub. Sube esta carpeta descomprimida.
