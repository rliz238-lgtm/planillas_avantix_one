/**
 * Planillas Avantix One - Core Logic
 */

// --- Payroll Global Helpers (Top Level) ---
window._pendingPayrollData = {};
const PayrollHelpers = {
    // Icono minimalista de ojo
    EYE_ICON: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:-2px"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>`,

    showPayrollSuccess: (summary) => {
        const modal = document.getElementById('payroll-success-modal');
        const content = document.getElementById('payroll-success-summary');
        if (modal && content) {
            content.innerHTML = `
                <div style="max-width: 300px; margin: 0 auto;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.8rem; font-size: 0.95rem;">
                        <span style="color: var(--text-muted);">Empleados:</span>
                        <span style="font-weight: 700; color: var(--primary);">${summary.count}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.8rem; font-size: 0.95rem;">
                        <span style="color: var(--text-muted);">Total Horas:</span>
                        <span style="font-weight: 700;">${summary.hours.toFixed(1)}h</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-top: 1px dashed var(--border); pt: 0.8rem; margin-top: 0.8rem; font-size: 1.1rem; padding-top: 0.8rem;">
                        <span style="color: var(--text-muted);">Monto Total:</span>
                        <span style="font-weight: 800; color: var(--success);">₡${Math.round(summary.amount).toLocaleString()}</span>
                    </div>
                </div>
            `;
            modal.showModal();
        }
    },

    showWhatsAppConfirm: (text, type = 'success') => {
        const modal = document.getElementById('whatsapp-confirm-modal');
        const content = document.getElementById('whatsapp-confirm-content');
        const icon = document.getElementById('whatsapp-confirm-icon');
        const title = document.getElementById('whatsapp-confirm-title');
        const subtitle = document.getElementById('whatsapp-confirm-subtitle');

        if (modal && content) {
            content.textContent = text;

            if (type === 'warning') {
                icon.textContent = "⚠️";
                title.textContent = "WhatsApp No Enviado";
                title.style.color = "var(--warning)";
                subtitle.textContent = "Agregue el número de teléfono al empleado para enviar resúmenes automáticos.";
            } else {
                icon.textContent = "✅";
                title.textContent = "WhatsApp Enviado";
                title.style.color = "var(--success)";
                subtitle.textContent = "El resumen se ha enviado correctamente.";
            }

            modal.showModal();
        }
    },

    sendServerWhatsApp: async (phone, text) => {
        if (!phone) {
            return PayrollHelpers.showWhatsAppConfirm(text, 'warning');
        }
        Storage.showLoader(true, 'Enviando WhatsApp...');
        try {
            const res = await apiFetch('/api/whatsapp/send', {
                method: 'POST',
                body: JSON.stringify({ phone, message: text })
            });
            const result = await res.json();
            if (result.success) {
                PayrollHelpers.showWhatsAppConfirm(result.messageSent);
            } else {
                alert("Error enviando WhatsApp: " + (result.error || "Desconocido"));
            }
        } catch (e) {
            alert("Error de conexión al enviar WhatsApp");
        } finally {
            Storage.showLoader(false);
        }
    },

    showPayrollDetail: (empId) => {
        const data = window._pendingPayrollData[empId];
        if (!data) return alert("Error: Datos no encontrados. Recargue la página.");
        const modal = document.getElementById('payroll-detail-modal');
        const body = document.getElementById('payroll-detail-body');
        document.getElementById('payroll-detail-title').textContent = `Detalle: ${data.name}`;
        document.getElementById('payroll-detail-info').innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div><strong>Pendiente:</strong> ₡${Math.round(data.net).toLocaleString()}</div>
                <div><strong>Horas:</strong> ${data.hours.toFixed(1)}h</div>
            </div>`;
        body.innerHTML = data.logs.sort((a, b) => new Date(b.date) - new Date(a.date)).map(l => {
            const isDouble = !!l.is_double_day;
            const logNet = l.net || (parseFloat(l.hours) * (parseFloat(employees.find(e => e.id == l.employee_id)?.hourly_rate || 0)));
            return `
            <tr>
                <td style="white-space:nowrap">${l.date.split('T')[0]}</td>
                <td>${l.time_in || '--'}</td><td>${l.time_out || '--'}</td>
                <td>
                    <div style="font-weight:700">${parseFloat(l.hours).toFixed(1)}h</div>
                </td>
                <td style="text-align:center">${isDouble ? '✅' : '--'}</td>
                <td style="text-align:center">${l.deduction_hours > 0 ? l.deduction_hours + 'h' : '--'}</td>
                <td style="display:flex; gap:5px; align-items:center;">
                    <span style="color:var(--success); font-weight:600;">₡${Math.round(logNet).toLocaleString()}</span>
                    <button class="btn btn-primary" style="padding:4px 8px; font-size:0.75rem;" onclick="PayrollHelpers.payLine(${l.id},${l.employee_id},'${l.date.split('T')[0]}',${logNet},${l.hours},${l.deduction || 0})" title="Pagar este día únicamente">💰</button>
                    <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem;" onclick="window.editLogDetailed(${l.id})" title="Editar horas, día doble o rebajos">✏️</button>
                    <button class="btn btn-whatsapp" style="padding:4px 8px; font-size:0.75rem;" onclick="PayrollHelpers.shareWhatsAppLine(${l.employee_id}, '${l.date.split('T')[0]}', ${l.hours}, ${logNet}, '${l.time_in}', '${l.time_out}')" title="Enviar comprobante de este día por WhatsApp">✉️</button>
                    <button class="btn btn-danger" style="padding:4px 8px; font-size:0.75rem;" onclick="window.deleteLog(${l.id})" title="Eliminar este día">🗑️</button>
                </td>
            </tr>`;
        }).join('');
        modal.showModal();
    },
    editLogLine: async (id) => {
        const logs = await Storage.get('logs');
        const l = logs.find(x => x.id == id);
        if (!l) return;
        const newHours = prompt("Ingrese la nueva cantidad de horas:", l.hours);
        if (newHours === null) return;
        Storage.showLoader(true, 'Actualizando horas...');
        await Storage.update('logs', id, { ...l, hours: parseFloat(newHours) });
        Storage.showLoader(false);
        const modal = document.getElementById('payroll-detail-modal');
        if (modal) modal.close();
        App.renderView('payroll');
    },
    shareWhatsAppLine: (empId, date, hours, amount, tIn, tOut) => {
        const employees = JSON.parse(localStorage.getItem('ttw_temp_employees') || '[]'); // Fallback or assume available
        // Better: Fetch it from the pending data if available
        const d = window._pendingPayrollData[empId];
        const phone = d ? d.phone : '';
        const name = d ? d.name : 'Empleado';
        const day = new Date(date + 'T00:00:00').toLocaleString('es-ES', { weekday: 'short' }).toUpperCase();
        const text = `*REGISTRO TTW*\n\n*Emp:* ${name}\n*Día:* ${day} ${date}\n*Horario:* ${tIn || '--'} - ${tOut || '--'}\n*Horas:* ${parseFloat(hours).toFixed(1)}h\n*Monto:* ₡${Math.round(amount).toLocaleString()}`;
        PayrollHelpers.sendServerWhatsApp(phone, text);
    },
    payEmployeeGroup: async (empId) => {
        const d = window._pendingPayrollData[empId];
        if (!d || !confirm(`¿Pagar ₡${Math.round(d.net).toLocaleString()} a ${d.name}?`)) return;
        Storage.showLoader(true, 'Pagando...');
        try {
            const res = await Storage.add('payments', { employeeId: parseInt(empId), date: Storage.getLocalDate(), amount: d.net, hours: d.hours, deductionCCSS: d.deduction, netAmount: d.net, startDate: d.startDate, endDate: d.endDate, logsDetail: d.logs, isImported: false });
            if (res.success) {
                for (const l of d.logs) await Storage.delete('logs', l.id);
                PayrollHelpers.showPayrollSuccess({ count: 1, amount: d.net, hours: d.hours });
                App.renderView('payroll');
            }
        } catch (e) { alert("Error"); } finally { Storage.showLoader(false); }
    },
    payLine: async (id, empId, date, amt, hrs, ded) => {
        if (!confirm("¿Pagar este día?")) return;
        Storage.showLoader(true, 'Pagando día...');
        try {
            const logs = await Storage.get('logs');
            const res = await Storage.add('payments', { employeeId: parseInt(empId), date: Storage.getLocalDate(), amount: amt, hours: hrs, deductionCCSS: ded, netAmount: amt, startDate: date, endDate: date, logsDetail: [logs.find(x => x.id == id)], isImported: false });
            if (res.success) { await Storage.delete('logs', id); document.getElementById('payroll-detail-modal').close(); App.renderView('payroll'); }
        } catch (e) { alert("Error"); } finally { Storage.showLoader(false); }
    },
    shareWhatsAppPending: (empId) => {
        const d = window._pendingPayrollData[empId]; if (!d) return;
        let details = "";
        if (d.logs && d.logs.length > 0) {
            details = "\n\n*DETALLE DE DÍAS:*\n";
            d.logs.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(l => {
                const day = new Date(l.date + 'T00:00:00').toLocaleString('es-ES', { weekday: 'short' }).toUpperCase();
                details += `• ${day} ${l.date.split('T')[0]}: ${l.time_in || '--'} - ${l.time_out || '--'} (${parseFloat(l.hours).toFixed(1)}h) → ₡${Math.round(l.net).toLocaleString()}\n`;
            });
        }
        const text = `*RESUMEN PAGO - AVANTIX ONE*\n\n*Empleado:* ${d.name}\n*Total Neto:* ₡${Math.round(d.net).toLocaleString()}\n*Total Horas:* ${d.hours.toFixed(1)}h${details}`;
        PayrollHelpers.sendServerWhatsApp(d.phone, text);
    },
    showPaymentHistoryDetail: async (paymentId) => {
        const payments = await Storage.get('payments'), employees = await Storage.get('employees');
        const p = payments.find(x => x.id == paymentId); if (!p) return;
        const emp = employees.find(e => e.id == p.employee_id);
        const modal = document.getElementById('payroll-detail-modal'), body = document.getElementById('payroll-detail-body');
        document.getElementById('payroll-detail-title').textContent = `Detalle Pago: ${emp ? emp.name : '??'}`;
        document.getElementById('payroll-detail-info').innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div><strong>Monto:</strong> ₡${Math.round(p.amount).toLocaleString()}</div>
                <div><strong>Fecha:</strong> ${p.date.split('T')[0]}</div>
            </div>`;
        body.innerHTML = (p.logs_detail || []).map((l, index) => {
            const day = new Date(l.date + 'T00:00:00').toLocaleString('es-ES', { weekday: 'short' }).toUpperCase();
            const logNet = l.net || (parseFloat(l.hours) * (emp ? parseFloat(emp.hourly_rate) : 0));
            return `
            <tr>
                <td style="white-space:nowrap">${l.date.split('T')[0]}</td>
                <td>${l.time_in || '--'}</td>
                <td>${l.time_out || '--'}</td>
                <td>
                    <div style="font-weight:600">${parseFloat(l.hours).toFixed(1)}h</div>
                </td>
                <td style="text-align:center">${l.is_double_day ? '✅' : '--'}</td>
                <td style="text-align:center">${l.deduction_hours > 0 ? l.deduction_hours + 'h' : '--'}</td>
                <td style="display:flex; gap:5px; align-items:center;">
                    <span style="font-weight:600">₡${Math.round(logNet).toLocaleString()}</span>
                    <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem;" onclick="PayrollHelpers.editPaidLogLine(${p.id}, ${index})" title="Editar este día pagado">✏️</button>
                    <button class="btn btn-whatsapp" style="padding:4px 8px; font-size:0.75rem;" onclick="PayrollHelpers.shareWhatsAppLine(${emp ? emp.id : 0}, '${l.date.split('T')[0]}', ${l.hours}, ${logNet}, '${l.time_in}', '${l.time_out}')" title="Re-enviar comprobante por WhatsApp">✉️</button>
                </td>
            </tr>`;
        }).join('');
        modal.showModal();
    },

    editPaidLogLine: async (paymentId, logIndex) => {
        const payments = await Storage.get('payments');
        const p = payments.find(x => x.id == paymentId);
        if (!p || !p.logs_detail[logIndex]) return;

        const l = p.logs_detail[logIndex];
        const editLogModal = document.getElementById('edit-log-modal');
        const editLogForm = document.getElementById('edit-log-form');

        editLogForm.logId.value = `paid_${paymentId}_${logIndex}`;
        editLogForm.date.value = l.date.split('T')[0];
        editLogForm.timeIn.value = l.time_in || '08:00';
        editLogForm.timeOut.value = l.time_out || '17:00';
        editLogForm.isDoubleDay.checked = !!l.is_double_day;
        editLogForm.deductionHours.value = l.deduction_hours || 0;

        // Custom submit for paid logs
        const originalSubmit = editLogForm.onsubmit;
        editLogForm.onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(editLogForm);
            const tIn = formData.get('timeIn');
            const tOut = formData.get('timeOut');
            const isDouble = editLogForm.isDoubleDay.checked;
            const deduction = parseFloat(formData.get('deductionHours') || 0);

            const start = new Date(`2000-01-01T${tIn}`);
            const end = new Date(`2000-01-01T${tOut}`);
            let diff = (end - start) / 1000 / 60 / 60;
            if (diff < 0) diff += 24;
            diff = Math.max(0, diff - deduction);
            const rawHours = diff;
            if (isDouble) diff *= 2;

            const employees = await Storage.get('employees');
            const emp = employees.find(e => e.id == p.employee_id);
            const rate = emp ? parseFloat(emp.hourly_rate) : 0;
            const logNet = diff * rate;

            // Update log_detail entry
            p.logs_detail[logIndex] = {
                ...l,
                date: formData.get('date'),
                time_in: tIn,
                time_out: tOut,
                is_double_day: isDouble,
                deduction_hours: deduction,
                hours: diff.toFixed(2),
                net: logNet
            };

            // Recalculate payment totals
            const totalHours = p.logs_detail.reduce((s, log) => s + parseFloat(log.hours), 0);
            const totalNet = p.logs_detail.reduce((s, log) => s + (log.net || (parseFloat(log.hours) * rate)), 0);

            Storage.showLoader(true, 'Actualizando pago...');
            await Storage.update('payments', paymentId, {
                ...p,
                hours: totalHours,
                amount: totalNet,
                net_amount: totalNet,
                logs_detail: p.logs_detail
            });
            Storage.showLoader(false);
            editLogModal.close();

            // Restore original submit and refresh
            editLogForm.onsubmit = originalSubmit;
            const detailModal = document.getElementById('payroll-detail-modal');
            if (detailModal && detailModal.open) detailModal.close();
            App.renderView('payroll');
        };

        editLogModal.showModal();
    }
};
window.PayrollHelpers = PayrollHelpers;

// --- Utilities ---
window.togglePassword = (id) => {
    const el = document.getElementById(id);
    if (!el) {
        // Buscamos por nombre si no hay ID
        const input = document.querySelector(`input[name="${id}"]`);
        if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
        }
    } else {
        el.type = el.type === 'password' ? 'text' : 'password';
    }
};

// --- Data Persistence Layer (API) ---
const apiFetch = async (url, options = {}) => {
    const session = JSON.parse(localStorage.getItem('ttw_session_v2026') || '{}');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    // Si enviamos archivos (FormData), dejamos que el navegador ponga el Content-Type con el boundary
    if (options.body instanceof FormData) {
        delete headers['Content-Type'];
    }

    if (session.business_id) headers['X-Business-ID'] = session.business_id;
    if (session.role) headers['X-User-Role'] = session.role;

    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        // No alertar ni desloguear si es el refresh inicial de business settings
        // o si ya estamos en la pantalla de login.
        if (url !== '/api/settings/business' && !url.includes('/api/login')) {
            alert("Sesión expirada o no autorizada");
            Auth.logout();
        }
    }
    return response;
};

