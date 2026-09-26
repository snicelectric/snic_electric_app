/* =========================================================
   MÓDULO DE ADMINISTRACIÓN (PERFILES, PERMISOS, CARNETS Y ARCHIVOS)
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  initAdministracion();
  setupPasswordRecoveryListener();
});

let todosLosPerfiles = [];
let todosLosRoles = [];
let perfilAEliminarId = null;

async function initAdministracion() {
  console.log('🚀 Inicializando módulo de administración...');
  setupEventListeners();
  await cargarRoles();
  await cargarPerfiles();
  await cargarMatrizPermisos();
}

/* =========================================================
   LISTENERS Y EVENTOS (CON CONTROLES NULOS SEGUROS)
   ========================================================= */
function setupEventListeners() {
  const btnNuevoUsuario = document.getElementById('btnNuevoUsuario');
  const btnNuevoUsuarioEmpty = document.getElementById('btnNuevoUsuarioEmpty');
  const closeModalUsuario = document.getElementById('closeUsuarioModal');
  const btnCancelarUsuario = document.getElementById('cancelarUsuario');
  const formUsuario = document.getElementById('usuarioForm');
  const btnResetPass = document.getElementById('btnEnviarResetPassword');

  if (btnNuevoUsuario) btnNuevoUsuario.addEventListener('click', () => abrirModalUsuario());
  if (btnNuevoUsuarioEmpty) btnNuevoUsuarioEmpty.addEventListener('click', () => abrirModalUsuario());
  if (closeModalUsuario) closeModalUsuario.addEventListener('click', () => cerrarModal('usuarioModal'));
  if (btnCancelarUsuario) btnCancelarUsuario.addEventListener('click', () => cerrarModal('usuarioModal'));
  if (formUsuario) formUsuario.addEventListener('submit', guardarPerfil);
  if (btnResetPass) btnResetPass.addEventListener('click', enviarCorreoRecuperacion);

  const closeModalCarnet = document.getElementById('closeCarnetModal');
  const btnCancelarCarnet = document.getElementById('cancelarCarnetModal');
  const btnImprimirCarnet = document.getElementById('btnImprimirCarnet');

  if (closeModalCarnet) closeModalCarnet.addEventListener('click', () => cerrarModal('carnetModal'));
  if (btnCancelarCarnet) btnCancelarCarnet.addEventListener('click', () => cerrarModal('carnetModal'));
  if (btnImprimirCarnet) btnImprimirCarnet.addEventListener('click', imprimirCarnet);

  const btnCancelarDelete = document.getElementById('cancelDeleteUsuario');
  const btnConfirmDelete = document.getElementById('confirmDeleteUsuario');

  if (btnCancelarDelete) btnCancelarDelete.addEventListener('click', () => cerrarModal('deleteUsuarioModal'));
  if (btnConfirmDelete) btnConfirmDelete.addEventListener('click', eliminarPerfil);

  const inputBuscar = document.getElementById('buscarUsuario');
  const selectEstado = document.getElementById('filtroEstado');
  if (inputBuscar) inputBuscar.addEventListener('input', filtrarTabla);
  if (selectEstado) selectEstado.addEventListener('change', filtrarTabla);

  const selectRolPermisos = document.getElementById('rolPermisosSelect');
  if (selectRolPermisos) {
    selectRolPermisos.addEventListener('change', (e) => cargarMatrizPermisos(e.target.value));
  }

  // Modals de actualización de contraseña
  const closeCambiarPass = document.getElementById('closeCambiarPasswordModal');
  const cancelarCambiarPass = document.getElementById('cancelarCambiarPassword');
  const formNuevaPass = document.getElementById('formNuevaPassword');

  if (closeCambiarPass) closeCambiarPass.addEventListener('click', () => cerrarModal('cambiarPasswordModal'));
  if (cancelarCambiarPass) cancelarCambiarPass.addEventListener('click', () => cerrarModal('cambiarPasswordModal'));
  if (formNuevaPass) formNuevaPass.addEventListener('submit', guardarNuevaPassword);
}

/* =========================================================
   ENVIAR CORREO Y CAMBIO DE CONTRASEÑA
   ========================================================= */
