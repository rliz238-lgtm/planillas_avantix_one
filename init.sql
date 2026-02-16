-- Tablas para SaaS Planilla Avantix One (Multi-tenancy)

-- Tabla de Empresas (Tenants)
CREATE TABLE IF NOT EXISTS businesses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE, -- Nombre Comercial
    legal_type VARCHAR(50) DEFAULT 'Persona Jurídica', -- Persona Física, Persona Jurídica, S.A., S.R.L., etc.
    legal_name VARCHAR(100), -- Razon Social
    cedula_juridica VARCHAR(50),
    country VARCHAR(50) DEFAULT 'Costa Rica',
    state VARCHAR(50), -- Provincia / Estado
    city VARCHAR(50), -- Cantón / Ciudad
    district VARCHAR(50), -- Distrito / Barrio
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(100),
    logo_url TEXT,
    default_overtime_multiplier DECIMAL(10, 2) DEFAULT 1.5,
    status VARCHAR(20) DEFAULT 'Active', -- Active, Suspended, Expired
    cycle_type VARCHAR(20) DEFAULT 'Weekly',
    expires_at TIMESTAMP NULL,
    theme_preference VARCHAR(20) DEFAULT 'dark', -- dark, light
    attendance_marker_enabled BOOLEAN DEFAULT FALSE,
    gps_latitude DOUBLE PRECISION,
    gps_longitude DOUBLE PRECISION,
    gps_radius_meters INTEGER DEFAULT 100,
    attendance_photo_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Usuarios (Administradores y Editores)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'owner', -- super_admin, owner, editor
    name VARCHAR(100) NOT NULL, -- Nombre
    last_name VARCHAR(100), -- Apellidos
    email VARCHAR(100),
    phone VARCHAR(20),
    username VARCHAR(50) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Empleados
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    cedula VARCHAR(20),
    phone VARCHAR(20),
    email VARCHAR(100),
    pin VARCHAR(4),
    position VARCHAR(100),
    hourly_rate DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'Active',
    start_date DATE NOT NULL,
    end_date DATE,
    apply_ccss BOOLEAN DEFAULT FALSE,
    overtime_threshold DECIMAL(10, 2) DEFAULT 48,
    overtime_multiplier DECIMAL(10, 2) DEFAULT 1.5,
    enable_overtime BOOLEAN DEFAULT TRUE,
    salary_history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Logs (Registro de horas)
CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    hours DECIMAL(10, 2) NOT NULL,
    time_in TIME,
    time_out TIME,
    is_imported BOOLEAN DEFAULT FALSE,
    is_paid BOOLEAN DEFAULT FALSE,
    is_double_day BOOLEAN DEFAULT FALSE,
    deduction_hours DECIMAL(10, 2) DEFAULT 0,
    source VARCHAR(20) DEFAULT 'Manual', -- Manual, Marker
    photo_url TEXT,
    location_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Pagos
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    hours DECIMAL(10, 2) DEFAULT 0,
    deduction_ccss DECIMAL(12, 2) DEFAULT 0,
    net_amount DECIMAL(12, 2) DEFAULT 0,
    date DATE NOT NULL,
    is_imported BOOLEAN DEFAULT FALSE,
    start_date DATE,
    end_date DATE,
    logs_detail JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Vales (Adelantos / Préstamos)
