/**
 * Planillas Tom Tom Wok - Core Logic
 */

// --- Payroll Global Helpers (Top Level) ---
window._pendingPayrollData = {};
const PayrollHelpers = {
    // Icono minimalista de ojo
    EYE_ICON: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:-2px"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>`,

    showWhatsAppConfirm: (text) => {
        const modal = document.getElementById('whatsapp-confirm-modal');
        const content = document.getElementById('whatsapp-confirm-content');
        if (modal && content) {
            content.textContent = text;
            modal.showModal();
        }
    },

    sendServerWhatsApp: async (phone, text) => {
        if (!phone) return alert("El empleado no tiene teléfono registrado.");
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
            if (res.success) { for (const l of d.logs) await Storage.delete('logs', l.id); App.renderView('payroll'); }
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
        const text = `*RESUMEN PAGO - TTW*\n\n*Empleado:* ${d.name}\n*Total Neto:* ₡${Math.round(d.net).toLocaleString()}\n*Total Horas:* ${d.hours.toFixed(1)}h${details}`;
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
    if (session.business_id) headers['X-Business-ID'] = session.business_id;
    if (session.role) headers['X-User-Role'] = session.role;

    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        alert("Sesión expirada o no autorizada");
        Auth.logout();
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
        if (!Auth.isAuthenticated()) {
            this.renderLogin();
            return;
        }

        const user = Auth.getUser();
        console.log("Sesión activa:", user.username, "Rol:", user.role);
        const appElem = document.getElementById('app');
        const loginView = document.getElementById('login-view');
        if (appElem) appElem.style.display = 'flex';
        if (loginView) loginView.style.display = 'none';

        // --- Dynamic Branding ---
        const bizNameDisplay = document.querySelector('.sidebar-header h2');
        if (bizNameDisplay) bizNameDisplay.textContent = user.business_name || 'Avantix SaaS';

        const logoDisplay = document.querySelector('.sidebar-header .logo');
        if (logoDisplay && user.logo_url) {
            logoDisplay.src = user.logo_url;
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
            await this.renderView('calculator');
        } else if (user.role === 'super_admin') {
            document.getElementById('nav-admin-businesses').style.display = 'flex';
            document.getElementById('nav-admin-stats').style.display = 'flex';
            this.setupNavigation();
            await this.renderView('adminStats');
        } else {
            // Owner/Editor
            this.setupNavigation();
            await this.renderView('dashboard');
        }

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.onclick = () => Auth.logout();
        }

        this.setupMobileMenu();
        this.setupEmployeeModal();
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

            if (id) {
                const employees = await Storage.get('employees');
                const oldEmp = employees.find(e => e.id == id);
                if (oldEmp) empData.salaryHistory = oldEmp.salary_history || [];
                await Storage.update('employees', id, empData);
            } else {
                await Storage.add('employees', empData);
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

    renderLogin() {
        const appElem = document.getElementById('app');
        const loginView = document.getElementById('login-view');
        if (appElem) appElem.style.display = 'none';
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
                if (loginView) loginView.style.display = 'none';
                if (appElem) appElem.style.display = 'flex'; // Usamos el container de app para el onboarding
                this.renderView('registration');
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
        const navItem = document.querySelector(`[data-view="${view}"]`);
        if (navItem) {
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            navItem.classList.add('active');
        }

        const titles = {
            dashboard: 'Dashboard',
            employees: 'Gestión de Empleados',
            employeeDetail: 'Detalle de Empleado',
            calculator: 'Calculadora de Pago Semanal',
            payroll: 'Cálculo de Planillas',
            benefits: 'Prestaciones de Ley',
            import: 'Importar Datos Excel',
            profile: 'Configuración de Mi Perfil',
            adminBusinesses: 'Gestión de Empresas SaaS',
            adminStats: 'Métricas Globales',
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
        const response = await fetch(`/api/maintenance/clear-all?target=${target}`, { method: 'DELETE' });
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
const Views = {
    registration: async () => {
        return `
            <div class="card" style="max-width: 600px; margin: 2rem auto;">
                <h3 style="margin-bottom: 2rem; text-align: center; color: var(--primary);">Registrar Nueva Empresa</h3>
                <form id="registration-form" class="form-grid">
                    <div class="form-group">
                        <label>Nombre de la Empresa</label>
                        <input type="text" name="businessName" placeholder="Ej: Restaurante El Sabor" required>
                    </div>
                    <div class="form-group">
                        <label>Cédula Jurídica</label>
                        <input type="text" name="cedulaJuridica" placeholder="Ej: 3-101-123456" required>
                    </div>
                    <hr style="grid-column: span 2; opacity: 0.1; margin: 1rem 0;">
                    <div class="form-group">
                        <label>Nombre del Propietario</label>
                        <input type="text" name="ownerName" placeholder="Ej: Juan Pérez" required>
                    </div>
                    <div class="form-group">
                        <label>Usuario para el Sistema</label>
                        <input type="text" name="username" placeholder="juan.perez" required>
                    </div>
                    <div class="form-group">
                        <label>Contraseña</label>
                        <input type="password" name="password" placeholder="••••••••" required>
                    </div>
                    <div style="grid-column: span 2; margin-top: 2rem;">
                        <button type="submit" class="btn btn-primary" style="width: 100%;">Crear Cuenta y Comenzar</button>
                        <button type="button" class="btn btn-secondary" style="width: 100%; margin-top: 10px;" onclick="location.reload()">Cancelar</button>
                    </div>
                </form>
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
                                <th>Nombre</th>
                                <th>Cédula</th>
                                <th>Estado</th>
                                <th>Ciclo</th>
                                <th>Creado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${businesses.map(b => `
                                <tr>
                                    <td><strong>${b.name}</strong></td>
                                    <td>${b.cedula_juridica}</td>
                                    <td><span class="badge" style="background: ${b.status === 'Active' ? 'var(--success)' : 'var(--danger)'}">${b.status}</span></td>
                                    <td>${b.cycle_type}</td>
                                    <td>${new Date(b.created_at).toLocaleDateString()}</td>
                                    <td>
                                        <button class="btn btn-secondary" onclick="window.editBusiness(${b.id})">✏️</button>
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
        return `
            <div class="grid-3">
                <div class="stat-card">
                    <div class="stat-icon" style="background: rgba(99, 102, 241, 0.1); color: var(--primary);">🏢</div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.businesses}</div>
                        <div class="stat-label">Empresas Activas</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: var(--success);">👥</div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.activeEmployees}</div>
                        <div class="stat-label">Empleados Totales</div>
                    </div>
                </div>
            </div>
            <div class="card" style="margin-top: 2rem;">
                <h3>Actividad Reciente</h3>
                <p style="color: var(--text-muted);">Muro de actividad global del SaaS.</p>
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
        form.onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            Storage.showLoader(true, 'Creando su empresa...');
            try {
                const res = await fetch('/api/onboarding/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if (result.success) {
                    alert('Empresa creada con éxito. Ahora puede iniciar sesión.');
                    location.reload();
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (err) {
                alert('Error de conexión');
            } finally {
                Storage.showLoader(false);
            }
        };
    },

    init_adminBusinesses: async () => {
        window.showAddBusinessModal = () => {
            alert("Acción de Super Admin: Abrir modal de creación de empresa (Por implementar)");
        };
        window.editBusiness = (id) => {
            alert("Acción de Super Admin: Editar empresa " + id);
        };
    },

    init_adminStats: async () => {
        // Podríamos cargar gráficas globales aquí
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
                                    <td style="font-weight:600; cursor:pointer; color:white" onclick="App.switchView('employeeDetail', '${emp.id}')">${emp.name}</td>
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
                                        <td style="color: white">${p.date ? p.date.split('T')[0] : '—'}</td>
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
        // Robustez: Si el rol es admin o si el usuario no tiene rol pero está logueado por el form de admin
        const isAdmin = user && (user.role === 'admin' || (user.username && user.role !== 'employee'));
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
                                ${isAdmin ? '<th>Horas Dobles</th>' : ''}
                                ${isAdmin ? '<th>Horas Almuerzo</th>' : ''}
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
                ${Auth.getUser().role === 'admin' ? '<td style="text-align:center"><input type="checkbox" class="calc-double" title="Marcar como Día Doble" style="width: 20px; height: 20px;"></td>' : ''}
                ${Auth.getUser().role === 'admin' ? '<td><input type="number" class="calc-deduction" value="0" step="0.5" style="width:100px" title="Horas de almuerzo o permisos"></td>' : ''}
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
            const otThreshold = emp ? parseFloat(emp.overtime_threshold || 48) : 48;
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
                const response = await fetch('/api/logs/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ employeeId: parseInt(empId), logs: batchLogs })
                });

                const result = await response.json();
                Storage.showLoader(false);

                if (result.success) {
                    PayrollHelpers.showWhatsAppConfirm(result.messageSent);

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

            const otThreshold = parseFloat(emp.overtime_threshold || 48);
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
                                    <td style="font-weight: 600; color: white; cursor: pointer; text-decoration: underline;" 
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
                                        <td style="font-weight: 600; color: white; cursor: pointer; text-decoration: underline;" 
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
            for (const c of checks) await PayrollHelpers.payEmployeeGroup(c.dataset.empid);
            Storage.showLoader(false); App.renderView('payroll');
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
                await fetch('/api/maintenance/clear-all?target=logs', { method: 'DELETE' });
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

    benefits: async () => {
        const employees = await Storage.get('employees');
        return `
            <div class="grid-2">
                <div class="card-container">
                    <h3>Calculadora de Prestaciones (CR)</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem">Basado en legislación costarricense (Cálculo aproximado).</p>
                    <div class="form-group">
                        <label>Seleccionar Empleado</label>
                        <select id="benefit-emp-select">
                            <option value="">Seleccione...</option>
                            ${employees.filter(e => e.status === 'Active').map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
                        </select>
                    </div>
                    <div id="benefit-results" style="margin-top: 1.5rem">
                         <div style="text-align: center; color: var(--text-muted)">Seleccione un empleado para ver la proyección anual</div>
                    </div>
                </div>

                <div class="card-container" style="background: linear-gradient(135deg, var(--bg-card) 0%, #2d3748 100%); border: 1px solid var(--primary);">
                    <h3 style="color: var(--primary)">Información Legal</h3>
                    <ul style="margin: 1rem 0; color: var(--text-muted); line-height: 1.6; list-style-position: inside;">
                        <li><strong>Aguinaldo:</strong> Un mes de salario promedio (1/12 de lo ganado en el año).</li>
                        <li><strong>Vacaciones:</strong> 2 semanas por cada 50 trabajadas.</li>
                        <li><strong>Cesantía:</strong> Indemnización en caso de despido sin causa.</li>
                    </ul>
                    <div style="padding: 1rem; background: rgba(99, 102, 241, 0.1); border-radius: 12px; border-left: 4px solid var(--primary)">
                        <small>Estos cálculos son ilustrativos y se basan en el pago por hora actual multiplicado por una jornada estándar.</small>
                    </div>
                </div>
            </div>
        `;
    },

    init_benefits: async () => {
        const select = document.getElementById('benefit-emp-select');
        const results = document.getElementById('benefit-results');

        if (select) {
            select.onchange = async () => {
                const empId = select.value;
                if (!empId) return;

                const employees = await Storage.get('employees');
                const emp = employees.find(e => e.id == empId);
                const rate = parseFloat(emp.hourly_rate);
                const monthlySalary = rate * 8 * 26; // Est mntly (26 days)

                const aguinaldo = monthlySalary;
                const vacaciones = (monthlySalary / 30) * 14;
                const cesantia = monthlySalary * 0.5; // Simplificado

                results.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <div class="stat-card" style="background: rgba(255,255,255,0.02)">
                            <h3 style="margin:0">Proyección Aguinaldo</h3>
                            <div class="value" style="color: var(--success); font-size: 1.5rem">₡${Math.round(aguinaldo).toLocaleString()}</div>
                        </div>
                        <div class="stat-card" style="background: rgba(255,255,255,0.02)">
                            <h3 style="margin:0">Proyección Vacaciones</h3>
                            <div class="value" style="color: var(--warning); font-size: 1.5rem">₡${Math.round(vacaciones).toLocaleString()}</div>
                        </div>
                        <div class="stat-card" style="background: rgba(255,255,255,0.02)">
                            <h3 style="margin:0">Proyección Cesantía</h3>
                            <div class="value" style="color: var(--accent); font-size: 1.5rem">₡${Math.round(cesantia).toLocaleString()}</div>
                        </div>
                    </div>
                `;
            };
        }
    },

    import: async () => {
        return `
            <div class="card-container">
                <div style="margin-bottom: 2rem">
                    <h3>Importar Liquidación desde Excel</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem">Seleccione o arrastre el archivo de liquidación (Ini, Fin, Empleado, Horas...)</p>
                </div>
                
                <div id="drop-zone" class="import-zone" style="border: 2px dashed var(--primary); background: rgba(99,102,241,0.02); height: 250px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; border-radius: 20px;">
                    <div style="font-size: 3.5rem; margin-bottom: 1rem">📊</div>
                    <h4 id="drop-zone-text">Arrastra tu archivo aquí</h4>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.5rem">o haz clic para buscar (.xlsx, .xls, .csv)</p>
                    <input type="file" id="excel-input" accept=".xlsx, .xls, .csv" style="position: absolute; width: 100%; height: 100%; opacity: 0; cursor: pointer;">
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
                // Columnas: A(0)=Ini, B(1)=Fin, C(2)=Empleado, D(3)=Horas, ..., O(14)=Total
                const name = row[2] ? String(row[2]).trim() : null;
                if (!name || name === "Empleado") continue; // Saltar si no hay nombre o es encabezado repetido

                const hours = parseFloat(row[3]) || 0;
                const amount = parseFloat(row[14]) || 0;
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

    profile: async () => {
        const user = Auth.getUser();
        const users = await Storage.get('users');

        let businessSection = '';
        if (user.role === 'owner' || user.role === 'super_admin') {
            const biz = await apiFetch('/api/settings/business').then(r => r.json()).catch(() => ({}));
            businessSection = `
                <div class="card-container" style="margin-top: 2rem;">
                    <h3>🏢 Configuración de Empresa</h3>
                    <form id="business-settings-form" class="form-grid" style="margin-top: 1.5rem;">
                        <div class="form-group">
                            <label>Nombre de la Empresa</label>
                            <input type="text" name="name" value="${biz.name || ''}" required>
                        </div>
                        <div class="form-group">
                            <label>Cédula Jurídica</label>
                            <input type="text" name="cedula_juridica" value="${biz.cedula_juridica || ''}" required>
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
                        <div style="grid-column: span 2; margin-top: 1rem;">
                            <button type="submit" class="btn btn-primary">Guardar Cambios de Empresa</button>
                        </div>
                    </form>
                </div>
            `;
        }

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
                                    <td><span class="badge ${u.role === 'super_admin' ? 'badge-primary' : u.role === 'owner' ? 'badge-secondary' : 'badge-info'}" style="font-size: 0.8rem; padding: 2px 6px;">${u.role}</span></td>
                                    <td>
                                        <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="window.openUserModal('${u.id}')">✏️</button>
                                        <button class="btn btn-danger" style="padding: 4px 8px;" onclick="window.deleteUser('${u.id}')">🗑️</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

            ${businessSection}

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

            <dialog id="user-modal">
                <div class="modal-content">
                    <button class="modal-close-btn" onclick="document.getElementById('user-modal').close()">✕</button>
                    <h3 id="user-modal-title">Registrar Usuario</h3>
                    <form id="user-form" style="display: flex; flex-direction: column; gap: 15px; margin-top: 1rem">
                        <input type="hidden" name="id" id="user-id-input">
                        <div class="form-group">
                            <label>Nombre Real</label>
                            <input type="text" name="name" required>
                        </div>
                        <div class="form-group">
                            <label>Nombre de Usuario</label>
                            <input type="text" name="username" required>
                        </div>
                        <div class="form-group">
                            <label>Rol</label>
                            <select name="role">
                                <option value="editor">Admin Editor (Solo Planillas)</option>
                                <option value="owner">Admin Dueño (Control de Empresa)</option>
                                ${user.role === 'super_admin' ? '<option value="super_admin">Super Administrador (Global)</option>' : ''}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Contraseña (Opcional si edita)</label>
                            <div class="password-wrapper">
                                <input type="password" name="password" id="admin-password-input">
                                <button type="button" class="password-toggle" onclick="window.togglePassword('admin-password-input')">${PayrollHelpers.EYE_ICON}</button>
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 20px;">
                            <button type="submit" class="btn btn-primary" style="flex:1">Guardar</button>
                            <button type="button" class="btn btn-secondary" style="flex:1" onclick="document.getElementById('user-modal').close()">Cerrar</button>
                        </div>
                    </form>
                </div>
            </dialog>
        `;
    },

    init_profile: async () => {
        const modal = document.getElementById('user-modal');
        const form = document.getElementById('user-form');
        const bizForm = document.getElementById('business-settings-form');

        if (bizForm) {
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

        window.openUserModal = async (id = null) => {
            form.reset();
            const idInput = document.getElementById('user-id-input');
            const title = document.getElementById('user-modal-title');
            if (idInput) idInput.value = id || '';
            if (title) title.textContent = id ? 'Editar Usuario' : 'Nuevo Usuario';

            if (id) {
                const users = await Storage.get('users');
                const u = users.find(x => x.id == id);
                if (u) {
                    form.name.value = u.name;
                    form.username.value = u.username;
                    form.role.value = u.role || 'editor';
                }
            }
            if (modal) modal.showModal();
        };

        window.deleteUser = async (id) => {
            const currentUser = Auth.getUser();
            if (currentUser && id == currentUser.id) return alert('No puede eliminarse a sí mismo');
            if (!confirm('¿Eliminar este usuario administrador?')) return;
            await Storage.delete('users', id);
            App.renderView('profile');
        };

        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                const id = document.getElementById('user-id-input').value;
                const data = {
                    name: form.name.value,
                    username: form.username.value,
                    role: form.role.value
                };
                if (form.password.value) data.password = form.password.value;

                if (id) {
                    await Storage.update('users', id, data);
                } else {
                    await Storage.add('users', data);
                }
                modal.close();
                App.renderView('profile');
            };
        }
    }
};

// --- Boostrap ---
document.addEventListener('DOMContentLoaded', () => App.init());
