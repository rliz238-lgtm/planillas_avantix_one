require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const db = require('./db');

const app = express();
// Puerto 80 para producción en Easypanel
const PORT = process.env.PORT || 80;

// --- DIAGNÓSTICO Y AUTO-INICIALIZACIÓN ---
async function startApp() {
    try {
        console.log('🔍 Probando conexión a la base de datos...');
        await db.query('SELECT NOW()');
        console.log('✅ Conexión EXITOSA a PostgreSQL');

        // Leer y ejecutar init.sql si es necesario
        const sqlPath = path.join(__dirname, 'init.sql');
        if (fs.existsSync(sqlPath)) {
            console.log('🚀 Ejecutando script de inicialización (init.sql)...');
            const sql = fs.readFileSync(sqlPath, 'utf8');
            await db.query(sql);
            console.log('✅ Tablas verificadas/creadas correctamente');
        }
    } catch (err) {
        console.error('❌ ERROR crítico de base de datos:', err.message);
        console.error('URL Intentada:', process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
    }
}

startApp();

// --- CONFIGURACIÓN DE SEGURIDAD (Desbloqueo de CSP) ---
// Este middleware soluciona el error "blocked:csp" que ves en tu pestaña Network
app.use((req, res, next) => {
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data: https:;"
    );
    next();
});

app.use(cors());
app.use(express.json());

// --- SERVIR ARCHIVOS ESTÁTICOS ---
app.use(express.static(path.join(__dirname, '')));

