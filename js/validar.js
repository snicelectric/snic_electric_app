/* =========================================
   LÓGICA DE VERIFICACIÓN DE TÉCNICOS Y QR
========================================== */

let html5QrcodeScanner = null;

document.addEventListener('DOMContentLoaded', () => {
    const btnBuscar = document.getElementById('btnBuscar');
    const btnToggleQR = document.getElementById('btnToggleQR');
    const docInput = document.getElementById('documentoInput');

    if (btnBuscar) {
        btnBuscar.addEventListener('click', () => {
            const doc = docInput.value.trim();
            if (doc) validarTecnico(doc);
        });
    }

    if (docInput) {
        docInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const doc = docInput.value.trim();
                if (doc) validarTecnico(doc);
            }
        });
    }

    // Auto-validación si la URL trae parámetro ?doc=123456
    const urlParams = new URLSearchParams(window.location.search);
    const docUrl = urlParams.get('doc');
    if (docUrl) {
        docInput.value = docUrl;
        validarTecnico(docUrl);
    }

    if (btnToggleQR) {
        btnToggleQR.addEventListener('click', toggleCamara);
    }
});

async function validarTecnico(documento) {
    const card = document.getElementById('resultCard');
    const content = document.getElementById('resultContent');

    card.style.display = 'block';
    card.className = 'status-card';
    content.innerHTML = '<i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top:10px;">Consultando registros de la empresa...</p>';

    // Limpiar el documento de puntos, guiones o espacios
    const docLimpio = documento.replace(/[\s.,-]/g, '');

    try {
        const { data: perfiles, error } = await window.supabaseClient
            .from('perfiles')
            .select('*')
            .eq('documento', documento);

        if (error) throw error;

        // CASO 1: FRAUDE / DOCUMENTO NO REGISTRADO
        if (!perfiles || perfiles.length === 0) {
            card.className = 'status-card fraud';
            content.innerHTML = `
                <i class="fa-solid fa-triangle-exclamation fa-3x" style="color: #dc2626;"></i>
                <h3 style="margin-top:10px; color:#991b1b;">¡ALERTA DE FRAUDE!</h3>
                <p style="margin-top:8px;">El documento <strong>${documento}</strong> NO corresponde a ningún técnico registrado en SNIC'ELECTRIC.</p>
                <small style="display:block; margin-top:10px; color:#7f1d1d;">Se ha registrado un reporte automático de seguridad.</small>
            `;
            notificarFraude(documento);
            return;
        }

        const tec = perfiles[0];

        // CASO 2: TÉCNICO INACTIVO
        if (!tec.activo) {
            card.className = 'status-card inactive';
            content.innerHTML = `
                <i class="fa-solid fa-user-slash fa-3x" style="color: #ea580c;"></i>
                <h3 style="margin-top:10px; color:#9a3412;">CARNET INACTIVO</h3>
                <p style="margin-top:8px;">El técnico <strong>${tec.nombre} ${tec.apellido}</strong> (C.C. ${tec.documento}) <strong>ya no labora</strong> en la empresa.</p>
                <p style="font-size: 0.85rem; margin-top: 8px;">No está autorizado para prestar servicios a nombre de SNIC'ELECTRIC.</p>
            `;
            return;
        }

        // BÚSQUEDA DE LA FOTO EN BUCKET / TABLA ARCHIVOS SI NO ESTÁ EN foto_url
        let fotoFinal = tec.foto_url;

        if (!fotoFinal) {
            try {
                const { data: archivos } = await window.supabaseClient
                    .from('archivos')
                    .select('bucket, ruta')
                    .eq('perfil_id', tec.id)
                    .eq('tipo', 'foto_perfil')
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (archivos && archivos.length > 0) {
                    const bucket = archivos[0].bucket || 'snic-electric';
                    const { data: urlData } = window.supabaseClient.storage
                        .from(bucket)
                        .getPublicUrl(archivos[0].ruta);
                    
                    fotoFinal = urlData?.publicUrl;
                }
            } catch (errFoto) {
                console.warn('No se pudo obtener la foto desde la tabla archivos:', errFoto);
            }
        }

        // CASO 3: TÉCNICO VÁLIDO Y ACTIVO
        card.className = 'status-card valid';
        
        const iniciales = ((tec.nombre ? tec.nombre.charAt(0) : 'T') + (tec.apellido ? tec.apellido.charAt(0) : '')).toUpperCase();
        
        const imgHtml = fotoFinal 
            ? `<img src="${fotoFinal}" class="tech-photo" alt="Foto del Técnico" onerror="this.onerror=null; this.src='https://via.placeholder.com/150/003366/FFFFFF?text=${iniciales}';">`
            : `<div class="tech-photo" style="display:flex; align-items:center; justify-content:center; background:#003366; color:#fff; font-size:2.2rem; font-weight:bold;">${iniciales}</div>`;

        content.innerHTML = `
            <i class="fa-solid fa-circle-check fa-3x" style="color: #16a34a;"></i>
            <h3 style="margin-top:10px; color:#14532d;">PERSONAL AUTORIZADO</h3>
            ${imgHtml}
            <h4 style="font-size:1.2rem; color:#003366; margin-bottom:5px;">${tec.nombre} ${tec.apellido}</h4>
            <p><strong>Cargo:</strong> ${tec.cargo || 'Técnico Electricista'}</p>
            <p><strong>RH:</strong> ${tec.tipo_sangre || 'N/A'} | <strong>Teléfono:</strong> ${tec.telefono || 'N/A'}</p>
            <span class="estado-badge"><i class="fa-solid fa-shield-halved"></i> Activo y Válido</span>
        `;

    } catch (err) {
        console.error('Error al validar técnico:', err.message);
        card.className = 'status-card fraud';
        content.innerHTML = `<p>Error de conexión al consultar el documento. Intente nuevamente.</p>`;
    }
}

async function notificarFraude(documentoIngresado) {
    try {
        await window.supabaseClient.from('archivos').insert([{
            nombre_archivo: `Alerta_Fraude_Doc_${documentoIngresado}`,
            tipo: 'alerta_fraude',
            mime_type: 'text/plain',
            tamano: 0
        }]);
    } catch (e) {
        console.error('Error enviando reporte de fraude:', e);
    }
}

function toggleCamara() {
    const qrDiv = document.getElementById('qrReader');
    if (qrDiv.style.display === 'none' || qrDiv.style.display === '') {
        qrDiv.style.display = 'block';
        html5QrcodeScanner = new Html5QrcodeScanner("qrReader", { fps: 10, qrbox: 240 });
        html5QrcodeScanner.render((decodedText) => {
            document.getElementById('documentoInput').value = decodedText;
            html5QrcodeScanner.clear();
            qrDiv.style.display = 'none';
            validarTecnico(decodedText);
        });
    } else {
        if (html5QrcodeScanner) html5QrcodeScanner.clear();
        qrDiv.style.display = 'none';
    }
}