const Storage = {
    SCHEMA: {
        employees: 'employees',
        logs: 'logs',
        payments: 'payments',
        settings: 'settings',
        users: 'users'
    },

    getLocalDate(d = new Date()) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    },

    showLoader(show, text = 'Procesando...', progress = 0) {
        const overlay = document.getElementById('loader-overlay');
        const textEl = document.getElementById('loader-text');
        const progressEl = document.getElementById('loader-progress');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
            if (textEl) textEl.innerText = text;
            if (progressEl) progressEl.style.width = `${progress}%`;
        }
    },

    async get(key) {
        try {
            const response = await apiFetch(`/api/${this.SCHEMA[key]}?_t=${Date.now()}`);
            if (!response.ok) throw new Error('Error al obtener datos');
            return await response.json();
        } catch (err) {
            console.error(err);
            return [];
        }
    },

    async add(key, data) {
        try {
            const response = await apiFetch(`/api/${this.SCHEMA[key]}`, {
                method: 'POST',
                body: JSON.stringify(data)
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                console.error(`API Error (${key}):`, result.error || 'Unknown error');
                return { error: result.error || 'Error al guardar datos', success: false };
            }
            return { ...result, success: true };
        } catch (err) {
            console.error(`Fetch Error (${key}):`, err);
            return { error: err.message, success: false };
        }
    },

    async update(key, id, updates) {
        try {
            const response = await apiFetch(`/api/${this.SCHEMA[key]}/${id}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });
            if (!response.ok) throw new Error('Error al actualizar dato');
            return await response.json();
        } catch (err) {
            console.error(err);
            return null;
        }
    },

    async delete(key, id) {
        try {
            const response = await apiFetch(`/api/${this.SCHEMA[key]}/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Error al eliminar dato');
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    },

    async deleteLogsByEmployee(employeeId) {
        try {
            const response = await apiFetch(`/api/logs/employee/${employeeId}`, {
                method: 'DELETE'
            });
            return response.ok;
        } catch (err) {
            console.error(err);
            return false;
        }
    }
};

// --- Authentication Layer ---
const Auth = {
    SCHEMA: 'ttw_session_v2026',

    async login(username, password) {
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                const user = await response.json();
                localStorage.setItem(this.SCHEMA, JSON.stringify({
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    role: user.role,
                    business_id: user.business_id,
                    business_name: user.business_name || 'Avantix SaaS',
                    logo_url: user.logo_url,
                    theme_preference: user.theme_preference || 'dark',
                    cycle_type: user.cycle_type || 'Weekly',
                    default_overtime_multiplier: user.default_overtime_multiplier || 1.5,
                    loginTime: Date.now()
                }));
                return true;
            }
            return false;
        } catch (err) {
            console.error('Error en login:', err);
            return false;
        }
    },

    async employeeAuth(pin) {
        try {
            const response = await fetch('/api/employee-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin })
            });

            if (response.ok) {
                const emp = await response.json();
                localStorage.setItem(this.SCHEMA, JSON.stringify({
                    id: emp.id,
                    name: emp.name,
                    role: 'employee',
                    business_id: emp.business_id,
                    loginTime: Date.now()
                }));
                return true;
            }
            return false;
        } catch (err) {
            console.error('Error en auth empleado:', err);
            return false;
        }
    },

    logout() {
        localStorage.removeItem(this.SCHEMA);
        location.reload();
    },

    getUser() {
        const session = localStorage.getItem(this.SCHEMA);
        return session ? JSON.parse(session) : null;
    },

    isAuthenticated() {
        return !!this.getUser();
    }
};