// --- RUTAS DE NAVEGACIÓN ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- API Health Check ---
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// --- Autenticación ---
// --- Usuarios ---
app.get('/api/users', async (req, res) => {
    try {
        const result = await db.query('SELECT id, username, name, created_at FROM users ORDER BY username ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    const { username, password, name } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO users (username, password, name) VALUES ($1, $2, $3) RETURNING id, username, name',
            [username, password, name]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { username, password, name } = req.body;
    try {
        let query = 'UPDATE users SET username=$1, name=$2';
        let params = [username, name, id];

        if (password) {
            query += ', password=$3 WHERE id=$4';
            params = [username, name, password, id];
        } else {
            query += ' WHERE id=$3';
        }

        const result = await db.query(query + ' RETURNING id, username, name', params);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Authentication ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await db.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            res.json({ id: user.id, username: user.username, name: user.name });
        } else {
            res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/employee-auth', async (req, res) => {
    const { pin } = req.body;
    try {
        const result = await db.query('SELECT * FROM employees WHERE pin = $1 AND status = $2', [pin, 'Active']);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(401).json({ error: 'PIN incorrecto o empleado inactivo' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Error en la base de datos' });
    }
});

// --- Empleados ---
app.get('/api/employees', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM employees ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/employees', async (req, res) => {
    const { name, cedula, phone, pin, position, hourlyRate, status, startDate, endDate, applyCCSS, overtimeThreshold, overtimeMultiplier, enableOvertime, salaryHistory } = req.body;

    // Validación de campos obligatorios
    if (!name || !hourlyRate || !startDate) {
        return res.status(400).json({ error: 'Faltan campos obligatorios: name, hourlyRate o startDate' });
    }

    try {
        const result = await db.query(
            'INSERT INTO employees (name, cedula, phone, pin, position, hourly_rate, status, start_date, end_date, apply_ccss, overtime_threshold, overtime_multiplier, enable_overtime, salary_history) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *',
            [name, cedula, phone, pin, position, hourlyRate, status || 'Active', startDate, endDate || null, applyCCSS || false, overtimeThreshold || 48, overtimeMultiplier || 1.5, enableOvertime !== false, JSON.stringify(salaryHistory || [])]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error("POST /api/employees error:", err.message);
        res.status(500).json({ error: "No se pudo crear el empleado: " + err.message });
    }
});

app.put('/api/employees/:id', async (req, res) => {
    const { id } = req.params;
    const { name, cedula, phone, pin, position, hourlyRate, status, startDate, endDate, applyCCSS, overtimeThreshold, overtimeMultiplier, enableOvertime, salaryHistory } = req.body;
    try {
        const result = await db.query(
            'UPDATE employees SET name=$1, cedula=$2, phone=$3, pin=$4, position=$5, hourly_rate=$6, status=$7, start_date=$8, end_date=$9, apply_ccss=$10, overtime_threshold=$11, overtime_multiplier=$12, enable_overtime=$13, salary_history=$14 WHERE id=$15 RETURNING *',
            [name, cedula, phone, pin, position, hourlyRate, status, startDate, endDate, applyCCSS, overtimeThreshold, overtimeMultiplier, enableOvertime, JSON.stringify(salaryHistory || []), id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/employees/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM employees WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Logs ---
app.get('/api/logs', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM logs ORDER BY date DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/logs', async (req, res) => {
    const { employeeId, date, hours, timeIn, timeOut, isImported, isDoubleDay, deductionHours } = req.body;

    if (!employeeId || isNaN(employeeId)) {
        return res.status(400).json({ error: 'ID de empleado inválido o faltante' });
    }
    if (!date || !hours && hours !== 0) {
        return res.status(400).json({ error: 'Faltan campos obligatorios: date o hours' });
    }

    try {
        const result = await db.query(
            'INSERT INTO logs (employee_id, date, hours, time_in, time_out, is_imported, is_double_day, deduction_hours) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [employeeId, date, hours, timeIn || null, timeOut || null, isImported || false, isDoubleDay || false, deductionHours || 0]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error("POST /api/logs error:", err.message);
        res.status(500).json({ error: "No se pudo registrar la hora: " + err.message });
    }
});

app.delete('/api/logs/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM logs WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/logs/:id', async (req, res) => {
    const { id } = req.params;
    const { employeeId, date, hours, timeIn, timeOut, isImported, isPaid, isDoubleDay, deductionHours } = req.body;
    try {
        const result = await db.query(
            'UPDATE logs SET employee_id=$1, date=$2, hours=$3, time_in=$4, time_out=$5, is_imported=$6, is_paid=$7, is_double_day=$8, deduction_hours=$9 WHERE id=$10 RETURNING *',
            [employeeId, date, hours, timeIn, timeOut, isImported, isPaid, isDoubleDay, deductionHours, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/logs/employee/:employeeId', async (req, res) => {
    try {
        await db.query('DELETE FROM logs WHERE employee_id = $1', [req.params.employeeId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Batch Logs & WhatsApp Summary ---
async function sendWhatsAppMessage(number, text) {
    const apiUrl = process.env.EVOLUTION_API_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;
    const instance = process.env.EVOLUTION_INSTANCE_NAME;

    if (!apiUrl || !apiKey || !instance) {
        console.warn('⚠️ Evolution API no está configurada en .env');
        return;
    }

    const cleanNumber = number.replace(/\D/g, '');
    const data = JSON.stringify({
        number: cleanNumber,
        text: text
    });

    return new Promise((resolve, reject) => {
        try {
            const url = new URL(apiUrl);
            // IMPORTANTE: encodeURIComponent maneja espacios en el nombre de la instancia
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: `/message/sendText/${encodeURIComponent(instance)}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apiKey,
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            const req = https.request(options, (res) => {
                let responseBody = '';
                res.on('data', (chunk) => { responseBody += chunk; });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log(`✅ WhatsApp enviado a ${cleanNumber}`);
                        resolve({ success: true, body: responseBody });
                    } else {
                        console.error(`❌ Error Evolution API (${res.statusCode}):`, responseBody);
                        reject(new Error(`Evolution API Error (${res.statusCode}): ${responseBody}`));
                    }
                });
            });

            req.on('error', (e) => {
                console.error('❌ Error de red enviando WhatsApp:', e.message);
                reject(e);
            });

            req.write(data);
            req.end();
        } catch (err) {
            reject(err);
        }
    });
}

app.post('/api/logs/batch', async (req, res) => {
    const { employeeId, logs } = req.body;

    if (!employeeId || !logs || !Array.isArray(logs)) {
        return res.status(400).json({ error: 'Datos de batch inválidos' });
    }

    try {
        // 1. Obtener datos del empleado
        const empRes = await db.query('SELECT * FROM employees WHERE id = $1', [employeeId]);
        if (empRes.rows.length === 0) return res.status(404).json({ error: 'Empleado no encontrado' });
        const emp = empRes.rows[0];

        let totalH = 0;
        let totalAmt = 0;
        let summaryDetails = "";

        // Iniciar transacción (opcional pero recomendado para batch)
        await db.query('BEGIN');

        for (const log of logs) {
            const { date, hours, timeIn, timeOut, isDoubleDay, deductionHours } = log;
            await db.query(
                'INSERT INTO logs (employee_id, date, hours, time_in, time_out, is_imported, is_double_day, deduction_hours) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                [employeeId, date, hours, timeIn, timeOut, false, isDoubleDay || false, deductionHours || 0]
            );

            const h = parseFloat(hours);
            totalH += h;
            // Cálculo del monto bruto considerando día doble
            const hourlyRate = parseFloat(emp.hourly_rate);
            const gross = h * hourlyRate;
            const deduction = emp.apply_ccss ? (gross * 0.1067) : 0;
            const net = gross - deduction;
            totalAmt += net;

            const dayName = new Date(date + 'T00:00:00').toLocaleString('es-ES', { weekday: 'short' }).toUpperCase();
            let logInfo = `(${h.toFixed(1)}h)`;
            if (isDoubleDay) logInfo += " [DOBLE]";
            if (parseFloat(deductionHours) > 0) logInfo += ` [-${deductionHours}h almuerzo]`;

            summaryDetails += `• ${dayName} ${date}: ${timeIn} - ${timeOut} ${logInfo} → ₡${Math.round(net).toLocaleString()}\n`;
        }

        await db.query('COMMIT');

        if (emp.phone) {
            const messageText = `*REGISTRO DE HORAS TTW*\n\n*Empleado:* ${emp.name}\n*Total Horas:* ${totalH.toFixed(1)}h\n*Monto Est.:* ₡${Math.round(totalAmt).toLocaleString()}\n\n*DETALLE:*\n${summaryDetails}`;
            await sendWhatsAppMessage(emp.phone, messageText);
            return res.json({ success: true, count: logs.length, messageSent: messageText });
        }

        res.json({ success: true, count: logs.length });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error("❌ Error en batch logs:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- Pagos ---
app.get('/api/payments', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM payments ORDER BY date DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/payments', async (req, res) => {
    const { employeeId, amount, hours, deductionCCSS, netAmount, date, isImported, logsDetail, startDate, endDate } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO payments (employee_id, amount, hours, deduction_ccss, net_amount, date, is_imported, logs_detail, start_date, end_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
            [employeeId, amount, hours || 0, deductionCCSS || 0, netAmount || amount, date, isImported || false, JSON.stringify(logsDetail || []), startDate || null, endDate || null]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/payments/:id', async (req, res) => {
    const { id } = req.params;
    const { employeeId, amount, hours, deductionCCSS, netAmount, date, isImported, logsDetail, startDate, endDate } = req.body;
    try {
        const result = await db.query(
            'UPDATE payments SET employee_id=$1, amount=$2, hours=$3, deduction_ccss=$4, net_amount=$5, date=$6, is_imported=$7, logs_detail=$8, start_date=$9, end_date=$10 WHERE id=$11 RETURNING *',
            [employeeId, amount, hours, deductionCCSS, netAmount, date, isImported, JSON.stringify(logsDetail || []), startDate, endDate, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/payments/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM payments WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Generic WhatsApp Send ---
app.post('/api/whatsapp/send', async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'Phone and message are required' });

    try {
        await sendWhatsAppMessage(phone, message);
        res.json({ success: true, messageSent: message });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// La ruta /api/employee-auth estaba duplicada, se mantiene una sola instancia.

// --- Webhook WhatsApp (Evolution API) ---
app.post('/api/webhook/whatsapp', async (req, res) => {
    try {
        const { event, data } = req.body;
        console.log(`📩 Webhook recibido: ${event}`);

        if (event === 'MESSAGES_UPSERT') {
            const message = data.message;
            const remoteJid = data.key.remoteJid;
            const fromMe = data.key.fromMe;
            const pushName = data.pushName;

            // Extraer texto del mensaje (soporta texto simple y respuesta con texto)
            const text = message.conversation ||
                (message.extendedTextMessage && message.extendedTextMessage.text) ||
                "";

            if (!fromMe && text) {
                console.log(`💬 Mensaje de ${pushName} (${remoteJid}): ${text}`);

                // Aquí se puede implementar lógica de respuesta automática o 
                // procesamiento de comandos para los empleados.
            }
        }

        res.status(200).json({ status: 'received' });
    } catch (err) {
        console.error('❌ Error en webhook:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Mantenimiento ---
app.delete('/api/maintenance/clear-all', async (req, res) => {
    const { target } = req.query; // 'logs', 'payments', 'employees', 'all'
    try {
        if (target === 'logs') {
            await db.query('DELETE FROM logs');
        } else if (target === 'payments') {
            await db.query('DELETE FROM payments');
        } else if (target === 'employees') {
            await db.query('DELETE FROM employees');
        } else if (target === 'all') {
            await db.query('DELETE FROM logs');
            await db.query('DELETE FROM payments');
            await db.query('DELETE FROM employees');
        } else {
            return res.status(400).json({ error: 'Objetivo de limpieza no válido' });
        }
        res.json({ success: true, message: `Limpieza de ${target} completada` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor backend de Tom Tom Wok corriendo en puerto ${PORT}`);
});