async function enviarCorreoRecuperacion() {
  const emailInput = document.getElementById('correoUsuario');
  const btnResetPass = document.getElementById('btnEnviarResetPassword');
  const email = emailInput ? emailInput.value.trim() : '';

  if (!email) {
    mostrarNotificacion('Por favor ingresa un correo electrónico válido.', 'error');
    return;
  }

  if (btnResetPass) {
    btnResetPass.disabled = true;
    btnResetPass.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';
  }

  mostrarNotificacion('Enviando correo de restablecimiento...', 'atencion');

  try {
    const redirectUrl = new URL('recuperar-password.html', window.location.href).href;

    const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });

    if (error) throw error;

    mostrarNotificacion(`Correo enviado con éxito a ${email}`, 'exito');
  } catch (err) {
    console.error('❌ Error al enviar correo de recuperación:', err.message);

    if (err.message.includes('rate limit')) {
      mostrarNotificacion('Límite de envíos superado. Por favor espera unos minutos antes de volver a intentar.', 'error');
    } else {
      mostrarNotificacion('No se pudo enviar el correo: ' + err.message, 'error');
    }
  } finally {
    setTimeout(() => {
      if (btnResetPass) {
        btnResetPass.disabled = false;
        btnResetPass.innerHTML = '<i class="fa-solid fa-envelope"></i> Enviar correo para cambiar contraseña';
      }
    }, 5000);
  }
}

function setupPasswordRecoveryListener() {
  if (window.supabaseClient) {
    window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        console.log('🔑 Evento de recuperación de contraseña detectado.');
        abrirModal('cambiarPasswordModal');
      }
    });
  }
}

async function guardarNuevaPassword(e) {
  e.preventDefault();

  const pass1 = document.getElementById('nuevaPasswordInput')?.value;
  const pass2 = document.getElementById('confirmarPasswordInput')?.value;
  const btnGuardar = document.getElementById('btnGuardarNuevaPassword');

  if (pass1 !== pass2) {
    mostrarNotificacion('Las contraseñas no coinciden.', 'error');
    return;
  }

  if (pass1 && pass1.length < 8) {
    mostrarNotificacion('La contraseña debe tener al menos 8 caracteres.', 'error');
    return;
  }

  if (btnGuardar) {
    btnGuardar.disabled = true;
    btnGuardar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Actualizando...';
  }

  try {
    const { error } = await window.supabaseClient.auth.updateUser({
      password: pass1
    });

    if (error) throw error;

    mostrarNotificacion('¡Contraseña actualizada con éxito!', 'exito');
    cerrarModal('cambiarPasswordModal');
    document.getElementById('formNuevaPassword')?.reset();

    window.history.replaceState(null, null, window.location.pathname);
  } catch (err) {
    console.error('❌ Error al actualizar contraseña:', err.message);
    mostrarNotificacion('Error al actualizar: ' + err.message, 'error');
  } finally {
    if (btnGuardar) {
      btnGuardar.disabled = false;
      btnGuardar.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Actualizar Contraseña';
    }
  }
}

/* =========================================================
   GESTIÓN DE PERMISOS DINÁMICOS DESDE SUPABASE
   ========================================================= */
let todosLosPermisosBD = [];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function cargarRoles() {
  try {
    const { data, error } = await window.supabaseClient
      .from('roles')
      .select('id, nombre, descripcion, activo')
      /*.eq('activo', true)*/
      .order('nombre', { ascending: true });

    if (error) throw error;

    todosLosRoles = data || [];
    const selects = [
      document.getElementById('rolPermisosSelect'),
      document.getElementById('rolUsuario')
    ].filter(Boolean);

    selects.forEach(select => {
      const current = select.value;
      const placeholder = select.id === 'rolUsuario'
        ? '<option value="">Seleccionar rol</option>'
        : '';

      select.innerHTML = placeholder + todosLosRoles.map(rol => `
        <option value="${rol.id}">${escapeHtml(rol.nombre)}</option>
      `).join('');

      if (current && todosLosRoles.some(r => r.id === current)) {
        select.value = current;
      }
    });

    console.log(`✅ ${todosLosRoles.length} roles cargados.`);
    return todosLosRoles;
  } catch (err) {
    console.error('❌ Error al cargar roles:', err.message);
    mostrarNotificacion('Error al cargar roles: ' + err.message, 'error');
    return [];
  }
}

function obtenerRolPorId(id) {
  return todosLosRoles.find(r => r.id === id) || null;
}

