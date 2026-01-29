-- Tablas para Planillas Tom Tom Wok
-- Tabla de Usuarios (Administradores)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Empleados
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    cedula VARCHAR(20),
    phone VARCHAR(20),
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
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    hours DECIMAL(10, 2) NOT NULL,
    time_in TIME,
    time_out TIME,
    is_imported BOOLEAN DEFAULT FALSE,
    is_paid BOOLEAN DEFAULT FALSE, -- Nueva columna para control de pagos
    is_double_day BOOLEAN DEFAULT FALSE,
    deduction_hours DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Pagos
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    hours DECIMAL(10, 2) DEFAULT 0,
    deduction_ccss DECIMAL(12, 2) DEFAULT 0,
    net_amount DECIMAL(12, 2) DEFAULT 0,
    date DATE NOT NULL,
    is_imported BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Configuración (Key-Value)
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT
);

-- Migraciones de Columnas (PostgreSQL 9.6+)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS apply_ccss BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS overtime_threshold DECIMAL(10, 2) DEFAULT 48;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS overtime_multiplier DECIMAL(10, 2) DEFAULT 1.5;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS enable_overtime BOOLEAN DEFAULT TRUE;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS is_imported BOOLEAN DEFAULT FALSE;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS is_double_day BOOLEAN DEFAULT FALSE;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS deduction_hours DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE logs ALTER COLUMN hours TYPE DECIMAL(10, 2); -- Asegurar precisión

-- Migraciones para Tabla payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS hours DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS deduction_ccss DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS net_amount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_imported BOOLEAN DEFAULT FALSE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS logs_detail JSONB DEFAULT '[]'::jsonb;

-- Insertar usuario admin por defecto
INSERT INTO users (username, password, name) 
VALUES ('admin', 'password1102', 'Administrador Principal')
ON CONFLICT (username) DO NOTHING;

-- Insertar usuario rli001
INSERT INTO users (username, password, name) 
VALUES ('rli001', 'rli001', 'Usuario RLI')
ON CONFLICT (username) DO NOTHING;