// --- View Engine ---
const App = {
    currentView: 'dashboard',

    async init() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('action') === 'register') {
            document.body.classList.add('onboarding-fullscreen');
            const landingView = document.getElementById('landing-view');
            const loginView = document.getElementById('login-view');
            const appElem = document.getElementById('app');
            if (landingView) landingView.style.display = 'none';
            if (loginView) loginView.style.display = 'none';
            if (appElem) appElem.style.display = 'flex';
            this.renderView('registration');

            // Auto-fill if params provided
            setTimeout(() => {
                const nameInput = document.querySelector('input[name="ownerName"]');
                const lastNameInput = document.querySelector('input[name="ownerLastName"]');
                const emailInput = document.querySelector('input[name="ownerEmail"]');
                if (nameInput && urlParams.get('name')) nameInput.value = urlParams.get('name');
                if (lastNameInput && urlParams.get('lastname')) lastNameInput.value = urlParams.get('lastname');
                if (emailInput && urlParams.get('email')) {
                    emailInput.value = urlParams.get('email');
                    emailInput.dispatchEvent(new Event('input'));
                }
            }, 500);
            return;
        }

        if (!Auth.isAuthenticated()) {
            this.renderLanding();
            return;
        }

        let user = Auth.getUser();

        // --- Refresh Session from Server (Admin/Owner only) ---
        if (user.role !== 'employee') {
            try {
                const res = await apiFetch('/api/settings/business');
                const freshBiz = await res.json();
                if (freshBiz && !freshBiz.error) {
                    user = {
                        ...user,
                        business_name: freshBiz.name,
                        logo_url: freshBiz.logo_url,
                        theme_preference: freshBiz.theme_preference,
                        cycle_type: freshBiz.cycle_type,
                        default_overtime_multiplier: freshBiz.default_overtime_multiplier
                    };
                    localStorage.setItem(Auth.SCHEMA, JSON.stringify(user));
                }
            } catch (err) {
                console.warn("No se pudo refrescar la sesión desde el servidor:", err);
            }
        }

        // --- Apply Theme Preference ---
        if (user.theme_preference) {
            document.documentElement.setAttribute('data-theme', user.theme_preference);
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
        }

        console.log("Sesión activa:", user.username, "Rol:", user.role);
        const appElem = document.getElementById('app');
        const loginView = document.getElementById('login-view');
        if (appElem) appElem.style.display = 'flex';
        if (loginView) loginView.style.display = 'none';

        // --- Dynamic Branding ---
        const bizNameDisplay = document.getElementById('sidebar-biz-name');
        const loginBizName = document.getElementById('login-biz-name');
        const logoContainer = document.querySelector('.sidebar .logo');

        if (bizNameDisplay) bizNameDisplay.textContent = user.business_name || 'Planillas Avantix One';
        if (loginBizName) loginBizName.textContent = user.business_name || 'Planillas Avantix One';

        if (logoContainer) {
            // Eliminar imagen anterior si existe para evitar duplicados o rotas
            logoContainer.querySelectorAll('img').forEach(img => img.remove());

            if (user.logo_url && user.logo_url !== 'null' && user.logo_url !== 'undefined' && user.logo_url !== '') {
                const img = document.createElement('img');
                img.src = user.logo_url;
                img.alt = user.business_name || 'Logo';
                img.style.maxHeight = '80px';
                img.style.width = 'auto';
                img.style.marginBottom = '2rem';
                img.onerror = () => {
                    img.style.display = 'none';
                    if (bizNameDisplay) bizNameDisplay.style.display = 'block';
                };
                logoContainer.prepend(img);
                if (bizNameDisplay) bizNameDisplay.style.display = 'none';
            } else {
                if (bizNameDisplay) bizNameDisplay.style.display = 'block';
            }
        }

        const userNameDisplay = document.querySelector('.username');
        if (userNameDisplay) userNameDisplay.textContent = user.name + (user.role === 'employee' ? ' (Empleado)' : user.role === 'super_admin' ? ' (Super Admin)' : '');

        // --- Role-based UI Adjustments ---
        if (user.role === 'employee') {
            document.querySelectorAll('.nav-item').forEach(btn => {
                const view = btn.dataset.view;
                if (!['calculator', 'profile'].includes(view)) {
                    btn.style.display = 'none';
                }
            });
            this.setupNavigation();
            await this.switchView('calculator');
        } else if (user.role === 'super_admin') {
            document.getElementById('nav-admin-businesses').style.display = 'flex';
            document.getElementById('nav-admin-super-users').style.display = 'flex';
            document.getElementById('nav-admin-stats').style.display = 'flex';
            const divider = document.getElementById('super-admin-divider');
            const label = document.getElementById('super-admin-label');
            if (divider) divider.style.display = 'block';
            if (label) label.style.display = 'block';

            this.setupNavigation();
            await this.switchView('adminStats');
        } else {
            // Owner/Editor
            this.setupNavigation();
            await this.switchView('dashboard');
        }

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.onclick = () => Auth.logout();
        }

        this.setupMobileMenu();
        this.setupEmployeeModal();
        this.setupThemeToggle();
    },

    setupThemeToggle() {
        const btn = document.getElementById('header-theme-toggle');
        const sun = document.getElementById('theme-icon-sun');
        const moon = document.getElementById('theme-icon-moon');
        if (!btn) return;

        const updateIcons = (theme) => {
            if (theme === 'light') {
                sun.style.display = 'none';
                moon.style.display = 'inline';
            } else {
                sun.style.display = 'inline';
                moon.style.display = 'none';
            }
        };

        const user = Auth.getUser();
        updateIcons(user.theme_preference || 'dark');

        btn.onclick = async () => {
            const current = document.documentElement.getAttribute('data-theme') || 'dark';
            const next = current === 'dark' ? 'light' : 'dark';

            document.documentElement.setAttribute('data-theme', next);
            updateIcons(next);

            // Persistir en servidor si es admin
            if (user.role === 'owner' || user.role === 'super_admin') {
                try {
                    const session = Auth.getUser();
                    const res = await apiFetch('/api/settings/business', {
                        method: 'PUT',
                        body: JSON.stringify({ ...session, theme_preference: next })
                    });
                    const result = await res.json();
                    if (result.id) {
                        localStorage.setItem(Auth.SCHEMA, JSON.stringify({ ...session, theme_preference: next }));
                    }
                } catch (e) { console.error("Error saving theme", e); }
            } else {
                // Para empleados solo local
                const session = Auth.getUser();
                localStorage.setItem(Auth.SCHEMA, JSON.stringify({ ...session, theme_preference: next }));
            }
        };
    },

    setupEmployeeModal() {
        const modal = document.getElementById('employee-modal');
        const form = document.getElementById('employee-form');
        if (!modal || !form) return;

        const modalTitle = document.getElementById('modal-title');
        const editIdInput = document.getElementById('edit-emp-id');

        window.editEmployee = async (id) => {
            const employees = await Storage.get('employees');
            const emp = employees.find(e => e.id == id);
            if (!emp) return;

            if (modalTitle) modalTitle.textContent = 'Editar Empleado';
            if (editIdInput) editIdInput.value = emp.id;

            form.name.value = emp.name;
            form.cedula.value = emp.cedula || '';
            form.phone.value = emp.phone || '';
            form.email.value = emp.email || '';
            form.pin.value = emp.pin || '';
            form.position.value = emp.position;
            form.hourlyRate.value = emp.hourly_rate;
            form.status.value = emp.status;
            form.startDate.value = emp.start_date ? emp.start_date.split('T')[0] : '';
            form.endDate.value = emp.end_date ? emp.end_date.split('T')[0] : '';
            form.applyCCSS.checked = !!emp.apply_ccss;
            form.overtimeThreshold.value = emp.overtime_threshold || 48;
            form.overtimeMultiplier.value = emp.overtime_multiplier || 1.5;
            form.enableOvertime.checked = emp.enable_overtime !== false;

            modal.showModal();
        };

        window.deleteEmployee = async (id) => {
            const employees = await Storage.get('employees');
            const emp = employees.find(e => e.id == id);
            if (!emp) return;

            const modalHtml = `
                <dialog id="delete-confirm-modal" class="modal">
                    <div class="modal-content" style="max-width: 400px; text-align: center;">
                        <button class="modal-close-btn" onclick="document.getElementById('delete-confirm-modal').close(); document.getElementById('delete-confirm-modal').remove();">✕</button>
                        <div style="font-size: 3rem; margin-bottom: 1rem">⚠️</div>
                        <h3 style="color: var(--danger); margin-bottom: 1rem">¿Eliminar Empleado?</h3>
                        <p style="color: var(--text-muted); margin-bottom: 2rem">Esta acción eliminará a <strong>${emp.name}</strong> y todos sus registros. No se puede deshacer.</p>
                        <div style="display: flex; gap: 10px;">
                            <button id="confirm-delete-btn" class="btn" style="background: var(--danger); flex: 1">Eliminar</button>
                            <button class="btn" style="flex: 1" onclick="document.getElementById('delete-confirm-modal').close(); document.getElementById('delete-confirm-modal').remove();">Cancelar</button>
                        </div>
                    </div>
                </dialog>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            const deleteModal = document.getElementById('delete-confirm-modal');
            deleteModal.showModal();

            document.getElementById('confirm-delete-btn').onclick = async () => {
                if (await Storage.delete('employees', id)) {
                    deleteModal.close();
                    deleteModal.remove();
                    if (App.currentView === 'employeeDetail') {
                        App.switchView('employees');
                    } else {
                        App.renderView('employees');
                    }
                }
            };
        };

        form.onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const id = editIdInput.value;
            const empData = {
                name: formData.get('name'),
                cedula: formData.get('cedula'),
                phone: formData.get('phone'),
                email: formData.get('email'),
                pin: formData.get('pin'),
                position: formData.get('position'),
                hourlyRate: parseFloat(formData.get('hourlyRate')),
                startDate: formData.get('startDate'),
                endDate: formData.get('endDate') || null,
                status: formData.get('status'),
                applyCCSS: form.applyCCSS.checked,
                overtimeThreshold: parseFloat(formData.get('overtimeThreshold')) || 48,
                overtimeMultiplier: parseFloat(formData.get('overtimeMultiplier')) || 1.5,
                enableOvertime: form.enableOvertime.checked,
                salaryHistory: []
            };

            let result;
            if (id) {
                const employees = await Storage.get('employees');
                const oldEmp = employees.find(e => e.id == id);
                if (oldEmp) empData.salaryHistory = oldEmp.salary_history || [];
                result = await Storage.update('employees', id, empData);
            } else {
                result = await Storage.add('employees', empData);
            }

            if (result.error) {
                alert("Error: " + result.error);
                return;
            }

            modal.close();
            if (App.currentView === 'employeeDetail') {
                App.renderView('employeeDetail', id);
            } else {
                App.renderView('employees');
            }
        };
    },

    setupMobileMenu() {
        const toggle = document.getElementById('menu-toggle');
        const close = document.getElementById('menu-close');
        const sidebar = document.getElementById('sidebar');

        if (toggle && sidebar) {
            toggle.onclick = () => sidebar.classList.add('active');
        }
        if (close && sidebar) {
            close.onclick = () => sidebar.classList.remove('active');
        }
    },

    renderLanding() {
        const landingView = document.getElementById('landing-view');
        const loginView = document.getElementById('login-view');
        const appElem = document.getElementById('app');

        if (appElem) appElem.style.display = 'none';
        if (loginView) loginView.style.display = 'none';

        if (landingView) {
            landingView.innerHTML = Views.landing();
            landingView.style.display = 'block';
            Views.init_landing();
        }
    },

    renderLogin() {
        const appElem = document.getElementById('app');
        const loginView = document.getElementById('login-view');
        const landingView = document.getElementById('landing-view');

        if (appElem) appElem.style.display = 'none';
        if (landingView) landingView.style.display = 'none';
        if (loginView) loginView.style.display = 'flex';

        const form = document.getElementById('login-form');
        const error = document.getElementById('login-error');
        const btnAdmin = document.getElementById('btn-mode-admin');
        const btnEmp = document.getElementById('btn-mode-emp');
        const adminFields = document.getElementById('admin-fields');
        const empFields = document.getElementById('employee-fields');
        const loginTitle = document.querySelector('#login-view p');
        const registerLink = document.getElementById('go-to-register');

        let loginMode = 'admin'; // 'admin' o 'employee'

        if (registerLink) {
            registerLink.onclick = (e) => {
                e.preventDefault();
                window.location.href = 'https://pay.hotmart.com/L104170872R';
            };
        }

        if (btnAdmin && btnEmp) {
            btnAdmin.onclick = () => {
                loginMode = 'admin';
                btnAdmin.style.background = 'var(--primary)';
                btnAdmin.style.color = 'white';
                btnEmp.style.background = 'transparent';
                btnEmp.style.color = 'var(--text-muted)';
                adminFields.style.display = 'block';
                empFields.style.display = 'none';
                if (loginTitle) loginTitle.innerText = 'Sistema de Control de Planillas';
            };

            btnEmp.onclick = () => {
                loginMode = 'employee';
                btnEmp.style.background = 'var(--primary)';
                btnEmp.style.color = 'white';
                btnAdmin.style.background = 'transparent';
                btnAdmin.style.color = 'var(--text-muted)';
                adminFields.style.display = 'none';
                empFields.style.display = 'block';
                if (loginTitle) loginTitle.innerText = 'Portal de Registro de Empleados';
                document.getElementById('employee-pin').focus();
            };
        }

        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();

                if (loginMode === 'admin') {
                    const user = document.getElementById('username').value;
                    const pass = document.getElementById('password').value;
                    if (await Auth.login(user, pass)) {
                        location.reload();
                    } else {
                        if (error) {
                            error.innerText = 'Usuario o contraseña incorrectos.';
                            error.style.display = 'block';
                        }
                    }
                } else {
                    const pin = document.getElementById('employee-pin').value;
                    if (await Auth.employeeAuth(pin)) {
                        location.reload();
                    } else {
                        if (error) {
                            error.innerText = 'PIN incorrecto o empleado inactivo.';
                            error.style.display = 'block';
                        }
                    }
                }
            };
        }
    },

    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                this.switchView(view);

                // Cerrar menú en móvil tras navegar
                const sidebar = document.getElementById('sidebar');
                if (window.innerWidth <= 1024 && sidebar) {
                    sidebar.classList.remove('active');
                }
            });
        });
    },

    async switchView(view, arg = null) {
        // Highlight logic
        let navView = view;

        const navItem = document.querySelector(`[data-view="${navView}"]`);
        if (navItem) {
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            navItem.classList.add('active');
        }

        const titles = {
            dashboard: 'Dashboard',
            adminStats: 'Métricas Globales',
            employees: 'Gestión de Empleados',
            users: 'Gestión de Usuarios',
            employeeDetail: 'Detalle de Empleado',
            calculator: `Calculadora de Pago ${Auth.getUser()?.cycle_type === 'Weekly' ? 'Semanal' : Auth.getUser()?.cycle_type === 'Biweekly' ? 'Quincenal' : 'Mensual'}`,
            payroll: 'Cálculo de Planillas',
            import: 'Importar Datos Excel',
            profile: 'Configuración de Empresa',
            adminBusinesses: 'Gestión de Empresas SaaS',
            adminSuperUsers: 'Gestión de Super Usuarios',
            registration: 'Registro de Nueva Empresa'
        };

        const viewTitle = document.getElementById('view-title');
        if (viewTitle) viewTitle.textContent = titles[view] || 'Planillas Avantix';

        await this.renderView(view, arg);
    },

    async renderView(view, arg = null) {
        const container = document.getElementById('view-container');
        if (!container) return;

        container.innerHTML = `<div class="view-loading">Cargando vista...</div>`;
        const html = await Views[view](arg);
        container.innerHTML = `<div class="view-animate">${html}</div>`;

        if (Views[`init_${view}`]) {
            await Views[`init_${view}`](arg);
        }
    }
};

// --- Global Utilities ---
window.clearTable = async (target) => {
    const labels = {
        logs: 'todas las horas pendientes',
        payments: 'todo el historial de pagos',
        employees: 'todos los empleados',
        all: 'TODA LA INFORMACIÓN (Horas, Pagos y Empleados)'
    };

    if (!confirm(`⚠️ ALERTA: ¿Está seguro de que desea eliminar ${labels[target]}?\n\nEsta acción no se puede deshacer.`)) return;

    // Doble confirmación para reinicio total
    if (target === 'all' && !confirm('¿ESTÁ ABSOLUTAMENTE SEGURO? Se perderán todos los datos registrados.')) return;

    Storage.showLoader(true, 'Limpiando base de datos...');
    try {
        const response = await apiFetch(`/api/maintenance/clear-all?target=${target}`, { method: 'DELETE' });
        const result = await response.json();
        Storage.showLoader(false);

        if (result.success) {
            alert('Limpieza completada con éxito.');
            location.reload(); // Recargar para limpiar todo el estado
        } else {
            alert('Error: ' + result.error);
        }
    } catch (err) {
        Storage.showLoader(false);
        alert('Error al conectar con el servidor.');
    }
};

// --- UI Components & Views ---
const ROLES = {
    editor: 'Admin Editor (Solo Planillas)',
    owner: 'Admin Dueño (Control de Empresa)',
    super_admin: 'Super Administrador (Global)',
    employee: 'Empleado'
};

const Views = {
    landing: () => {
        return `
            <div class="landing-navbar">
                <div class="logo" style="display: flex; align-items: center; gap: 10px;">
                    <img src="img/avantix_one_logo.png" alt="Logo" style="height: 40px;">
                    <h2 style="font-size: 1.4rem; margin: 0; color: white;">Planillas Avantix One</h2>
                </div>
                <div class="landing-nav-links">
                    <a href="#features">Funciones</a>
                    <a href="#pricing">Precios</a>
                    <a href="#" id="landing-login-btn" class="btn btn-secondary" style="padding: 10px 25px;">Iniciar Sesión</a>
                </div>
            </div>

            <section class="hero-section">
                <h1>Simplifique su nómina hoy mismo</h1>
                <p>La plataforma líder en Costa Rica para el control de horas, cálculo de CCSS y gestión de planillas SaaS.</p>
                <div class="hero-btns">
                    <a href="#pricing" class="btn btn-primary" style="padding: 15px 35px; font-size: 1.1rem;">Comenzar Ahora</a>
                    <a href="#features" class="btn btn-secondary" style="padding: 15px 35px; font-size: 1.1rem;">Ver Funciones</a>
                </div>
            </section>

            <section class="features-section" id="features">
                <div class="section-title">
                    <h2>Todo lo que su empresa necesita</h2>
                    <p style="color: var(--text-muted)">Gestione su personal de forma profesional y sin errores.</p>
                </div>
                <div class="features-grid">
                    <div class="feature-card">
                        <span class="feature-icon">⏱️</span>
                        <h3>Control de Asistencia</h3>
                        <p>Portal intuitivo para que sus empleados registren entradas y salidas con un PIN de seguridad.</p>
                    </div>
                    <div class="feature-card">
                        <span class="feature-icon">🇨🇷</span>
                        <h3>Reportes CCSS</h3>
                        <p>Cálculo automático del 10.67% y generación de reportes listos para la Caja.</p>
                    </div>
                    <div class="feature-card">
                        <span class="feature-icon">⚡</span>
                        <h3>Cálculo de Extras</h3>
                        <p>Algoritmo inteligente para horas extras, feriados y días dobles configurables.</p>
                    </div>
                    <div class="feature-card">
                        <span class="feature-icon">📱</span>
                        <h3>WhatsApp Directo</h3>
                        <p>Envíe comprobantes de pago detallados directamente al WhatsApp de sus empleados.</p>
                    </div>
                </div>
            </section>

            <section class="pricing-section" id="pricing">
                <div class="section-title">
                    <h2>Plan Simple y Transparente</h2>
                    <p style="color: var(--text-muted)">Únase a las empresas que ya optimizaron su tiempo.</p>
                </div>
                <div class="pricing-card">
                    <div class="pricing-badge">Oferta de Lanzamiento</div>
                    <h3>Plan Anual SaaS</h3>
                    <div class="price">$120 <span>/ año</span></div>
                    <ul class="pricing-features">
                        <li>Empresas Ilimitadas</li>
                        <li>Empleados Ilimitados</li>
                        <li>Soporte Técnico 24/7</li>
                        <li>Actualizaciones de Ley automáticas</li>
                        <li>Módulo de Reportería Avanzada</li>
                    </ul>
                    <a href="https://pay.hotmart.com/L104170872R" target="_blank" class="btn btn-primary" style="width: 100%; padding: 20px; font-size: 1.2rem; font-weight: 700;">ADQUIRIR AHORA</a>
                    <p style="margin-top: 1.5rem; font-size: 0.85rem; color: var(--text-muted);">Pago seguro procesado por Hotmart®</p>
                </div>
            </section>

            <section class="testimonial-section">
                <div class="testimonial-card">
                    "Desde que usamos Avantix One, el cierre de quincena pasó de ser una pesadilla de 4 horas a solo 15 minutos. El envío por WhatsApp es lo que más aman mis empleados."
                    <div class="testimonial-author">— Tom Tom Wok, Restaurante Gourmet</div>
                </div>
            </section>

            <footer class="landing-footer">
                <p>© 2026 Planillas Avantix One. Desarrollado para empresas de alto rendimiento.</p>
                <div style="margin-top: 1rem;">
                    <a href="#" style="color: var(--primary); text-decoration: none;" id="landing-footer-login">Acceso Administrador</a>
                </div>
            </footer>
        `;
    },

    init_landing: () => {
        const loginBtns = [
            document.getElementById('landing-login-btn'),
            document.getElementById('landing-footer-login')
        ];

        loginBtns.forEach(btn => {
            if (btn) {
                btn.onclick = (e) => {
                    e.preventDefault();
                    App.renderLogin();
                };
            }
        });

        // Smooth scroll for anchors
        document.querySelectorAll('.landing-nav-links a[href^="#"], .hero-btns a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const targetId = this.getAttribute('href');
                if (targetId === '#') return;
                const target = document.querySelector(targetId);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    },

    registration: async () => {
        return `
            <div class="card onboarding-card">
                <div class="onboarding-steps">
                    <div class="step-indicator active" data-step="1" data-label="Usuario">1</div>
                    <div class="step-indicator" data-step="2" data-label="Empresa">2</div>
                    <div class="step-indicator" data-step="3" data-label="Finalizar">3</div>
                </div>

                <form id="registration-form">
                    <!-- Paso 1: Cuenta de Usuario -->
                    <div class="onboarding-section active" data-section="1">
                        <div style="margin-bottom: 2rem; text-align: center;">
                            <h2 style="color: var(--primary); margin-bottom: 0.5rem;">Crea tu Cuenta</h2>
                            <p style="color: var(--text-muted);">Comencemos con tus datos básicos.</p>
                        </div>
                        
                        <div class="grid-2">
                            <div class="form-group">
                                <label>Nombre *</label>
                                <input type="text" name="ownerName" placeholder="Ej: Juan" required>
                            </div>
                            <div class="form-group">
                                <label>Apellidos *</label>
                                <input type="text" name="ownerLastName" placeholder="Ej: Pérez" required>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Correo Electrónico * (Será su Usuario)</label>
                            <input type="email" name="ownerEmail" id="reg-owner-email" placeholder="juan@ejemplo.com" required 
                                oninput="document.getElementById('reg-owner-username').value = this.value">
                        </div>

                        <div class="grid-2">
                            <div class="form-group">
                                <label>Teléfono *</label>
                                <input type="tel" name="ownerPhone" placeholder="Ej: 8888-8888" required>
                            </div>
                            <div class="form-group">
                                <label>Contraseña *</label>
                                <input type="password" name="password" placeholder="••••••••" required>
                            </div>
                        </div>

                        <input type="hidden" name="username" id="reg-owner-username">
                        
                        <div class="onboarding-nav">
                            <div></div>
                            <button type="button" class="btn btn-primary next-step">Siguiente</button>
                        </div>
                    </div>

                    <!-- Paso 2: Información de Empresa -->
                    <div class="onboarding-section" data-section="2">
                        <div style="margin-bottom: 2rem; text-align: center;">
                            <h2 style="color: var(--primary); margin-bottom: 0.5rem;">Datos de la Empresa</h2>
                            <p style="color: var(--text-muted);">Puedes completar esto ahora o después.</p>
                        </div>

                        <div class="form-group">
                            <label>Nombre Comercial</label>
                            <input type="text" name="businessName" placeholder="Ej: Restaurante El Sabor">
                        </div>

                        <div class="grid-2">
                            <div class="form-group">
                                <label>Cédula Jurídica / Física</label>
                                <input type="text" name="cedulaJuridica" placeholder="Ej: 3-101-123456">
                            </div>
                            <div class="form-group">
                                <label>Tipo de Identidad</label>
                                <select name="legal_type">
                                    <option value="Persona Jurídica">Persona Jurídica</option>
                                    <option value="Persona Física">Persona Física</option>
                                    <option value="Sociedad Anónima (S.A.)">Sociedad Anónima (S.A.)</option>
                                    <option value="Soc. Resp. Limitada (S.R.L.)">Soc. Resp. Limitada (S.R.L.)</option>
                                </select>
                            </div>
                        </div>

                        <div class="grid-2">
                            <div class="form-group">
                                <label>Provincia / Estado</label>
                                <input type="text" name="state">
                            </div>
                            <div class="form-group">
                                <label>Cantón / Ciudad</label>
                                <input type="text" name="city">
                            </div>
                        </div>

                        <div class="onboarding-nav">
                            <button type="button" class="btn btn-secondary prev-step">Anterior</button>
                            <button type="button" class="btn btn-primary next-step">Siguiente</button>
                        </div>
                    </div>

                    <!-- Paso 3: Configuración y Logo -->
                    <div class="onboarding-section" data-section="3">
                        <div style="margin-bottom: 2rem; text-align: center;">
                            <h2 style="color: var(--primary); margin-bottom: 0.5rem;">Configuración Final</h2>
                            <p style="color: var(--text-muted);">Personaliza tu espacio de trabajo.</p>
                        </div>

                        <div class="form-group">
                            <label>Ciclo de Pago</label>
                            <select name="cycle_type">
                                <option value="Weekly">Semanal (Pago cada 7 días)</option>
                                <option value="Biweekly">Quincenal (Pago cada 15 días)</option>
                                <option value="Monthly">Mensual (Pago cada 30 días)</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Logo de la Empresa (Opcional)</label>
                            <div class="logo-upload-zone" id="logo-drop-zone">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 10px; opacity: 0.5;">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                    <circle cx="8.5" cy="8.5" r="1.5"/>
                                    <polyline points="21 15 16 10 5 21"/>
                                </svg>
                                <p style="font-size: 0.9rem;">Click para subir o arrastra una imagen</p>
                                <input type="file" id="onboarding-logo-input" accept="image/*" style="display: none;">
                            </div>
                            <div class="logo-preview-container" id="logo-preview-container">
                                <img src="" class="logo-preview" id="logo-preview-img">
                                <button type="button" class="btn btn-danger btn-icon" id="remove-logo-btn" style="margin-top: 10px;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                    Quitar Logo
                                </button>
                            </div>
                        </div>

                        <div class="onboarding-nav">
                            <button type="button" class="btn btn-secondary prev-step">Anterior</button>
                            <button type="submit" class="btn btn-primary">Finalizar Registro</button>
                        </div>
                    </div>
                </form>

                <div style="text-align: center; margin-top: 2rem;">
                    <a href="#" onclick="location.reload()" style="color: var(--text-muted); font-size: 0.85rem; text-decoration: none;">¿Ya tienes cuenta? Regresar al Login</a>
                </div>
            </div>
        `;
    },

    adminBusinesses: async () => {
        const businesses = await apiFetch('/api/admin/businesses').then(r => r.json());
        return `
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <h3>Empresas Registradas</h3>
                    <button class="btn btn-primary" onclick="window.showAddBusinessModal()">+ Nueva Empresa</button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre Comercial</th>
                                <th>Empresa (Legal)</th>
                                <th>Cédula</th>
                                <th>Usuario (Dueño)</th>
                                <th>Estado</th>
                                <th>Vencimiento</th>
                                <th>Ciclo</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${businesses.map(b => `
                                <tr>
                                    <td><strong>${b.name}</strong></td>
                                    <td style="font-size: 0.85rem; opacity: 0.8;">${b.legal_name || '-'}</td>
                                    <td>${b.cedula_juridica || '-'}</td>
                                    <td style="color: var(--primary); font-weight: 500;">${b.owner_username || '-'}</td>
                                    <td><span class="badge" style="background: ${b.status === 'Active' ? 'var(--success)' : (b.status === 'Suspended' ? 'var(--danger)' : 'var(--warning)')}">${b.status}</span></td>
                                    <td>${b.expires_at ? new Date(b.expires_at).toLocaleDateString() : 'Ilimitado'}</td>
                                    <td>${b.cycle_type}</td>
                                    <td>
                                        <button class="btn btn-secondary" onclick="window.editBusiness(${b.id})">✏️ Editar / Prorrogar</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    adminStats: async () => {
        const stats = await apiFetch('/api/admin/stats').then(r => r.json());
        window._latestAdminStats = stats;
        const { summary, distribution } = stats;

        return `
            <style>
                .admin-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; }
                .dist-card { background: rgba(255,255,255,0.02); border-radius: 16px; padding: 1.5rem; border: 1px solid rgba(255,255,255,0.05); }
                .dist-header { display: flex; align-items: center; gap: 10px; margin-bottom: 1.5rem; color: var(--primary); font-weight: 600; }
                .progress-bar { height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; margin-top: 8px; }
                .progress-fill { height: 100%; border-radius: 3px; }
            </style>

            <div class="admin-stats-grid">
                <div class="stat-card">
                    <div class="stat-icon" style="background: rgba(99, 102, 241, 0.1); color: var(--primary);">🏢</div>
                    <div class="stat-info">
                        <div class="stat-value">${summary.totalBusinesses}</div>
                        <div class="stat-label">Empresas Totales</div>
                        <div style="font-size: 0.75rem; color: var(--success); margin-top: 5px;">
                            ${summary.newLast30 > 0 ? `▲ +${summary.newLast30} este mes` : 'Sin registros nuevos'}
                        </div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: var(--success);">👥</div>
                    <div class="stat-info">
                        <div class="stat-value">${summary.activeEmployees}</div>
                        <div class="stat-label">Empleados en el Sistema</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background: rgba(245, 158, 11, 0.1); color: var(--warning);">💰</div>
                    <div class="stat-info">
                        <div class="stat-value">₡${Math.round(summary.totalVolume).toLocaleString()}</div>
                        <div class="stat-label">Volumen Total Procesado</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background: rgba(239, 68, 68, 0.1); color: var(--danger);">📊</div>
                    <div class="stat-info">
                        <div class="stat-value">${summary.newLast7}</div>
                        <div class="stat-label">Nuevas (7 días)</div>
                    </div>
                </div>
            </div>

            <div class="grid-2" style="margin-top: 2rem; gap: 2rem;">
                <div class="card-container">
                    <h3>Crecimiento del SaaS</h3>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">Nuevas empresas por mes</p>
                    <div style="height: 300px;">
                        <canvas id="adminGrowthChart"></canvas>
                    </div>
                </div>
                <div class="card-container">
                    <h3>Volumen Financiero Mensual</h3>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">Monto total de pagos en el ecosistema</p>
                    <div style="height: 300px;">
                        <canvas id="adminVolumeChart"></canvas>
                    </div>
                </div>
            </div>

            <div class="grid-2" style="margin-top: 2rem; gap: 2rem;">
                <div class="dist-card">
                    <div class="dist-header">🌍 Distribución Geográfica</div>
                    ${distribution.country.length > 0 ? distribution.country.sort((a, b) => b.count - a.count).map(c => {
            const percent = (c.count / summary.totalBusinesses) * 100;
            return `
                            <div style="margin-bottom: 1.2rem;">
                                <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 4px;">
                                    <span>${c.country || 'Sin especificar'}</span>
                                    <span style="font-weight: 600;">${c.count}</span>
                                </div>
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${percent}%; background: var(--primary); box-shadow: 0 0 10px var(--primary);"></div>
                                </div>
                            </div>
                        `;
        }).join('') : '<p style="color: var(--text-muted); text-align: center;">No hay datos disponibles.</p>'}
                </div>
                <div class="dist-card">
                    <div class="dist-header">📊 Estados de Cuenta</div>
                    ${distribution.status.length > 0 ? distribution.status.map(s => {
            const percent = (s.count / summary.totalBusinesses) * 100;
            const color = s.status === 'Active' ? 'var(--success)' : (s.status === 'Suspended' ? 'var(--danger)' : 'var(--warning)');
            return `
                            <div style="margin-bottom: 1.2rem;">
                                <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 4px;">
                                    <span>${s.status}</span>
                                    <span style="font-weight: 600;">${Math.round(percent)}%</span>
                                </div>
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${percent}%; background: ${color};"></div>
                                </div>
                            </div>
                        `;
        }).join('') : '<p style="color: var(--text-muted); text-align: center;">No hay datos disponibles.</p>'}
                </div>
            </div>
        `;
    },

    dashboard: async () => {
        const employees = await Storage.get('employees');
        const activeEmployees = employees.filter(e => e.status === 'Active');
        const rawLogs = await Storage.get('logs');
        const payments = await Storage.get('payments');

        // Deduplicate logs
        const uniqueLogKeys = new Set();
        const logs = rawLogs.filter(l => {
            const key = `${l.employee_id}|${l.date}|${l.hours}|${l.time_in || ''}|${l.time_out || ''}`;
            if (uniqueLogKeys.has(key)) return false;
            uniqueLogKeys.add(key);
            return true;
        });

        const now = new Date();
        const todayStr = Storage.getLocalDate();
        const currentYearMonth = todayStr.substring(0, 7);

        // --- Helper for Aggregation ---
        const getAggregateStats = (startDate, endDate) => {
            // Unpaid Logs
            const periodLogs = logs.filter(l => l.date >= startDate && l.date <= endDate);
            let hours = periodLogs.reduce((s, l) => s + parseFloat(l.hours || 0), 0);
            let amount = periodLogs.reduce((s, l) => {
                const emp = employees.find(e => e.id == l.employee_id);
                const gross = parseFloat(l.hours || 0) * (emp ? parseFloat(emp.hourly_rate) : 0);
                const deduction = (emp && emp.apply_ccss) ? (gross * 0.1067) : 0;
                return s + (gross - deduction);
            }, 0);

            // Paid Data from Payments Detail
            payments.forEach(p => {
                if (!p.logs_detail || !Array.isArray(p.logs_detail)) return;
                p.logs_detail.forEach(l => {
                    const logDate = l.date ? l.date.split('T')[0] : null;
                    if (logDate && logDate >= startDate && logDate <= endDate) {
                        const h = parseFloat(l.hours || 0);
                        hours += h;

                        // Recalculate net if not present in log detail
                        if (l.net) {
                            amount += parseFloat(l.net);
                        } else {
                            const emp = employees.find(e => e.id == p.employee_id);
                            const gross = h * (emp ? parseFloat(emp.hourly_rate) : 0);
                            const deduction = (emp && emp.apply_ccss) ? (gross * 0.1067) : 0;
                            amount += (gross - deduction);
                        }
                    }
                });
            });

            return { hours, amount };
        };

        const getWeekRange = (date) => {
            const d = new Date(date);
            const day = d.getDay();
            const dayNum = day === 0 ? 7 : day;
            const diffToMonday = 1 - dayNum;
            const monday = new Date(d);
            monday.setDate(d.getDate() + diffToMonday);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            // Use local date formatting to avoid TZ shifts
            return {
                start: Storage.getLocalDate(monday),
                end: Storage.getLocalDate(sunday)
            };
        };

        // Current Month Stats
        const monthStart = `${currentYearMonth}-01`;
        const monthEnd = `${currentYearMonth}-31`; // SQL/JS handles overflow or comparison
        const monthStats = getAggregateStats(monthStart, monthEnd);

        // Current Week Stats
        const weekRange = getWeekRange(now);
        const weekStats = getAggregateStats(weekRange.start, weekRange.end);

        // Last Week Stats
        const lastWeekDate = new Date(now);
        lastWeekDate.setDate(now.getDate() - 7);
        const lastWeekRange = getWeekRange(lastWeekDate);
        const lastWeekStats = getAggregateStats(lastWeekRange.start, lastWeekRange.end);

        return `
            <div class="stats-grid">
                <div class="stat-card">
                    <h3>Empleados Activos</h3>
                    <div class="value">${activeEmployees.length}</div>
                    <div class="trend up">👥 Personal Actual</div>
                </div>
                <div class="stat-card">
                    <h3>Semana Pasada</h3>
                    <div class="value">${lastWeekStats.hours.toFixed(1)}h</div>
                    <div style="font-size: 1.2rem; margin-top: 0.5rem; color: var(--success)">₡${Math.round(lastWeekStats.amount).toLocaleString()}</div>
                    <div class="trend" style="font-size: 0.75rem">${lastWeekRange.start} al ${lastWeekRange.end}</div>
                </div>
                <div class="stat-card">
                    <h3>Semana Actual</h3>
                    <div class="value">${weekStats.hours.toFixed(1)}h</div>
                    <div style="font-size: 1.2rem; margin-top: 0.5rem; color: var(--success)">₡${Math.round(weekStats.amount).toLocaleString()}</div>
                    <div class="trend" style="font-size: 0.75rem">${weekRange.start} al ${weekRange.end}</div>
                </div>
                <div class="stat-card">
                    <h3>Acumulado del Mes</h3>
                    <div class="value">${monthStats.hours.toFixed(1)}h</div>
                    <div style="font-size: 1.2rem; margin-top: 0.5rem; color: var(--success)">₡${Math.round(monthStats.amount).toLocaleString()}</div>
                    <div class="trend">${now.toLocaleString('es-ES', { month: 'long' }).toUpperCase()}</div>
                </div>
            </div>

            <div style="margin-top: 2rem">
                <div class="card-container">
                    <h3>Historial de Salarios Pagados (Último Año)</h3>
                    <div style="height: 350px; margin-top: 2rem">
                        <canvas id="salaryChart"></canvas>
                    </div>
                </div>
            </div>
        `;
    },

    init_registration: async () => {
        const form = document.getElementById('registration-form');
        if (!form) return;

        // --- Multi-step Logic ---
        const sections = document.querySelectorAll('.onboarding-section');
        const indicators = document.querySelectorAll('.step-indicator');
        const nextBtns = document.querySelectorAll('.next-step');
        const prevBtns = document.querySelectorAll('.prev-step');

        const goToStep = (step) => {
            sections.forEach(s => s.classList.remove('active'));
            indicators.forEach(i => {
                i.classList.remove('active');
                if (parseInt(i.dataset.step) < step) i.classList.add('completed');
                else i.classList.remove('completed');
            });

            document.querySelector(`.onboarding-section[data-section="${step}"]`).classList.add('active');
            document.querySelector(`.step-indicator[data-step="${step}"]`).classList.add('active');
        };

        nextBtns.forEach(btn => {
            btn.onclick = () => {
                const currentSection = btn.closest('.onboarding-section');
                const step = parseInt(currentSection.dataset.section);

                // Validación básica para el paso 1
                if (step === 1) {
                    const required = currentSection.querySelectorAll('[required]');
                    let valid = true;
                    required.forEach(input => {
                        if (!input.value) {
                            input.style.borderColor = 'var(--danger)';
                            valid = false;
                        } else {
                            input.style.borderColor = 'var(--border)';
                        }
                    });
                    if (!valid) return;
                }

                goToStep(step + 1);
            };
        });

        prevBtns.forEach(btn => {
            btn.onclick = () => {
                const step = parseInt(btn.closest('.onboarding-section').dataset.section);
                goToStep(step - 1);
            };
        });

        // --- Logo Upload Logic ---
        const dropZone = document.getElementById('logo-drop-zone');
        const fileInput = document.getElementById('onboarding-logo-input');
        const previewContainer = document.getElementById('logo-preview-container');
        const previewImg = document.getElementById('logo-preview-img');
        const removeLogoBtn = document.getElementById('remove-logo-btn');

        if (dropZone && fileInput) {
            dropZone.onclick = () => fileInput.click();
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        previewImg.src = re.target.result;
                        previewContainer.style.display = 'block';
                        dropZone.style.display = 'none';
                    };
                    reader.readAsDataURL(file);
                }
            };
        }

        if (removeLogoBtn) {
            removeLogoBtn.onclick = () => {
                fileInput.value = '';
                previewContainer.style.display = 'none';
                dropZone.style.display = 'block';
            };
        }

        // --- Form Final Submit ---
        form.onsubmit = async (e) => {
            e.preventDefault();

            const formDataRaw = new FormData(form);
            const data = Object.fromEntries(formDataRaw.entries());

            const finalData = new FormData();
            for (const key in data) finalData.append(key, data[key]);

            if (fileInput.files[0]) {
                finalData.append('logo', fileInput.files[0]);
            }

            // Sync business email/phone with owner
            if (!data.businessName) finalData.set('businessName', 'Empresa de ' + data.ownerName);
            finalData.append('email', data.ownerEmail);
            finalData.append('phone', data.ownerPhone);

            Storage.showLoader(true, 'Creando su empresa...');
            try {
                // Determine if we send JSON or Mulipart based on file presence
                const hasFile = fileInput.files.length > 0;
                let fetchOptions = {
                    method: 'POST',
                    body: hasFile ? finalData : JSON.stringify(Object.fromEntries(finalData))
                };

                if (!hasFile) {
                    fetchOptions.headers = { 'Content-Type': 'application/json' };
                }

                const res = await fetch('/api/onboarding/register', fetchOptions);
                const result = await res.json();

                if (result.success && result.session) {
                    localStorage.setItem(Auth.SCHEMA, JSON.stringify({
                        ...result.session,
                        loginTime: Date.now()
                    }));

                    const card = form.closest('.card');
                    if (card) {
                        card.innerHTML = `
                            <div style="text-align: center; padding: 3rem;">
                                <div style="font-size: 5rem; margin-bottom: 1rem;">🚀</div>
                                <h2 style="color: var(--primary); margin-bottom: 1rem;">¡Bienvenidos a Avantix One!</h2>
                                <p style="color: var(--text-muted); margin-bottom: 2rem;">Estamos preparando su entorno personalizado para <b>${result.session.business_name}</b>...</p>
                                <div class="loader-spinner" style="margin: 0 auto;"></div>
                            </div>
                        `;
                    }
                    setTimeout(() => location.reload(), 2000);
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (err) {
                console.error(err);
                alert('Error de conexión');
            } finally {
                Storage.showLoader(false);
            }
        };
    },

    init_adminBusinesses: async () => {
        const modal = document.getElementById('business-modal');
        const form = document.getElementById('business-form');

        // Logo Upload for Super Admin
        const uploadBtn = document.getElementById('admin-logo-upload-btn');
        const uploadInput = document.getElementById('admin-logo-upload-input');
        const preview = document.getElementById('admin-business-logo-preview');
        const logoHidden = document.getElementById('business-logo');

        const removeBtn = document.getElementById('admin-logo-remove-btn');
        if (removeBtn) {
            removeBtn.onclick = () => {
                if (!confirm("¿Seguro que desea quitar el logo de esta empresa?")) return;
                preview.style.display = 'none';
                preview.src = '';
                logoHidden.value = '';
                removeBtn.style.display = 'none';
            };
        }

        if (uploadBtn && uploadInput) {
            uploadBtn.onclick = () => uploadInput.click();
            uploadInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) return alert("El archivo supera los 2MB permitidos.");

                const formData = new FormData();
                formData.append('logo', file);

                Storage.showLoader(true, 'Subiendo logo...');
                try {
                    const res = await apiFetch('/api/settings/upload-logo', {
                        method: 'POST',
                        body: formData
                    });
                    const result = await res.json();
                    if (result.success) {
                        preview.src = result.logo_url;
                        preview.style.display = 'block';
                        logoHidden.value = result.logo_url;
                        if (removeBtn) removeBtn.style.display = 'block';
                        alert("Logo subido con éxito.");
                    } else {
                        alert("Error: " + result.error);
                    }
                } catch (err) { alert("Error de conexión"); }
                finally { Storage.showLoader(false); }
            };
        }

        // Dynamic labels based on country
        const countryInput = document.getElementById('business-country');
        const updateLabels = (country) => {
            const labels = {
                'Costa Rica': { state: 'Provincia', city: 'Cantón', district: 'Distrito', id: 'Cédula o Identificación' },
                'México': { state: 'Estado', city: 'Municipio', district: 'Colonia', id: 'RFC / CURP' },
                'Colombia': { state: 'Departamento', city: 'Municipio', district: 'Barrio', id: 'NIT / CC' },
                'España': { state: 'Provincia', city: 'Municipio', district: 'Barrio/Distrito', id: 'NIF / NIE' },
                'default': { state: 'Estado / Provincia', city: 'Ciudad / Municipio', district: 'Distrito / Barrio', id: 'ID Legal' }
            };
            const config = labels[country] || labels.default;
            document.getElementById('label-state').innerText = config.state;
            document.getElementById('label-city').innerText = config.city;
            document.getElementById('label-district').innerText = config.district;
            document.getElementById('label-cedula').innerText = config.id;
        };

        countryInput.addEventListener('input', (e) => updateLabels(e.target.value));

        window.showAddBusinessModal = () => {
            form.reset();
            document.getElementById('business-id').value = '';
            document.getElementById('business-modal-title').innerText = 'Nueva Empresa';
            preview.style.display = 'none';
            preview.src = '';
            if (removeBtn) removeBtn.style.display = 'none';
            updateLabels('Costa Rica');
            modal.showModal();
        };

        window.editBusiness = async (id) => {
            const biz = await apiFetch(`/api/admin/businesses/${id}`).then(r => r.json());
            document.getElementById('business-id').value = biz.id;
            document.getElementById('business-name').value = biz.name || '';
            document.getElementById('business-legal-type').value = biz.legal_type || 'Persona Jurídica';
            document.getElementById('business-legal-name').value = biz.legal_name || '';
            document.getElementById('business-cedula').value = biz.cedula_juridica || '';
            document.getElementById('business-country').value = biz.country || 'Costa Rica';
            document.getElementById('business-state').value = biz.state || '';
            document.getElementById('business-city').value = biz.city || '';
            document.getElementById('business-district').value = biz.district || '';
            document.getElementById('business-address').value = biz.address || '';

            // Dueño
            document.getElementById('owner-name').value = biz.owner_name || '';
            document.getElementById('owner-lastname').value = biz.owner_last_name || '';
            document.getElementById('owner-email').value = biz.owner_email || '';
            document.getElementById('owner-phone').value = biz.owner_phone || '';
            document.getElementById('owner-username').value = biz.owner_username || '';

            document.getElementById('business-status').value = biz.status;
            document.getElementById('business-cycle').value = biz.cycle_type;
            document.getElementById('business-logo').value = biz.logo_url || '';
            document.getElementById('business-theme').value = biz.theme_preference || 'dark';

            if (biz.logo_url) {
                preview.src = biz.logo_url;
                preview.style.display = 'block';
                if (removeBtn) removeBtn.style.display = 'block';
            } else {
                preview.style.display = 'none';
                if (removeBtn) removeBtn.style.display = 'none';
            }

            if (biz.expires_at) {
                document.getElementById('business-expiry').value = new Date(biz.expires_at).toISOString().split('T')[0];
            } else {
                document.getElementById('business-expiry').value = '';
            }

            updateLabels(biz.country || 'Costa Rica');
            document.getElementById('business-modal-title').innerText = 'Editar Empresa / Prorrogar';
            modal.showModal();
        };

        form.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('business-id').value;
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            const method = id ? 'PUT' : 'POST';
            const url = id ? `/api/admin/businesses/${id}` : '/api/admin/businesses';

            Storage.showLoader(true, 'Guardando...');
            try {
                const res = await apiFetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (res.ok) {
                    modal.close();
                    location.reload();
                } else {
                    const err = await res.json();
                    alert('Error: ' + err.error);
                }
            } catch (err) {
                alert('Error de conexión');
            } finally {
                Storage.showLoader(false);
            }
        };
    },

    init_adminStats: async () => {
        const stats = window._latestAdminStats || await apiFetch('/api/admin/stats').then(r => r.json());
        if (typeof Chart === 'undefined') return;

        // Growth Chart
        const growthCtx = document.getElementById('adminGrowthChart');
        if (growthCtx) {
            new Chart(growthCtx, {
                type: 'line',
                data: {
                    labels: stats.growth.map(g => g.month),
                    datasets: [{
                        label: 'Nuevas Empresas',
                        data: stats.growth.map(g => parseInt(g.count)),
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 3,
                        pointBackgroundColor: '#6366f1',
                        pointBorderColor: '#fff',
                        pointHoverRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', stepSize: 1 } },
                        x: { grid: { display: false }, ticks: { color: '#64748b' } }
                    }
                }
            });
        }

        // Volume Chart
        const volumeCtx = document.getElementById('adminVolumeChart');
        if (volumeCtx) {
            new Chart(volumeCtx, {
                type: 'bar',
                data: {
                    labels: stats.volumeTrend.map(v => v.month),
                    datasets: [{
                        label: 'Volumen Total',
                        data: stats.volumeTrend.map(v => parseFloat(v.total)),
                        backgroundColor: 'rgba(16, 185, 129, 0.4)',
                        borderColor: '#10b981',
                        borderWidth: 2,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => ' ₡' + Math.round(ctx.raw).toLocaleString()
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(255,255,255,0.05)' },
                            ticks: {
                                color: '#64748b',
                                callback: (val) => '₡' + (val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : val.toLocaleString())
                            }
                        },
                        x: { grid: { display: false }, ticks: { color: '#64748b' } }
                    }
                }
            });
        }
    },

    init_dashboard: async () => {
        const payments = await Storage.get('payments');
        const ctx = document.getElementById('salaryChart');
        if (!ctx) return;

        const months = [];
        const data = [];
        const now = new Date();

        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthStr = d.toISOString().substring(0, 7);
            const monthLabel = d.toLocaleString('es-ES', { month: 'short' }).toUpperCase();

            const monthTotal = payments
                .filter(p => p.date && p.date.startsWith(monthStr))
                .reduce((s, p) => s + parseFloat(p.amount || 0), 0);

            months.push(monthLabel);
            data.push(monthTotal);
        }

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [{
                    label: 'Salarios Pagados (₡)',
                    data: data,
                    backgroundColor: 'rgba(99, 102, 241, 0.4)',
                    borderColor: '#6366f1',
                    borderWidth: 2,
                    borderRadius: 8,
                    hoverBackgroundColor: '#6366f1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return 'Total: ₡' + context.raw.toLocaleString();
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#94a3b8',
                            callback: function (value) {
                                return '₡' + value.toLocaleString();
                            }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8' }
                    }
                }
            }
        });
    },

    employees: async () => {
        const employees = await Storage.get('employees');
        const statusFilter = localStorage.getItem('gn_employee_status_filter') || 'Active';

        const filteredEmployees = employees.filter(emp => {
            if (statusFilter === 'All') return true;
            return emp.status === statusFilter;
        });

        return `
            <div class="card-container">
                <div class="table-header">
                    <div>
                        <h3 style="margin:0">Lista de Colaboradores</h3>
                        <p style="font-size: 0.8rem; color: var(--text-muted)">Gestión interna de personal</p>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center">
                        <select id="employee-status-filter" style="width: auto; padding: 6px 12px;">
                            <option value="Active" ${statusFilter === 'Active' ? 'selected' : ''}>Solo Activos</option>
                            <option value="Inactive" ${statusFilter === 'Inactive' ? 'selected' : ''}>Inactivos</option>
                            <option value="All" ${statusFilter === 'All' ? 'selected' : ''}>Todos</option>
                        </select>
                        <button class="btn" style="background: rgba(239,68,68,0.1); color: var(--danger)" id="deactivate-all-btn">🛑 Desactivar Todos</button>
                        <button class="btn btn-primary" id="add-employee-btn">+ Nuevo Empleado</button>
                    </div>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Cargo</th>
                                <th>Pago x Hora</th>
                                <th>Estado</th>
                                <th>Inicio / Fin</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredEmployees.map(emp => `
                                <tr>
                                    <td style="font-weight:600; cursor:pointer;" onclick="App.switchView('employeeDetail', '${emp.id}')">${emp.name}</td>
                                    <td>${emp.position}</td>
                                    <td>₡${parseFloat(emp.hourly_rate).toLocaleString()}</td>
                                    <td>
                                        <span class="tag ${emp.status === 'Active' ? 'tag-active' : 'tag-inactive'}">
                                            ${emp.status === 'Active' ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td>
                                        <div style="font-size: 0.85rem">📅 ${emp.start_date ? emp.start_date.split('T')[0] : '—'}</div>
                                        ${emp.end_date ? `<div style="font-size: 0.85rem; color: var(--danger)">🚪 ${emp.end_date.split('T')[0]}</div>` : ''}
                                    </td>
                                    <td style="padding: 1.25rem 1rem;">
                                        <div style="display: flex; gap: 8px; align-items: center;">
                                            <button class="btn" style="padding: 4px 8px; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2)" onclick="window.editEmployee('${emp.id}')" title="Editar">✏️</button>
                                            <button class="btn" style="padding: 4px 8px; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2)" onclick="App.switchView('employeeDetail', '${emp.id}')" title="Ver Detalle">${PayrollHelpers.EYE_ICON}</button>
                                            <button class="btn" style="padding: 4px 8px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2)" onclick="window.deleteEmployee('${emp.id}')" title="Eliminar">🗑️</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                            ${filteredEmployees.length === 0 ? '<tr><td colspan="6" style="text-align:center">No hay empleados con este estado</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    init_employees: async () => {
        const modal = document.getElementById('employee-modal');
        const btn = document.getElementById('add-employee-btn');
        const form = document.getElementById('employee-form');
        const statusFilter = document.getElementById('employee-status-filter');
        const modalTitle = document.getElementById('modal-title');
        const editIdInput = document.getElementById('edit-emp-id');

        if (statusFilter) {
            statusFilter.onchange = () => {
                localStorage.setItem('gn_employee_status_filter', statusFilter.value);
                App.renderView('employees');
            };
        }

        const deactivateBtn = document.getElementById('deactivate-all-btn');
        if (deactivateBtn) {
            deactivateBtn.onclick = async () => {
                if (!confirm('¿Está seguro de que desea poner a TODOS los empleados como Inactivos?')) return;
                const employees = await Storage.get('employees');
                const today = Storage.getLocalDate();
                for (const emp of employees) {
                    await Storage.update('employees', emp.id, {
                        ...emp,
                        hourlyRate: emp.hourly_rate,
                        startDate: emp.start_date,
                        applyCCSS: emp.apply_ccss,
                        status: 'Inactive',
                        endDate: emp.end_date || today
                    });
                }
                App.renderView('employees');
            };
        }

        if (btn) {
            btn.onclick = () => {
                form.reset();
                if (editIdInput) editIdInput.value = '';
                if (modalTitle) modalTitle.textContent = 'Registrar Empleado';
                modal.showModal();
            };
        }
    },

    employeeDetail: async (id) => {
        const employees = await Storage.get('employees');
        const emp = employees.find(e => e.id == id);
        if (!emp) return 'Empleado no encontrado';

        const rawLogs = await Storage.get('logs');
        const logs = rawLogs.filter(l => l.employee_id == id);

        const payments = await Storage.get('payments');
        const empPayments = payments.filter(p => p.employee_id == id);

        const history = emp.salary_history || [{ date: emp.start_date ? emp.start_date.split('T')[0] : '', rate: emp.hourly_rate, reason: 'Salario Inicial' }];

        return `
            <div class="card-container">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem">
                    <div>
                        <h2 style="margin:0; color: var(--primary)">${emp.name}</h2>
                        <p style="color: var(--text-muted)">${emp.position} | ₡${parseFloat(emp.hourly_rate).toLocaleString()} por hora</p>
                    </div>
                    <div style="display: flex; gap: 10px">
                        <button class="btn" style="background: rgba(99,102,241,0.1)" onclick="App.switchView('employees')">⬅️ Volver</button>
                        <button class="btn btn-primary" onclick="window.editEmployee('${emp.id}')">✏️ Editar Perfil Completo</button>
                    </div>
                </div>

                <div class="stats-grid" style="margin-bottom: 2rem">
                    <div class="stat-card">
                        <h3>Total Horas</h3>
                        <div class="value">${logs.reduce((s, l) => s + parseFloat(l.hours || 0), 0).toFixed(1)}h</div>
                    </div>
                    <div class="stat-card" style="border-left: 4px solid var(--success)">
                        <h3>Total Pagado</h3>
                        <div class="value" style="color: var(--success)">₡${empPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0).toLocaleString()}</div>
                    </div>
                </div>

                <div class="grid-2">
                    <div class="card-container" style="background: rgba(255,255,255,0.02)">
                        <h3>Historial de Cambios Salariales</h3>
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Tarifa</th>
                                        <th>Motivo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${history.map(h => `
                                        <tr>
                                            <td>${h.date}</td>
                                            <td>₡${parseFloat(h.rate).toLocaleString()}</td>
                                            <td style="font-size: 0.85rem">${h.reason}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="card-container" style="background: rgba(255,255,255,0.02)">
                        <h3>Proyección de Rebajos (Base Actual)</h3>
                        <div style="padding: 1rem; background: var(--bg-body); border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem">
                                <span>Aplicar CCSS:</span>
                                <b>${emp.apply_ccss ? 'SÍ (10.67%)' : 'NO'}</b>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem">
                                <span>Salario Bruto (Ej. 48h):</span>
                                <span>₡${(48 * emp.hourly_rate).toLocaleString()}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-weight: 600; color: var(--danger)">
                                <span>Deducción estimada:</span>
                                <span>₡${emp.apply_ccss ? (48 * emp.hourly_rate * 0.1067).toLocaleString() : '0'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card-container" style="margin-top: 2rem;">
                    <h3 style="margin-bottom: 1.5rem">Historial de Pagos Realizados</h3>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Fecha de Pago</th>
                                    <th>Periodo</th>
                                    <th>Monto Pagado</th>
                                    <th>Método</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${empPayments.length > 0 ? empPayments.sort((a, b) => new Date(b.date) - new Date(a.date)).map(p => `
                                    <tr>
                                        <td>${p.date ? p.date.split('T')[0] : '—'}</td>
                                        <td>${p.period || 'N/A'}</td>
                                        <td style="font-weight: 600; color: var(--success)">₡${parseFloat(p.amount).toLocaleString()}</td>
                                        <td>${p.method || 'Transferencia'}</td>
                                        <td><span class="tag tag-active">Pagado</span></td>
                                    </tr>
                                `).join('') : '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-muted)">No hay pagos registrados para este empleado.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Eliminado modal local para usar el global window.editEmployee -->
        `;
    },

    init_employeeDetail: async (id) => {
        // No necesitamos inicializar nada aquí ya que usamos window.editEmployee que es global
    },

    calculator: async () => {
        const employees = await Storage.get('employees');
        const user = Auth.getUser();
        // Permitir opciones avanzadas para roles administrativos
        const isAdmin = user && ['super_admin', 'owner', 'editor'].includes(user.role);
        const activeEmployees = employees.filter(e => e.status === 'Active');

        return `
            <div class="card-container">
                <div style="margin-bottom: 2rem">
                    <h3 style="color: var(--primary)">Calculadora de Horas</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem">
                        Utilice esta herramienta para registrar las horas laboradas de los empleados y calcular su pago bruto (incluye feriados y rebajos).
                    </p>
                </div>

                <div class="form-group" style="max-width: 400px; margin-bottom: 2.5rem;">
                    <label style="font-weight: 600; color: var(--text-main); margin-bottom: 0.8rem; display: block;">
                        👤 Seleccionar Empleado
                    </label>
                    <select id="calc-employee-id" required ${isAdmin ? '' : 'disabled'}>
                        ${isAdmin ? '<option value="">-- Elija un empleado de la lista --</option>' : ''}
                        ${activeEmployees.map(e => `
                            <option value="${e.id}" ${(!isAdmin && e.id == user.id) ? 'selected' : ''}>
                                ${e.name} ${isAdmin ? `(Tarifa: ₡${parseFloat(e.hourly_rate).toLocaleString()}/h)` : ''}
                            </option>
                        `).join('')}
                    </select>
                    ${!isAdmin ? `
                        <div style="margin-top: 1rem; padding: 0.8rem; background: rgba(99,102,241,0.1); border-radius: 10px; border-left: 4px solid var(--primary);">
                            <span style="font-size: 0.85rem; color: var(--text-main)">Registrando horas para: <strong>${user.name}</strong></span>
                        </div>
                    ` : ''}
                </div>

                <div class="table-container">
                    <table id="calc-table">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Entrada</th>
                                <th>Salida</th>
                                <th>Horas</th>
                                <th>Horas Dobles</th>
                                <th>Horas Almuerzo</th>
                                <th style="width: 50px"></th>
                            </tr>
                        </thead>
                        <tbody id="calc-tbody">
                            <!-- Rows injected here -->
                        </tbody>
                    </table>
                </div>

                <div style="margin-top: 1.5rem; display: flex; gap: 10px;">
                    <button class="btn" style="background: rgba(255,255,255,0.05)" id="calc-add-row">+ Agregar Día</button>
                    <button class="btn btn-primary" id="calc-save-logs" disabled>💾 Guardar Registros</button>
                </div>

                <div id="calc-summary" style="margin-top: 3rem; padding: 2.5rem; background: rgba(99, 102, 241, 0.05); border-radius: 20px; border: 1px solid var(--primary); display: none;">
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 2rem; text-align: center;">
                        <div>
                            <div style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.5rem">Total de Horas</div>
                            <div class="value calc-total-value" id="calc-total-hours" style="color: var(--primary)">0.00h</div>
                            <div id="calc-overtime-info" style="font-size: 0.8rem; color: var(--text-muted); margin-top: 5px;"></div>
                        </div>
                        <div>
                            <div style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.5rem">Monto Estimado</div>
                            <div class="value calc-total-value" id="calc-total-pay" style="color: var(--success)">₡0</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    init_calculator: async () => {
        const tbody = document.getElementById('calc-tbody');
        const addRowBtn = document.getElementById('calc-add-row');
        const saveBtn = document.getElementById('calc-save-logs');
        const empSelect = document.getElementById('calc-employee-id');
        const summary = document.getElementById('calc-summary');

        let rowCount = 0;

        const createRow = () => {
            rowCount++;
            const lastRow = tbody.lastElementChild;
            let nextDateStr = Storage.getLocalDate();
            let nextIn = "08:00";
            let nextOut = "17:00";

            if (lastRow) {
                const lastDateVal = lastRow.querySelector('.calc-date').value;
                const lastInVal = lastRow.querySelector('.calc-in').value;
                const lastOutVal = lastRow.querySelector('.calc-out').value;

                if (lastDateVal) {
                    const [y, m, d] = lastDateVal.split('-').map(Number);
                    const dt = new Date(y, m - 1, d);
                    dt.setDate(dt.getDate() + 1);
                    nextDateStr = Storage.getLocalDate(dt);
                }
                nextIn = lastInVal;
                nextOut = lastOutVal;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="date" class="calc-date" value="${nextDateStr}"></td>
                <td><input type="time" class="calc-in" value="${nextIn}"></td>
                <td><input type="time" class="calc-out" value="${nextOut}"></td>
                <td class="calc-subtotal" style="font-weight: 600">0.00h</td>
                <td style="text-align:center"><input type="checkbox" class="calc-double" title="Marcar como Día Doble" style="width: 20px; height: 20px;"></td>
                <td><input type="number" class="calc-deduction" value="0" step="0.5" style="width:100px" title="Horas de almuerzo o permisos"></td>
                <td style="text-align: center;"><button class="btn" style="padding: 6px; color: var(--danger)" onclick="this.closest('tr').remove(); window.updateCalcTotal();">✕</button></td>
            `;
            tbody.appendChild(tr);

            tr.querySelectorAll('input').forEach(input => {
                input.oninput = () => window.updateCalcTotal();
                if (input.type === 'checkbox') input.onchange = () => window.updateCalcTotal();
            });
            window.updateCalcTotal();
        };

        window.updateCalcTotal = async () => {
            const rows = tbody.querySelectorAll('tr');
            let totalH = 0;
            const empId = empSelect.value;
            const employees = await Storage.get('employees');
            const emp = employees.find(e => e.id == empId);
            const rate = emp ? parseFloat(emp.hourly_rate) : 0;

            rows.forEach(tr => {
                const tIn = tr.querySelector('.calc-in').value;
                const tOut = tr.querySelector('.calc-out').value;
                const isDouble = tr.querySelector('.calc-double') ? tr.querySelector('.calc-double').checked : false;
                const deduction = tr.querySelector('.calc-deduction') ? parseFloat(tr.querySelector('.calc-deduction').value || 0) : 0;

                if (tIn && tOut) {
                    const start = new Date(`2000-01-01T${tIn}`);
                    const end = new Date(`2000-01-01T${tOut}`);
                    let diff = (end - start) / 1000 / 60 / 60;
                    if (diff < 0) diff += 24;

                    // Restar rebajos
                    diff = Math.max(0, diff - deduction);

                    const displayHours = isDouble ? diff * 2 : diff;
                    tr.querySelector('.calc-subtotal').textContent = displayHours.toFixed(2) + 'h';
                    totalH += displayHours;
                }
            });

            let finalPay = 0;
            const user = Auth.getUser();
            const cycle = user?.cycle_type || 'Weekly';
            const baseThreshold = emp ? parseFloat(emp.overtime_threshold || 48) : 48;

            let otThreshold = baseThreshold;
            if (cycle === 'Biweekly') otThreshold = baseThreshold * 2;
            if (cycle === 'Monthly') otThreshold = baseThreshold * 4;

            const otMultiplier = emp ? parseFloat(emp.overtime_multiplier || 1.5) : 1.5;
            const otEnabled = emp ? emp.enable_overtime !== false : true;
            const otInfo = document.getElementById('calc-overtime-info');

            if (totalH > otThreshold && Auth.getUser().role === 'admin' && otEnabled) {
                const baseH = otThreshold;
                const extraH = totalH - otThreshold;
                finalPay = (baseH * rate) + (extraH * rate * otMultiplier);
                if (otInfo) otInfo.textContent = `Base: ${baseH.toFixed(1)}h | Extra: ${extraH.toFixed(1)}h (x${otMultiplier})`;
            } else {
                finalPay = totalH * rate;
                if (otInfo) {
                    if (!otEnabled && totalH > otThreshold) {
                        otInfo.textContent = `⚠️ Horas extra deshabilitadas para este empleado.`;
                    } else {
                        otInfo.textContent = "";
                    }
                }
            }

            document.getElementById('calc-total-hours').textContent = totalH.toFixed(2) + 'h';
            document.getElementById('calc-total-pay').textContent = '₡' + Math.round(finalPay).toLocaleString();

            summary.style.display = totalH > 0 ? 'block' : 'none';
            saveBtn.disabled = !empId || totalH <= 0;
        };

        empSelect.onchange = () => window.updateCalcTotal();
        addRowBtn.onclick = () => createRow();

        window.clearCalculator = () => {
            tbody.innerHTML = '';
            createRow();
        };

        if (Auth.getUser().role === 'employee') {
            window.updateCalcTotal();
        }

        saveBtn.onclick = async () => {
            const empId = empSelect.value;
            if (!empId) return;

            const rows = tbody.querySelectorAll('tr');
            const batchLogs = [];

            for (const tr of rows) {
                const date = tr.querySelector('.calc-date').value;
                const tIn = tr.querySelector('.calc-in').value;
                const tOut = tr.querySelector('.calc-out').value;
                const isDouble = tr.querySelector('.calc-double') ? tr.querySelector('.calc-double').checked : false;
                const deduction = tr.querySelector('.calc-deduction') ? parseFloat(tr.querySelector('.calc-deduction').value || 0) : 0;

                if (!date || !tIn || !tOut) continue;

                const start = new Date(`2000-01-01T${tIn}`);
                const end = new Date(`2000-01-01T${tOut}`);
                let diff = (end - start) / 1000 / 60 / 60;
                if (diff < 0) diff += 24;

                // Restar rebajos
                diff = Math.max(0, diff - deduction);

                const finalHours = isDouble ? diff * 2 : diff;

                batchLogs.push({
                    date,
                    timeIn: tIn,
                    timeOut: tOut,
                    hours: finalHours.toFixed(2),
                    isDoubleDay: isDouble,
                    deductionHours: deduction
                });
            }

            if (batchLogs.length === 0) return;

            Storage.showLoader(true, 'Guardando y enviando resumen...');

            try {
                const response = await apiFetch('/api/logs/batch', {
                    method: 'POST',
                    body: JSON.stringify({ employeeId: parseInt(empId), logs: batchLogs })
                });

                const result = await response.json();
                Storage.showLoader(false);

                if (result.success) {
                    if (result.messageSent) {
                        PayrollHelpers.showWhatsAppConfirm(result.messageSent);
                    }

                    if (Auth.getUser().role === 'admin') {
                        App.switchView('payroll');
                    } else {
                        window.clearCalculator();
                    }
                } else {
                    alert('Error: ' + (result.error || 'No se pudo guardar el batch'));
                }
            } catch (err) {
                Storage.showLoader(false);
                alert('Error de conexión con el servidor');
            }
        };

        createRow();
    },

    payroll: async () => {
        const employees = await Storage.get('employees');
        const logs = await Storage.get('logs');
        const payments = await Storage.get('payments');

        // --- RESUMEN DE PENDIENTES (Agrupado por Empleado) ---
        const pendingByEmployee = {};
        logs.filter(l => !l.is_paid).forEach(log => {
            const emp = employees.find(e => e.id == log.employee_id);
            if (!emp) return;

            if (!pendingByEmployee[emp.id]) {
                pendingByEmployee[emp.id] = {
                    empId: emp.id,
                    name: emp.name,
                    phone: emp.phone || '',
                    hours: 0,
                    regularHours: 0,
                    extraHours: 0,
                    doubleHours: 0,
                    gross: 0,
                    deduction: 0,
                    net: 0,
                    logs: [],
                    startDate: log.date,
                    endDate: log.date
                };
            }
            const empData = pendingByEmployee[emp.id];
            const hours = parseFloat(log.hours);
            const isDouble = !!log.is_double_day;

            if (isDouble) {
                empData.doubleHours += hours;
            } else {
                // Cálculo simple de extras basado en el threshold semanal del empleado
                // Nota: Esto es acumulativo, para un reporte exacto por día se requiere lógica más compleja
                // pero aquí mantenemos la lógica de negocio actual.
                empData.regularHours += hours;
            }

            const user = Auth.getUser();
            const cycle = user?.cycle_type || 'Weekly';
            const baseThreshold = parseFloat(emp.overtime_threshold || 48);
            let otThreshold = baseThreshold;
            if (cycle === 'Biweekly') otThreshold = baseThreshold * 2;
            if (cycle === 'Monthly') otThreshold = baseThreshold * 4;

            const otEnabled = emp.enable_overtime !== false;

            // Recalcular extras en base al acumulado (aproximado para el resumen)
            if (otEnabled && empData.regularHours > otThreshold) {
                empData.extraHours = empData.regularHours - otThreshold;
            }

            const gross = hours * parseFloat(emp.hourly_rate);
            const deduction = emp.apply_ccss ? (gross * 0.1067) : 0;
            const net = gross - deduction;

            empData.hours += hours;
            empData.gross += gross;
            empData.deduction += deduction;
            empData.net += net;
            empData.logs.push({ ...log, isDouble, hours, gross, deduction, net });

        });

        // Convertir objeto en array para el render y guardar en estado global temporal
        const pendingSummary = Object.values(pendingByEmployee).sort((a, b) => a.name.localeCompare(b.name));
        window._pendingPayrollData = pendingByEmployee;

        return `
            <div class="card-container">
                <div class="table-header">
                    <h3>Resumen de Pagos Pendientes (Agrupado)</h3>
                    <div style="display: flex; gap: 10px">
                         <button class="btn btn-danger" onclick="window.clearAllLogs()">🗑️ Limpiar Todo</button>
                         <button class="btn btn-primary" id="process-payroll-btn">💳 Pagar Seleccionados</button>
                    </div>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 40px"><input type="checkbox" id="select-all-pending" checked></th>
                                <th>Empleado</th>
                                <th>Desde</th>
                                <th>Hasta</th>
                                <th>Extras</th>
                                <th>Dobles</th>
                                <th>Total Horas</th>
                                <th>CCSS (Est.)</th>
                                <th>Monto Neto</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pendingSummary.map(ps => {
            return `
                                <tr>
                                    <td><input type="checkbox" class="pending-check" 
                                        data-empid="${ps.empId}" 
                                        data-hours="${ps.hours}" 
                                        data-net="${ps.net}" 
                                        data-deduction="${ps.deduction}" 
                                        data-start="${ps.startDate.split('T')[0]}"
                                        data-end="${ps.endDate.split('T')[0]}"
                                        checked></td>
                                    <td style="font-weight: 600; cursor: pointer; text-decoration: underline;" 
                                        onclick="PayrollHelpers.showPayrollDetail(${ps.empId})">
                                        ${ps.name}
                                    </td>
                                    <td style="font-size: 0.85rem">${ps.startDate.split('T')[0]}</td>
                                    <td style="font-size: 0.85rem">${ps.endDate.split('T')[0]}</td>
                                    <td style="color: var(--warning)">${ps.extraHours.toFixed(1)}h</td>
                                    <td style="color: var(--accent)">${ps.doubleHours.toFixed(1)}h</td>
                                    <td style="font-weight: 600">${ps.hours.toFixed(1)}h</td>
                                    <td style="color: var(--danger)">₡${Math.round(ps.deduction).toLocaleString()}</td>
                                    <td style="color: var(--success); font-weight: 700;">₡${Math.round(ps.net).toLocaleString()}</td>
                                    <td style="display: flex; gap: 5px">
                                        <button class="btn btn-primary" title="Ver Detalle" style="padding: 5px 10px" onclick="PayrollHelpers.showPayrollDetail(${ps.empId})">${PayrollHelpers.EYE_ICON}</button>
                                        <button class="btn btn-success" title="Pagar Todo" style="padding: 5px 10px; background: var(--success);" onclick="PayrollHelpers.payEmployeeGroup(${ps.empId})">💰</button>
                                        <button class="btn btn-whatsapp" title="WhatsApp" style="padding: 5px 10px" onclick="PayrollHelpers.shareWhatsAppPending(${ps.empId})">✉️</button>
                                        <button class="btn btn-secondary" title="Editar Días" style="padding: 5px 10px" onclick="PayrollHelpers.showPayrollDetail(${ps.empId})">✏️</button>
                                        <button class="btn btn-danger" onclick="window.clearEmpLogs(${ps.empId})" style="padding: 4px 8px; font-size: 0.8rem" title="Limpiar">🗑️</button>
                                    </td>
                                </tr>
                            `;
        }).join('')}
                            ${pendingSummary.length === 0 ? '<tr><td colspan="8" style="text-align:center">No hay horas pendientes de pago</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card-container" style="margin-top: 2rem">
                <div class="table-header">
                    <h3>Historial de Pagos</h3>
                    <div style="display: flex; gap: 10px">
                        <button class="btn btn-info" onclick="window.exportCCSS()" style="background: var(--primary)">🇨🇷 Exportar CCSS</button>
                        <button class="btn btn-warning" onclick="window.exportPayments()">📥 Excel</button>
                        <button class="btn btn-danger" id="delete-selected-payments">🗑️ Eliminar</button>
                    </div>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 40px"><input type="checkbox" id="select-all-payments"></th>
                                <th title="Fecha en que se realizó el pago">Fecha Pago</th>
                                <th title="Nombre del colaborador">Empleado</th>
                                <th title="Fecha de inicio del periodo">Desde</th>
                                <th title="Fecha de fin del periodo">Hasta</th>
                                <th title="Horas extras calculadas">Extras</th>
                                <th title="Horas dobles por feriado">Dobles</th>
                                <th title="Total de horas pagadas">Horas</th>
                                <th title="Monto neto recibido">Monto Neto</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${payments.sort((a, b) => new Date(b.date) - new Date(a.date)).map(p => {
            const emp = employees.find(e => e.id == p.employee_id);
            const paymentJson = JSON.stringify(p).replace(/'/g, "&apos;");
            return `
                                    <tr>
                                        <td><input type="checkbox" class="payment-check" data-id="${p.id}" data-full-payment='${paymentJson}'></td>
                                        <td>${p.date ? p.date.split('T')[0] : '—'}</td>
                                        <td style="font-weight: 600; cursor: pointer; text-decoration: underline;" 
                                            onclick="PayrollHelpers.showPaymentHistoryDetail('${p.id}')">
                                            ${emp ? emp.name : 'Desconocido'}
                                        </td>
                                        <td style="font-size: 0.85rem">${p.start_date ? p.start_date.split('T')[0] : '—'}</td>
                                        <td style="font-size: 0.85rem">${p.end_date ? p.end_date.split('T')[0] : '—'}</td>
                                        <td style="color: var(--warning)">${(p.logs_detail || []).reduce((s, l) => s + (parseFloat(l.extra || 0)), 0).toFixed(1)}h</td>
                                        <td style="color: var(--accent)">${(p.logs_detail || []).reduce((s, l) => s + (l.is_double_day ? parseFloat(l.hours || 0) : 0), 0).toFixed(1)}h</td>
                                        <td>${parseFloat(p.hours || 0).toFixed(1)}h</td>
                                        <td style="color: var(--success); font-weight: 700;">₡${Math.round(p.amount).toLocaleString()}</td>
                                        <td style="display: flex; gap: 5px">
                                            <button class="btn btn-primary" title="Ver Detalle" style="padding: 5px 10px" onclick="PayrollHelpers.showPaymentHistoryDetail('${p.id}')">${PayrollHelpers.EYE_ICON}</button>
                                            <button class="btn btn-secondary" title="Editar" style="padding: 5px 10px" onclick="window.editPaymentRecord('${p.id}')">✏️</button>
                                            <button class="btn btn-whatsapp" title="WhatsApp" style="padding: 5px 10px" onclick="window.shareWhatsApp('${p.id}')">✉️</button>
                                            <button class="btn btn-danger" style="padding: 5px 10px" onclick="window.deletePayment('${p.id}')">🗑️</button>
                                        </td>
                                    </tr>
                                `;
        }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    init_payroll: async () => {
        const btn = document.getElementById('process-payroll-btn');
        if (btn) btn.onclick = async () => {
            const checks = document.querySelectorAll('.pending-check:checked');
            if (!checks.length || !confirm(`¿Pagar a ${checks.length} empleados?`)) return;
            Storage.showLoader(true, 'Procesando...');

            let totalAmount = 0;
            let totalHours = 0;
            let count = 0;

            for (const c of checks) {
                const empId = c.dataset.empid;
                const d = window._pendingPayrollData[empId];
                if (d) {
                    try {
                        const res = await Storage.add('payments', {
                            employeeId: parseInt(empId),
                            date: Storage.getLocalDate(),
                            amount: d.net,
                            hours: d.hours,
                            deductionCCSS: d.deduction,
                            netAmount: d.net,
                            startDate: d.startDate,
                            endDate: d.endDate,
                            logsDetail: d.logs,
                            isImported: false
                        });
                        if (res.success) {
                            for (const l of d.logs) await Storage.delete('logs', l.id);
                            totalAmount += d.net;
                            totalHours += d.hours;
                            count++;
                        }
                    } catch (err) {
                        console.error("Error pagando a empleado:", empId, err);
                    }
                }
            }

            Storage.showLoader(false);
            if (count > 0) {
                PayrollHelpers.showPayrollSuccess({ count, amount: totalAmount, hours: totalHours });
            }
            App.renderView('payroll');
        };
        const allP = document.getElementById('select-all-pending');
        if (allP) allP.onclick = () => document.querySelectorAll('.pending-check').forEach(c => c.checked = allP.checked);
        const allPy = document.getElementById('select-all-payments');
        if (allPy) allPy.onclick = () => document.querySelectorAll('.payment-check').forEach(c => c.checked = allPy.checked);

        // --- Funciones de Eliminación ---
        window.deletePayment = async (id) => {
            if (confirm("¿Está seguro de eliminar este registro de pago?")) {
                await Storage.delete('payments', id);
                App.renderView('payroll');
            }
        };

        const editLogModal = document.getElementById('edit-log-modal');
        const editLogForm = document.getElementById('edit-log-form');

        window.editLogDetailed = async (id) => {
            const logs = await Storage.get('logs');
            const l = logs.find(x => x.id == id);
            if (!l) return;

            editLogForm.logId.value = l.id;
            editLogForm.date.value = l.date.split('T')[0];
            editLogForm.timeIn.value = l.time_in || '08:00';
            editLogForm.timeOut.value = l.time_out || '17:00';
            editLogForm.isDoubleDay.checked = !!l.is_double_day;
            editLogForm.deductionHours.value = l.deduction_hours || 0;

            editLogModal.showModal();
        };

        if (editLogForm) {
            editLogForm.onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(editLogForm);
                const logId = formData.get('logId');

                const tIn = formData.get('timeIn');
                const tOut = formData.get('timeOut');
                const isDouble = editLogForm.isDoubleDay.checked;
                const deduction = parseFloat(formData.get('deductionHours') || 0);

                const start = new Date(`2000-01-01T${tIn}`);
                const end = new Date(`2000-01-01T${tOut}`);
                let diff = (end - start) / 1000 / 60 / 60;
                if (diff < 0) diff += 24;
                diff = Math.max(0, diff - deduction);
                if (isDouble) diff *= 2;

                const updates = {
                    date: formData.get('date'),
                    timeIn: tIn,
                    timeOut: tOut,
                    isDoubleDay: isDouble,
                    deductionHours: deduction,
                    hours: diff.toFixed(2),
                    employeeId: l.employee_id,
                    isPaid: l.is_paid || false,
                    isImported: l.is_imported || false
                };

                Storage.showLoader(true, 'Actualizando registro...');
                await Storage.update('logs', logId, updates);
                Storage.showLoader(false);
                editLogModal.close();

                // Si el modal de detalle estaba abierto, lo cerramos para refrescar vista de atrás
                const detailModal = document.getElementById('payroll-detail-modal');
                if (detailModal && detailModal.open) detailModal.close();

                App.renderView('payroll');
            };
        }

        window.deleteLog = async (id) => {
            if (confirm("¿Eliminar este registro de horas?")) {
                await Storage.delete('logs', id);
                // Si el modal está abierto, lo cerramos para evitar inconsistencias
                const modal = document.getElementById('payroll-detail-modal');
                if (modal && modal.open) modal.close();
                App.renderView('payroll');
            }
        };

        window.clearEmpLogs = async (empId) => {
            if (confirm("¿Eliminar TODAS las horas pendientes de este empleado?")) {
                Storage.showLoader(true, 'Eliminando...');
                await Storage.deleteLogsByEmployee(empId);
                Storage.showLoader(false);
                App.renderView('payroll');
            }
        };

        window.clearAllLogs = async () => {
            if (confirm("¿Borrar TODAS las horas pendientes del sistema?")) {
                await apiFetch('/api/maintenance/clear-all?target=logs', { method: 'DELETE' });
                App.renderView('payroll');
            }
        };

        const delSel = document.getElementById('delete-selected-payments');
        if (delSel) delSel.onclick = async () => {
            const checks = document.querySelectorAll('.payment-check:checked');
            if (!checks.length || !confirm("¿Borrar los pagos seleccionados?")) return;
            for (const c of checks) await Storage.delete('payments', c.dataset.id);
            App.renderView('payroll');
        };

        window.editPaymentRecord = async (id) => {
            const payments = await Storage.get('payments');
            const p = payments.find(x => x.id == id);
            if (!p) return;

            const newAmount = prompt("Ingrese el nuevo monto neto del pago:", Math.round(p.amount));
            if (newAmount === null) return;
            const newHours = prompt("Ingrese el total de horas:", p.hours);
            if (newHours === null) return;

            Storage.showLoader(true, 'Actualizando pago...');
            await Storage.update('payments', id, { ...p, amount: parseFloat(newAmount), hours: parseFloat(newHours), net_amount: parseFloat(newAmount) });
            Storage.showLoader(false);
            App.renderView('payroll');
        };

        // Redefine mappings for global scope access
        window.showPayrollDetail = PayrollHelpers.showPayrollDetail;
        window.showPaymentHistoryDetail = PayrollHelpers.showPaymentHistoryDetail;
        window.payEmployeeGroup = PayrollHelpers.payEmployeeGroup;
        window.shareWhatsAppPending = PayrollHelpers.shareWhatsAppPending;
        window.shareWhatsApp = Views.shareWhatsApp;
        window.payLine = PayrollHelpers.payLine;
        window.editPaymentRecord = window.editPaymentRecord;
        window.exportCCSS = Views.exportCCSS;
        window.exportPayments = Views.exportPayments;
    },

    shareWhatsApp: async (id) => {
        const pms = await Storage.get('payments'), ems = await Storage.get('employees');
        const p = pms.find(x => x.id == id), e = ems.find(x => x.id == p.employee_id);
        if (!p || !e) return;

        let details = "";
        if (p.logs_detail && p.logs_detail.length > 0) {
            details = "\n\n*DETALLE:*\n";
            p.logs_detail.forEach(l => {
                const day = new Date(l.date + 'T00:00:00').toLocaleString('es-ES', { weekday: 'short' }).toUpperCase();
                details += `• ${day} ${l.date.split('T')[0]}: ${l.time_in || '--'} - ${l.time_out || '--'} (${parseFloat(l.hours).toFixed(1)}h) → ₡${Math.round(l.net || (parseFloat(l.hours) * parseFloat(e.hourly_rate))).toLocaleString()}\n`;
            });
        }

        const text = `*COMPROBANTE TTW*\n\n*Empleado:* ${e.name}\n*Total Pagado:* ₡${Math.round(p.amount).toLocaleString()}\n*Total Horas:* ${p.hours}h${details}`;
        PayrollHelpers.sendServerWhatsApp(e.phone, text);
    },

    exportPayments: async () => {
        const pms = await Storage.get('payments'), ems = await Storage.get('employees');
        const data = pms.map(p => {
            const e = ems.find(x => x.id == p.employee_id);
            return { Fecha: p.date.split('T')[0], Empleado: e ? e.name : '--', Horas: p.hours, Monto: p.amount };
        });
        const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Pagos"); XLSX.writeFile(wb, "Pagos.xlsx");
    },

    exportCCSS: async () => {
        const now = new Date();
        const month = prompt("Ingrese el Mes (1-12):", now.getMonth() + 1);
        if (!month) return;
        const year = prompt("Ingrese el Año (YYYY):", now.getFullYear());
        if (!year) return;

        Storage.showLoader(true, 'Generando reporte CCSS...');
        try {
            const res = await apiFetch(`/api/reports/ccss?month=${month}&year=${year}`);
            const data = await res.json();

            if (data.error) throw new Error(data.error);
            if (data.length === 0) {
                alert("No se encontraron pagos con CCSS para este periodo.");
                return;
            }

            const exportData = data.map(row => ({
                'Identificación': row.cedula,
                'Nombre Completo': row.name,
                'Salario Bruto': Math.round(row.gross_salary),
                'Días Laborados': 30
            }));

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Planilla CCSS");
            XLSX.writeFile(wb, `Planilla_CCSS_${month}_${year}.xlsx`);
        } catch (e) {
            alert("Error: " + e.message);
        } finally {
            Storage.showLoader(false);
        }
    },


    downloadImportTemplate: () => {
        const headers = [
            "Fecha Inicio", "Fecha Fin", "Nombre Empleado", "Horas", "Monto Total"
        ];
        const rows = [
            ["2026-02-01", "2026-02-07", "Juan Perez", 48, 150000],
            ["2026-02-01", "2026-02-07", "Maria Lopez", 40, 120000]
        ];
        const data = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Plantilla Importacion");
        XLSX.writeFile(wb, "Plantilla_Importacion_Avantix.xlsx");
    },

    import: async () => {
        return `
            <div class="card-container">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem">
                    <div>
                        <h3>Importar Liquidación desde Excel</h3>
                        <p style="color: var(--text-muted); font-size: 0.9rem">Seleccione o arrastre el archivo de liquidación (Ini, Fin, Empleado, Horas...)</p>
                    </div>
                    <button class="btn btn-secondary" onclick="Views.downloadImportTemplate()" style="background: rgba(99,102,241,0.1); border: 1px solid var(--primary); color: var(--primary)">
                        📥 Descargar Plantilla
                    </button>
                </div>
                
                <div id="drop-zone" class="import-zone" style="border: 2px dashed var(--primary); background: rgba(99,102,241,0.02); height: 250px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; border-radius: 20px; margin-bottom: 2rem;">
                    <div style="font-size: 3.5rem; margin-bottom: 1rem">📊</div>
                    <h4 id="drop-zone-text">Arrastra tu archivo aquí</h4>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.5rem">o haz clic para buscar (.xlsx, .xls, .csv)</p>
                    <input type="file" id="excel-input" accept=".xlsx, .xls, .csv" style="position: absolute; width: 100%; height: 100%; opacity: 0; cursor: pointer;">
                </div>

                <div class="card-container" style="background: rgba(99,102,241,0.05); border: 1px solid rgba(99,102,241,0.2); padding: 1.5rem; border-radius: 12px;">
                    <h4 style="margin-bottom: 1rem; color: var(--primary);">📋 Guía de Formato Requerido</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                        <div style="font-size: 0.85rem;">
                            <strong>Columna A:</strong> Fecha Inicio (YYYY-MM-DD)
                        </div>
                        <div style="font-size: 0.85rem;">
                            <strong>Columna B:</strong> Fecha Fin (YYYY-MM-DD)
                        </div>
                        <div style="font-size: 0.85rem;">
                            <strong>Columna C:</strong> Nombre del Empleado
                        </div>
                        <div style="font-size: 0.85rem;">
                            <strong>Columna D:</strong> Horas Laboradas
                        </div>
                        <div style="font-size: 0.85rem;">
                            <strong>Columna E:</strong> Monto Total (Neto)
                        </div>
                    </div>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 1rem;">* El sistema intentará vincular automáticamente a los empleados existentes por su nombre.</p>
                </div>

                <div id="import-preview-container" style="margin-top: 3rem; display: none">
                    <div class="table-header">
                        <h3>Vista Previa de Importación</h3>
                        <div style="display: flex; gap: 10px">
                            <button class="btn btn-secondary" onclick="App.renderView('import')">Cancelar</button>
                            <button class="btn btn-primary" id="execute-import-btn">✅ Confirmar e Importar</button>
                        </div>
                    </div>
                    <div class="table-container">
                        <table id="preview-table">
                            <thead>
                                <tr>
                                    <th>Ini</th>
                                    <th>Fin</th>
                                    <th>Empleado</th>
                                    <th>Horas</th>
                                    <th>Salario Total</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    init_import: () => {
        const dropZone = document.getElementById('drop-zone');
        const input = document.getElementById('excel-input');
        const preview = document.getElementById('import-preview-container');
        let importedData = [];

        if (dropZone) dropZone.onclick = (e) => {
            if (e.target !== input) input.click();
        };

        const excelDateToJSDate = (serial) => {
            if (!serial) return null;

            // Si ya es un formato YYYY-MM-DD aproximado
            if (typeof serial === 'string' && /^\d{4}-\d{2}-\d{2}/.test(serial)) {
                return serial.split('T')[0];
            }

            // Si es un número (formato serial de Excel)
            if (!isNaN(serial) && typeof serial !== 'string') {
                const utc_days = Math.floor(serial - 25569);
                const utc_value = utc_days * 86400;
                const date_info = new Date(utc_value * 1000);
                return date_info.toISOString().split('T')[0];
            }

            // Si es un string tipo DD/MM/YYYY o DD-MM-YYYY
            if (typeof serial === 'string') {
                const parts = serial.split(/[/-]/);
                if (parts.length === 3) {
                    // Detectar si es DD/MM/YYYY o YYYY/MM/DD
                    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
            }

            // Intento final con el constructor de Date
            try {
                const d = new Date(serial);
                if (!isNaN(d.getTime())) {
                    return d.toISOString().split('T')[0];
                }
            } catch (e) { }

            return serial; // Devolver original si nada funciona
        };

        if (dropZone) {
            dropZone.ondragover = (e) => {
                e.preventDefault();
                dropZone.style.borderColor = 'var(--success)';
            };
            dropZone.ondragleave = () => {
                dropZone.style.borderColor = 'var(--primary)';
            };
            dropZone.ondrop = (e) => {
                e.preventDefault();
                dropZone.style.borderColor = 'var(--primary)';
                if (e.dataTransfer.files.length > 0) {
                    const file = e.dataTransfer.files[0];
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        try {
                            const data = new Uint8Array(ev.target.result);
                            const workbook = XLSX.read(data, { type: 'array' });
                            const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
                            const rows = sheetData.slice(1).filter(r => r && Array.isArray(r) && r.length > 0);
                            if (rows.length === 0) alert("No se encontraron filas de datos en el archivo.");
                            processImportableData(rows);
                        } catch (err) {
                            console.error(err);
                            alert("Error al procesar el archivo: " + err.message);
                        }
                    };
                    reader.readAsArrayBuffer(file);
                }
            };
        }

        if (input) input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = new Uint8Array(ev.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
                    const rows = sheetData.slice(1).filter(r => r && Array.isArray(r) && r.length > 0);
                    if (rows.length === 0) alert("No se encontraron filas de datos en el archivo.");
                    processImportableData(rows);
                } catch (err) {
                    console.error(err);
                    alert("Error al procesar el archivo: " + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        };

        const processImportableData = async (rows) => {
            const employees = await Storage.get('employees');
            const tbody = document.querySelector('#preview-table tbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            importedData = [];

            console.log("Procesando", rows.length, "filas. Empleados actuales:", employees.length);

            for (const row of rows) {
                // Columnas: A(0)=Ini, B(1)=Fin, C(2)=Empleado, D(3)=Horas, E(4)=Total
                const name = row[2] ? String(row[2]).trim() : null;
                if (!name || name === "Empleado" || name === "Nombre Empleado") continue;

                const hours = parseFloat(row[3]) || 0;
                const amount = parseFloat(row[4]) || 0;
                const dateIni = excelDateToJSDate(row[0]);
                const dateFin = excelDateToJSDate(row[1]);

                // Búsqueda más flexible del empleado
                const emp = employees.find(e =>
                    e.name.trim().toLowerCase() === name.toLowerCase() ||
                    e.name.trim().toLowerCase().includes(name.toLowerCase())
                );

                const statusText = emp ? '✅ Vinculado' : '⚠️ Autocrear';

                importedData.push({
                    name: name,
                    hours: hours,
                    amount: amount,
                    date: dateFin || Storage.getLocalDate(),
                    dateIni: dateIni,
                    dateFin: dateFin,
                    employee_id: emp ? emp.id : null,
                    rate: emp ? parseFloat(emp.hourly_rate) : (hours > 0 ? (amount / hours) : 3500)
                });

                tbody.innerHTML += `
                    <tr>
                        <td>${dateIni || '-'}</td>
                        <td>${dateFin || '-'}</td>
                        <td style="font-weight:600">${name}</td>
                        <td>${hours.toFixed(1)}h</td>
                        <td>₡${Math.round(amount).toLocaleString()}</td>
                        <td style="color: ${emp ? 'var(--success)' : 'var(--warning)'}">${statusText}</td>
                    </tr>
                `;
            }

            if (importedData.length > 0) {
                preview.style.display = 'block';
                dropZone.style.display = 'none';
            } else {
                alert("No se encontraron registros válidos. Verifique que el nombre esté en la columna C y que el archivo no esté protegido.");
            }
        };

        const executeBtn = document.getElementById('execute-import-btn');
        if (executeBtn) {
            executeBtn.onclick = async () => {
                if (!confirm(`Se importarán ${importedData.length} registros. ¿Continuar?`)) return;

                Storage.showLoader(true, 'Preparando lista de empleados...', 0);

                try {
                    // Obtener lista fresca de empleados
                    let employees = await Storage.get('employees');
                    let successCount = 0;
                    let errorCount = 0;

                    for (let i = 0; i < importedData.length; i++) {
                        const item = importedData[i];
                        const progress = Math.round(((i + 1) / importedData.length) * 100);
                        Storage.showLoader(true, `Procesando (${i + 1}/${importedData.length}): ${item.name}`, progress);

                        try {
                            const trimmedName = item.name.trim();
                            // IMPORTANTE: Buscar de nuevo por nombre para evitar duplicar si ya lo creamos
                            // en una iteración anterior de este mismo bucle.
                            let emp = employees.find(e =>
                                e.name.trim().toLowerCase() === trimmedName.toLowerCase()
                            );

                            let empId = emp ? emp.id : null;

                            // Si no existe, lo creamos
                            if (!empId) {
                                const newEmpResult = await Storage.add('employees', {
                                    name: trimmedName,
                                    position: 'Importado',
                                    hourlyRate: item.rate || 3500,
                                    startDate: item.date,
                                    status: 'Active',
                                    applyCCSS: false,
                                    salaryHistory: []
                                });

                                if (newEmpResult.success && newEmpResult.id) {
                                    empId = newEmpResult.id;
                                    // Lo añadimos a nuestra lista local para no volver a crearlo si aparece más abajo
                                    employees.push({
                                        id: empId,
                                        name: trimmedName,
                                        hourly_rate: item.rate || 3500
                                    });
                                } else {
                                    console.error("No se pudo crear empleado:", trimmedName);
                                    errorCount++;
                                    continue;
                                }
                            }

                            // Guardar directamente en la tabla de pagos (historial)
                            const paymentResult = await Storage.add('payments', {
                                employeeId: parseInt(empId),
                                amount: item.amount,
                                hours: item.hours,
                                deductionCCSS: 0,
                                netAmount: item.amount,
                                date: item.date, // Usar la fecha del periodo del Excel
                                isImported: true,
                                startDate: item.dateIni,
                                endDate: item.dateFin,
                                logsDetail: [{
                                    date: item.dateFin,
                                    hours: item.hours,
                                    net: item.amount,
                                    note: 'Importado de Excel (Liquidación Semanal)'
                                }]
                            });

                            if (paymentResult.success) {
                                successCount++;
                            } else {
                                errorCount++;
                            }
                        } catch (err) {
                            console.error("Fallo registro individual:", err);
                            errorCount++;
                        }
                    }

                    Storage.showLoader(false);
                    alert(`Importación finalizada.\n✅ Éxito: ${successCount}\n❌ Error/Omitido: ${errorCount}`);
                    App.switchView('payroll');

                } catch (err) {
                    Storage.showLoader(false);
                    console.error("Error crítico en importación:", err);
                    alert("Error crítico durante la importación.");
                }
            };
        }
    },

    users: async () => {
        const currentUser = Auth.getUser();
        if (currentUser.role !== 'owner' && currentUser.role !== 'super_admin') {
            return `<div class="card-container"><p style="color:var(--danger)">Acceso denegado. Solo administradores pueden gestionar usuarios.</p></div>`;
        }
        try {
            const users = await apiFetch(`/api/users?_t=${Date.now()}`).then(r => r.json());

            return `
                <div class="card-container">
                    <div class="table-header">
                        <h3>Gestión de Usuarios Admins</h3>
                        <button class="btn btn-primary" onclick="window.openUserModal()">+ Nuevo Admin</button>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Empresa</th>
                                    <th>Usuario</th>
                                    <th>Rol</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${users.map(u => `
                                    <tr>
                                        <td>${u.name}</td>
                                        <td style="font-size: 0.8rem; color: var(--text-muted)">${u.business_name || 'N/A'}</td>
                                        <td>${u.username}</td>
                                        <td><span class="badge ${u.role === 'super_admin' ? 'badge-primary' : u.role === 'owner' ? 'badge-secondary' : 'badge-info'}" style="font-size: 0.8rem; padding: 2px 6px;">${ROLES[u.role] || u.role}</span></td>
                                        <td>
                                            <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="window.openUserModal('${u.id}')">✏️</button>
                                            <button class="btn btn-danger" style="padding: 4px 8px;" onclick="window.deleteUser('${u.id}')">🗑️</button>
                                        </td>
                                    </tr>
                                `).join('')}
                                ${users.length === 0 ? '<tr><td colspan="5" style="text-align:center">No hay usuarios registrados.</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (err) {
            return `<div class="card-container"><p style="color:var(--danger)">Error de conexión: ${err.message}</p></div>`;
        }
    },

    adminSuperUsers: async () => {
        try {
            const users = await apiFetch(`/api/users?role=super_admin&_t=${Date.now()}`).then(r => r.json());

            if (!Array.isArray(users)) {
                return `<div class="card-container"><p style="color:var(--danger)">Error al cargar super usuarios: ${users.error || 'Respuesta inválida'}</p></div>`;
            }

            return `
                <div class="card-container">
                    <div class="table-header">
                        <h3>Gestión de Super Usuarios Desarrollador</h3>
                        <button class="btn btn-primary" onclick="window.openUserModal()">+ Nuevo Super Usuario</button>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Usuario</th>
                                    <th>Rol</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${users.map(u => `
                                    <tr>
                                        <td>${u.name}</td>
                                        <td>${u.username}</td>
                                        <td><span class="badge badge-primary" style="font-size: 0.8rem; padding: 2px 6px;">${ROLES.super_admin}</span></td>
                                        <td>
                                            <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="window.openUserModal('${u.id}')">✏️</button>
                                            <button class="btn btn-danger" style="padding: 4px 8px;" onclick="window.deleteUser('${u.id}')">🗑️</button>
                                        </td>
                                    </tr>
                                `).join('')}
                                ${users.length === 0 ? '<tr><td colspan="4" style="text-align:center">No hay super usuarios registrados.</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (err) {
            return `<div class="card-container"><p style="color:var(--danger)">Error de conexión: ${err.message}</p></div>`;
        }
    },

    init_adminSuperUsers: async () => {
        await Views.init_users();
    },

    profile: async () => {
        const user = Auth.getUser();
        const biz = await apiFetch('/api/settings/business').then(r => r.json()).catch(() => ({}));

        return `
            <div class="card-container">
                <h3>🏢 Configuración de Empresa</h3>
                <form id="business-settings-form" class="form-grid" style="margin-top: 1.5rem;">
                    <div style="grid-column: span 2; margin-bottom: 1rem;">
                        <h4 style="color: var(--primary); border-bottom: 1px solid rgba(99,102,241,0.2); padding-bottom: 5px;">Información General</h4>
                    </div>
                    <div class="form-group">
                        <label>Nombre Comercial</label>
                        <input type="text" name="name" value="${biz.name || ''}" required>
                    </div>
                    <div class="form-group">
                        <label>Razón Social (Legal)</label>
                        <input type="text" name="legal_name" value="${biz.legal_name || ''}">
                    </div>
                    <div class="form-group">
                        <label>Tipo de Identidad</label>
                        <select name="legal_type">
                            <option value="Persona Jurídica" ${biz.legal_type === 'Persona Jurídica' ? 'selected' : ''}>Persona Jurídica</option>
                            <option value="Persona Física" ${biz.legal_type === 'Persona Física' ? 'selected' : ''}>Persona Física</option>
                            <option value="Sociedad Anónima (S.A.)" ${biz.legal_type === 'Sociedad Anónima (S.A.)' ? 'selected' : ''}>Sociedad Anónima (S.A.)</option>
                            <option value="Soc. Resp. Limitada (S.R.L.)" ${biz.legal_type === 'Soc. Resp. Limitada (S.R.L.)' ? 'selected' : ''}>Soc. Resp. Limitada (S.R.L.)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Cédula o Identificación</label>
                        <input type="text" name="cedula_juridica" value="${biz.cedula_juridica || ''}">
                    </div>

                    <div style="grid-column: span 2; margin-top: 2rem; margin-bottom: 1rem;">
                        <h4 style="color: var(--primary); border-bottom: 1px solid rgba(99,102,241,0.2); padding-bottom: 5px;">Ubicación</h4>
                    </div>
                    <div class="form-group">
                        <label>País</label>
                        <input type="text" name="country" value="${biz.country || 'Costa Rica'}">
                    </div>
                    <div class="form-group">
                        <label>Provincia / Estado</label>
                        <input type="text" name="state" value="${biz.state || ''}">
                    </div>
                    <div class="form-group">
                        <label>Cantón / Ciudad</label>
                        <input type="text" name="city" value="${biz.city || ''}">
                    </div>
                    <div class="form-group">
                        <label>Distrito / Barrio</label>
                        <input type="text" name="district" value="${biz.district || ''}">
                    </div>
                    <div class="form-group" style="grid-column: span 2">
                        <label>Dirección Exacta</label>
                        <textarea name="address" rows="2" style="width: 100%; border-radius: 8px; background: var(--input-bg); border: 1px solid var(--border); color: var(--input-color); padding: 10px;">${biz.address || ''}</textarea>
                    </div>

                    <div style="grid-column: span 2; margin-top: 2rem; margin-bottom: 1rem;">
                        <h4 style="color: var(--primary); border-bottom: 1px solid rgba(99,102,241,0.2); padding-bottom: 5px;">Ajustes del Sistema</h4>
                    </div>
                    <div class="form-group">
                        <label>Factor Horas Extra (Ej: 1.5)</label>
                        <input type="number" name="default_overtime_multiplier" step="0.1" value="${biz.default_overtime_multiplier || 1.5}">
                    </div>
                    <div class="form-group">
                        <label>Ciclo de Pago</label>
                        <select name="cycle_type">
                            <option value="Weekly" ${biz.cycle_type === 'Weekly' ? 'selected' : ''}>Semanal</option>
                            <option value="Biweekly" ${biz.cycle_type === 'Biweekly' ? 'selected' : ''}>Quincenal</option>
                            <option value="Monthly" ${biz.cycle_type === 'Monthly' ? 'selected' : ''}>Mensual</option>
                        </select>
                    </div>
                    <div class="form-group" style="grid-column: span 2;">
                        <label>Logo de la Empresa</label>
                        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                            <img src="${biz.logo_url || ''}" id="profile-logo-preview" style="max-height: 50px; border-radius: 8px; background: rgba(255,255,255,0.05); ${biz.logo_url ? '' : 'display:none;'}">
                            <button type="button" class="btn btn-secondary" onclick="document.getElementById('logo-upload-input').click()">📁 Subir Logo</button>
                            ${biz.logo_url ? `<button type="button" class="btn btn-danger" id="btn-remove-logo" style="padding: 8px 12px;">🗑️ Quitar Logo</button>` : ''}
                            <input type="file" id="logo-upload-input" accept="image/*" style="display: none;">
                            <p style="font-size: 0.75rem; color: var(--text-muted); width: 100%;">Máx 2MB. PNG, JPG, SVG. Si no hay logo, se mostrará el nombre.</p>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Preferencia de Tema</label>
                        <select name="theme_preference">
                            <option value="dark" ${biz.theme_preference === 'dark' ? 'selected' : ''}>Oscuro</option>
                            <option value="light" ${biz.theme_preference === 'light' ? 'selected' : ''}>Claro</option>
                        </select>
                    </div>

                    <div style="grid-column: span 2; margin-top: 30px;">
                        <button type="submit" class="btn btn-primary" style="width: 100%; padding: 15px; font-weight: 600;">Guardar Todos los Cambios</button>
                    </div>
                </form>
            </div>

            <div class="card-container" style="margin-top: 2rem; border: 1px solid var(--danger); background: rgba(239, 68, 68, 0.02);">
                <div style="margin-bottom: 1.5rem">
                    <h3 style="color: var(--danger)">🛠️ Zona de Mantenimiento</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem">Use estas opciones para corregir errores de importación o reiniciar el sistema. <strong>Cuidado: Esta acción es irreversible.</strong></p>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <button class="btn btn-danger" onclick="window.clearTable('logs')">🗑️ Borrar Horas Pendientes</button>
                    <button class="btn btn-danger" onclick="window.clearTable('payments')">🗑️ Borrar Historial Pagos</button>
                    <button class="btn btn-danger" onclick="window.clearTable('employees')">🗑️ Borrar Todos los Empleados</button>
                    <button class="btn" style="background: var(--danger); color: white; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);" onclick="window.clearTable('all')">🔥 REINICIO TOTAL</button>
                </div>
            </div>
        `;
    },

    init_users: async () => {
        const modal = document.getElementById('user-modal');
        const form = document.getElementById('user-form');
        const roleSelect = document.getElementById('user-role-select');
        const currentUser = Auth.getUser();

        window.openUserModal = async (id = null) => {
            form.reset();
            const idInput = document.getElementById('user-id-input');
            const title = document.getElementById('user-modal-title');
            if (idInput) idInput.value = id || '';
            if (title) title.textContent = id ? 'Editar Usuario' : 'Nuevo Usuario';

            // Configurar opciones de rol dinámicamente
            if (roleSelect) {
                let options = `
                    <option value="editor">Admin Editor (Solo Planillas)</option>
                    <option value="owner">Admin Dueño (Control de Empresa)</option>
                `;
                if (currentUser.role === 'super_admin') {
                    options += '<option value="super_admin">Super Administrador (Global)</option>';
                }
                roleSelect.innerHTML = options;

                // Si estamos en la vista de super usuarios, preseleccionar super_admin
                if (App.currentView === 'adminSuperUsers' && !id && currentUser.role === 'super_admin') {
                    roleSelect.value = 'super_admin';
                }
            }

            if (id) {
                // Fetch user data directly to ensure we have it regardless of current view filtering
                const u = await apiFetch(`/api/users/${id}`).then(r => r.json()).catch(() => null);
                if (u) {
                    form.name.value = u.name;
                    form.username.value = u.username;
                    if (roleSelect) roleSelect.value = u.role || 'editor';
                }
            }
            if (modal) modal.showModal();
        };

        window.deleteUser = async (id) => {
            const currentUser = Auth.getUser();
            if (currentUser && id == currentUser.id) return alert('No puede eliminarse a sí mismo');
            if (!confirm('¿Eliminar este usuario administrador?')) return;
            await Storage.delete('users', id);
            App.renderView(App.currentView);
        };

        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                const id = document.getElementById('user-id-input').value;
                const data = {
                    name: form.name.value,
                    username: form.username.value,
                    role: roleSelect ? roleSelect.value : (form.role ? form.role.value : 'editor')
                };
                if (form.password.value) {
                    data.password = form.password.value;
                } else if (!id) {
                    return alert('La contraseña es obligatoria para nuevos usuarios');
                }

                Storage.showLoader(true, id ? 'Actualizando usuario...' : 'Creando usuario...');
                try {
                    let result;
                    if (id) {
                        result = await Storage.update('users', id, data);
                    } else {
                        result = await Storage.add('users', data);
                    }

                    if (result && (result.success || result.id)) {
                        modal.close();
                        App.renderView(App.currentView);
                    } else {
                        alert('Error: ' + (result?.error || 'No se pudo guardar el usuario'));
                    }
                } catch (err) {
                    console.error("User form submit error:", err);
                    alert('Error técnico al procesar el usuario');
                } finally {
                    Storage.showLoader(false);
                }
            };
        }
    },

    init_profile: async () => {
        const bizForm = document.getElementById('business-settings-form');

        if (bizForm) {
            const uploadInput = document.getElementById('logo-upload-input');
            const removeLogoBtn = document.getElementById('btn-remove-logo');
            if (removeLogoBtn) {
                removeLogoBtn.onclick = async () => {
                    if (!confirm("¿Seguro que desea quitar el logo de la empresa?")) return;

                    Storage.showLoader(true, 'Quitando logo...');
                    try {
                        const session = Auth.getUser();
                        const res = await apiFetch('/api/settings/business', {
                            method: 'PUT',
                            body: JSON.stringify({ ...session, logo_url: null })
                        });
                        const result = await res.json();
                        if (result.id) {
                            localStorage.setItem(Auth.SCHEMA, JSON.stringify({ ...session, logo_url: null }));
                            alert("Logo eliminado con éxito.");
                            location.reload();
                        } else {
                            alert("Error: " + result.error);
                        }
                    } catch (err) { alert("Error de conexión"); }
                    finally { Storage.showLoader(false); }
                };
            }

            if (uploadInput) {
                uploadInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) return alert("El archivo supera los 2MB permitidos.");

                    const formData = new FormData();
                    formData.append('logo', file);

                    Storage.showLoader(true, 'Subiendo logo...');
                    try {
                        const res = await apiFetch('/api/settings/upload-logo', {
                            method: 'POST',
                            body: formData
                        });
                        const result = await res.json();
                        if (result.success) {
                            const preview = document.getElementById('profile-logo-preview');
                            if (preview) {
                                preview.src = result.logo_url;
                                preview.style.display = 'block';
                            }
                            // Actualizar sesión para reflejar en sidebar de inmediato
                            const session = Auth.getUser();
                            localStorage.setItem(Auth.SCHEMA, JSON.stringify({ ...session, logo_url: result.logo_url }));
                            alert("Logo actualizado con éxito.");
                            location.reload();
                        } else {
                            alert("Error: " + result.error);
                        }
                    } catch (err) { alert("Error de conexión"); }
                    finally { Storage.showLoader(false); }
                };
            }

            bizForm.onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(bizForm);
                const data = Object.fromEntries(formData.entries());

                Storage.showLoader(true, 'Actualizando configuración...');
                try {
                    const res = await apiFetch('/api/settings/business', {
                        method: 'PUT',
                        body: JSON.stringify(data)
                    });
                    const result = await res.json();
                    if (result.id) {
                        // Actualizar sesión local para cambios inmediatos (logo y tema)
                        const session = Auth.getUser();
                        localStorage.setItem(Auth.SCHEMA, JSON.stringify({
                            ...session,
                            business_name: result.name,
                            logo_url: result.logo_url,
                            theme_preference: result.theme_preference,
                            cycle_type: result.cycle_type,
                            default_overtime_multiplier: result.default_overtime_multiplier
                        }));

                        // Aplicar tema inmediatamente si cambió
                        document.documentElement.setAttribute('data-theme', result.theme_preference);

                        alert('Configuración actualizada con éxito.');
                        location.reload();
                    } else {
                        alert('Error: ' + (result.error || 'Desconocido'));
                    }
                } catch (err) {
                    alert('Error de conexión');
                } finally {
                    Storage.showLoader(false);
                }
            };
        }
    }
};

// --- Boostrap ---
document.addEventListener('DOMContentLoaded', () => App.init());