function obtenerRolPorNombre(nombre) {
  const normalizado = String(nombre || '').trim().toLowerCase();
  return todosLosRoles.find(r => String(r.nombre || '').trim().toLowerCase() === normalizado) || null;
}

async function cargarMatrizPermisos(rolIdSeleccionado = null) {
  const container = document.getElementById('permisosRolContainer');
  if (!container) return;

  if (!todosLosRoles.length) await cargarRoles();

  const rolSelect = document.getElementById('rolPermisosSelect');
  const rolId = rolIdSeleccionado || rolSelect?.value || todosLosRoles[0]?.id;

  if (rolSelect && rolId) rolSelect.value = rolId;

  if (!rolId) {
    container.innerHTML = '<p class="error-text">No hay roles activos configurados.</p>';
    return;
  }

  container.innerHTML = '<p class="loading-text"><i class="fa-solid fa-spinner fa-spin"></i> Cargando permisos...</p>';

  try {
    if (todosLosPermisosBD.length === 0) {
      const { data: permisos, error: errPermisos } = await window.supabaseClient
        /*.from('permisos')
        .select('id,codigo,nombre,modulo,accion,descripcion')
        .order('modulo', { ascending: true })
        .order('accion', { ascending: true });
        const { data, error } = await supabase*/
        .from('permisos')
        .select('id, codigo, descripcion')
        .order('codigo', { ascending: true });

      if (errPermisos) throw errPermisos;
      todosLosPermisosBD = permisos || [];
    }

    const { data: asignaciones, error: errAsig } = await window.supabaseClient
      .from('rol_permisos')
      .select('permiso_id')
      .eq('rol_id', rolId);

    if (errAsig) throw errAsig;

    const rolActual = obtenerRolPorId(rolId);
    const nombreRol = String(rolActual?.nombre || '').trim().toLowerCase();
    const esAdmin = nombreRol === 'administrador';

    const permisosAsignadosIds = new Set(
      (asignaciones || []).map(a => a.permiso_id)
    );

    const modulosMap = {};
    todosLosPermisosBD.forEach(p => {
      const moduloNombre = p.modulo || 'General';
      if (!modulosMap[moduloNombre]) modulosMap[moduloNombre] = [];
      modulosMap[moduloNombre].push(p);
    });

    let htmlContent = '';

    if (esAdmin) {
      htmlContent = `
        <div style="padding:10px 15px;margin-bottom:15px;background:#fff3cd;color:#856404;border-left:4px solid #ffebaa;border-radius:4px;font-size:.88rem;">
          <i class="fa-solid fa-lock"></i>
          <strong>Rol Administrador:</strong>
          este rol tiene acceso total y sus permisos no se modifican desde esta matriz.
        </div>`;
    }

    Object.keys(modulosMap).forEach(modulo => {
      htmlContent += `
        <div class="permiso-grupo">
          <div class="permiso-grupo-titulo">
            <i class="fa-solid fa-folder"></i> ${escapeHtml(modulo)}
          </div>
          <div class="permiso-opciones">
            ${modulosMap[modulo].map(p => {
              const estaAsignado = esAdmin || permisosAsignadosIds.has(p.id);
              const checked = estaAsignado ? 'checked' : '';
              const disabled = esAdmin ? 'disabled' : '';
              const descripcion = escapeHtml(p.descripcion || '');
              const nombre = escapeHtml(p.nombre || p.accion || p.codigo || '');

              return `
                <label class="permiso-check ${esAdmin ? 'disabled-label' : ''}" title="${descripcion}">
                  <input type="checkbox"
                         data-permiso-id="${p.id}"
                         ${checked}
                         ${disabled}
                         onchange="guardarCambioPermisoBD('${rolId}', '${p.id}', this.checked)">
                  ${nombre}
                </label>`;
            }).join('')}
          </div>
        </div>`;
    });

    container.innerHTML = htmlContent || '<p class="loading-text">No hay permisos configurados.</p>';
  } catch (err) {
    console.error('❌ Error al cargar permisos:', err.message);
    container.innerHTML = `<p class="error-text">Error al cargar la matriz de permisos: ${escapeHtml(err.message)}</p>`;
  }
}

