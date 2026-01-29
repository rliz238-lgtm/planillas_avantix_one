const fs = require('fs');

let content = fs.readFileSync('main.js', 'utf8');

const patches = [
    {
        old: `                                 <th>Fecha</th>
                                 <th>Entrada</th>
                                 <th>Salida</th>
                                 <th>Horas</th>
                                 <th style="width: 50px"></th>`,
        new: `                                 <th style="min-width: 140px;" title="Fecha en que se laboró">Fecha Laborada</th>
                                 <th title="Hora de inicio de la jornada">Entrada</th>
                                 <th title="Hora de finalización de la jornada">Salida</th>
                                 <th title="Total de horas laboradas calculadas automáticamente">Horas Totales</th>
                                 ${isAdmin ? '<th style="text-align:center" title="Marcar si este día se paga doble (Feriado)">Horas Dobles</th>' : ''}
                                 ${isAdmin ? '<th title="Horas para rebajar (Almuerzo o permisos)">Horas Almuerzo</th>' : ''}
                                 <th style="width: 50px"></th>`
    },
    {
        old: `                                 <th style="width: 40px"><input type="checkbox" id="select-all-pending" checked></th>
                                 <th>Empleado</th>
                                 <th>Desde</th>
                                 <th>Hasta</th>
                                 <th>Total Horas</th>
                                 <th>CCSS (Est.)</th>
                                 <th>Monto Neto</th>
                                 <th>Acción</th>`,
        new: `                                 <th style="width: 40px"><input type="checkbox" id="select-all-pending" checked></th>
                                 <th>Empleado</th>
                                 <th title="Rango de fechas de este pago">Periodo de Pago</th>
                                 <th title="Total de horas laboradas (Dobles ya multiplicadas)">Horas Tot.</th>
                                 <th title="Monto descontado por CCSS (Estimado)">Rebajo CCSS</th>
                                 <th title="Monto neto final a transferir">Monto Neto</th>
                                 <th>Acción</th>`
    },
    {
        old: `                                     <td style="font-size: 0.85rem">\${ps.startDate.split('T')[0]}</td>
                                     <td style="font-size: 0.85rem">\${ps.endDate.split('T')[0]}</td>
                                     <td style="font-weight: 600">\${ps.hours.toFixed(1)}h</td>
                                     <td style="color: var(--danger)">₡\${Math.round(ps.deduction).toLocaleString()}</td>
                                     <td style="color: var(--success); font-weight: 700;">₡\${Math.round(ps.net).toLocaleString()}</td>
                                     <td style="display: flex; gap: 5px">
                                         <button class="btn btn-primary" title="Ver Detalle" style="padding: 5px 10px" onclick="PayrollHelpers.showPayrollDetail(\${ps.empId})">\${PayrollHelpers.EYE_ICON}</button>
                                         <button class="btn btn-success" title="Pagar Todo" style="padding: 5px 10px; background: var(--success);" onclick="PayrollHelpers.payEmployeeGroup(\${ps.empId})">💰</button>
                                         <button class="btn btn-whatsapp" title="WhatsApp" style="padding: 5px 10px" onclick="PayrollHelpers.shareWhatsAppPending(\${ps.empId})">✉️</button>
                                         <button class="btn btn-secondary" title="Editar Días" style="padding: 5px 10px" onclick="PayrollHelpers.showPayrollDetail(\${ps.empId})">✏️</button>
                                         <button class="btn btn-danger" onclick="window.clearEmpLogs(\${ps.empId})" style="padding: 4px 8px; font-size: 0.8rem" title="Limpiar">🗑️</button>
                                     </td>`,
        new: `                                     <td style="font-size: 0.85rem">
                                        <div style="white-space: nowrap">\${ps.startDate.split('T')[0]}</div>
                                        <div style="color: var(--text-muted); font-size: 0.75rem">al \${ps.endDate.split('T')[0]}</div>
                                     </td>
                                     <td style="font-weight: 600">
                                        \${ps.hours.toFixed(1)}h
                                        \${ps.doubleHours > 0 ? \`<div style="font-size: 0.7rem; color: var(--warning)">incl. \${ps.doubleHours.toFixed(1)}h Dobles</div>\` : ''}
                                     </td>
                                     <td style="color: var(--danger)">₡\${Math.round(ps.deduction).toLocaleString()}</td>
                                     <td style="color: var(--success); font-weight: 700;">₡\${Math.round(ps.net).toLocaleString()}</td>
                                     <td style="display: flex; gap: 5px">
                                         <button class="btn btn-primary" title="Ver Desglose" style="padding: 5px 10px" onclick="PayrollHelpers.showPayrollDetail(\${ps.empId})">\${PayrollHelpers.EYE_ICON}</button>
                                         <button class="btn btn-success" title="Pagar Todo" style="padding: 5px 10px; background: var(--success);" onclick="PayrollHelpers.payEmployeeGroup(\${ps.empId})">💰</button>
                                         <button class="btn btn-whatsapp" title="WhatsApp" style="padding: 5px 10px" onclick="PayrollHelpers.shareWhatsAppPending(\${ps.empId})">✉️</button>
                                         <button class="btn btn-secondary" title="Editar Días" style="padding: 5px 10px" onclick="PayrollHelpers.showPayrollDetail(\${ps.empId})">✏️</button>
                                         <button class="btn btn-danger" onclick="window.clearEmpLogs(\${ps.empId})" style="padding: 4px 8px; font-size: 0.8rem" title="Limpiar Horas">🗑️</button>
                                     </td>`
    },
    {
        old: `                                         <td style="font-size: 0.85rem">\${p.start_date ? p.start_date.split('T')[0] : '—'}</td>
                                         <td style="font-size: 0.85rem">\${p.end_date ? p.end_date.split('T')[0] : '—'}</td>
                                         <td>\${parseFloat(p.hours || 0).toFixed(1)}h</td>
                                         <td style="color: var(--success); font-weight: 700;">₡\${Math.round(p.amount).toLocaleString()}</td>`,
        new: `                                         <td style="font-size: 0.85rem">
                                            <div style="white-space: nowrap">\${p.start_date ? p.start_date.split('T')[0] : '—'}</div>
                                            <div style="color: var(--text-muted); font-size: 0.75rem">al \${p.end_date ? p.end_date.split('T')[0] : '—'}</div>
                                         </td>
                                         <td style="font-weight: 600">
                                            \${parseFloat(p.hours || 0).toFixed(1)}h
                                            \${(p.logs_detail || []).some(l => l.is_double_day) ? \`<div style="font-size: 0.7rem; color: var(--warning)">incl. Dobles</div>\` : ''}
                                         </td>
                                         <td style="color: var(--success); font-weight: 700;">₡\${Math.round(p.amount).toLocaleString()}</td>`
    }
];

// Helper to normalize content for matching (handle line endings and extra spaces)
function betterReplace(text, oldBlock, newBlock) {
    // Escape template literals for the script itself but we need to match literal backticks/dollar signs in main.js
    if (text.includes(oldBlock)) {
        console.log("Success: found block");
        return text.replace(oldBlock, newBlock);
    } else {
        console.warn("Warning: block not found");
        // Try to match ignoring leading/trailing whitespace of the whole block
        return text;
    }
}

// Special handle for the first block which has un-escaped template tags in the source but need to be matched
// Actually, I'll just use literal strings.

// Final logic: run through patches
patches.forEach(p => {
    if (content.indexOf(p.old) !== -1) {
        content = content.replace(p.old, p.new);
        console.log("Applied patch");
    } else {
        console.log("Patch failed to find old content");
    }
});

fs.writeFileSync('main.js', content);