CREATE TABLE IF NOT EXISTS vouchers (
    id SERIAL PRIMARY KEY,
    business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL, -- Se llena cuando el vale es aplicado a un pago
    date DATE NOT NULL,
    description TEXT,
    amount DECIMAL(12, 2) NOT NULL,
    is_applied BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Configuración (Key-Value por empresa)
CREATE TABLE IF NOT EXISTS settings (
    business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    key VARCHAR(50),
    value TEXT,
    PRIMARY KEY (business_id, key)
);

-- Tabla para Plantillas de Correo (Configuración Global / Super Admin)
CREATE TABLE IF NOT EXISTS email_notifications (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) UNIQUE NOT NULL, -- Ej: HOTMART_SALE, NEW_REGISTRATION
    name VARCHAR(100) NOT NULL,       -- Nombre descriptivo para la UI
    subject VARCHAR(255) NOT NULL,
    html_template TEXT NOT NULL,
    recipients TEXT DEFAULT 'info@avantixone.com', -- Lista separada por comas
    is_active BOOLEAN DEFAULT TRUE,
    last_sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar configuraciones iniciales basadas en el código hardcoded actual
INSERT INTO email_notifications (type, name, subject, html_template) 
VALUES 
('HOTMART_SALE', 'Nueva Venta Hotmart', '💰 Nueva Venta Hotmart: {{buyer_name}}', 
'<div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; color: #1e293b;">
    <h2 style="color: #6366f1; margin-top: 0;">🚀 ¡Nueva Venta Detectada!</h2>
    <p>Se ha procesado una nueva compra desde Hotmart.</p>
    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #cbd5e1; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Comprador:</strong> {{buyer_name}}</p>
        <p style="margin: 5px 0;"><strong>Email:</strong> {{buyer_email}}</p>
        <p style="margin: 5px 0;"><strong>Evento:</strong> <span style="background: #e0e7ff; color: #4338ca; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem;">{{event}}</span></p>
    </div>
    <p style="font-size: 0.9rem; color: #64748b; font-style: italic;">
        Nota: El sistema ya envió el correo de bienvenida al cliente con su enlace de registro.
    </p>
</div>'),
('NEW_REGISTRATION', 'Registro de Empresa', '🏢 Nuevo Registro: {{business_name}}', 
'<div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; color: #1e293b;">
    <h2 style="color: #10b981; margin-top: 0;">✅ ¡Nueva Empresa Registrada!</h2>
    <p>Un usuario ha completado exitosamente su registro en la plataforma.</p>
    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #cbd5e1; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Empresa:</strong> {{business_name}}</p>
        <p style="margin: 5px 0;"><strong>Propietario:</strong> {{owner_name}}</p>
        <p style="margin: 5px 0;"><strong>Email:</strong> {{owner_email}}</p>
        <p style="margin: 5px 0;"><strong>Teléfono:</strong> {{owner_phone}}</p>
        <p style="margin: 5px 0;"><strong>Ciclo de Pago:</strong> {{cycle_type}}</p>
    </div>
</div>'),
('TEST', 'Prueba de Sistema', '🧪 Prueba de Notificación - Avantix One', 
'<div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; text-align: center;">
    <h2 style="color: #6366f1;">¡Funciona Correctamente!</h2>
    <p>Este es un correo de prueba enviado por el sistema de notificaciones.</p>
    <div style="background: #f0fdf4; color: #166534; padding: 15px; border-radius: 8px; margin: 20px 0;">
        Las notificaciones dinámicas están listas para usarse.
    </div>
    <p style="font-size: 0.85rem; color: #94a3b8;">Enviado el: {{date}}</p>
</div>'),
('HOTMART_WELCOME', 'Bienvenida Cliente (Hotmart)', '¡Gracias por tu compra en Avantix One! 🚀', 
'<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #6366f1; margin: 0;">¡Bienvenido a Avantix One! 🚀</h2>
    </div>
    <p>Hola <strong>{{buyer_name}}</strong>,</p>
    <p>¡Gracias por tu compra! Ya tienes acceso a la plataforma de gestión de planillas líder en la región.</p>
    <div style="background: #f9fafb; padding: 30px; border-radius: 8px; margin: 25px 0; border: 1px solid #eee; text-align: center;">
        <p style="margin-bottom: 20px; color: #374151; font-weight: 500;">Haz clic en el botón de abajo para configurar tu cuenta y los datos de tu empresa:</p>
        <a href="{{registration_link}}" style="background: #6366f1; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Completar mi Registro</a>
    </div>
    <p style="font-size: 0.9rem; color: #6b7280;">Este enlace te llevará directamente al asistente de configuración.</p>
</div>'),
('RESEND_ACCESS', 'Reenvío de Credenciales', 'Tus credenciales de acceso - Avantix One', 
'<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
    <h2 style="color: #6366f1;">Credenciales de Acceso 🚀</h2>
    <p>Hola <strong>{{name}}</strong>,</p>
    <p>Aquí tienes tus datos para ingresar a la plataforma de <strong>{{business_name}}</strong>:</p>
    <div style="background: #f9fafb; padding: 20px; border-radius: 8px; border: 1px solid #eee;">
        <p><strong>🌐 URL:</strong> <a href="https://app.avantixone.com">https://app.avantixone.com</a></p>
        <p><strong>👤 Usuario:</strong> {{username}}</p>
        <p><strong>🔑 Contraseña:</strong> {{password}}</p>
    </div>
    <p style="margin-top: 20px; font-size: 0.9rem; color: #6b7280;">Si no recordabas tu contraseña, te recomendamos cambiarla al ingresar.</p>
</div>'),
('RESET_PASSWORD', 'Reinicio de Contraseña', 'REINICIO de credenciales - Avantix One', 
'<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
    <h2 style="color: #ef4444;">Contraseña Reiniciada 🔐</h2>
    <p>Hola <strong>{{name}}</strong>,</p>
    <p>Tu contraseña para la empresa <strong>{{business_name}}</strong> ha sido reiniciada.</p>
    <div style="background: #fffbeb; padding: 20px; border-radius: 8px; border: 1px solid #fef3c7;">
        <p><strong>🌐 URL de Acceso:</strong> <a href="https://app.avantixone.com">https://app.avantixone.com</a></p>
        <p><strong>👤 Usuario:</strong> {{username}}</p>
        <p><strong>🔑 Nueva Contraseña:</strong> <code style="font-weight: bold;">{{password}}</code></p>
    </div>
    <p style="margin-top: 20px; font-size: 0.9rem; color: #b45309;">Recuerda cambiar esta contraseña temporal apenas ingreses.</p>
</div>'),
('REGISTRATION_SUCCESS', 'Confirmación de Registro (Cliente)', '✅ Tu cuenta en Avantix One está lista', 
'<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #10b981; margin: 0;">¡Registro Completado! ✅</h2>
    </div>
    <p>Hola <strong>{{name}}</strong>,</p>
    <p>Tu empresa <strong>{{business_name}}</strong> ha sido configurada correctamente en Avantix One.</p>
    <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #bbf7d0; text-align: center;">
        <p style="margin-bottom: 15px; color: #166534; font-weight: 500;">Ya puedes ingresar a tu panel de control:</p>
        <a href="https://app.avantixone.com" style="background: #10b981; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Ingresar al Sistema</a>
    </div>
    <p style="font-size: 0.9rem; color: #64748b;">Tu usuario es: <strong>{{username}}</strong></p>
    <p style="margin-top: 20px; font-size: 0.8rem; color: #94a3b8; text-align: center;">Gracias por confiar en Avantix One para la gestión de tus planillas.</p>
</div>')
ON CONFLICT (type) DO UPDATE 
SET name = EXCLUDED.name, 
    subject = EXCLUDED.subject, 
    html_template = EXCLUDED.html_template;

-- MIGRACIONES DE COLUMNAS (Para bases de datos existentes)
DO $$ 
BEGIN
    -- Columnas para multi-tenancy
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='business_id') THEN
        ALTER TABLE users ADD COLUMN business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role') THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'owner';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='business_id') THEN
        ALTER TABLE employees ADD COLUMN business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logs' AND column_name='business_id') THEN
        ALTER TABLE logs ADD COLUMN business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='business_id') THEN
        ALTER TABLE payments ADD COLUMN business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE;
    END IF;

    -- Campos de Internacionalización y Legalidad
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='legal_type') THEN
        ALTER TABLE businesses ADD COLUMN legal_type VARCHAR(50) DEFAULT 'Persona Jurídica';
        ALTER TABLE businesses ADD COLUMN country VARCHAR(50) DEFAULT 'Costa Rica';
        ALTER TABLE businesses ADD COLUMN state VARCHAR(50);
        ALTER TABLE businesses ADD COLUMN city VARCHAR(50);
        ALTER TABLE businesses ADD COLUMN district VARCHAR(50);
        ALTER TABLE businesses ADD COLUMN address TEXT;
    END IF;

    -- Campos detallados de Usuarios
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_name') THEN
        ALTER TABLE users ADD COLUMN last_name VARCHAR(100);
        ALTER TABLE users ADD COLUMN email VARCHAR(100);
        ALTER TABLE users ADD COLUMN phone VARCHAR(20);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='phone') THEN
        ALTER TABLE businesses ADD COLUMN phone VARCHAR(20);
        ALTER TABLE businesses ADD COLUMN email VARCHAR(100);
        ALTER TABLE businesses ADD COLUMN legal_name VARCHAR(100);
        ALTER TABLE businesses ADD COLUMN is_sa BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='email') THEN
        ALTER TABLE employees ADD COLUMN email VARCHAR(100);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='expires_at') THEN
        ALTER TABLE businesses ADD COLUMN expires_at TIMESTAMP NULL;
    END IF;

    -- Asegurar que el nombre de la empresa sea único para evitar duplicados en el inicio
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_name_unique') THEN
        -- Limpiar duplicados accidentales antes de aplicar restricción
        DELETE FROM businesses WHERE id NOT IN (SELECT MIN(id) FROM businesses GROUP BY name);
        ALTER TABLE businesses ADD CONSTRAINT businesses_name_unique UNIQUE (name);
    END IF;

    -- Migration to add missing theme_preference and other columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='theme_preference') THEN
        ALTER TABLE businesses ADD COLUMN theme_preference VARCHAR(20) DEFAULT 'dark';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='logo_url') THEN
        ALTER TABLE businesses ADD COLUMN logo_url TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='cycle_type') THEN
        ALTER TABLE businesses ADD COLUMN cycle_type VARCHAR(20) DEFAULT 'Weekly';
    END IF;

    -- Columnas para Vales y Detalles Extendidos en Pagos
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='voucher_amount') THEN
        ALTER TABLE payments ADD COLUMN voucher_amount DECIMAL(12, 2) DEFAULT 0;
        ALTER TABLE payments ADD COLUMN voucher_details JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE payments ADD COLUMN gross_amount DECIMAL(12, 2) DEFAULT 0;
        ALTER TABLE payments ADD COLUMN lunch_hours DECIMAL(10, 2) DEFAULT 0;
    END IF;

    -- Marcador de Asistencia (Businesses)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='attendance_marker_enabled') THEN
        ALTER TABLE businesses ADD COLUMN attendance_marker_enabled BOOLEAN DEFAULT FALSE;
        ALTER TABLE businesses ADD COLUMN gps_latitude DOUBLE PRECISION;
        ALTER TABLE businesses ADD COLUMN gps_longitude DOUBLE PRECISION;
        ALTER TABLE businesses ADD COLUMN gps_radius_meters INTEGER DEFAULT 100;
        ALTER TABLE businesses ADD COLUMN attendance_photo_required BOOLEAN DEFAULT FALSE;
    END IF;

    -- Marcador de Asistencia (Logs)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logs' AND column_name='source') THEN
        ALTER TABLE logs ADD COLUMN source VARCHAR(20) DEFAULT 'Manual';
        ALTER TABLE logs ADD COLUMN photo_url TEXT;
        ALTER TABLE logs ADD COLUMN location_metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Asegurar que la tabla settings tenga business_id si ya existía sin ella
-- (Esto es más delicado si ya hay datos, se asume que se puede reestructurar)
-- ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
-- ALTER TABLE settings ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE;

-- Insertar primera empresa por defecto para datos existentes
INSERT INTO businesses (name, status) 
VALUES ('Avantix One - Sede Principal', 'Active')
ON CONFLICT (name) DO NOTHING;

-- Asignar todos los registros existentes a la primera empresa (si business_id es NULL)
UPDATE users SET business_id = 1 WHERE business_id IS NULL AND role != 'super_admin';
UPDATE employees SET business_id = 1 WHERE business_id IS NULL;
UPDATE logs SET business_id = 1 WHERE business_id IS NULL;
UPDATE payments SET business_id = 1 WHERE business_id IS NULL;

-- Insertar usuario Super Admin
INSERT INTO users (username, password, name, role) 
VALUES ('superadmin', 'avantix2026', 'Super Administrador', 'super_admin')
ON CONFLICT (username) DO NOTHING;

-- Actualizar usuarios existentes con roles
UPDATE users SET role = 'super_admin' WHERE username = 'admin';
UPDATE users SET role = 'super_admin', business_id = NULL WHERE username = 'rli001';

