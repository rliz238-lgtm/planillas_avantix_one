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
                this.currentEmployee = {
                    ...emp,
                    hourlyRate: parseFloat(emp.hourly_rate),
                    business_name: emp.business_name || 'Planillas Avantix One'
                };

                // Cargar logs del empleado desde el servidor con headers de negocio
                const logsResponse = await fetch('/api/logs', {
                    headers: {
                        'X-Business-ID': emp.business_id,
                        'X-User-Role': 'employee'
                    }
                });
                this.currentLogs = await logsResponse.json();

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
            if (this.currentEmployee.attendance_marker_enabled) {
                this.initMarker();
            }
        }
    },

    renderLogin() {
        return `
            <div class="login-container">
                <div class="login-card">
                    <img src="img/avantix_one_logo.png" alt="Logo" style="height: 60px; margin-bottom: 1.5rem;">
                    <h1 style="color: white; margin-bottom: 0.5rem;">Planillas Avantix One</h1>
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
        const emp = this.currentEmployee;
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

        // Marker UI if enabled
        let markerHtml = '';
        if (emp.attendance_marker_enabled) {
            markerHtml = `
                <div class="card-container" style="margin-bottom: 2rem; border: 1px solid var(--primary); background: rgba(99, 102, 241, 0.03);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h3 style="margin: 0;">📍 Marcador de Asistencia</h3>
                        <div id="marker-status" style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Listo para marcar</div>
                    </div>
                    
                    <div id="marker-controls" style="display: flex; flex-direction: column; gap: 15px; align-items: center;">
                        ${emp.attendance_photo_required ? `
                            <div id="camera-container" style="width: 100%; max-width: 320px; aspect-ratio: 4/3; background: #000; border-radius: 12px; overflow: hidden; position: relative;">
                                <video id="marker-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>
                                <canvas id="marker-canvas" style="display: none;"></canvas>
                                <img id="marker-photo-preview" style="display: none; width: 100%; height: 100%; object-fit: cover;">
                                <div id="camera-overlay" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); color: white; display: none;">
                                    📸 Click para tomar foto
                                </div>
                            </div>
                            <button class="btn btn-secondary" id="btn-snap" style="width: 100%; max-width: 320px;">📷 Tomar Selfie</button>
                        ` : ''}
                        
                        <div style="display: flex; gap: 10px; width: 100%; max-width: 400px;">
                            <button class="btn btn-primary" id="btn-clock-in" style="flex: 1; padding: 1rem; font-weight: 700; background: var(--success);">🕒 MARCAR ENTRADA</button>
                            <button class="btn btn-danger" id="btn-clock-out" style="flex: 1; padding: 1rem; font-weight: 700;">🕒 MARCAR SALIDA</button>
                        </div>
                        <p style="font-size: 0.75rem; color: var(--text-muted); text-align: center;">
                            Se validará su ubicación por GPS antes de procesar el registro.
                        </p>
                    </div>
                </div>
            `;
        }

        return `
            <div style="padding: 1rem; max-width: 1200px; margin: 0 auto;">
                <div class="employee-header">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <h2 style="margin: 0;">👋 Hola, ${emp.name}</h2>
                            <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">${emp.position} @ ${emp.business_name || 'Empresa'}</p>
                        </div>
                        <button class="btn" onclick="EmployeePortal.logout()" style="background: rgba(255,255,255,0.2);">
                            Cerrar Sesión
                        </button>
                    </div>
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
                        <div class="summary-value">₡${emp.hourlyRate}</div>
                        <div class="summary-label">Pago x Hora</div>
                    </div>
                </div>

                ${markerHtml}

                <div class="card-container">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h3 style="margin: 0;">Reporte de Horas Manual</h3>
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
                                <div style="font-size: 0.9rem; color: var(--text-muted);">Total Reportado (Manual)</div>
                                <div id="total-hours" class="calc-total-value" style="color: var(--primary);">0.00h</div>
                            </div>
                            <button class="btn btn-primary" id="save-btn" style="padding: 1rem 2rem; font-size: 1.1rem;">
                                💾 Guardar Reporte
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
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Business-ID': this.currentEmployee.business_id,
                            'X-User-Role': 'employee'
                        },
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
                const logsResponse = await fetch('/api/logs', {
                    headers: {
                        'X-Business-ID': this.currentEmployee.business_id,
                        'X-User-Role': 'employee'
                    }
                });
                this.currentLogs = await logsResponse.json();

                this.render();
            } catch (err) {
                console.error('Error saving hours:', err);
                alert('Ocurrió un error al guardar las horas.');
                saveBtn.disabled = false;
                saveBtn.textContent = '💾 Guardar Reporte';
            }
        };

        // Initialize with one row
        createRow();
    },

    initMarker() {
        const emp = this.currentEmployee;
        const video = document.getElementById('marker-video');
        const btnSnap = document.getElementById('btn-snap');
        const btnIn = document.getElementById('btn-clock-in');
        const btnOut = document.getElementById('btn-clock-out');
        const statusEl = document.getElementById('marker-status');
        let capturedPhoto = null;

        if (emp.attendance_photo_required && video) {
            this.startCamera(video);
            btnSnap.onclick = () => {
                capturedPhoto = this.takePhoto(video);
                const preview = document.getElementById('marker-photo-preview');
                preview.src = capturedPhoto;
                preview.style.display = 'block';
                video.style.display = 'none';
                btnSnap.textContent = '🔄 Retomar Foto';
            };
        }

        const handleAction = async (type) => {
            if (emp.attendance_photo_required && !capturedPhoto) {
                return alert("Debe tomarse una selfie para marcar.");
            }

            statusEl.textContent = "⌛ Validando...";
            btnIn.disabled = btnOut.disabled = true;

            try {
                // 1. Obtener GPS
                if (!navigator.geolocation) throw new Error("GPS no soportado");
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
                });

                const { latitude, longitude } = pos.coords;

                // 2. Subir Foto (si hay)
                let photoUrl = null;
                if (capturedPhoto) {
                    const blob = await (await fetch(capturedPhoto)).blob();
                    const formData = new FormData();
                    formData.append('photo', blob, 'marker.jpg');
                    const uploadRes = await fetch('/api/logs/upload-photo', {
                        method: 'POST',
                        body: formData
                    }).then(r => r.json());
                    photoUrl = uploadRes.photo_url;
                }

                // 3. Registrar Log
                const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                const body = {
                    employeeId: emp.id,
                    date: this.getLocalDate(),
                    timeIn: type === 'IN' ? timeStr : null,
                    timeOut: type === 'OUT' ? timeStr : null,
                    hours: 0,
                    source: 'Marker',
                    photoUrl: photoUrl,
                    locationMetadata: { latitude, longitude }
                };

                const response = await fetch('/api/logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Business-ID': emp.business_id, 'X-User-Role': 'employee' },
                    body: JSON.stringify(body)
                });

                const result = await response.json();
                if (response.ok) {
                    alert(`✅ Marcaje de ${type === 'IN' ? 'ENTRADA' : 'SALIDA'} exitoso.`);
                    location.reload();
                } else {
                    alert("Error: " + (result.error || "No se pudo registrar"));
                }
            } catch (err) {
                alert("Error: " + err.message);
            } finally {
                statusEl.textContent = "Listo para marcar";
                btnIn.disabled = btnOut.disabled = false;
            }
        };

        btnIn.onclick = () => handleAction('IN');
        btnOut.onclick = () => handleAction('OUT');
    },

    async startCamera(video) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            video.srcObject = stream;
        } catch (err) {
            console.error("Camera error:", err);
            alert("No se pudo acceder a la cámara. Verifique los permisos.");
        }
    },

    takePhoto(video) {
        const canvas = document.getElementById('marker-canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.8);
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    EmployeePortal.init();
});