window.guardarCambioPermisoBD = async function(rolId, permisoId, estaMarcado) {
  const rol = obtenerRolPorId(rolId);
  if (!rol) {
    mostrarNotificacion('El rol seleccionado no existe.', 'error');
    return;
  }

  if (String(rol.nombre).trim().toLowerCase() === 'administrador') return;

  try {
    if (estaMarcado) {
      const { error } = await window.supabaseClient
        .from('rol_permisos')
        .insert([{ rol_id: rolId, permiso_id: permisoId }]);

      if (error && error.code !== '23505') throw error;
    } else {
      const { error } = await window.supabaseClient
        .from('rol_permisos')
        .delete()
        .eq('rol_id', rolId)
        .eq('permiso_id', permisoId);

      if (error) throw error;
    }

    mostrarNotificacion(`Permiso actualizado para el rol ${String(rol.nombre).toUpperCase()}`, 'exito');
  } catch (err) {
    console.error('❌ Error al guardar permiso:', err.message);
    mostrarNotificacion('No se pudo guardar el cambio de permiso: ' + err.message, 'error');

    // Restaurar el estado visual si Supabase rechazó el cambio.
    await cargarMatrizPermisos(rolId);
  }
};

/* =========================================================
   CARGAR Y RENDERIZAR PERFILES
   ========================================================= */
