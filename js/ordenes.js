/* =========================================================
   SNIC'ELECTRIC - ÓRDENES DE SERVICIO
   ========================================================= */

(function () {
    "use strict";

    let ordenes = [];
    let clientes = [];
    let cotizaciones = [];
    let tecnicos = [];
    let servicios = [];
    let items = [];

    let editando = null;
    let detalleActual = null;

    document.addEventListener("DOMContentLoaded", init);

    async function init() {
        if (!window.SNICAuth) {
            console.error("SNIC'ELECTRIC - Auth.js no disponible.");
            location.href = "../login.html";
            return;
        }

        const permiso = SNICAuth.PERMISOS?.ORDENES_VER;
        if (permiso && !SNICAuth.protegerPagina(permiso)) return;

        mostrarUsuario();
        configurar();

        try {
            await cargarDatosSupabase();
            render();
            stats();

            const params = new URLSearchParams(location.search);
            const cotizacion = params.get("cotizacion");
            if (cotizacion) {
                abrir(null, cotizacion);
            }
        } catch (error) {
            console.error("SNIC'ELECTRIC - Error inicializando Ordenes:", error);
            toast("No se pudieron cargar los datos.", "error");
        }
    }

    function supabase() {
        if (!window.supabaseClient) {
            console.error("SNIC'ELECTRIC - supabaseClient no está disponible.");
            return null;
        }
        return window.supabaseClient;
    }

    async function cargarDatosSupabase() {
        const sb = supabase();
        if (!sb) throw new Error("Cliente Supabase no disponible.");

        await Promise.all([
            cargarClientes(),
            cargarCotizaciones(),
            cargarTecnicos(),
            cargarServicios()
        ]);

        await cargarOrdenes();
    }

    /* =====================================================
       CLIENTES
       ===================================================== */

    async function cargarClientes() {
        const sb = supabase();
        const { data, error } = await sb
            .from("clientes")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        clientes = (data || []).filter(c => c.activo !== false).map(normalizarCliente);
        llenarClientes();
    }

    function normalizarCliente(c) {
        return {
            ...c,
            id: c.id,
            nombre: c.nombre || "",
            apellido: c.apellido || "",
            documentoNumero: c.numero_documento || c.documentoNumero || c.documento || "",
            razonSocial: c.razon_social || c.razonSocial || "",
            nombreCompleto: c.nombre_completo || c.nombreCompleto || ""
        };
    }

    function nombreCliente(c) {
        if (!c) return "Cliente no registrado";
        if (c.razonSocial) return c.razonSocial;
        if (c.nombreCompleto) return c.nombreCompleto;
        return [c.nombre, c.apellido].filter(Boolean).join(" ") || "Cliente";
    }

    function llenarClientes() {
        const select = by("clienteOS");
        if (!select) return;

        select.innerHTML = `
            <option value="">Seleccionar cliente...</option>
            ${clientes.map(c => `
                <option value="${esc(c.id)}">
                    ${esc(nombreCliente(c))} ${c.documentoNumero ? ` · ${esc(c.documentoNumero)}` : ""}
                </option>
            `).join("")}
        `;
    }

    /* =====================================================
       COTIZACIONES
       ===================================================== */

    async function cargarCotizaciones() {
        const sb = supabase();
        const { data, error } = await sb
            .from("cotizaciones")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        const cotizacionesBase = data || [];
        cotizaciones = [];

        for (const cot of cotizacionesBase) {
            const { data: detalles, error: errorDetalles } = await sb
                .from("cotizacion_detalles")
                .select("*")
                .eq("cotizacion_id", cot.id)
                .order("created_at", { ascending: true });

            if (errorDetalles) {
                console.warn("No se pudieron cargar detalles de", cot.numero, errorDetalles);
            }

            const cliente = clientes.find(c => c.id === cot.cliente_id);

            cotizaciones.push({
                ...cot,
                id: cot.numero || cot.id,
                uuid: cot.id,
                clienteId: cot.cliente_id,
                clienteNombre: cliente ? nombreCliente(cliente) : "Cliente",
                clienteDocumento: cliente?.documentoNumero || "",
                items: (detalles || []).map(d => ({
                    ...d,
                    producto_id: d.producto_id || d.product_id || null,
                    descripcion: d.descripcion || d.nombre || "Concepto",
                    unidad: d.unidad || "servicio",
                    cantidad: Number(d.cantidad) || 1,
                    precio_unitario: Number(d.precio_unitario || d.valor_unitario || d.precio) || 0,
                    observacion: d.observacion || ""
                }))
            });
        }
        llenarCotizaciones();
    }

    function llenarCotizaciones() {
        const select = by("cotizacionOS");
        if (!select) return;

        const aprobadas = cotizaciones.filter(c => String(c.estado || "").toLowerCase() === "aprobada");

        select.innerHTML = `
            <option value="">Seleccionar cotización aprobada...</option>
            ${aprobadas.map(c => `
                <option value="${esc(c.id)}">
                    ${esc(c.id)} · ${esc(c.clienteNombre || "Cliente")} · ${money(c.total || 0)}
                </option>
            `).join("")}
        `;
    }

    /* =====================================================
       TÉCNICOS
       ===================================================== */

    async function cargarTecnicos() {
        const sb = supabase();
        const select = by("responsableOS");

        try {
            const { data, error } = await sb
                .from("perfiles")
                .select(`id, nombre, apellido, email, activo, roles (id, nombre)`)
                .eq("activo", true);

            if (error) throw error;

            tecnicos = (data || []).filter(p => String(p.roles?.nombre || "").trim().toLowerCase() === "técnico");

            if (select) {
                select.innerHTML = `
                    <option value="">Seleccionar técnico...</option>
                    ${tecnicos.map(t => `
                        <option value="${esc(t.id)}">${esc(nombreTecnico(t))}</option>
                    `).join("")}
                `;
            }
        } catch (error) {
            console.error("SNIC'ELECTRIC - Error cargando técnicos:", error);
            if (select) {
                select.innerHTML = `<option value="">No se pudieron cargar los técnicos</option>`;
            }
        }
    }

    function nombreTecnico(t) {
        if (!t) return "Sin técnico";
        return [t.nombre, t.apellido].filter(Boolean).join(" ") || t.email || "Técnico";
    }

    /* =====================================================
       SERVICIOS Y PRODUCTOS
       ===================================================== */

    async function cargarServicios() {
        const sb = supabase();
        const { data, error } = await sb
            .from("productos")
            .select(`id, codigo, nombre, unidad, descripcion, precio_venta, estado`)
            .eq("estado", "activo")
            .order("codigo", { ascending: true });

        if (error) throw error;
        servicios = data || [];
        llenarSelectorServicios();
    }

    function llenarSelectorServicios() {
        const select = by("servicioOS");
        if (!select) return;

        select.innerHTML = `
            <option value="">Seleccionar desde catálogo...</option>
            ${servicios.map(s => `
                <option value="${esc(s.id)}">
                    ${esc(s.codigo)} · ${esc(s.nombre)} ·${money(s.precio_venta || 0)}
                </option>
            `).join("")}
        `;
    }

    /* =====================================================
       ÓRDENES
       ===================================================== */

    async function cargarOrdenes() {
        const sb = supabase();
        const { data, error } = await sb
            .from("ordenes_servicio")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        const ordenesBase = data || [];
        ordenes = [];

        for (const orden of ordenesBase) {
            const { data: detalles, error: errorDetalles } = await sb
                .from("ordenes_servicio_detalles")
                .select("*")
                .eq("orden_id", orden.id)
                .order("created_at", { ascending: true });

            if (errorDetalles) {
                console.error("Error cargando detalles de", orden.numero, errorDetalles);
                continue;
            }

            const cliente = clientes.find(c => c.id === orden.cliente_id);
            const tecnico = tecnicos.find(t => t.id === orden.responsable_id);
            const cotizacion = cotizaciones.find(c => c.uuid === orden.cotizacion_id);

            ordenes.push({
                ...orden,
                id: orden.numero,
                uuid: orden.id,
                clienteId: orden.cliente_id,
                clienteNombre: cliente ? nombreCliente(cliente) : "Sin cliente",
                clienteDocumento: cliente?.documentoNumero || "",
                cotizacionId: cotizacion?.id || "",
                cotizacionUuid: orden.cotizacion_id,
                responsableId: orden.responsable_id,
                responsable: tecnico ? nombreTecnico(tecnico) : "Sin asignar",
                fecha: orden.fecha_programada,
                hora: orden.hora_programada || "",
                contacto: orden.contacto_obra || "",
                direccion: orden.direccion || "",
                descripcion: orden.descripcion || "",
                observaciones: orden.observaciones || "",
                prioridad: orden.prioridad || "normal",
                estado: orden.estado || "pendiente",
                items: (detalles || []).map(d => ({
                    ...d,
                    producto_id: d.producto_id || null,
                    descripcion: d.descripcion || "Concepto",
                    unidad: d.unidad || "servicio",
                    cantidad: Number(d.cantidad) || 1,
                    precio_unitario: Number(d.precio_unitario) || 0,
                    observacion: d.observacion || ""
                }))
            });
        }
    }

    /* =====================================================
       CONFIGURACIÓN EVENTOS
       ===================================================== */

    function configurar() {
        by("btnNuevaOS")?.addEventListener("click", () => abrir());
        by("btnCrearPrimera")?.addEventListener("click", () => abrir());
        by("btnCerrarModal")?.addEventListener("click", cerrarModal);
        by("btnCancelar")?.addEventListener("click", cerrarModal);
        by("osForm")?.addEventListener("submit", guardarOS);
        by("cotizacionOS")?.addEventListener("change", cargarCotizacion);

        by("btnAgregarLibre")?.addEventListener("click", () => agregarConcepto());
        by("btnAgregarServicio")?.addEventListener("click", () => agregarConceptoServicio());

        by("buscarOS")?.addEventListener("input", render);
        by("filtroEstado")?.addEventListener("change", render);
        by("filtroPrioridad")?.addEventListener("change", render);

        by("btnCerrarDetalle")?.addEventListener("click", cerrarDetalle);
        by("btnCerrarDetalle2")?.addEventListener("click", cerrarDetalle);
        by("btnImprimirOS")?.addEventListener("click", () => imprimir(detalleActual));
        by("btnEditarDesdeDetalle")?.addEventListener("click", () => {
            const x = detalleActual;
            cerrarDetalle();
            if (x) abrir(x.id);
        });

        by("btnCerrarEstado")?.addEventListener("click", cerrarEstado);
        by("btnCancelarEstado")?.addEventListener("click", cerrarEstado);
        by("btnGuardarEstado")?.addEventListener("click", guardarEstado);

        document.addEventListener("keydown", e => {
            if (e.key === "Escape") {
                cerrarModal();
                cerrarDetalle();
                cerrarEstado();
            }
        });

        document.querySelectorAll("[data-logout]").forEach(b => {
            b.addEventListener("click", () => SNICAuth.cerrarSesion());
        });
    }

    function mostrarUsuario() {
        const u = SNICAuth.obtenerUsuarioActual?.();
        if (!u) return;

        document.querySelectorAll("[data-user-name]").forEach(e => e.textContent = u.nombre || u.email || "Usuario");
        document.querySelectorAll("[data-user-role]").forEach(e => e.textContent = cap(u.rol || "Usuario"));
    }

    /* =====================================================
       ABRIR / CERRAR FORMULARIO
       ===================================================== */

    async function abrir(id = null, cotId = "") {
        const permiso = id ? SNICAuth.PERMISOS.ORDENES_EDITAR : SNICAuth.PERMISOS.ORDENES_CREAR;
        if (permiso && !SNICAuth.tienePermiso(permiso)) {
            toast("No tienes permiso para esta acción.", "error");
            return;
        }

        editando = id ? ordenes.find(x => x.id === id || x.uuid === id) : null;
        items = editando ? JSON.parse(JSON.stringify(editando.items || [])) : [];

        by("modalTitulo").textContent = editando ? `Editar ${editando.id}` : "Nueva orden de servicio";
        by("osId").value = editando?.uuid || "";
        by("fechaOS").value = editando?.fecha || new Date().toISOString().slice(0, 10);
        by("horaOS").value = editando?.hora || "";
        by("responsableOS").value = editando?.responsableId || "";
        by("direccionOS").value = editando?.direccion || "";
        by("contactoOS").value = editando?.contacto || "";
        by("descripcionOS").value = editando?.descripcion || "";
        by("observacionesOS").value = editando?.observaciones || "";
        by("prioridadOS").value = editando?.prioridad || "normal";

        llenarClientes();
        llenarCotizaciones();
        llenarSelectorServicios();

        by("clienteOS").value = editando?.clienteId || "";
        by("cotizacionOS").value = editando?.cotizacionId || cotId || "";

        if (cotId && !editando) {
            await cargarCotizacion();
        }

        renderItems();
        open("osModal");
    }

    async function cargarCotizacion() {
        const valor = by("cotizacionOS")?.value;
        if (!valor) return;

        let cotizacion = cotizaciones.find(c => c.id === valor || c.uuid === valor);

        if (!cotizacion) {
            const sb = supabase();
            let query = sb.from("cotizaciones").select("*");
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)) {
                query = query.eq("id", valor);
            } else {
                query = query.eq("numero", valor);
            }

            const { data, error } = await query.maybeSingle();
            if (error) throw error;

            if (data) {
                const cliente = clientes.find(c => c.id === data.cliente_id);
                const { data: detalles } = await sb.from("cotizacion_detalles").select("*").eq("cotizacion_id", data.id);
                cotizacion = {
                    ...data,
                    id: data.numero || data.id,
                    uuid: data.id,
                    clienteId: data.cliente_id,
                    clienteNombre: cliente ? nombreCliente(cliente) : "Cliente",
                    items: detalles || []
                };
            }
        }

        if (!cotizacion) {
            toast("No se encontró la cotización.", "error");
            return;
        }

        by("clienteOS").value = cotizacion.clienteId || "";
        by("descripcionOS").value = by("descripcionOS").value || `Ejecución de trabajos correspondientes a la cotización ${cotizacion.id}.`;

        items = (cotizacion.items || []).map(x => ({
            producto_id: x.producto_id || x.product_id || null,
            descripcion: x.descripcion || x.nombre || "Concepto",
            unidad: x.unidad || "servicio",
            cantidad: Number(x.cantidad) || 1,
            precio_unitario: Number(x.precio_unitario || x.valor_unitario || x.precio) || 0,
            observacion: x.observacion || ""
        }));

        renderItems();
        toast("Datos de la cotización cargados con éxito.");
    }

    /* =====================================================
       AGREGAR Y RENDERIZAR CONCEPTOS
       ===================================================== */

    function agregarConcepto() {
        items.push({
            producto_id: null,
            descripcion: "",
            unidad: "servicio",
            cantidad: 1,
            precio_unitario: 0,
            observacion: ""
        });
        renderItems();
    }

    function agregarConceptoServicio() {
        const select = by("servicioOS");
        if (!select || !select.value) {
            toast("Selecciona un elemento del catálogo.", "error");
            return;
        }

        const servicio = servicios.find(s => s.id === select.value);
        if (!servicio) return;

        items.push({
            producto_id: servicio.id,
            descripcion: servicio.nombre,
            unidad: servicio.unidad || "servicio",
            cantidad: 1,
            precio_unitario: Number(servicio.precio_venta) || 0,
            observacion: ""
        });

        select.value = "";
        renderItems();
    }

    function renderItems() {
        const tbody = by("itemsOS");
        const empty = by("itemsEmpty");
        if (!tbody) return;

        let totalMonto = 0;

        tbody.innerHTML = items.map((item, index) => {
            const subtotal = (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0);
            totalMonto += subtotal;

            const opcionesServicios = `
                <option value="">Selección libre / catálogo...</option>
                ${servicios.map(s => `
                    <option value="${esc(s.id)}" ${item.producto_id === s.id ? "selected" : ""}>
                        ${esc(s.codigo)} ·${esc(s.nombre)}
                    </option>
                `).join("")}
            `;

            return `
                <tr>
                    <td>
                        <select class="servicio-item" data-i="${index}" style="margin-bottom:4px">
                            ${opcionesServicios}
                        </select>
                        <input data-i="${index}" data-k="descripcion" value="${esc(item.descripcion || "")}" placeholder="Descripción del concepto">
                    </td>
                    <td>
                        <input data-i="${index}" data-k="unidad" value="${esc(item.unidad || "servicio")}">
                    </td>
                    <td>
                        <input type="number" min="0.01" step="0.01" data-i="${index}" data-k="cantidad" value="${Number(item.cantidad) || 1}">
                    </td>
                    <td>
                        <input type="number" min="0" step="100" data-i="${index}" data-k="precio_unitario" value="${Number(item.precio_unitario) || 0}">
                    </td>
                    <td style="font-weight:bold; vertical-align:middle; text-align:right">
                        ${money(subtotal)}
                    </td>
                    <td>
                        <input data-i="${index}" data-k="observacion" value="${esc(item.observacion || "")}" placeholder="Observación">
                    </td>
                    <td style="vertical-align:middle; text-align:center">
                        <button type="button" class="remove-item" data-remove="${index}"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
        }).join("");

        if (empty) empty.hidden = items.length > 0;

        const countEl = by("totalItemsCount");
        const montoEl = by("totalMontoEstimado");
        if (countEl) countEl.textContent = items.length;
        if (montoEl) montoEl.textContent = money(totalMonto);

        tbody.querySelectorAll("[data-k]").forEach(input => {
            input.addEventListener("input", () => {
                const i = Number(input.dataset.i);
                const key = input.dataset.k;
                if (!items[i]) return;

                items[i][key] = (key === "cantidad" || key === "precio_unitario") ? Number(input.value) || 0 : input.value;
                if (key === "cantidad" || key === "precio_unitario") renderItems();
            });
        });

        tbody.querySelectorAll(".servicio-item").forEach(select => {
            select.addEventListener("change", () => {
                const i = Number(select.dataset.i);
                if (!items[i]) return;

                const servicio = servicios.find(s => s.id === select.value);
                if (!servicio) {
                    items[i].producto_id = null;
                } else {
                    items[i].producto_id = servicio.id;
                    items[i].descripcion = servicio.nombre;
                    items[i].unidad = servicio.unidad || "servicio";
                    items[i].precio_unitario = Number(servicio.precio_venta) || 0;
                }
                renderItems();
            });
        });

        tbody.querySelectorAll("[data-remove]").forEach(button => {
            button.addEventListener("click", () => {
                items.splice(Number(button.dataset.remove), 1);
                renderItems();
            });
        });
    }

    /* =====================================================
       GUARDAR ORDEN DE SERVICIO
       ===================================================== */

    async function guardarOS(e) {
        e.preventDefault();

        const id = by("osId").value;
        const permiso = id ? SNICAuth.PERMISOS.ORDENES_EDITAR : SNICAuth.PERMISOS.ORDENES_CREAR;
        if (permiso && !SNICAuth.tienePermiso(permiso)) {
            toast("No tienes permiso para guardar órdenes.", "error");
            return;
        }

        const clienteId = by("clienteOS").value;
        if (!clienteId) {
            toast("Selecciona un cliente.", "error");
            return;
        }

        if (!items.length) {
            toast("Agrega al menos un concepto.", "error");
            return;
        }

        if (items.some(item => !String(item.descripcion || "").trim())) {
            toast("Todos los conceptos deben tener descripción.", "error");
            return;
        }

        const sb = supabase();
        if (!sb) return;

        const responsableId = by("responsableOS").value || null;
        const cotizacionValor = by("cotizacionOS").value || "";
        let cotizacionUuid = null;

        if (cotizacionValor) {
            const cotizacion = cotizaciones.find(c => c.id === cotizacionValor || c.uuid === cotizacionValor);
            if (cotizacion) {
                cotizacionUuid = cotizacion.uuid;
            } else {
                let query = sb.from("cotizaciones").select("id,numero");
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cotizacionValor)) {
                    query = query.eq("id", cotizacionValor);
                } else {
                    query = query.eq("numero", cotizacionValor);
                }
                const { data } = await query.maybeSingle();
                if (data) cotizacionUuid = data.id;
            }
        }

        const usuario = SNICAuth.obtenerUsuarioActual?.();
        let usuarioId = usuario?.id || usuario?.usuario_id || usuario?.perfil_id || null;

        if (!usuarioId) {
            const { data: sessionData } = await sb.auth.getSession();
            usuarioId = sessionData?.session?.user?.id || null;
        }

        let numero = editando?.id || generarCodigo(clienteId, by("fechaOS").value);

        const datosOrden = {
            numero,
            cliente_id: clienteId,
            cotizacion_id: cotizacionUuid,
            creado_por: usuarioId,
            responsable_id: responsableId,
            fecha_programada: by("fechaOS").value,
            hora_programada: by("horaOS").value || null,
            direccion: by("direccionOS").value.trim() || null,
            contacto_obra: by("contactoOS").value.trim() || null,
            descripcion: by("descripcionOS").value.trim() || null,
            estado: editando?.estado || "pendiente",
            prioridad: by("prioridadOS").value || "normal",
            observaciones: by("observacionesOS").value.trim() || null
        };

        try {
            let ordenGuardada;

            if (editando) {
                const uuid = editando.uuid;
                const { data, error } = await sb.from("ordenes_servicio").update(datosOrden).eq("id", uuid).select().single();
                if (error) throw error;
                ordenGuardada = data;

                const { error: errorDelete } = await sb.from("ordenes_servicio_detalles").delete().eq("orden_id", uuid);
                if (errorDelete) throw errorDelete;
            } else {
                const { data, error } = await sb.from("ordenes_servicio").insert(datosOrden).select().single();
                if (error) throw error;
                ordenGuardada = data;
            }

            const detalles = items.map(item => ({
                orden_id: ordenGuardada.id,
                producto_id: item.producto_id || null,
                descripcion: String(item.descripcion || "").trim(),
                unidad: item.unidad || "servicio",
                cantidad: Number(item.cantidad) || 1,
                precio_unitario: Number(item.precio_unitario) || 0,
                observacion: String(item.observacion || "").trim() || null
            }));

            if (detalles.length) {
                const { error } = await sb.from("ordenes_servicio_detalles").insert(detalles);
                if (error) throw error;
            }

            toast(editando ? `Orden ${numero} actualizada correctamente.` : `Orden ${numero} guardada correctamente.`);
            cerrarModal();
            await cargarOrdenes();
            render();
            stats();
        } catch (error) {
            console.error("SNIC'ELECTRIC - Error guardando orden en Supabase:", error);
            toast(error.message || "No se pudo guardar la orden.", "error");
        }
    }

    function generarCodigo(clienteId, fechaStr) {
        const cliente = clientes.find(c => c.id === clienteId);
        const documento = String(cliente?.documentoNumero || "").replace(/\D/g, "");
        const ult = (documento.slice(-3) || "000").padStart(3, "0");
        const fecha = new Date(`${fechaStr}T00:00:00`);
        const dd = String(fecha.getDate()).padStart(2, "0");
        const mm = String(fecha.getMonth() + 1).padStart(2, "0");
        const base = `OS-${ult}-${dd}${mm}`;

        const existentes = ordenes.filter(o => String(o.id).startsWith(base));
        return existentes.length === 0 ? base : `${base}-${String(existentes.length + 1).padStart(2, "0")}`;
    }

    /* =====================================================
       RENDER Y ACCIONES TABLA
       ===================================================== */

    function render() {
        const q = (by("buscarOS")?.value || "").toLowerCase();
        const estado = by("filtroEstado")?.value || "";
        const prioridad = by("filtroPrioridad")?.value || "";
        const tbody = by("tablaOS");
        if (!tbody) return;

        const lista = ordenes.filter(o => {
            const texto = [o.id, o.clienteNombre, o.clienteDocumento, o.responsable, o.cotizacionId].join(" ").toLowerCase();
            return (!q || texto.includes(q)) && (!estado || o.estado === estado) && (!prioridad || o.prioridad === prioridad);
        });

        tbody.innerHTML = lista.map(o => `
            <tr>
                <td><span class="order-id">${esc(o.id)}</span></td>
                <td><strong>${esc(o.clienteNombre || "Sin cliente")}</strong><span class="muted">${esc(o.clienteDocumento || "")}</span></td>
                <td><span class="muted">${esc(o.cotizacionId || "Directa")}</span></td>
                <td>${esc(fecha(o.fecha))}<span class="muted">${esc(o.hora || "")}</span></td>
                <td>${esc(o.responsable || "Sin asignar")}</td>
                <td><span class="priority ${esc(o.prioridad)}">${esc(cap(o.prioridad))}</span></td>
                <td><span class="badge ${esc(o.estado)}">${esc(estadoTexto(o.estado))}</span></td>
                <td>
                    <div class="actions">
                        <button class="action ver" title="Ver" data-a="ver" data-id="${esc(o.id)}"><i class="fa-solid fa-eye"></i></button>
                        <button class="action editar" title="Editar" data-a="editar" data-id="${esc(o.id)}"><i class="fa-solid fa-pen"></i></button>
                        <button class="action estado" title="Estado" data-a="estado" data-id="${esc(o.id)}"><i class="fa-solid fa-arrows-rotate"></i></button>
                        <button class="action imprimir" title="Imprimir / PDF" data-a="pdf" data-id="${esc(o.id)}"><i class="fa-solid fa-file-pdf"></i></button>
                        <button class="action danger" title="Eliminar" data-a="eliminar" data-id="${esc(o.id)}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join("");

        const empty = by("emptyOS");
        if (empty) empty.hidden = lista.length > 0;

        tbody.querySelectorAll("[data-a]").forEach(button => {
            button.addEventListener("click", () => accion(button.dataset.a, button.dataset.id));
        });
    }

    function stats() {
        if (by("statTotal")) by("statTotal").textContent = ordenes.length;
        if (by("statPendientes")) by("statPendientes").textContent = ordenes.filter(o => o.estado === "pendiente" || o.estado === "programada").length;
        if (by("statEjecucion")) by("statEjecucion").textContent = ordenes.filter(o => o.estado === "ejecucion").length;
        if (by("statFinalizadas")) by("statFinalizadas").textContent = ordenes.filter(o => o.estado === "finalizada").length;
    }

    function accion(acc, id) {
        const orden = ordenes.find(o => o.id === id || o.uuid === id);
        if (!orden) return;

        if (acc === "ver") ver(orden);
        if (acc === "editar") abrir(orden.id);
        if (acc === "estado") abrirEstado(orden);
        if (acc === "pdf") imprimir(orden);
        if (acc === "eliminar") eliminar(orden);
    }

    /* =====================================================
       VER DETALLE / ESTADO / ELIMINAR
       ===================================================== */

    function ver(o) {
        detalleActual = o;
        by("detalleTitulo").textContent = o.id;

        let totalServicio = 0;
        const rows = (o.items || []).map(item => {
            const subtotal = (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0);
            totalServicio += subtotal;

            return `
                <tr>
                    <td>${esc(item.descripcion)}</td>
                    <td>${esc(item.unidad)}</td>
                    <td>${esc(item.cantidad)}</td>
                    <td>${money(item.precio_unitario)}</td>
                    <td>${money(subtotal)}</td>
                    <td>${esc(item.observacion || "")}</td>
                </tr>
            `;
        }).join("");

        by("detalleContenido").innerHTML = `
            <div class="detail-grid">
                <div class="detail-card"><span>Cliente</span><strong>${esc(o.clienteNombre)}</strong></div>
                <div class="detail-card"><span>Documento</span><strong>${esc(o.clienteDocumento || "No registrado")}</strong></div>
                <div class="detail-card"><span>Fecha / hora</span><strong>${esc(fecha(o.fecha))} ${esc(o.hora || "")}</strong></div>
                <div class="detail-card"><span>Responsable</span><strong>${esc(o.responsable || "Sin asignar")}</strong></div>
                <div class="detail-card"><span>Prioridad</span><strong>${esc(cap(o.prioridad))}</strong></div>
                <div class="detail-card"><span>Estado</span><strong>${esc(estadoTexto(o.estado))}</strong></div>
                <div class="detail-card"><span>Dirección</span><strong>${esc(o.direccion || "No registrada")}</strong></div>
                <div class="detail-card"><span>Contacto</span><strong>${esc(o.contacto || "No registrado")}</strong></div>
                <div class="detail-card"><span>Cotización</span><strong>${esc(o.cotizacionId || "Sin cotización")}</strong></div>
            </div>
            <div class="detail-card" style="margin-top:10px">
                <span>Descripción</span>
                <strong>${esc(o.descripcion || "Sin descripción")}</strong>
            </div>
            <div class="detail-list">
                <table>
                    <thead>
                        <tr>
                            <th>CONCEPTO</th>
                            <th>UNIDAD</th>
                            <th>CANT.</th>
                            <th>PRECIO UNIT.</th>
                            <th>SUBTOTAL</th>
                            <th>OBSERVACIÓN</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div class="detail-card" style="margin-top:10px; text-align:right;">
                <span>Total Estimado del Servicio</span>
                <strong style="font-size:14px; color:var(--navy);">${money(totalServicio)}</strong>
            </div>
            <div class="detail-card" style="margin-top:10px">
                <span>Observaciones</span>
                <strong>${esc(o.observaciones || "Sin observaciones")}</strong>
            </div>
        `;

        open("detalleModal");
    }

    function abrirEstado(o) {
        by("estadoOSId").value = o.uuid;
        by("nuevoEstado").value = o.estado;
        open("estadoModal");
    }

    async function guardarEstado() {
        const uuid = by("estadoOSId").value;
        const nuevoEstado = by("nuevoEstado").value;

        if (!SNICAuth.tienePermiso(SNICAuth.PERMISOS.ORDENES_EDITAR)) {
            toast("No tienes permiso para cambiar el estado.", "error");
            return;
        }

        try {
            const sb = supabase();
            const { error } = await sb.from("ordenes_servicio").update({ estado: nuevoEstado }).eq("id", uuid);
            if (error) throw error;

            cerrarEstado();
            await cargarOrdenes();
            render();
            stats();
            toast("Estado actualizado.");
        } catch (error) {
            toast(error.message || "No se pudo actualizar el estado.", "error");
        }
    }

    async function eliminar(o) {
        if (!SNICAuth.tienePermiso(SNICAuth.PERMISOS.ORDENES_EDITAR)) {
            toast("No tienes permiso para eliminar órdenes.", "error");
            return;
        }

        if (!confirm(`¿Eliminar ${o.id}? Esta acción no se puede deshacer.`)) return;

        try {
            const sb = supabase();
            await sb.from("ordenes_servicio_detalles").delete().eq("orden_id", o.uuid);
            const { error } = await sb.from("ordenes_servicio").delete().eq("id", o.uuid);
            if (error) throw error;

            await cargarOrdenes();
            render();
            stats();
            toast("Orden eliminada correctamente.");
        } catch (error) {
            toast(error.message || "No se pudo eliminar la orden.", "error");
        }
    }

    /* =====================================================
       IMPRIMIR / GENERAR PDF
       ===================================================== */

    async function imprimir(o) {
        if (!o) return;

        const sb = supabase();
        let empresa = {};
        let detalles = {};

        try {
            if (sb) {
                const { data: dEmpresa } = await sb.from("configuracion_empresa").select("*").maybeSingle();
                if (dEmpresa) empresa = dEmpresa;
                const { data: dDetalles } = await sb.from("configuracion_empresa_detalles").select("*").maybeSingle();
                if (dDetalles) detalles = dDetalles;
            }
        } catch (err) {
            console.error("Error obteniendo datos de empresa:", err);
        }

        const nombreEmpresa = empresa.nombre || empresa.razon_social || "SNIC'ELECTRIC S.A.S.";
        const nit = empresa.nit || empresa.identificacion || "";
        const regimen = empresa.regimen || "";
        const slogan = empresa.eslogan || detalles.eslogan || "MANTENIMIENTO ELÉCTRICO RESIDENCIAL Y COMERCIAL";
        const direccion = empresa.direccion || detalles.direccion || "";
        const telefono = empresa.telefono || detalles.telefono || "";
        const celular = empresa.celular || detalles.celular || "";
        const email = empresa.email || detalles.email || "";
        const web = empresa.web || detalles.sitio_web || "";
        const logo = empresa.logo_url || detalles.logo_url || new URL("../img/logo.png", location.href).href;

        const w = window.open("", "_blank", "width=1000,height=800");
        if (!w) {
            toast("Permite ventanas emergentes para imprimir.", "error");
            return;
        }

        let totalEstimado = 0;
        const rows = (o.items || []).map(item => {
            const subtotal = (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0);
            totalEstimado += subtotal;

            return `
                <tr>
                    <td>${esc(item.descripcion)}</td>
                    <td>${esc(item.unidad)}</td>
                    <td style="text-align:center">${esc(item.cantidad)}</td>
                    <td style="text-align:right">${money(item.precio_unitario)}</td>
                    <td style="text-align:right">${money(subtotal)}</td>
                    <td>${esc(item.observacion || "")}</td>
                </tr>
            `;
        }).join("");

        w.document.write(`
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(o.id)}</title>
<style>
@page { size: A4; margin: 14mm; }
body { font-family: Arial, sans-serif; color: #17233a; font-size: 11px; margin: 0; padding: 0; }
.toolbar { text-align: right; margin-bottom: 12px; }
.toolbar button { padding: 9px 14px; border: 0; border-radius: 6px; background: #fbb900; font-weight: 700; cursor: pointer; }
.head { display: flex; justify-content: space-between; border-bottom: 3px solid #fbb900; padding-bottom: 12px; }
.brand { display: flex; gap: 12px; align-items: center; }
.brand img { width: 70px; height: 70px; object-fit: contain; }
.brand h1 { margin: 0; color: #0b2f67; font-size: 18px; }
.brand p { margin: 2px 0; color: #718096; font-size: 9px; }
.slogan { color: #fbb900 !important; font-weight: 700; text-transform: uppercase; }
.code { text-align: right; }
.code h2 { color: #0b2f67; margin: 3px 0; }
.section { margin-top: 18px; }
.label { font-size: 9px; color: #b27b00; font-weight: 800; letter-spacing: 1px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border: 1px solid #dce4ee; padding: 12px; border-radius: 7px; margin-top: 7px; }
.grid div span { display: block; color: #7d8998; font-size: 9px; }
.grid strong { font-size: 11px; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
th { background: #0b2f67; color: white; text-align: left; padding: 8px; font-size: 9px; }
td { padding: 8px; border-bottom: 1px solid #e4e9f0; }
.box { border: 1px solid #dce4ee; border-radius: 7px; padding: 12px; margin-top: 14px; white-space: pre-wrap; }
.total-box { text-align: right; margin-top: 12px; font-size: 13px; font-weight: bold; color: #0b2f67; }
.sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; }
.line { border-top: 1px solid #657489; padding-top: 6px; text-align: center; font-size: 9px; }
@media print { .toolbar { display: none; } }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">🖨 Imprimir / Guardar PDF</button></div>
<div class="head">
    <div class="brand">
        <img src="${logo}" alt="${esc(nombreEmpresa)}">
        <div>
            <h1>${esc(nombreEmpresa)}</h1>
            ${slogan ? `<p class="slogan">${esc(slogan)}</p>` : ''}
            ${nit ? `<p>NIT: ${esc(nit)}${regimen ? `· ${esc(regimen)}` : ''}</p>` : ''}
            ${direccion ? `<p>Dirección: ${esc(direccion)}</p>` : ''}
            ${(telefono || celular) ? `<p>${telefono ? `Tel: ${esc(telefono)}` : ''} ${celular ? `· Móvil: ${esc(celular)}` : ''}</p>` : ''}
            ${(email || web) ? `<p>${email ? `Email: ${esc(email)}` : ''} ${web ? `· ${esc(web)}` : ''}</p>` : ''}
        </div>
    </div>
    <div class="code">
        <div class="label">ORDEN DE SERVICIO</div>
        <h2>${esc(o.id)}</h2>
        <div>Fecha: ${esc(fecha(o.fecha))}</div>
        <div>Estado: ${esc(estadoTexto(o.estado))}</div>
    </div>
</div>
<div class="section">
    <div class="label">DATOS DEL SERVICIO</div>
    <div class="grid">
        <div><span>Cliente</span><strong>${esc(o.clienteNombre)}</strong></div>
        <div><span>Documento</span><strong>${esc(o.clienteDocumento || "N/A")}</strong></div>
        <div><span>Dirección de obra</span><strong>${esc(o.direccion || "N/A")}</strong></div>
        <div><span>Contacto en obra</span><strong>${esc(o.contacto || "N/A")}</strong></div>
        <div><span>Técnico Asignado</span><strong>${esc(o.responsable || "Sin asignar")}</strong></div>
        <div><span>Cotización de Origen</span><strong>${esc(o.cotizacionId || "Directa")}</strong></div>
    </div>
</div>
<div class="section">
    <div class="label">DESCRIPCIÓN DEL TRABAJO</div>
    <div class="box">${esc(o.descripcion || "Sin descripción.")}</div>
</div>
<div class="section">
    <div class="label">CONCEPTOS Y ACTIVIDADES</div>
    <table>
        <thead>
            <tr>
                <th>DESCRIPCIÓN</th>
                <th>UNIDAD</th>
                <th style="text-align:center">CANT.</th>
                <th style="text-align:right">PRECIO UNIT.</th>
                <th style="text-align:right">SUBTOTAL</th>
                <th>OBSERVACIÓN</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>
    <div class="total-box">Monto Total Servicio: ${money(totalEstimado)}</div>
</div>
${o.observaciones ? `
<div class="section">
    <div class="label">OBSERVACIONES Y INSTRUCCIONES</div>
    <div class="box">${esc(o.observaciones)}</div>
</div>` : ''}
<div class="sign">
    <div class="line">Firma Responsable / Técnico<br><strong>${esc(o.responsable || "SNIC'ELECTRIC")}</strong></div>
    <div class="line">Firma y Aceptación del Cliente<br><strong>${esc(o.clienteNombre)}</strong></div>
</div>
</body>
</html>
        `);
        w.document.close();
    }

    /* =====================================================
       UTILIDADES
       ===================================================== */

    function open(id) { by(id)?.classList.add("show"); }
    function cerrarModal() { by("osModal")?.classList.remove("show"); editando = null; items = []; }
    function cerrarDetalle() { by("detalleModal")?.classList.remove("show"); detalleActual = null; }
    function cerrarEstado() { by("estadoModal")?.classList.remove("show"); }
    function by(id) { return document.getElementById(id); }
    function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
    function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
    function fecha(f) { return f ? new Date(`${f}T00:00:00`).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" }) : "-"; }
    function money(v) { return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v || 0); }

    function estadoTexto(e) {
        const m = { pendiente: "Pendiente", programada: "Programada", ejecucion: "En ejecución", finalizada: "Finalizada", cancelada: "Cancelada" };
        return m[e] || e;
    }

    function toast(m, type = "success") {
        const t = by("toast"), msg = by("toastMessage"), ic = by("toastIcon");
        if (!t || !msg) return;

        msg.textContent = m;
        t.className = `toast show ${type === "error" ? "error" : ""}`;
        if (ic) ic.className = type === "error" ? "fa-solid fa-triangle-exclamation" : "fa-solid fa-circle-check";

        setTimeout(() => t.classList.remove("show"), 3500);
    }
})();