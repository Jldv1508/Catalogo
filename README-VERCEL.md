# jldv1508.com en Vercel

- Catalogo publico: `/`
- Renombrador privado: `/admin`

En Vercel configura estas variables de entorno:

- `ADMIN_USER`: usuario del editor. Si no lo pones, sera `admin`.
- `ADMIN_PASSWORD`: contrasena obligatoria para acceder a `/admin`.

Sin `ADMIN_PASSWORD`, `/admin` devuelve error 503 para evitar publicar el editor sin proteccion.
