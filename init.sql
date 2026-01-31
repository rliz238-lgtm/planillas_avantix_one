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

-- Tabla de Configuración (Key-Value por empresa)
CREATE TABLE IF NOT EXISTS settings (
    business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    key VARCHAR(50),
    value TEXT,
    PRIMARY KEY (business_id, key)
);

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
UPDATE users SET role = 'owner' WHERE username = 'rli001';

