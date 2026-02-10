---
description: Gestión de Backups y Recuperación de Datos
---

Este flujo de trabajo detalla cómo realizar copias de seguridad de la base de datos y los archivos del sistema, así como su restauración.

### 1. Copia de Seguridad de la Base de Datos (PostgreSQL)

Para generar un respaldo de la base de datos actual:

```bash
docker exec -t avantix_one_db_planillas_avantixone pg_dump -U avaone db_planillas_avantixone > backup_$(date +%Y-%m-%d).sql
```
*Nota: Si el comando pide contraseña, usa la que está en tu archivo .env (ea167ca0e95c175c1051).*

### 2. Restauración de la Base de Datos

En caso de fallo total, primero asegúrate de que el contenedor de la base de datos esté corriendo y luego ejecuta:

```bash
cat nombre_del_archivo_backup.sql | docker exec -i avantix_one_db_planillas_avantixone psql -U avaone -d db_planillas_avantixone
```

### 3. Respaldo de Archivos (Logos y Multimedia)

Los logos de las empresas se guardan en el volumen de Docker. Para respaldarlos localmente en el VPS:

```bash
tar -czvf logos_backup_$(date +%Y-%m-%d).tar.gz ./img/logos
```

### 4. Automatización Sugerida (Cron Job)

Puedes programar que el VPS haga esto automáticamente todas las noches a las 2:00 AM editando el crontab (`crontab -e`):

```bash
0 2 * * * docker exec avantix_one_db_planillas_avantixone pg_dump -U avaone db_planillas_avantixone > /ruta/a/tus/backups/db_$(date +\%F).sql
```

### 5. Recomendación de Seguridad
Si usas un servicio como **Easypanel**, lo más recomendable es activar la opción de "Backups" integrada en su panel, la cual puede subir estos archivos automáticamente a Google Drive o S3 para máxima seguridad fuera del VPS.
