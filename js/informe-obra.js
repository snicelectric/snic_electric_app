(function () {
"use strict";

const MAX_FOTOS = 8;
const BUCKET_NAME = "snic-electric";

let informes = [];
let ordenes = [];
let clientes = [];
let productos = [];
let usuarios = [];
let materiales = [];
let fotosNuevas = [];
let fotosGuardadas = [];
let editando = null;
let detalleActual = null;
let informeCambioEstado = null;

document.addEventListener("DOMContentLoaded", iniciar);

async function iniciar() {
    if (!window.SNICAuth) { location.href = "../login.html"; return; }
    if (!SNICAuth.protegerPagina(SNICAuth.PERMISOS.INFORME_OBRA_VER)) return;

    mostrarUsuario();
    configurarEventos();
    
    await cargarDatosIniciales();

    if (SNICAuth.aplicarPermisos) SNICAuth.aplicarPermisos();
}

async function cargarDatosIniciales() {
    try {
        const client = window.supabaseClient;

        const [resClientes, resOrdenes, resProductos, resPerfiles] = await Promise.all([
            client.from("clientes").select("*"),
            client.from("ordenes_servicio").select("*"),
            client.from("productos").select("*"),
            client.from("perfiles").select("*")
        ]);

        clientes = resClientes.data || [];
        ordenes = resOrdenes.data || [];
        productos = resProductos.data || [];
        usuarios = resPerfiles.data || [];

        llenarOrdenesSelect();
        await cargarInformes();
    } catch (err) {
        toast("Error cargando información desde Supabase: " + err.message, "error");
    }
}

async function cargarInformes() {
    try {
        const client = window.supabaseClient;
        
        const { data, error } = await client
            .from("informes_obra")
            .select(`
                *,
                informes_obra_detalles (*),
                archivos (*)
            `)
            .order("created_at", { ascending: false });

        if (error) throw error;

        informes = data || [];
        render();
        estadisticas();
    } catch (err) {
        toast("Error al consultar los informes de obra.", "error");
        console.error(err);
    }
}

function configurarEventos() {
    on("btnNuevoInforme", "click", () => abrir());
    on("btnCrearPrimero", "click", () => abrir());
    on("btnCerrarModal", "click", cerrar);
    on("btnCancelar", "click", cerrar);
    on("informeForm", "submit", guardarFormulario);
    on("ordenInforme", "change", completarOrden);
    on("btnAgregarMaterial", "click", () => {
        materiales.push({ producto_id: "", descripcion: "", unidad: "unidad", cantidad: 1, observaciones: "" });
        renderMateriales();
    });
    on("fotosInforme", "change", manejarFotos);
    on("buscarInforme", "input", render);
    on("filtroEstado", "change", render);
    on("btnCerrarDetalle", "click", cerrarDetalle);
    on("btnCerrarDetalle2", "click", cerrarDetalle);
    on("btnImprimir", "click", () => imprimir(detalleActual));

    on("btnCerrarEstadoModal", "click", cerrarEstadoModal);
    on("btnCancelarEstado", "click", cerrarEstadoModal);
    on("estadoForm", "submit", guardarNuevoEstado);

    document.addEventListener("click", manejarAcciones);
    document.addEventListener("keydown", e => {
        if (e.key === "Escape") { 
            cerrar(); 
            cerrarDetalle(); 
            cerrarEstadoModal();
        }
    });

    document.querySelectorAll("[data-logout]").forEach(btn =>
        btn.addEventListener("click", () => SNICAuth.cerrarSesion())
    );
}

function on(id, event, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
}

function mostrarUsuario() {
    const u = SNICAuth.obtenerUsuarioActual?.();
    if (!u) return;
    document.querySelectorAll("[data-user-name]").forEach(e => e.textContent = u.nombre || u.email || "Usuario");
    document.querySelectorAll("[data-user-role]").forEach(e => e.textContent = cap(u.rol || "Usuario"));
}

function usuarioActual() {
    return SNICAuth.obtenerUsuarioActual?.() || {};
}

function esAdministrador() {
    return String(usuarioActual().rol || "").toLowerCase() === "administrador";
}

function obtenerNombreCreador(informe) {
    if (!informe || !informe.usuario_id) {
        const actual = usuarioActual();
        return actual.nombre || actual.email || "Sin asignar";
    }
    const usr = usuarios.find(u => u.id === informe.usuario_id);
    return usr ? (usr.nombre || usr.email || "Sin asignar") : "Sin asignar";
}

function llenarOrdenesSelect() {
    const select = by("ordenInforme");
    if (!select) return;

    const actual = usuarioActual();
    const nombre = String(actual.nombre || "").trim().toLowerCase();
    const email = String(actual.email || "").trim().toLowerCase();

    const disponibles = ordenes.filter(o => {
        if (esAdministrador()) return true;
        if (!o.responsable && !o.responsable_id && !o.tecnico_id) return true;
        
        const nomTecnico = String(o.tecnico || o.responsable || "").toLowerCase();
        return o.tecnico_id === actual.id || 
               o.responsable_id === actual.id ||
               nomTecnico === nombre ||
               nomTecnico === email;
    });

    select.innerHTML = '<option value="">Seleccionar orden...</option>' +
        disponibles.map(o => {
            const cliente = clientes.find(c => c.id === o.cliente_id);
            const numOrden = o.numero || o.id;
            return `<option value="${esc(o.id)}">${esc(numOrden)} · ${esc(nombreCliente(cliente))} · ${esc(o.estado || "")}</option>`;
        }).join("");
}

function completarOrden() {
    const id = by("ordenInforme").value;
    const o = ordenes.find(x => x.id === id);
    if (!o) return;

    const cliente = clientes.find(c => c.id === o.cliente_id);
    by("clienteInforme").value = nombreCliente(cliente);
    by("lugarInforme").value = o.direccion || "";
    by("trabajoInforme").value = by("trabajoInforme").value || o.descripcion || `Ejecución de trabajos correspondientes a la orden.`;
}

async function abrir(id = null) {
    const permiso = id ? SNICAuth.PERMISOS.INFORME_OBRA_EDITAR : SNICAuth.PERMISOS.INFORME_OBRA_CREAR;
    if (!SNICAuth.tienePermiso(permiso)) {
        toast("No tienes permiso para realizar esta acción.", "error");
        return;
    }

    editando = id ? informes.find(x => x.id === id) : null;
    materiales = editando ? JSON.parse(JSON.stringify(editando.informes_obra_detalles || [])) : [];
    fotosGuardadas = editando ? JSON.parse(JSON.stringify(editando.archivos || [])) : [];
    fotosNuevas = [];

    const numInforme = editando ? (editando.numero || editando.id) : "Nuevo informe";
    by("modalTitulo").textContent = editando ? `Editar ${numInforme}` : "Nuevo informe";
    by("informeId").value = editando?.id || "";
    by("fechaInforme").value = editando?.fecha || hoy();

    llenarOrdenesSelect();
    by("ordenInforme").value = editando?.orden_id || "";

    const orden = ordenes.find(o => o.id === editando?.orden_id);
    const c = clientes.find(cli => cli.id === editando?.cliente_id);
    
    by("clienteInforme").value = nombreCliente(c);
    by("tecnicoInforme").value = editando ? obtenerNombreCreador(editando) : (usuarioActual().nombre || usuarioActual().email || "");
    by("lugarInforme").value = editando?.lugar || orden?.direccion || "";
    by("trabajoInforme").value = editando?.trabajo_realizado || editando?.observaciones || "";
    by("observacionesInforme").value = editando?.observaciones || "";
    
    if (by("estadoInforme")) {
        by("estadoInforme").value = editando?.estado || "borrador";
    }

    renderMateriales();
    await renderFotos();
    abrirModal("informeModal");
}

async function generarCodigoInformeSupabase() {
    const client = window.supabaseClient;
    if (!client?.from) return `IT-${String(informes.length + 1).padStart(5, "0")}`;

    const { data, error } = await client
        .from("informes_obra")
        .select("numero")
        .like("numero", "IT-%")
        .order("numero", { ascending: false })
        .limit(1);

    if (error) throw error;

    const ultimo = Number(String(data?.[0]?.numero || "").replace(/^IT-/, "")) || 0;
    return `IT-${String(ultimo + 1).padStart(5, "0")}`;
}

async function guardarFormulario(e) {
    e.preventDefault();

    const id = by("informeId").value;
    const ordenId = by("ordenInforme").value;
    const orden = ordenes.find(x => x.id === ordenId);
    
    if (!orden) {
        toast("Selecciona una orden de servicio.", "error");
        return;
    }

    const trabajo = by("trabajoInforme").value.trim();
    if (!trabajo) {
        toast("Describe el trabajo realizado.", "error");
        return;
    }

    const client = window.supabaseClient;

    try {
        let informeIdGuardado = id;

        const payloadCabecera = {
            orden_id: orden.id,
            cliente_id: orden.cliente_id || null,
            fecha: by("fechaInforme").value || hoy(),
            observaciones: by("observacionesInforme").value.trim() || trabajo,
            estado: by("estadoInforme") ? by("estadoInforme").value : "borrador",
            updated_at: new Date().toISOString()
        };

        if (!id) {
            payloadCabecera.numero = await generarCodigoInformeSupabase();
            payloadCabecera.created_at = new Date().toISOString();
            payloadCabecera.usuario_id = usuarioActual().id || null;

            const { data: dataIns, error: errIns } = await client
                .from("informes_obra")
                .insert([payloadCabecera])
                .select()
                .single();

            if (errIns) throw errIns;
            informeIdGuardado = dataIns.id;
        } else {
            const { error: errUpd } = await client
                .from("informes_obra")
                .update(payloadCabecera)
                .eq("id", id);

            if (errUpd) throw errUpd;
        }

        if (id) {
            await client.from("informes_obra_detalles").delete().eq("informe_id", id);
        }

        if (materiales.length > 0) {
            const detallesInsertar = materiales.map(m => ({
                informe_id: informeIdGuardado,
                producto_id: m.producto_id || null,
                descripcion: m.descripcion || "Material de obra",
                unidad: m.unidad || "unidad",
                cantidad: Number(m.cantidad) || 1,
                observaciones: m.observaciones || null
            }));

            const { error: errDet } = await client
                .from("informes_obra_detalles")
                .insert(detallesInsertar);

            if (errDet) throw errDet;
        }

        for (const fotoFile of fotosNuevas) {
            const ext = fotoFile.name.split(".").pop();
            const fileRuta = `informes/${informeIdGuardado}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;

            const { error: errUpload } = await client.storage
                .from(BUCKET_NAME)
                .upload(fileRuta, fotoFile);

            if (errUpload) {
                console.error("Error al subir archivo a Storage:", errUpload);
                toast("Error al subir imagen a Storage: " + errUpload.message, "error");
                continue;
            }

            const { error: errArch } = await client.from("archivos").insert([{
                bucket: BUCKET_NAME,
                ruta: fileRuta,
                nombre_archivo: fotoFile.name,
                tipo: "evidencia_obra",
                mime_type: fotoFile.type,
                tamano: fotoFile.size,
                cliente_id: orden.cliente_id || null,
                informe_id: informeIdGuardado,
                usuario_id: usuarioActual().id || null,
                created_at: new Date().toISOString()
            }]);

            if (errArch) console.error("Error al registrar entrada en la tabla archivos:", errArch);
        }

        toast(id ? "Informe actualizado correctamente." : "Informe guardado correctamente.");
        cerrar();
        await cargarInformes();

    } catch (err) {
        toast("Error al guardar en Supabase: " + err.message, "error");
        console.error(err);
    }
}

function abrirModalEstado(x) {
    if (!SNICAuth.tienePermiso(SNICAuth.PERMISOS.INFORME_OBRA_EDITAR)) {
        toast("No tienes permisos para modificar el estado.", "error");
        return;
    }

    informeCambioEstado = x;
    
    if (by("estadoModalTitulo")) {
        by("estadoModalTitulo").textContent = `Cambiar Estado: ${x.numero || x.id}`;
    }
    if (by("nuevoEstadoSelect")) {
        by("nuevoEstadoSelect").value = x.estado || "borrador";
    }

    abrirModal("estadoModal");
}

async function guardarNuevoEstado(e) {
    e.preventDefault();
    if (!informeCambioEstado) return;

    const nuevoEstado = by("nuevoEstadoSelect") ? by("nuevoEstadoSelect").value : "borrador";

    try {
        const { error } = await window.supabaseClient
            .from("informes_obra")
            .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
            .eq("id", informeCambioEstado.id);

        if (error) throw error;

        toast("Estado cambiado a " + estadoInformeTexto(nuevoEstado) + ".");
        cerrarEstadoModal();
        await cargarInformes();
    } catch (err) {
        toast("Error al cambiar de estado: " + err.message, "error");
    }
}

function cerrarEstadoModal() {
    cerrarModal("estadoModal");
    informeCambioEstado = null;
}

function render() {
    const body = by("tablaInformes");
    const empty = by("emptyInformes");
    if (!body) return;

    const q = (by("buscarInforme")?.value || "").toLowerCase();
    const estado = by("filtroEstado")?.value || "";

    const lista = informes.filter(x => {
        const cliente = clientes.find(c => c.id === x.cliente_id);
        const orden = ordenes.find(o => o.id === x.orden_id);
        
        const numInforme = x.numero || x.id;
        const numOrden = orden?.numero || x.orden_id || "";
        const nomCliente = nombreCliente(cliente);

        const texto = [numInforme, numOrden, nomCliente, x.observaciones].join(" ").toLowerCase();
        return (!q || texto.includes(q)) && (!estado || (x.estado || "borrador") === estado);
    });

    body.innerHTML = lista.map(x => {
        const cliente = clientes.find(c => c.id === x.cliente_id);
        const orden = ordenes.find(o => o.id === x.orden_id);
        const estActual = x.estado || "borrador";

        return `
        <tr>
          <td><strong>${esc(x.numero || x.id)}</strong></td>
          <td><span class="order-pill">${esc(orden?.numero || "Sin orden")}</span></td>
          <td><strong>${esc(nombreCliente(cliente))}</strong></td>
          <td>${esc(fecha(x.fecha))}</td>
          <td>${esc(obtenerNombreCreador(x))}</td>
          <td><span class="status ${esc(estActual)}">${esc(estadoInformeTexto(estActual))}</span></td>
          <td><div class="actions">
            <button type="button" class="action ver" title="Ver" data-action="view" data-id="${esc(x.id)}"><i class="fa-solid fa-eye"></i></button>
            <button type="button" class="action editar" title="Editar" data-action="edit" data-id="${esc(x.id)}"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="action status-btn" title="Cambiar Estado" data-action="status" data-id="${esc(x.id)}"><i class="fa-solid fa-rotate"></i></button>
            <button type="button" class="action imprimir" title="Imprimir / PDF" data-action="pdf" data-id="${esc(x.id)}"><i class="fa-solid fa-file-pdf"></i></button>
            ${esAdministrador() ? `<button type="button" class="action danger" title="Eliminar" data-action="delete" data-id="${esc(x.id)}"><i class="fa-solid fa-trash"></i></button>` : ""}
          </div></td>
        </tr>
    `;}).join("");

    empty.hidden = lista.length > 0;
}

function manejarAcciones(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const x = informes.find(i => String(i.id) === String(btn.dataset.id));
    if (!x) return;

    if (btn.dataset.action === "view") detalle(x);
    if (btn.dataset.action === "edit") abrir(x.id);
    if (btn.dataset.action === "status") abrirModalEstado(x);
    if (btn.dataset.action === "pdf") imprimir(x);
    if (btn.dataset.action === "delete") eliminar(x);
}

async function detalle(x) {
    detalleActual = x;
    const cliente = clientes.find(c => c.id === x.cliente_id);
    const orden = ordenes.find(o => o.id === x.orden_id);

    by("detalleTitulo").textContent = `${x.numero || x.id} · ${nombreCliente(cliente)}`;

    const materialesHtml = (x.informes_obra_detalles || []).length
        ? `<table class="detail-table"><thead><tr><th>Material</th><th>Unidad</th><th>Cantidad</th><th>Observación</th></tr></thead><tbody>
          ${(x.informes_obra_detalles || []).map(m => `<tr><td>${esc(m.descripcion)}</td><td>${esc(m.unidad)}</td><td>${esc(m.cantidad)}</td><td>${esc(m.observaciones || "")}</td></tr>`).join("")}
          </tbody></table>`
        : `<p class="detail-empty">No se registraron materiales.</p>`;

    const client = window.supabaseClient;
    
    let fotosHtml = `<p class="detail-empty">No hay fotografías.</p>`;
    if ((x.archivos || []).length > 0) {
        const fotosUrls = await Promise.all((x.archivos || []).map(async f => {
            const { data } = await client.storage
                .from(f.bucket || BUCKET_NAME)
                .createSignedUrl(f.ruta, 3600);
            return data?.signedUrl ? `<img src="${data.signedUrl}" alt="Evidencia de obra">` : '';
        }));
        fotosHtml = `<div class="detail-photos">${fotosUrls.join("")}</div>`;
    }

    by("detalleContenido").innerHTML = `
      <div class="detail-grid">
        <div><span>Número de Orden</span><strong>${esc(orden?.numero || "-")}</strong></div>
        <div><span>Fecha</span><strong>${esc(fecha(x.fecha))}</strong></div>
        <div><span>Cliente</span><strong>${esc(nombreCliente(cliente))}</strong></div>
        <div><span>Técnico</span><strong>${esc(obtenerNombreCreador(x))}</strong></div>
        <div><span>Lugar</span><strong>${esc(orden?.direccion || "-")}</strong></div>
        <div><span>Estado</span><strong>${estadoInformeTexto(x.estado || "borrador")}</strong></div>
      </div>
      <div class="detail-section"><span>TRABAJO REALIZADO / OBSERVACIONES</span><p>${esc(x.observaciones || "-")}</p></div>
      <div class="detail-section"><span>MATERIALES</span>${materialesHtml}</div>
      <div class="detail-section"><span>EVIDENCIA FOTOGRÁFICA</span>${fotosHtml}</div>
    `;
    abrirModal("detalleModal");
}

async function eliminar(x) {
    if (!esAdministrador()) {
        toast("Solo el Administrador puede eliminar informes.", "error");
        return;
    }
    if (!confirm(`¿Eliminar el informe ${x.numero || x.id}? Esta acción no se puede deshacer.`)) return;

    try {
        const { error } = await window.supabaseClient
            .from("informes_obra")
            .delete()
            .eq("id", x.id);

        if (error) throw error;

        toast("Informe eliminado correctamente.");
        await cargarInformes();
    } catch (err) {
        toast("Error al eliminar el informe: " + err.message, "error");
    }
}

function manejarFotos(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const totalActual = fotosGuardadas.length + fotosNuevas.length;
    const disponibles = Math.max(0, MAX_FOTOS - totalActual);

    if (files.length > disponibles) {
        toast(`Solo puedes registrar hasta ${MAX_FOTOS} fotografías.`, "error");
    }

    fotosNuevas.push(...files.slice(0, disponibles));
    renderFotos();
    e.target.value = "";
}

async function renderFotos() {
    const box = by("fotosPreview");
    if (!box) return;

    const client = window.supabaseClient;
    let html = "";

    const fotosGuardadasUrls = await Promise.all(fotosGuardadas.map(async f => {
        const { data } = await client.storage
            .from(f.bucket || BUCKET_NAME)
            .createSignedUrl(f.ruta, 3600);
        return { ...f, url: data?.signedUrl || "" };
    }));

    fotosGuardadasUrls.forEach((f) => {
        html += `
          <div class="photo-card">
            <img src="${f.url}" alt="Fotografía">
            <button type="button" data-remove-saved-photo="${f.id}" title="Eliminar"><i class="fa-solid fa-xmark"></i></button>
          </div>`;
    });

    fotosNuevas.forEach((file, i) => {
        const tempUrl = URL.createObjectURL(file);
        html += `
          <div class="photo-card">
            <img src="${tempUrl}" alt="Fotografía nueva">
            <button type="button" data-remove-new-photo="${i}" title="Quitar"><i class="fa-solid fa-xmark"></i></button>
          </div>`;
    });

    box.innerHTML = html;

    box.querySelectorAll("[data-remove-saved-photo]").forEach(btn =>
        btn.addEventListener("click", async () => {
            const idFoto = btn.dataset.removeSavedPhoto;
            if (confirm("¿Deseas eliminar esta fotografía?")) {
                await client.from("archivos").delete().eq("id", idFoto);
                fotosGuardadas = fotosGuardadas.filter(f => f.id !== idFoto);
                await renderFotos();
            }
        })
    );

    box.querySelectorAll("[data-remove-new-photo]").forEach(btn =>
        btn.addEventListener("click", () => {
            fotosNuevas.splice(Number(btn.dataset.removeNewPhoto), 1);
            renderFotos();
        })
    );
}

function renderMateriales() {
    const body = by("materialesBody");
    const empty = by("materialesEmpty");
    if (!body) return;

    body.innerHTML = materiales.map((m, i) => {
        const pid = m.producto_id || "";
        const p = productos.find(x => x.id === pid);
        const unidad = p?.unidad || m.unidad || "unidad";

        return `
          <tr>
            <td>
              <select data-mi="${i}" data-mk="producto_id" aria-label="Producto de inventario">
                <option value="">Seleccionar producto...</option>
                ${productos.map(x => `<option value="${esc(x.id)}" ${x.id === pid ? "selected" : ""}>${esc(x.codigo || "")} · ${esc(x.nombre || "Producto")} · Stock: ${esc(x.stock ?? 0)}</option>`).join("")}
              </select>
            </td>
            <td><input data-mi="${i}" data-mk="unidad" value="${esc(unidad)}" readonly></td>
            <td><input type="number" min="0.01" step="0.01" data-mi="${i}" data-mk="cantidad" value="${Number(m.cantidad) || 1}"></td>
            <td><input data-mi="${i}" data-mk="observaciones" value="${esc(m.observaciones || "")}" placeholder="Observación"></td>
            <td><button type="button" class="remove-item" data-remove-material="${i}"><i class="fa-solid fa-trash"></i></button></td>
          </tr>`;
    }).join("");

    empty.hidden = materiales.length > 0;

    body.querySelectorAll("[data-mk]").forEach(input => {
        input.addEventListener("input", () => actualizarMaterialDesdeCampo(input));
        input.addEventListener("change", () => actualizarMaterialDesdeCampo(input));
    });

    body.querySelectorAll("[data-remove-material]").forEach(btn =>
        btn.addEventListener("click", () => {
            materiales.splice(Number(btn.dataset.removeMaterial), 1);
            renderMateriales();
        })
    );
}

function actualizarMaterialDesdeCampo(input) {
    const i = Number(input.dataset.mi);
    if (!materiales[i]) return;
    const key = input.dataset.mk;
    if (key === "cantidad") materiales[i][key] = Number(input.value) || 0;
    else materiales[i][key] = input.value;

    if (key === "producto_id") {
        const p = productos.find(x => x.id === input.value);
        materiales[i].descripcion = p?.nombre || "";
        materiales[i].unidad = p?.unidad || "unidad";
        renderMateriales();
    }
}

function estadisticas() {
    by("statTotal").textContent = informes.length;
    by("statBorradores").textContent = informes.filter(x => (x.estado || "borrador") === "borrador").length;
    by("statProceso").textContent = informes.filter(x => x.estado === "en_proceso").length;
    by("statFinalizados").textContent = informes.filter(x => x.estado === "finalizado").length;
}

async function imprimir(x) {
    if (!x) return;
    const w = window.open("", "_blank", "width=1000,height=800");
    if (!w) { toast("Permite ventanas emergentes para generar el PDF.", "error"); return; }

    const cliente = clientes.find(c => c.id === x.cliente_id);
    const orden = ordenes.find(o => o.id === x.orden_id);
    const client = window.supabaseClient;

    const materialsRows = (x.informes_obra_detalles || []).map(m =>
        `<tr><td>${esc(m.descripcion)}</td><td>${esc(m.unidad)}</td><td>${esc(m.cantidad)}</td><td>${esc(m.observaciones || "")}</td></tr>`
    ).join("");

    let photos = "";
    if ((x.archivos || []).length > 0) {
        const photosUrls = await Promise.all((x.archivos || []).map(async f => {
            const { data } = await client.storage
                .from(f.bucket || BUCKET_NAME)
                .createSignedUrl(f.ruta, 3600);
            return data?.signedUrl ? `<img src="${data.signedUrl}" alt="Evidencia">` : '';
        }));
        photos = photosUrls.join("");
    }

    const logo = new URL("../img/logo.png", location.href).href;

    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(x.numero || x.id)}</title>
    <style>
      @page{size:A4;margin:13mm}
      body{font-family:Arial,sans-serif;color:#16233b;font-size:11px;margin:0}
      .toolbar{text-align:right;margin-bottom:12px}.toolbar button{background:#fbb900;border:0;border-radius:6px;padding:9px 14px;font-weight:700}
      .head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #fbb900;padding-bottom:12px}
      .brand{display:flex;gap:12px;align-items:center}.brand img{width:72px;height:72px;object-fit:contain}.brand h1{margin:0;color:#0b2f67}.brand p{margin:3px 0;color:#758196;font-size:9px}
      .code{text-align:right}.label{font-size:9px;color:#b47b00;font-weight:800;letter-spacing:1px}.code h2{margin:4px 0;color:#0b2f67}
      .section{margin-top:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;border:1px solid #dbe3ee;padding:12px;border-radius:7px;margin-top:7px}
      .grid span{display:block;color:#788596;font-size:9px}.grid strong{font-size:11px}
      .box{border:1px solid #dbe3ee;border-radius:7px;padding:12px;margin-top:7px;white-space:pre-wrap;line-height:1.5}
      table{width:100%;border-collapse:collapse;margin-top:7px}th{background:#0b2f67;color:#fff;padding:8px;text-align:left;font-size:9px}td{padding:8px;border-bottom:1px solid #e3e8ef}
      .photos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}.photos img{width:100%;height:145px;object-fit:cover;border-radius:5px}
      .sign{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:55px}.line{border-top:1px solid #687789;text-align:center;padding-top:6px;font-size:9px}
      @media print{.toolbar{display:none}}
    </style></head><body>
    <div class="toolbar"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
    <div class="head"><div class="brand"><img src="${logo}"><div><h1>SNIC'ELECTRIC</h1><p>MANTENIMIENTO ELÉCTRICO RESIDENCIAL</p></div></div>
    <div class="code"><div class="label">INFORME DE OBRA</div><h2>${esc(x.numero || x.id)}</h2><div>Fecha: ${esc(fecha(x.fecha))}</div></div></div>
    <div class="section"><div class="label">DATOS DEL SERVICIO</div><div class="grid">
      <div><span>Orden de servicio</span><strong>${esc(orden?.numero || "-")}</strong></div><div><span>Cliente</span><strong>${esc(nombreCliente(cliente))}</strong></div>
      <div><span>Técnico</span><strong>${esc(obtenerNombreCreador(x))}</strong></div><div><span>Lugar</span><strong>${esc(orden?.direccion || "-")}</strong></div>
    </div></div>
    <div class="section"><div class="label">OBSERVACIONES Y TRABAJO REALIZADO</div><div class="box">${esc(x.observaciones || "-")}</div></div>
    <div class="section"><div class="label">MATERIALES UTILIZADOS</div><table><thead><tr><th>DESCRIPCIÓN</th><th>UNIDAD</th><th>CANT.</th><th>OBSERVACIÓN</th></tr></thead><tbody>${materialsRows || "<tr><td colspan='4'>No se registraron materiales.</td></tr>"}</tbody></table></div>
    ${photos ? `<div class="section"><div class="label">EVIDENCIA FOTOGRÁFICA</div><div class="photos">${photos}</div></div>` : ""}
    <div class="sign"><div class="line">Responsable / Técnico</div><div class="line">Cliente / Recibido a satisfacción</div></div>
    <script>addEventListener('load',()=>setTimeout(()=>print(),300))</script></body></html>`);
    w.document.close();
}

function cerrar() {
    cerrarModal("informeModal");
    editando = null;
    fotosNuevas = [];
    fotosGuardadas = [];
}

function cerrarDetalle() {
    cerrarModal("detalleModal");
    detalleActual = null;
}

function abrirModal(id) {
    const m = by(id);
    if (!m) return;
    m.classList.add("show");
    m.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
}

function cerrarModal(id) {
    const m = by(id);
    if (!m) return;
    m.classList.remove("show");
    m.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal.show")) document.body.classList.remove("modal-open");
}

function estadoInformeTexto(v) {
    return ({borrador:"Borrador",en_proceso:"En ejecución",finalizado:"Finalizado"})[v] || v || "-";
}

function nombreCliente(c) {
    if (!c) return "Sin cliente";
    return [c.nombre, c.apellido].filter(Boolean).join(" ") || c.razon_social || c.nombre_completo || "Sin cliente";
}

function hoy() {
    return new Date().toISOString().slice(0,10);
}

function fecha(v) {
    if (!v) return "-";
    const p = String(v).split("-");
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v;
}

function cap(v) {
    return String(v || "").charAt(0).toUpperCase() + String(v || "").slice(1);
}

function by(id) { return document.getElementById(id); }

function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, m => ({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
}

function toast(message, type = "success") {
    const box = by("toast"), icon = by("toastIcon"), text = by("toastMessage");
    if (!box) return;
    text.textContent = message;
    icon.className = type === "error" ? "fa-solid fa-circle-exclamation" : "fa-solid fa-circle-check";
    box.classList.toggle("error", type === "error");
    box.classList.add("show");
    clearTimeout(window.__informeToast);
    window.__informeToast = setTimeout(() => box.classList.remove("show"), 3200);
}
})();