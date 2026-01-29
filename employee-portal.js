const EmployeePortal = {
    currentEmployee: null,
    currentLogs: [],

    init() {
        this.render();
    },

    getLocalDate(d = new Date()) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    },

    async authenticate(pin) {
        try {
            const response = await fetch('/api/employee-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin })
            });

            if (response.ok) {
                const emp = await response.json();

                // Normalizar datos del empleado
                emp.hourlyRate = parseFloat(emp.hourly_rate);

                this.currentEmployee = emp;

                // Cargar logs del empleado desde el servidor
                const logsResponse = await fetch('/api/logs');
                const allLogs = await logsResponse.json();
                this.currentLogs = allLogs.filter(l => String(l.employee_id) === String(emp.id));

                this.render();
                return true;
            }
            return false;
        } catch (err) {
            console.error('Error during authentication:', err);
            return false;
        }
    },

    logout() {
        this.currentEmployee = null;
        this.currentLogs = [];
        this.render();
    },

    render() {
        const container = document.getElementById('app-container');

        if (!this.currentEmployee) {
            container.innerHTML = this.renderLogin();
            this.initLogin();
        } else {
            container.innerHTML = this.renderDashboard();
            this.initDashboard();
        }
    },

    renderLogin() {
        return `
            <div class="login-container">
                <div class="login-card">
                    <img src="img/logo_tom_tom_wok_white.png" alt="Tom Tom Wok Logo" style="width: 200px; margin-bottom: 2rem;">
                    <p style="color: var(--text-muted); margin-bottom: 2rem;">Portal de Empleados</p>
                    
                    <input 
                        type="password" 
                        id="pin-input" 
                        class="pin-input" 
                        placeholder="••••" 
                        maxlength="4"
                        inputmode="numeric"
                        pattern="[0-9]*"
                    >
                    
                    <button class="btn btn-primary" id="login-btn" style="width: 100%; padding: 1rem; font-size: 1.1rem;">
                        Ingresar
                    </button>
                    
                    <p id="error-msg" style="color: var(--danger); margin-top: 1rem; display: none;">
                        PIN incorrecto. Intenta de nuevo.
                    </p>
                </div>
            </div>
        `;
    },

    renderDashboard() {
        const logs = this.currentLogs;

        // Get current week range
        const now = new Date();
        const day = now.getDay();
        const dayNum = day === 0 ? 7 : day;
        const diffToMonday = 1 - dayNum;

        const monday = new Date(now);
        monday.setDate(now.getDate() + diffToMonday);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        const weekStart = this.getLocalDate(monday);
        const weekEnd = this.getLocalDate(sunday);

        const weekLogs = logs.filter(l => l.date >= weekStart && l.date <= weekEnd);
        const weekHours = weekLogs.reduce((s, l) => s + parseFloat(l.hours || 0), 0);
        const todayLogs = logs.filter(l => l.date && l.date.startsWith(this.getLocalDate()));
        const todayHours = todayLogs.reduce((s, l) => s + parseFloat(l.hours || 0), 0);

        return `
            <div style="padding: 1rem; max-width: 1200px; margin: 0 auto;">
                <div class="employee-header">
                    <h2 style="margin: 0;">👋 Hola, ${this.currentEmployee.name}</h2>
                    <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">${this.currentEmployee.position}</p>
                    <button class="btn" onclick="EmployeePortal.logout()" style="margin-top: 1rem; background: rgba(255,255,255,0.2);">
                        Cerrar Sesión
                    </button>
                </div>

                <div class="week-summary">
                    <div class="summary-item">
                        <div class="summary-value">${weekHours.toFixed(1)}h</div>
                        <div class="summary-label">Esta Semana</div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-value">${todayHours.toFixed(1)}h</div>
                        <div class="summary-label">Hoy</div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-value">₡${this.currentEmployee.hourlyRate}</div>
                        <div class="summary-label">Pago x Hora</div>
                    </div>
                </div>

                <div class="card-container">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h3 style="margin: 0;">Registrar Horas</h3>
                        <button class="btn" id="add-row-btn" style="background: rgba(99,102,241,0.1); color: var(--primary);">
                            + Añadir Día
                        </button>
                    </div>

                    <div class="table-container">
                        <table id="hours-table">
                            <thead>
                                <tr>
                                    <th class="col-date">Fecha</th>
                                    <th class="col-time">Entrada</th>
                                    <th class="col-time">Salida</th>
                                    <th class="col-double">Doble</th>
                                    <th class="col-num">Almuerzo</th>
                                    <th class="col-hours">Horas</th>
                                    <th class="col-action"></th>
                                </tr>
                            </thead>
                            <tbody id="hours-tbody">
                                <!-- Rows injected here -->
                            </tbody>
                        </table>
                    </div>

                    <div style="margin-top: 2rem; padding: 1.5rem; background: rgba(99,102,241,0.05); border-radius: 12px; border: 1px solid var(--primary);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-size: 0.9rem; color: var(--text-muted);">Total a Guardar</div>
                                <div id="total-hours" class="calc-total-value" style="color: var(--primary);">0.00h</div>
                            </div>
                            <button class="btn btn-primary" id="save-btn" style="padding: 1rem 2rem; font-size: 1.1rem;">
                                💾 Guardar Horas
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    initLogin() {
        const pinInput = document.getElementById('pin-input');
        const loginBtn = document.getElementById('login-btn');
        const errorMsg = document.getElementById('error-msg');

        const attemptLogin = async () => {
            const pin = pinInput.value.trim();
            if (pin.length !== 4) {
                errorMsg.style.display = 'block';
                errorMsg.textContent = 'El PIN debe tener 4 dígitos.';
                return;
            }

            if (await this.authenticate(pin)) {
                errorMsg.style.display = 'none';
            } else {
                errorMsg.style.display = 'block';
                errorMsg.textContent = 'PIN incorrecto. Intenta de nuevo.';
                pinInput.value = '';
                pinInput.focus();
            }
        };

        loginBtn.onclick = attemptLogin;
        pinInput.onkeypress = (e) => {
            if (e.key === 'Enter') attemptLogin();
        };
        pinInput.focus();
    },

    initDashboard() {
        const tbody = document.getElementById('hours-tbody');
        const addRowBtn = document.getElementById('add-row-btn');
        const saveBtn = document.getElementById('save-btn');
        const totalHoursEl = document.getElementById('total-hours');

        const createRow = () => {
            const lastRow = tbody.lastElementChild;
            let nextDate = new Date();
            let lastIn = '08:00';
            let lastOut = '17:00';

            if (lastRow) {
                const lastDateVal = lastRow.querySelector('.date-input').value;
                if (lastDateVal) {
                    const [y, m, d] = lastDateVal.split('-').map(Number);
                    const dt = new Date(y, m - 1, d);
                    dt.setDate(dt.getDate() + 1);
                    nextDate = dt;
                }
                lastIn = lastRow.querySelector('.time-in').value;
                lastOut = lastRow.querySelector('.time-out').value;
            }

            const dateStr = this.getLocalDate(nextDate);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="col-date"><input type="date" class="date-input" value="${dateStr}" style="width: 100%;"></td>
                <td class="col-time"><input type="time" class="time-in" value="${lastIn}" style="width: 100%;"></td>
                <td class="col-time"><input type="time" class="time-out" value="${lastOut}" style="width: 100%;"></td>
                <td class="col-double"><input type="checkbox" class="is-double-day" style="width: 18px; height: 18px;"></td>
                <td class="col-num"><input type="number" class="deduction-hours" value="0" step="0.5" style="width: 100%;"></td>
                <td class="col-hours hours-cell">0.00h</td>
                <td class="col-action">
                    <button class="btn" onclick="this.closest('tr').remove(); EmployeePortal.updateTotal();" style="padding: 4px 8px; background: rgba(239,68,68,0.1); color: var(--danger);">
                        🗑️
                    </button>
                </td>
            `;

            tbody.appendChild(tr);

            const inputs = tr.querySelectorAll('input');
            inputs.forEach(inp => {
                inp.addEventListener('change', () => this.updateTotal());
            });

            this.updateTotal();
        };

        this.updateTotal = () => {
            const rows = tbody.querySelectorAll('tr');
            let total = 0;

            rows.forEach(tr => {
                const timeIn = tr.querySelector('.time-in').value;
                const timeOut = tr.querySelector('.time-out').value;
                const isDouble = tr.querySelector('.is-double-day').checked;
                const deduction = parseFloat(tr.querySelector('.deduction-hours').value || 0);
                const hoursCell = tr.querySelector('.hours-cell');

                if (timeIn && timeOut) {
                    const start = new Date(`2000-01-01T${timeIn}`);
                    const end = new Date(`2000-01-01T${timeOut}`);
                    let diff = (end - start) / 1000 / 60 / 60;
                    if (diff < 0) diff += 24;

                    let dayTotal = Math.max(0, diff - deduction);
                    if (isDouble) dayTotal *= 2;

                    hoursCell.textContent = dayTotal.toFixed(2) + 'h';
                    total += dayTotal;
                } else {
                    hoursCell.textContent = '0.00h';
                }
            });

            totalHoursEl.textContent = total.toFixed(2) + 'h';
            saveBtn.disabled = total <= 0;
        };

        addRowBtn.onclick = () => createRow();

        saveBtn.onclick = async () => {
            const rows = tbody.querySelectorAll('tr');
            if (rows.length === 0) return;

            let savedCount = 0;
            saveBtn.disabled = true;
            saveBtn.textContent = 'Guardando...';

            try {
                for (const tr of rows) {
                    const date = tr.querySelector('.date-input').value;
                    const timeIn = tr.querySelector('.time-in').value;
                    const timeOut = tr.querySelector('.time-out').value;
                    const isDouble = tr.querySelector('.is-double-day').checked;
                    const deduction = parseFloat(tr.querySelector('.deduction-hours').value || 0);

                    if (!date || !timeIn || !timeOut) continue;

                    const start = new Date(`2000-01-01T${timeIn}`);
                    const end = new Date(`2000-01-01T${timeOut}`);
                    let diff = (end - start) / 1000 / 60 / 60;
                    if (diff < 0) diff += 24;

                    let dayTotal = Math.max(0, diff - deduction);
                    if (isDouble) dayTotal *= 2;

                    const response = await fetch('/api/logs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            employeeId: this.currentEmployee.id,
                            date: date,
                            timeIn: timeIn,
                            timeOut: timeOut,
                            hours: dayTotal.toFixed(2),
                            isDoubleDay: isDouble,
                            deductionHours: deduction
                        })
                    });

                    if (response.ok) savedCount++;
                }

                alert(`✅ Se guardaron ${savedCount} registros de horas correctamente.`);
                // Recargar logs para actualizar el resumen
                const logsResponse = await fetch('/api/logs');
                const allLogs = await logsResponse.json();
                this.currentLogs = allLogs.filter(l => String(l.employee_id) === String(this.currentEmployee.id));

                this.render();
            } catch (err) {
                console.error('Error saving hours:', err);
                alert('Ocurrió un error al guardar las horas.');
                saveBtn.disabled = false;
                saveBtn.textContent = '💾 Guardar Horas';
            }
        };

        // Initialize with one row
        createRow();
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    EmployeePortal.init();
});