async function cargarPerfiles() {
  try {
    console.log('📥 Cargando perfiles desde Supabase...');
    const { data: perfiles, error } = await window.supabaseClient
      .from('perfiles')
      .select('*, roles(id,nombre)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    todosLosPerfiles = perfiles || [];
    console.log(`✅ ${todosLosPerfiles.length} perfiles cargados:`, todosLosPerfiles);
    renderizarTabla(todosLosPerfiles);
    actualizarEstadisticas(todosLosPerfiles);
  } catch (err) {
    console.error('❌ Error al cargar perfiles:', err.message);
    mostrarNotificacion('Error al cargar perfiles: ' + err.message, 'error');
  }
}

function renderizarTabla(perfiles) {
  const tbody = document.getElementById('usuariosTableBody');
  const emptyState = document.getElementById('emptyState');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (perfiles.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  perfiles.forEach((p) => {
    const tr = document.createElement('tr');
    const nombreCompleto = `${p.nombre || ''} ${p.apellido || ''}`.trim() || 'Sin Nombre';
    const iniciales = ((p.nombre ? p.nombre.charAt(0) : 'U') + (p.apellido ? p.apellido.charAt(0) : '')).toUpperCase();
    const estadoTexto = p.activo ? 'Activo' : 'Inactivo';
    const estadoClase = p.activo ? 'estado-activo' : 'estado-inactivo';

    const avatarHtml = p.foto_url 
      ? `<img src="${p.foto_url}" alt="Foto" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.onerror=null; this.parentNode.innerHTML='${iniciales}';">` 
      : iniciales;

    tr.innerHTML = `
      <td>
        <div class="usuario-name">
          <div class="usuario-avatar">
            ${avatarHtml}
          </div>
          <div class="usuario-data">
            <strong>${nombreCompleto}</strong>
            <span>Doc: ${p.documento || 'N/A'}</span>
          </div>
        </div>
      </td>
      <td>${p.email || 'N/A'}</td>
      <td><span class="rol-badge rol-tecnico">${escapeHtml(p.roles?.nombre || 'Sin rol')}</span></td>
      <td><span class="estado-badge ${estadoClase}"><i class="fa-solid fa-circle"></i> ${estadoTexto}</span></td>
      <td>${p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A'}</td>
      <td>
        <div class="acciones">
          <button type="button" class="btn-action carnet" title="Ver Carnet" onclick="verCarnet('${p.id}')">
            <i class="fa-solid fa-id-card"></i>
          </button>
          <button type="button" class="btn-action editar" title="Editar" onclick="abrirModalUsuario('${p.id}')">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button type="button" class="btn-action eliminar" title="Eliminar" onclick="confirmarEliminar('${p.id}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function actualizarEstadisticas(perfiles) {
  const total = perfiles.length;
  
  const nombreRol = p => String(p.roles?.nombre || '').trim().toLowerCase();
  const administradores = perfiles.filter(p => nombreRol(p) === 'administrador').length;
  const administrativos = perfiles.filter(p => nombreRol(p) === 'administrativo').length;
  const tecnicos = perfiles.filter(p => ['tecnico', 'técnico'].includes(nombreRol(p))).length;

  if (document.getElementById('totalUsuarios')) {
    document.getElementById('totalUsuarios').textContent = total;
  }
  if (document.getElementById('totalAdministradores')) {
    document.getElementById('totalAdministradores').textContent = administradores;
  }
  if (document.getElementById('totalAdministrativos')) {
    document.getElementById('totalAdministrativos').textContent = administrativos;
  }
  if (document.getElementById('totalTecnicos')) {
    document.getElementById('totalTecnicos').textContent = tecnicos;
  }
}

function filtrarTabla() {
  const q = document.getElementById('buscarUsuario')?.value.toLowerCase() || '';
  const estadoFilter = document.getElementById('filtroEstado')?.value || 'todos';

  const filtrados = todosLosPerfiles.filter((p) => {
    const nombre = `${p.nombre || ''} ${p.apellido || ''}`.toLowerCase();
    const email = (p.email || '').toLowerCase();
    const doc = (p.documento || '').toLowerCase();

    const coincideTexto = nombre.includes(q) || email.includes(q) || doc.includes(q);
    let coincideEstado = true;
    if (estadoFilter === 'activo') coincideEstado = p.activo === true;
    if (estadoFilter === 'inactivo') coincideEstado = p.activo === false;

    return coincideTexto && coincideEstado;
  });

  renderizarTabla(filtrados);
}

/* =========================================================
   GUARDAR Y EDITAR PERFIL (CON UPSERT EN TABLA ARCHIVOS)
   ========================================================= */
window.abrirModalUsuario = function(id = null) {
  const form = document.getElementById('usuarioForm');
  if (form) form.reset();

  document.getElementById('usuarioId').value = '';
  document.getElementById('modalTitle').textContent = id ? 'Editar perfil' : 'Nuevo perfil';

  if (id) {
    const p = todosLosPerfiles.find(item => item.id === id);
    if (p) {
      console.log('✏️ Editando perfil existente:', p);
      document.getElementById('usuarioId').value = p.id;
      document.getElementById('nombreUsuario').value = p.nombre || '';
      document.getElementById('apellidoUsuario').value = p.apellido || '';
      document.getElementById('correoUsuario').value = p.email || '';
      document.getElementById('telefonoUsuario').value = p.telefono || '';
      document.getElementById('documentoUsuario').value = p.documento || '';
      document.getElementById('cargoUsuario').value = p.cargo || '';
       document.getElementById('rolUsuario').value = p.rol_id || '';
      document.getElementById('tipoSangreUsuario').value = p.tipo_sangre || '';
      document.getElementById('contactoEmergencia').value = p.contacto_emergencia || '';
      document.getElementById('fechaVencimientoCarnet').value = p.fecha_vencimiento || '';
      document.getElementById('estadoUsuario').value = p.activo ? 'activo' : 'inactivo';
    }
  } else {
    console.log('➕ Abriendo modal para nuevo perfil');
  }

  abrirModal('usuarioModal');
};

async function guardarPerfil(e) {
  e.preventDefault();

  const id = document.getElementById('usuarioId')?.value.trim() || '';
  const esEdicion = Boolean(id);
  const email = document.getElementById('correoUsuario')?.value.trim().toLowerCase() || '';
  const rolId = document.getElementById('rolUsuario')?.value || '';

  if (!email) throw new Error('El correo electrónico es obligatorio.');
  if (!rolId) throw new Error('Debes seleccionar un rol.');
  if (!obtenerRolPorId(rolId)) throw new Error('El rol seleccionado no es válido.');

  const fechaHoy = new Date().toISOString().split('T')[0];
  const actual = esEdicion ? todosLosPerfiles.find(p => p.id === id) : null;
  const fechaExpedicion = actual?.fecha_expedicion || actual?.created_at?.split('T')[0] || fechaHoy;

  const baseDatos = {
    ...(esEdicion ? { id } : {}),
    nombre: document.getElementById('nombreUsuario').value.trim(),
    apellido: document.getElementById('apellidoUsuario').value.trim(),
    email,
    telefono: document.getElementById('telefonoUsuario').value.trim(),
    documento: document.getElementById('documentoUsuario').value.trim(),
    cargo: document.getElementById('cargoUsuario').value.trim(),
    rol_id: rolId,
    tipo_sangre: document.getElementById('tipoSangreUsuario').value,
    contacto_emergencia: document.getElementById('contactoEmergencia').value.trim(),
    fecha_expedicion: fechaExpedicion,
    fecha_vencimiento: document.getElementById('fechaVencimientoCarnet').value || null,
    activo: document.getElementById('estadoUsuario').value === 'activo'
  };

  const submitButton = document.getElementById('guardarUsuario');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
  }

  mostrarNotificacion(esEdicion ? 'Actualizando usuario y cuenta de acceso...' : 'Creando cuenta y perfil de usuario...', 'atencion');

  try {
    let userId = id;

    if (!esEdicion) {
      // La cuenta Auth se crea mediante Edge Function. El usuario recibirá una invitación
      // y establecerá su propia contraseña; nunca se envía una contraseña desde este frontend.
      const result = await llamarFuncionUsuarios({
        action: 'create',
        ...baseDatos,
        redirect_to: new URL('../recuperar-password.html', window.location.href).href
      });
      userId = result.user_id;
      document.getElementById('usuarioId').value = userId;
    } else {
      await llamarFuncionUsuarios({ action: 'update', ...baseDatos });
    }

    // === FOTO ===
    const fotoInput = document.getElementById('fotoPerfil');
    if (fotoInput?.files?.length) {
      const file = fotoInput.files[0];
      const fileExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const filePath = `fotos/${userId}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await window.supabaseClient.storage
        .from('snic-electric')
        .upload(filePath, file, { upsert: true, contentType: file.type || 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: publicData } = window.supabaseClient.storage.from('snic-electric').getPublicUrl(filePath);
      const fotoUrl = publicData?.publicUrl || null;

      await actualizarUrlsPerfil(userId, { foto_url: fotoUrl });
      await guardarArchivoPerfil({
        perfil_id: userId,
        bucket: 'snic-electric',
        ruta: filePath,
        nombre_archivo: file.name,
        tipo: 'foto_perfil',
        mime_type: file.type || 'image/jpeg',
        tamano: file.size
      });
    }

    // === QR ===
    const docInput = baseDatos.documento;
    if (docInput) {
      try {
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(docInput)}`;
        const response = await fetch(qrApiUrl);
        if (!response.ok) throw new Error('No se pudo generar el QR.');
        const blob = await response.blob();
        const filePath = `qrs/qr_${userId}_${Date.now()}.png`;

        const { error: uploadError } = await window.supabaseClient.storage
          .from('snic-electric')
          .upload(filePath, blob, { contentType: 'image/png', upsert: true });
        if (uploadError) throw uploadError;

        const { data: publicData } = window.supabaseClient.storage.from('snic-electric').getPublicUrl(filePath);
        const qrUrl = publicData?.publicUrl || null;

        await actualizarUrlsPerfil(userId, { qr_url: qrUrl });
        await guardarArchivoPerfil({
          perfil_id: userId,
          bucket: 'snic-electric',
          ruta: filePath,
          nombre_archivo: `qr_${docInput}.png`,
          tipo: 'codigo_qr',
          mime_type: 'image/png',
          tamano: blob.size
        });
      } catch (qrError) {
        console.warn('⚠️ No se pudo subir el QR:', qrError);
      }
    }

    mostrarNotificacion(
      esEdicion
        ? 'Usuario y perfil actualizados correctamente.'
        : 'Usuario creado. Se envió una invitación al correo para establecer la contraseña.',
      'exito'
    );
    cerrarModal('usuarioModal');
    await cargarPerfiles();
  } catch (err) {
    console.error('❌ Error al guardar usuario:', err);
    mostrarNotificacion('Error al guardar usuario: ' + (err?.message || err), 'error');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar usuario';
    }
  }
}

async function llamarFuncionUsuarios(payload) {
  if (!window.supabaseClient?.functions) throw new Error('Supabase Functions no está disponible.');

  const { data, error } = await window.supabaseClient.functions.invoke('admin-users', {
    body: payload
  });

  if (error) {
    let detail = error.message || 'No se pudo ejecutar la operación.';
    try {
      const context = error.context;
      if (context?.json) {
        const body = await context.json();
        detail = body?.error || detail;
      }
    } catch (_) {}
    throw new Error(detail);
  }

  if (!data?.ok) throw new Error(data?.error || 'La operación fue rechazada.');
  return data;
}

async function actualizarUrlsPerfil(userId, patch) {
  const { error } = await window.supabaseClient
    .from('perfiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

async function guardarArchivoPerfil(datos) {
  const { data: existente, error: consultaError } = await window.supabaseClient
    .from('archivos')
    .select('id')
    .eq('perfil_id', datos.perfil_id)
    .eq('tipo', datos.tipo)
    .maybeSingle();

  if (consultaError) throw consultaError;

  if (existente) {
    const { error } = await window.supabaseClient.from('archivos').update(datos).eq('id', existente.id);
    if (error) throw error;
  } else {
    const { error } = await window.supabaseClient.from('archivos').insert([datos]);
    if (error) throw error;
  }
}

/* =========================================================
   ELIMINAR PERFIL CON CONTROL DE ÚLTIMO ADMINISTRADOR
   ========================================================= */
window.confirmarEliminar = function(id) {
  perfilAEliminarId = id;
  abrirModal('deleteUsuarioModal');
};

async function eliminarPerfil() {
  if (!perfilAEliminarId) return;

  const idObjetivo = perfilAEliminarId;
  try {
    const perfilObjetivo = todosLosPerfiles.find(p => p.id === idObjetivo);
    if (!perfilObjetivo) throw new Error('No se encontró el perfil seleccionado.');

    const result = await llamarFuncionUsuarios({ action: 'delete', id: idObjetivo });
    if (!result?.user_id) throw new Error('La cuenta no fue eliminada correctamente.');

    mostrarNotificacion('Usuario y cuenta de acceso eliminados correctamente.', 'exito');
    cerrarModal('deleteUsuarioModal');
    await cargarPerfiles();
  } catch (err) {
    console.error('❌ Error al eliminar usuario:', err);
    mostrarNotificacion('Error al eliminar: ' + (err?.message || err), 'error');
  } finally {
    perfilAEliminarId = null;
  }
}

/* =========================================================
   CARNET DE IDENTIFICACIÓN (CON ACCESO A TABLA ARCHIVOS)
   ========================================================= */
window.verCarnet = async function(id) {
  const p = todosLosPerfiles.find(item => item.id === id);
  if (!p) return;

  const container = document.getElementById('carnetPreviewContainer');
  if (!container) return;

  container.innerHTML = '<p class="loading-text" style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando archivos del carnet...</p>';
  abrirModal('carnetModal');

  let fotoUrlArchivos = null;
  let qrUrlArchivos = null;

  try {
    const { data: archivos, error } = await window.supabaseClient
      .from('archivos')
      .select('bucket, ruta, tipo, created_at')
      .eq('perfil_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (archivos && archivos.length > 0) {
      const archivoFoto = archivos.find(a => a.tipo === 'foto_perfil');
      if (archivoFoto && archivoFoto.ruta) {
        const bucket = archivoFoto.bucket || 'snic-electric';
        const { data: signedData, error: signedErr } = await window.supabaseClient.storage
          .from(bucket)
          .createSignedUrl(archivoFoto.ruta, 3600);

        if (!signedErr && signedData?.signedUrl) {
          fotoUrlArchivos = signedData.signedUrl;
        } else {
          const { data: urlData } = window.supabaseClient.storage.from(bucket).getPublicUrl(archivoFoto.ruta);
          fotoUrlArchivos = urlData?.publicUrl;
        }
      }

      const archivoQr = archivos.find(a => a.tipo === 'codigo_qr');
      if (archivoQr && archivoQr.ruta) {
        const bucket = archivoQr.bucket || 'snic-electric';
        const { data: signedData, error: signedErr } = await window.supabaseClient.storage
          .from(bucket)
          .createSignedUrl(archivoQr.ruta, 3600);

        if (!signedErr && signedData?.signedUrl) {
          qrUrlArchivos = signedData.signedUrl;
        } else {
          const { data: urlData } = window.supabaseClient.storage.from(bucket).getPublicUrl(archivoQr.ruta);
          qrUrlArchivos = urlData?.publicUrl;
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ Error al consultar archivos:', err.message);
  }

  const fotoSrc = fotoUrlArchivos || p.foto_url || 'https://via.placeholder.com/150?text=Sin+Foto';
  const qrSource = qrUrlArchivos || p.qr_url || `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(p.documento || 'SNIC')}`;

  const nombreCompleto = `${p.nombre || ''} ${p.apellido || ''}`.trim() || 'PERSONAL TÉCNICO';
  const fechaExpedicionFormatted = p.fecha_expedicion 
    ? p.fecha_expedicion 
    : (p.created_at ? p.created_at.split('T')[0] : 'N/A');

  container.innerHTML = `
    <div class="carnet-card" id="carnetPrintArea">
      <div class="carnet-header">
        <div class="carnet-brand">
          <i class="fa-solid fa-bolt"></i>
          <h3 class="carnet-logo">SNIC'ELECTRIC</h3>
        </div>
        <span class="carnet-sub">Identificación de Personal Técnico</span>
      </div>

      <div class="carnet-body">
        <div class="carnet-photo-container">
          <div class="carnet-avatar" style="overflow: hidden; width: 100px; height: 100px; border-radius: 50%;">
            <img src="${fotoSrc}" 
                 alt="Foto Perfil" 
                 style="width: 100%; height: 100%; object-fit: cover; display: block;" 
                 onerror="this.onerror=null; this.src='https://via.placeholder.com/150?text=Sin+Foto';">
          </div>
          <span class="carnet-rh-badge">RH ${p.tipo_sangre || 'O+'}</span>
        </div>

        <div class="carnet-identity">
          <h4 class="carnet-nombre">${nombreCompleto}</h4>
          <span class="carnet-cargo">${p.cargo || 'Técnico Electricista'}</span>
        </div>

        <div class="carnet-details-grid">
          <div class="carnet-detail-item">
            <span>Documento / C.C.</span>
            <strong>${p.documento || 'N/A'}</strong>
          </div>
          <div class="carnet-detail-item">
            <span>Teléfono</span>
            <strong>${p.telefono || 'N/A'}</strong>
          </div>
          <div class="carnet-detail-item">
            <span>Expedición</span>
            <strong>${fechaExpedicionFormatted}</strong>
          </div>
          <div class="carnet-detail-item">
            <span>Vencimiento</span>
            <strong>${p.fecha_vencimiento || 'N/A'}</strong>
          </div>
          <div class="carnet-detail-item full-width">
            <span>Contacto Emergencia</span>
            <strong>${p.contacto_emergencia || 'N/A'}</strong>
          </div>
        </div>

        <div class="carnet-footer-info">
          <div class="carnet-qr">
            <img src="${qrSource}" 
                 alt="QR" 
                 style="width:100%;height:100%;border-radius:4px;object-fit:cover;"
                 onerror="this.onerror=null; this.src='https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=SNIC';">
          </div>
          <div class="carnet-signature">
            <img src="../img/firmaS.png" alt="Firma Autorizada SNIC'ELECTRIC" class="carnet-signature-img">
            <div class="carnet-signature-line"></div>
            <span>Firma Autorizada</span>
          </div>
        </div>
      </div>

      <div class="carnet-footer">
        <span><i class="fa-solid fa-phone"></i> Emergencias 24/7</span>
        <span>www.snicelectric.com</span>
      </div>
    </div>
  `;
};

function imprimirCarnet() {
  const printContents = document.getElementById('carnetPrintArea')?.outerHTML;
  if (!printContents) return;

  const windowPrint = window.open('', '', 'width=600,height=700');
  windowPrint.document.write(`
    <html>
      <head>
        <title>Imprimir Carnet - SNIC'ELECTRIC</title>
        <link rel="stylesheet" href="../css/administracion.css">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
        <style>
          body { display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #fff; }
          .carnet-card { box-shadow: none !important; border: 1px solid #ccc !important; }
        </style>
      </head>
      <body>
        ${printContents}
        <script>
          setTimeout(() => { window.print(); window.close(); }, 600);
        </script>
      </body>
    </html>
  `);
  windowPrint.document.close();
}

/* =========================================================
   UTILITIES
   ========================================================= */
function abrirModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) {
    m.setAttribute('aria-hidden', 'false');
    m.classList.add('show');
  }
}

function cerrarModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) {
    m.setAttribute('aria-hidden', 'true');
    m.classList.remove('show');
  }
}

function mostrarNotificacion(mensaje, tipo = 'exito') {
  const notif = document.getElementById('notification');
  const notifMsg = document.getElementById('notificationMessage');
  const notifTitle = document.getElementById('notificationTitle');

  if (!notif || !notifMsg) return;

  notifMsg.textContent = mensaje;
  if (notifTitle) {
    notifTitle.textContent = tipo === 'exito' ? 'Operación exitosa' : 'Atención';
  }

  notif.classList.add('show');
  setTimeout(() => {
    notif.classList.remove('show');
  }, 4000);
}
