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

-- Actualización de la tabla de Pagos para incluir detalles de vales y CCSS para el historial
ALTER TABLE payments ADD COLUMN IF NOT EXISTS voucher_amount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS voucher_details JSONB DEFAULT '[]'::jsonb;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gross_amount DECIMAL(12, 2) DEFAULT 0; -- Monto total sin rebajos (Gross)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS lunch_hours DECIMAL(10, 2) DEFAULT 0; -- Total horas de almuerzo tomadas
