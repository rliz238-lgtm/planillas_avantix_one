require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const nodemailer = require('nodemailer');
const multer = require('multer');
const db = require('./db');

const app = express();
// Puerto 80 para producción en Easypanel
// Última actualización SaaS: 2026-01-30 00:22 (CheckAuth Fix)
const PORT = process.env.PORT || 80;

// --- CONFIGURACIÓN DE MULTER (Subida de Logos) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'img', 'logos');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const businessId = req.headers['x-business-id'] || 'unknown';
        cb(null, `logo_${businessId}_${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB Limit
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|svg|webp/;
        const isExt = allowed.test(path.extname(file.originalname).toLowerCase());
        const isMime = allowed.test(file.mimetype);
        if (isExt && isMime) return cb(null, true);
        cb(new Error('Solo se permiten imágenes (JPG, PNG, SVG, WEBP)'));
    }
});

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

// --- Middleware de Multi-tenancy y Roles ---
const checkAuth = async (req, res, next) => {
    const businessId = req.headers['x-business-id'];
    const role = req.headers['x-user-role'];

    // El Super Admin puede no tener business_id asociado directamente en algunos contextos
    if (!businessId && role !== 'super_admin') {
        return res.status(401).json({ error: 'Empresa no identificada' });
    }

    if (businessId && role !== 'super_admin') {
        try {
            const biz = await db.query('SELECT status, expires_at FROM businesses WHERE id = $1', [businessId]);
            if (biz.rows.length > 0) {
                const b = biz.rows[0];
                if (b.status === 'Suspended') return res.status(403).json({ error: 'Cuenta suspendida por administración.' });
                if (b.expires_at && new Date(b.expires_at) < new Date()) {
                    return res.status(403).json({ error: 'Suscripción vencida. Favor renovar.' });
                }
            }
        } catch (e) {
            console.error('CheckAuth Error:', e);
        }
    }

    req.businessId = businessId;
    req.userRole = role;
    next();
};

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
app.get('/api/users', checkAuth, async (req, res) => {
    try {
        let query = `
            SELECT u.id, u.username, u.name, u.role, u.created_at, b.name as business_name 
            FROM users u 
            LEFT JOIN businesses b ON u.business_id = b.id 
        `;
        let params = [];

        if (req.userRole !== 'super_admin') {
            query += 'WHERE u.business_id = $1 ';
            params.push(req.businessId);
        }

        query += 'ORDER BY u.username ASC';
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', checkAuth, async (req, res) => {
    const { username, password, name, role } = req.body;
    try {
        // Validación de seguridad: solo un super_admin puede crear otro super_admin
        const finalRole = (role === 'super_admin' && req.userRole !== 'super_admin') ? 'editor' : (role || 'editor');

        const result = await db.query(
            'INSERT INTO users (username, password, name, role, business_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, name, role',
            [username, password, name, finalRole, req.businessId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', checkAuth, async (req, res) => {
    const { id } = req.params;
    const { username, password, name, role } = req.body;
    try {
        let query = 'UPDATE users SET username=$1, name=$2';
        let params = [username, name];
        let paramIdx = 3;

        if (password) {
            query += `, password=$${paramIdx++}`;
            params.push(password);
        }

        if (role) {
            query += `, role=$${paramIdx++}`;
            params.push(role);
        }

        query += ` WHERE id=$${paramIdx++} AND (business_id=$${paramIdx} OR $${paramIdx + 1}='super_admin')`;
        params.push(id, req.businessId, req.userRole);

        const result = await db.query(query + ' RETURNING id, username, name, role', params);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', checkAuth, async (req, res) => {
    try {
        await db.query('DELETE FROM users WHERE id = $1 AND (business_id = $2 OR $3 = \'super_admin\')', [req.params.id, req.businessId, req.userRole]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Authentication ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await db.query(
            'SELECT u.*, b.name as business_name, b.logo_url, b.cycle_type, b.default_overtime_multiplier, b.theme_preference FROM users u LEFT JOIN businesses b ON u.business_id = b.id WHERE u.username = $1 AND u.password = $2',
            [username, password]
        );
        if (result.rows.length > 0) {
            const user = result.rows[0];
            res.json({
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                business_id: user.business_id,
                business_name: user.business_name,
                logo_url: user.logo_url,
                cycle_type: user.cycle_type,
                default_overtime_multiplier: user.default_overtime_multiplier,
                theme_preference: user.theme_preference || 'dark'
            });
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
app.get('/api/employees', checkAuth, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM employees WHERE business_id = $1 ORDER BY name ASC', [req.businessId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/employees', checkAuth, async (req, res) => {
    const { name, cedula, phone, email, pin, position, hourlyRate, status, startDate, endDate, applyCCSS, overtimeThreshold, overtimeMultiplier, enableOvertime, salaryHistory } = req.body;

    if (!name || !hourlyRate || !startDate) {
        return res.status(400).json({ error: 'Faltan campos obligatorios: name, hourlyRate o startDate' });
    }

    try {
        const result = await db.query(
            'INSERT INTO employees (name, cedula, phone, email, pin, position, hourly_rate, status, start_date, end_date, apply_ccss, overtime_threshold, overtime_multiplier, enable_overtime, salary_history, business_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *',
            [name, cedula, phone, email, pin, position, hourlyRate, status || 'Active', startDate, endDate || null, applyCCSS || false, overtimeThreshold || 48, overtimeMultiplier || 1.5, enableOvertime !== false, JSON.stringify(salaryHistory || []), req.businessId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error("POST /api/employees error:", err.message);
        res.status(500).json({ error: "No se pudo crear el empleado: " + err.message });
    }
});

app.put('/api/employees/:id', checkAuth, async (req, res) => {
    const { id } = req.params;
    const { name, cedula, phone, email, pin, position, hourlyRate, status, startDate, endDate, applyCCSS, overtimeThreshold, overtimeMultiplier, enable_overtime, salaryHistory } = req.body;
    try {
        const result = await db.query(
            'UPDATE employees SET name=$1, cedula=$2, phone=$3, email=$4, pin=$5, position=$6, hourly_rate=$7, status=$8, start_date=$9, end_date=$10, apply_ccss=$11, overtime_threshold=$12, overtime_multiplier=$13, enable_overtime=$14, salary_history=$15 WHERE id=$16 AND business_id=$17 RETURNING *',
            [name, cedula, phone, email, pin, position, hourlyRate, status, startDate, endDate, applyCCSS, overtimeThreshold, overtimeMultiplier, enable_overtime, JSON.stringify(salaryHistory || []), id, req.businessId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/employees/:id', checkAuth, async (req, res) => {
    try {
        await db.query('DELETE FROM employees WHERE id = $1 AND business_id = $2', [req.params.id, req.businessId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Logs ---
app.get('/api/logs', checkAuth, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM logs WHERE business_id = $1 ORDER BY date DESC', [req.businessId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/logs', checkAuth, async (req, res) => {
    const { employeeId, date, hours, timeIn, timeOut, isImported, isDoubleDay, deductionHours } = req.body;

    if (!employeeId || isNaN(employeeId)) {
        return res.status(400).json({ error: 'ID de empleado inválido o faltante' });
    }
    if (!date || !hours && hours !== 0) {
        return res.status(400).json({ error: 'Faltan campos obligatorios: date o hours' });
    }

    try {
        const result = await db.query(
            'INSERT INTO logs (employee_id, date, hours, time_in, time_out, is_imported, is_double_day, deduction_hours, business_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [employeeId, date, hours, timeIn || null, timeOut || null, isImported || false, isDoubleDay || false, deductionHours || 0, req.businessId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error("POST /api/logs error:", err.message);
        res.status(500).json({ error: "No se pudo registrar la hora: " + err.message });
    }
});

app.delete('/api/logs/:id', checkAuth, async (req, res) => {
    try {
        await db.query('DELETE FROM logs WHERE id = $1 AND business_id = $2', [req.params.id, req.businessId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/logs/:id', checkAuth, async (req, res) => {
    const { id } = req.params;
    const { employeeId, date, hours, timeIn, timeOut, isImported, isPaid, isDoubleDay, deductionHours } = req.body;
    try {
        const result = await db.query(
            'UPDATE logs SET employee_id=$1, date=$2, hours=$3, time_in=$4, time_out=$5, is_imported=$6, is_paid=$7, is_double_day=$8, deduction_hours=$9 WHERE id=$10 AND business_id=$11 RETURNING *',
            [employeeId, date, hours, timeIn, timeOut, isImported, isPaid, isDoubleDay, deductionHours, id, req.businessId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/logs/employee/:employeeId', checkAuth, async (req, res) => {
    try {
        await db.query('DELETE FROM logs WHERE employee_id = $1 AND business_id = $2', [req.params.employeeId, req.businessId]);
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

// --- Email Send (Nodemailer) ---
async function sendEmailMessage(to, subject, text, html) {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465', // true for 465, false for others
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    const info = await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: to,
        subject: subject,
        text: text,
        html: html
    });

    console.log(`✅ Correo enviado a ${to}: ${info.messageId}`);
    return info;
}

app.post('/api/logs/batch', checkAuth, async (req, res) => {
    const { employeeId, logs } = req.body;

    if (!employeeId || !logs || !Array.isArray(logs)) {
        return res.status(400).json({ error: 'Datos de batch inválidos' });
    }

    try {
        // 1. Obtener datos del empleado y verificar pertenencia a empresa
        const empRes = await db.query('SELECT * FROM employees WHERE id = $1 AND business_id = $2', [employeeId, req.businessId]);
        if (empRes.rows.length === 0) return res.status(404).json({ error: 'Empleado no encontrado o no pertenece a su empresa' });
        const emp = empRes.rows[0];

        let totalH = 0;
        let totalAmt = 0;
        let summaryDetails = "";

        await db.query('BEGIN');

        for (const log of logs) {
            const { date, hours, timeIn, timeOut, isDoubleDay, deductionHours } = log;
            await db.query(
                'INSERT INTO logs (employee_id, date, hours, time_in, time_out, is_imported, is_double_day, deduction_hours, business_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                [employeeId, date, hours, timeIn, timeOut, false, isDoubleDay || false, deductionHours || 0, req.businessId]
            );

            const h = parseFloat(hours);
            totalH += h;
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

        if (emp.email) {
            const subject = `Resumen de Planilla - ${emp.name}`;
            const messagePlain = `REGISTRO DE HORAS TTW\n\nEmpleado: ${emp.name}\nTotal Horas: ${totalH.toFixed(1)}h\nMonto Est.: ₡${Math.round(totalAmt).toLocaleString()}\n\nDETALLE:\n${summaryDetails}`;

            const messageHtml = `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                    <h2 style="color: #6366f1; margin-top: 0;">Resumen de Horas TTW</h2>
                    <p><strong>Empleado:</strong> ${emp.name}</p>
                    <p><strong>Total Horas:</strong> ${totalH.toFixed(1)}h</p>
                    <p><strong>Monto Estimado:</strong> <span style="font-size: 1.2rem; color: #10b981; font-weight: bold;">₡${Math.round(totalAmt).toLocaleString()}</span></p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <h3 style="margin-bottom: 10px;">Detalle:</h3>
                    <pre style="background: #f9fafb; padding: 15px; border-radius: 4px; white-space: pre-wrap;">${summaryDetails}</pre>
                    <p style="font-size: 0.8rem; color: #6b7280; margin-top: 30px;">Este es un mensaje automático generado por Avantix SaaS.</p>
                </div>
            `;

            try {
                await sendEmailMessage(emp.email, subject, messagePlain, messageHtml);
                return res.json({ success: true, count: logs.length, emailSent: true });
            } catch (emailErr) {
                console.error("❌ Error enviando email:", emailErr.message);
                // No fallamos el registro si el email falla, pero avisamos
                return res.json({ success: true, count: logs.length, emailSent: false, emailError: emailErr.message });
            }
        } else if (emp.phone) {
            // Fallback to WhatsApp if no email but phone exists (optional, keeping it as fallback for now or removing as per user request)
            // The user said "no por WhatsApp", so I'll comment this out or just skip it if email is missing.
            console.log(`⚠️ Empleado ${emp.name} no tiene correo. No se envió notificación.`);
        }

        res.json({ success: true, count: logs.length });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error("❌ Error en batch logs:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- Pagos ---
app.get('/api/payments', checkAuth, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM payments WHERE business_id = $1 ORDER BY date DESC', [req.businessId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/payments', checkAuth, async (req, res) => {
    const { employeeId, amount, hours, deductionCCSS, netAmount, date, isImported, logsDetail, startDate, endDate } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO payments (employee_id, amount, hours, deduction_ccss, net_amount, date, is_imported, logs_detail, start_date, end_date, business_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
            [employeeId, amount, hours || 0, deductionCCSS || 0, netAmount || amount, date, isImported || false, JSON.stringify(logsDetail || []), startDate || null, endDate || null, req.businessId]
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
app.delete('/api/maintenance/clear-all', checkAuth, async (req, res) => {
    const { target } = req.query;
    try {
        if (target === 'logs') {
            await db.query('DELETE FROM logs WHERE business_id = $1', [req.businessId]);
        } else if (target === 'payments') {
            await db.query('DELETE FROM payments WHERE business_id = $1', [req.businessId]);
        } else if (target === 'employees') {
            await db.query('DELETE FROM employees WHERE business_id = $1', [req.businessId]);
        } else if (target === 'all') {
            await db.query('DELETE FROM logs WHERE business_id = $1', [req.businessId]);
            await db.query('DELETE FROM payments WHERE business_id = $1', [req.businessId]);
            await db.query('DELETE FROM employees WHERE business_id = $1', [req.businessId]);
        } else {
            return res.status(400).json({ error: 'Objetivo de limpieza no válido' });
        }
        res.json({ success: true, message: `Limpieza de ${target} completada` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Super Admin Endpoints ---
app.get('/api/admin/businesses', checkAuth, async (req, res) => {
    if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Prohibido' });
    try {
        const result = await db.query(`
            SELECT b.*, u.username as owner_username 
            FROM businesses b
            LEFT JOIN users u ON u.business_id = b.id AND u.role = 'owner'
            ORDER BY b.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Business Settings (Owner) ---
app.get('/api/settings/business', checkAuth, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM businesses WHERE id = $1', [req.businessId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/settings/business', checkAuth, async (req, res) => {
    if (req.userRole !== 'owner' && req.userRole !== 'super_admin') return res.status(403).json({ error: 'Prohibido' });
    const { name, cedula_juridica, logo_url, default_overtime_multiplier, cycle_type, theme_preference } = req.body;
    try {
        const result = await db.query(
            'UPDATE businesses SET name=$1, cedula_juridica=$2, logo_url=$3, default_overtime_multiplier=$4, cycle_type=$5, theme_preference=$6 WHERE id=$7 RETURNING *',
            [name, cedula_juridica, logo_url, default_overtime_multiplier, cycle_type, theme_preference || 'dark', req.businessId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings/upload-logo', checkAuth, upload.single('logo'), async (req, res) => {
    if (req.userRole !== 'owner' && req.userRole !== 'super_admin') return res.status(403).json({ error: 'Prohibido' });
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });

    const logoUrl = `/img/logos/${req.file.filename}`;
    try {
        await db.query('UPDATE businesses SET logo_url=$1 WHERE id=$2', [logoUrl, req.businessId]);
        res.json({ success: true, logo_url: logoUrl });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Admin Global Business Management ---
app.get('/api/admin/businesses/:id', checkAuth, async (req, res) => {
    if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Prohibido' });
    try {
        const result = await db.query(`
            SELECT b.*, u.name as owner_name, u.last_name as owner_last_name, u.email as owner_email, u.phone as owner_phone, u.username as owner_username
            FROM businesses b
            LEFT JOIN users u ON u.business_id = b.id AND u.role = 'owner'
            WHERE b.id = $1
        `, [req.params.id]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/businesses/:id', checkAuth, async (req, res) => {
    if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Prohibido' });
    const {
        name, cedula_juridica, status, expires_at, cycle_type, logo_url, theme_preference,
        legal_name, legal_type, country, state, city, district, address, phone, email,
        ownerName, ownerLastName, ownerEmail, ownerPhone, ownerUsername, ownerPassword
    } = req.body;
    try {
        await db.query('BEGIN');

        // Update Business
        const result = await db.query(
            `UPDATE businesses SET
                name=$1, cedula_juridica=$2, status=$3, expires_at=$4, cycle_type=$5,
                legal_name=$6, legal_type=$7, country=$8, state=$9, city=$10,
                district=$11, address=$12, phone=$13, email=$14, logo_url=$15, theme_preference=$16
            WHERE id=$17 RETURNING *`,
            [
                name, cedula_juridica, status, expires_at, cycle_type,
                legal_name, legal_type, country, state, city,
                district, address, phone, email, logo_url, theme_preference || 'dark', req.params.id
            ]
        );

        // Update Owner User
        let userQuery = `UPDATE users SET name=$1, last_name=$2, email=$3, phone=$4`;
        let userParams = [ownerName, ownerLastName, ownerEmail, ownerPhone];

        if (ownerUsername) {
            userQuery += `, username=$${userParams.length + 1}`;
            userParams.push(ownerUsername);
        }
        if (ownerPassword) {
            userQuery += `, password=$${userParams.length + 1}`;
            userParams.push(ownerPassword);
        }

        userQuery += ` WHERE business_id=$${userParams.length + 1} AND role='owner'`;
        userParams.push(req.params.id);

        await db.query(userQuery, userParams);

        await db.query('COMMIT');
        res.json(result.rows[0]);
    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/businesses', checkAuth, async (req, res) => {
    if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Prohibido' });
    const {
        name, cedula_juridica, default_overtime_multiplier, status, cycle_type, expires_at,
        legal_name, legal_type, country, state, city, district, address, phone, email,
        ownerName, ownerLastName, ownerEmail, ownerPhone, ownerUsername, ownerPassword
    } = req.body;
    try {
        await db.query('BEGIN');

        // Create Business
        const busRes = await db.query(
            `INSERT INTO businesses (
                name, cedula_juridica, default_overtime_multiplier, status, cycle_type,
                expires_at, legal_name, legal_type, country, state, city,
                district, address, phone, email, logo_url, theme_preference
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
            [
                name, cedula_juridica, default_overtime_multiplier || 1.5, status || 'Active', cycle_type || 'Weekly',
                expires_at || null, legal_name, legal_type, country, state, city,
                district, address, phone, email, logo_url || null, theme_preference || 'dark'
            ]
        );
        const businessId = busRes.rows[0].id;

        // Create Owner User
        await db.query(
            'INSERT INTO users (username, password, name, last_name, email, phone, role, business_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [ownerUsername, ownerPassword, ownerName, ownerLastName, ownerEmail, ownerPhone, 'owner', businessId]
        );

        await db.query('COMMIT');
        res.json({ id: businessId });
    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/stats', checkAuth, async (req, res) => {
    if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Prohibido' });
    try {
        const [
            businesses,
            activeEmp,
            totalVolume,
            recent7,
            recent30,
            growth,
            volumeTrend,
            statuses,
            countries
        ] = await Promise.all([
            db.query('SELECT COUNT(*) FROM businesses'),
            db.query("SELECT COUNT(*) FROM employees WHERE status = 'Active'"),
            db.query("SELECT SUM(amount) FROM payments"),
            db.query("SELECT COUNT(*) FROM businesses WHERE created_at > NOW() - INTERVAL '7 days'"),
            db.query("SELECT COUNT(*) FROM businesses WHERE created_at > NOW() - INTERVAL '30 days'"),
            db.query("SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as count FROM businesses GROUP BY month ORDER BY month DESC LIMIT 12"),
            db.query("SELECT TO_CHAR(date, 'YYYY-MM') as month, SUM(amount) as total FROM payments GROUP BY month ORDER BY month DESC LIMIT 12"),
            db.query("SELECT status, COUNT(*) FROM businesses GROUP BY status"),
            db.query("SELECT country, COUNT(*) FROM businesses GROUP BY country")
        ]);

        res.json({
            summary: {
                totalBusinesses: parseInt(businesses.rows[0].count),
                activeEmployees: parseInt(activeEmp.rows[0].count),
                totalVolume: parseFloat(totalVolume.rows[0].sum || 0),
                newLast7: parseInt(recent7.rows[0].count),
                newLast30: parseInt(recent30.rows[0].count)
            },
            growth: growth.rows.reverse(),
            volumeTrend: volumeTrend.rows.reverse(),
            distribution: {
                status: statuses.rows,
                country: countries.rows
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Onboarding Flow ---
app.post('/api/onboarding/register', async (req, res) => {
    const {
        businessName, legal_type, legal_name, cedulaJuridica, country, state, city, district, address, email: bizEmail, phone: bizPhone,
        ownerName, ownerLastName, ownerEmail, ownerPhone, username, password
    } = req.body;
    try {
        await db.query('BEGIN');

        // 1. Crear Empresa
        const busRes = await db.query(
            `INSERT INTO businesses (
                name, legal_type, legal_name, cedula_juridica, country, state, city, district, address, email, phone, logo_url, cycle_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
            [businessName, legal_type, legal_name, cedulaJuridica, country, state, city, district, address, bizEmail, bizPhone, req.body.logo_url || null, req.body.cycle_type || 'Weekly']
        );
        const businessId = busRes.rows[0].id;

        // 2. Crear Usuario Owner
        const userRes = await db.query(
            'INSERT INTO users (username, password, name, last_name, email, phone, role, business_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [username, password, ownerName, ownerLastName, ownerEmail, ownerPhone, 'owner', businessId]
        );
        const userId = userRes.rows[0].id;

        await db.query('COMMIT');

        // Retornar datos de sesión para auto-login inmediato
        res.json({
            success: true,
            session: {
                id: userId,
                username: username,
                name: ownerName,
                role: 'owner',
                business_id: businessId,
                business_name: businessName,
                logo_url: logo_url,
                cycle_type: cycle_type,
                theme_preference: theme_preference || 'dark'
            }
        });
    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

// --- Hotmart Webhook Integration ---
app.post('/api/webhooks/hotmart', async (req, res) => {
    const hottok = req.headers['x-hotmart-hottok'];
    const expectedTok = process.env.HOTMART_HOTTOK;

    // 1. Validar Seguridad
    if (!expectedTok || hottok !== expectedTok) {
        console.warn('⚠️ Webhook de Hotmart: Token inválido o no configurado');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = req.body;
    console.log('📦 Hotmart Webhook Payload:', JSON.stringify(payload));

    // Procesar solo si la compra está aprobada (PURCHASE_APPROVED es un evento común)
    // Hotmart puede enviar varios eventos, adaptamos según necesites
    const event = payload.event;

    if (event === 'PURCHASE_APPROVED' || event === 'PURCHASE_COMPLETED' || (payload.data && payload.data.status === 'APPROVED')) {
        const buyer = payload.data ? payload.data.buyer : payload.buyer;
        const product = payload.data ? payload.data.product : payload.product;

        if (!buyer || !buyer.email) {
            return res.status(400).json({ error: 'Noy buyer info in payload' });
        }

        try {
            await db.query('BEGIN');

            const businessName = `Empresa de ${buyer.name || buyer.email}`;
            const username = buyer.email;
            const password = Math.random().toString(36).slice(-8); // Contraseña aleatoria temporal

            // Hotmart: Acceso a un año y 7 dias de prueba gratuita
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 365 + 7);

            // 1. Crear Empresa
            const busRes = await db.query(
                'INSERT INTO businesses (name, status, expires_at) VALUES ($1, $2, $3) RETURNING id',
                [businessName, 'Active', expiresAt]
            );
            const businessId = busRes.rows[0].id;

            // 2. Crear Usuario Owner
            await db.query(
                'INSERT INTO users (username, password, name, role, business_id) VALUES ($1, $2, $3, $4, $5)',
                [username, password, buyer.name || 'Propietario', 'owner', businessId]
            );

            await db.query('COMMIT');

            console.log(`✅ Provisionamiento automático exitoso para: ${buyer.email}. Pass temporal: ${password}`);

            // --- Envío de Notificación Automática vía WhatsApp ---
            const buyerPhone = buyer.phone || (payload.data && payload.data.buyer ? payload.data.buyer.checkout_phone : null);

            if (buyerPhone) {
                const welcomeMsg = `*¡Bienvenido a Avantix One!* 🚀\n\nHola ${buyer.name || 'Propietario'},\n\nTu acceso a la plataforma de planillas ya está listo. Aquí tienes tus credenciales:\n\n*🌐 URL:* https://tu-dominio.com\n*👤 Usuario:* ${username}\n*🔑 Contraseña:* ${password}\n\nTe recomendamos cambiar tu contraseña una vez que ingreses.`;

                try {
                    await sendWhatsAppMessage(buyerPhone, welcomeMsg);
                    console.log(`📲 Credenciales enviadas por WhatsApp a ${buyerPhone}`);
                } catch (wsErr) {
                    console.error(`⚠️ No se pudo enviar el WhatsApp de bienvenida: ${wsErr.message}`);
                }
            } else {
                console.warn(`📢 No se encontró teléfono para enviar credenciales a ${buyer.email}`);
            }

            return res.json({ success: true, message: 'Provisioning complete' });
        } catch (err) {
            await db.query('ROLLBACK');
            console.error('❌ Error en el provisionamiento de Hotmart:', err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Responder 200 para otros eventos para que Hotmart no reintente
    res.json({ received: true });
});

app.listen(PORT, () => {
    console.log(`Servidor backend de Tom Tom Wok corriendo en puerto ${PORT}`);
});
