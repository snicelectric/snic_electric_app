(function () {
    "use strict";

    let cotizaciones = [];
    let clientes = [];
    let productos = [];
    let inspecciones = [];
    let usuarios = [];
    let items = [];
    let editando = null;

    document.addEventListener("DOMContentLoaded", init);

    async function init() {
        if (!window.SNICAuth) {
            location.href = "../login.html";
            return;
        }

        if (!window.SNICAuth.protegerPagina(SNICAuth.PERMISOS.COTIZACIONES_VER)) {
            return;
        }

        await cargar();
        configurar();
        mostrarUsuario();
        llenarClientes();
        llenarInspecciones();
        llenarProductos();
        render();
        actualizarStats();
        SNICAuth.aplicarPermisos();

        const params = new URLSearchParams(location.search);
        if (params.get("inspeccion")) {
            abrir(null, params.get("inspeccion"));
        }
    }

    // Helper para formatear identificadores de inspección a INSP-XXXXX
    function formatearCodigoInspeccion(val) {
        if (!val) return "";
        const strVal = String(val).trim();
        if (strVal.startsWith("INSP-")) return strVal;
        
        const num = Number(strVal);
        if (!isNaN(num) && num > 0) {
            return `INSP-${String(num).padStart(5, "0")}`;
        }
        return strVal;
    }

    async function cargar() {
        try {
            if (!window.supabaseClient?.from) {
                throw new Error("Supabase no está disponible.");
            }

            // 1. Cargar Usuarios/Técnicos
            const { data: usuariosData, error: usuariosError } =
                await window.supabaseClient
                    .from("perfiles")
                    .select("*");

            if (!usuariosError) {
                usuarios = usuariosData || [];
            } else {
                console.warn("No fue posible cargar usuarios:", usuariosError);
                usuarios = [];
            }

            const usuariosMap = new Map(
                usuarios.map(u => [
                    String(u.id),
                    [u.nombre, u.apellido].filter(Boolean).join(" ") ||
                    u.nombreCompleto ||
                    u.nombre ||
                    u.email ||
                    "Técnico"
                ])
            );

            // 2. Cargar Clientes
            const { data: clientesData, error: clientesError } =
                await window.supabaseClient
                    .from("clientes")
                    .select("*")
                    .order("created_at", { ascending: false });

            if (clientesError) throw clientesError;

            clientes = (clientesData || []).map(c => ({
                ...c,
                documentoNumero: c.documentoNumero || c.numero_documento || c.documento || "",
                activo: c.activo !== false
            }));

            // 3. Cargar Productos
            const { data: productosData, error: productosError } =
                await window.supabaseClient
                    .from("productos")
                    .select("*")
                    .order("created_at", { ascending: false });

            if (productosError) throw productosError;

            productos = (productosData || []).map(p => ({
                ...p,
                precioVenta: Number(p.precioVenta ?? p.precio_venta ?? 0),
                estado: p.estado || "activo"
            }));

            // 4. Cargar Inspecciones
            const { data: inspeccionesData, error: inspeccionesError } =
                await window.supabaseClient
                    .from("inspecciones")
                    .select("*")
                    .order("created_at", { ascending: false });

            if (!inspeccionesError) {
                inspecciones = (inspeccionesData || []).map(i => {
                    const rawNum = i.numero || i.codigo || i.id;
                    const codigoFormateado = formatearCodigoInspeccion(rawNum);

                    return {
                        ...i,
                        codigoFormateado,
                        clienteId: i.cliente_id || null,
                        clienteNombre: nombreCliente(
                            clientes.find(c => String(c.id) === String(i.cliente_id))
                        ),
                        necesidades: Array.isArray(i.necesidades) ? i.necesidades : []
                    };
                });
            } else {
                console.warn("No fue posible cargar inspecciones:", inspeccionesError);
                inspecciones = [];
            }

            // 5. Cargar Cotizaciones
            const { data: cotizacionesData, error: cotizacionesError } =
                await window.supabaseClient
                    .from("cotizaciones")
                    .select("*")
                    .order("created_at", { ascending: false });

            if (cotizacionesError) throw cotizacionesError;

            const cotizacionIds = (cotizacionesData || []).map(c => c.id);
            let detallesData = [];

            if (cotizacionIds.length) {
                const { data, error } =
                    await window.supabaseClient
                        .from("cotizacion_detalles")
                        .select("*")
                        .in("cotizacion_id", cotizacionIds);

                if (error) throw error;
                detallesData = data || [];
            }

            const clientesMap = new Map(clientes.map(c => [String(c.id), c]));
            const productosMap = new Map(productos.map(p => [String(p.id), p]));
            const inspeccionesMap = new Map(inspecciones.map(i => [String(i.id), i]));

            const detallesPorCotizacion = {};
            detallesData.forEach(detalle => {
                const id = String(detalle.cotizacion_id);
                if (!detallesPorCotizacion[id]) {
                    detallesPorCotizacion[id] = [];
                }
                detallesPorCotizacion[id].push(detalle);
            });

            cotizaciones = (cotizacionesData || []).map(cotizacion => {
                const cliente = clientesMap.get(String(cotizacion.cliente_id));
                const docCliente = cliente?.documentoNumero || cliente?.documento || cliente?.numero_documento || cliente?.nit || "";
                const detalles = detallesPorCotizacion[String(cotizacion.id)] || [];

                const insp = cotizacion.inspeccion_id
                    ? inspeccionesMap.get(String(cotizacion.inspeccion_id))
                    : null;

                const inspeccionCodigo = insp
                    ? insp.codigoFormateado
                    : (cotizacion.inspeccion_id ? formatearCodigoInspeccion(cotizacion.inspeccion_id) : null);

                const tecnicoNombre = cotizacion.creado_por
                    ? (usuariosMap.get(String(cotizacion.creado_por)) || cotizacion.creado_por)
                    : "SNIC'ELECTRIC";

                const itemsCotizacion = detalles.map(detalle => {
                    const producto = detalle.producto_id
                        ? productosMap.get(String(detalle.producto_id))
                        : null;

                    return {
                        id: detalle.id,
                        tipo: detalle.tipo || (producto ? "producto" : "libre"),
                        productoId: detalle.producto_id || null,
                        codigo: detalle.codigo || producto?.codigo || "",
                        descripcion: detalle.descripcion || producto?.nombre || "Sin descripción",
                        unidad: detalle.unidad || producto?.unidad || "unidad",
                        cantidad: Number(detalle.cantidad) || 0,
                        precio: Number(detalle.precio ?? detalle.precio_unitario ?? producto?.precioVenta ?? 0),
                        descuento: Number(detalle.descuento) || 0,
                        subtotal: Number(detalle.subtotal) || 0
                    };
                });

                return {
                    id: cotizacion.numero,
                    supabaseId: cotizacion.id,
                    clienteId: cotizacion.cliente_id,
                    clienteNombre: cliente ? nombreCliente(cliente) : "Sin cliente",
                    clienteDocumento: docCliente,
                    inspeccionId: cotizacion.inspeccion_id || null,
                    inspeccionCodigo: inspeccionCodigo,
                    fecha: cotizacion.fecha || cotizacion.created_at,
                    validez: Number(cotizacion.validez) || 15,
                    observaciones: cotizacion.observaciones || "",
                    items: itemsCotizacion,
                    subtotal: Number(cotizacion.subtotal) || 0,
                    descuento: Number(cotizacion.descuento) || 0,
                    descuento_global: Number(cotizacion.descuento_global) || 0,
                    base: Number(cotizacion.base) || 0,
                    iva: Number(cotizacion.iva) || 0,
                    total: Number(cotizacion.total) || 0,
                    estado: normalizarEstado(cotizacion.estado),
                    creadoPor: tecnicoNombre,
                    creadoAt: cotizacion.created_at || null,
                    actualizadoAt: cotizacion.updated_at || null
                };
            });

        } catch (error) {
            console.error("SNIC'ELECTRIC - Error cargando cotizaciones desde Supabase:", error);
            cotizaciones = [];
            toast(error?.message || "No fue posible cargar las cotizaciones desde Supabase.", "error");
        }
    }

    function configurar() {
        by("btnNuevaCotizacion")?.addEventListener("click", () => abrir());
        by("btnCrearPrimera")?.addEventListener("click", () => abrir());
        by("btnCerrarModal")?.addEventListener("click", cerrarModal);
        by("btnCancelar")?.addEventListener("click", cerrarModal);

        by("cotizacionForm")?.addEventListener("submit", guardarCotizacion);

        by("clienteCotizacion")?.addEventListener("change", () => {
            llenarInspecciones(by("clienteCotizacion").value);
        });

        by("inspeccionCotizacion")?.addEventListener("change", () => {
            cargarNecesidadesInspeccion(by("inspeccionCotizacion").value);
        });

        by("btnAgregarProducto")?.addEventListener("click", agregarProducto);

        by("btnAgregarLibre")?.addEventListener("click", () => {
            agregarItem({
                tipo: "libre",
                descripcion: "",
                unidad: "servicio",
                cantidad: 1,
                precio: 0,
                descuento: 0
            });
        });

        by("descuentoCotizacion")?.addEventListener("input", calcular);
        by("ivaCotizacion")?.addEventListener("input", calcular);

        by("buscarCotizacion")?.addEventListener("input", render);
        by("filtroEstado")?.addEventListener("change", render);
        by("filtroFecha")?.addEventListener("change", render);

        by("btnCerrarDetalle")?.addEventListener("click", cerrarDetalle);
        by("btnCerrarEstado")?.addEventListener("click", cerrarEstado);
        by("btnCancelarEstado")?.addEventListener("click", cerrarEstado);
        by("btnGuardarEstado")?.addEventListener("click", guardarEstado);

        document.querySelectorAll("[data-menu-toggle]").forEach(button => {
            button.addEventListener("click", () => {
                by("sidebar")?.classList.toggle("open");
            });
        });

        document.querySelectorAll("[data-logout]").forEach(button => {
            button.addEventListener("click", () => SNICAuth.cerrarSesion());
        });

        ["cotizacionModal", "detalleModal", "estadoModal"].forEach(id => {
            by(id)?.addEventListener("click", e => {
                if (e.target.id === id) cerrarPorId(id);
            });
        });

        document.addEventListener("keydown", e => {
            if (e.key === "Escape") {
                cerrarModal();
                cerrarDetalle();
                cerrarEstado();
            }
        });
    }

    function mostrarUsuario() {
        const u = SNICAuth.obtenerUsuarioActual();
        if (!u) return;

        document.querySelectorAll("[data-user-name]").forEach(e => {
            e.textContent = u.nombre || u.email || "Usuario";
        });

        document.querySelectorAll("[data-user-role]").forEach(e => {
            e.textContent = cap(u.rol || "Usuario");
        });
    }

    function llenarClientes() {
        const s = by("clienteCotizacion");
        if (!s) return;

        s.innerHTML =
            '<option value="">Seleccionar cliente...</option>' +
            clientes
                .filter(c => c.activo !== false)
                .map(c =>
                    `<option value="${esc(c.id)}">
                        ${esc(nombreCliente(c))}
                        ${c.documentoNumero ? ` · ${esc(c.documentoNumero)}` : ""}
                    </option>`
                )
                .join("");
    }

    function llenarInspecciones(clienteId = "") {
        const s = by("inspeccionCotizacion");
        if (!s) return;

        const cid = clienteId || by("clienteCotizacion")?.value || "";

        const list = inspecciones.filter(
            i => !cid || String(i.clienteId) === String(cid)
        );

        s.innerHTML =
            '<option value="">Sin inspección</option>' +
            list.map(i =>
                `<option value="${esc(i.id)}">
                    ${esc(i.codigoFormateado || i.id)} ·
                    ${esc(i.clienteNombre || "Cliente")} ·
                    ${esc(fecha(i.fecha))}
                </option>`
            ).join("");

        if (editando?.inspeccionId) {
            s.value = editando.inspeccionId;
        }
    }

    function llenarProductos() {
        const s = by("productoSelector");
        if (!s) return;

        s.innerHTML =
            '<option value="">Agregar producto o servicio del inventario...</option>' +
            productos
                .filter(p => p.estado !== "inactivo")
                .map(p =>
                    `<option value="${esc(p.id)}">
                        ${esc(p.codigo)} ·
                        ${esc(p.nombre)} ·
                        ${money(p.precioVenta)}
                    </option>`
                )
                .join("");
    }

    function abrir(id = null, inspeccionId = "") {
        const permiso = id
            ? SNICAuth.PERMISOS.COTIZACIONES_EDITAR
            : SNICAuth.PERMISOS.COTIZACIONES_CREAR;

        if (!SNICAuth.tienePermiso(permiso)) {
            toast("No tienes permiso para esta acción.", "error");
            return;
        }

        editando = id
            ? cotizaciones.find(x => String(x.id) === String(id) || String(x.supabaseId) === String(id))
            : null;

        if (editando && estaFacturada(editando)) {
            toast(`La cotización ${editando.id} ya fue facturada y no puede modificarse.`, "error");
            return;
        }

        items = editando
            ? JSON.parse(JSON.stringify(editando.items || []))
            : [];

        by("modalTitulo").textContent = editando ? `Editar ${editando.id}` : "Nueva cotización";
        by("cotizacionId").value = editando?.id || "";
        by("fechaCotizacion").value = editando?.fecha ? editando.fecha.slice(0, 10) : new Date().toISOString().slice(0, 10);
        by("validezCotizacion").value = editando?.validez || 15;
        by("observacionesCotizacion").value = editando?.observaciones || "";

        // Asegurar que las variables en editando conserven el porcentaje o monto global
        if (by("descuentoCotizacion")) {
            let pctGlobal = 0;
            if (editando) {
                // Calcular el subtotal neto de los ítems
                const subtotalBruto = items.reduce((s, x) => s + ((Number(x.cantidad) || 0) * (Number(x.precio) || 0)), 0);
                const descItems = items.reduce((s, x) => s + (Number(x.descuento) || 0), 0);
                const subtotalNeto = Math.max(0, subtotalBruto - descItems);

                // Si existe descuento_global guardado en Supabase, revertir la regla para obtener el porcentaje exacto
                const descGlobalGuardado = Number(editando.descuento_global) || 0;
                if (descGlobalGuardado > 0 && subtotalNeto > 0) {
                    pctGlobal = (descGlobalGuardado / subtotalNeto) * 100;
                }
            }
            // Asignar el porcentaje reconstruido directamente al campo HTML
            by("descuentoCotizacion").value = pctGlobal > 0 ? Number(pctGlobal.toFixed(2)) : 0;
        }

        if (by("ivaCotizacion")) {
            by("ivaCotizacion").value = editando?.ivaPct ?? 19;
        }

        renderItems();
        // Ejecutar el cálculo inmediatamente después de establecer los valores en los campos HTML
        calcular();
        open("cotizacionModal");

        if (inspeccionId && !editando) {
            cargarNecesidadesInspeccion(inspeccionId);
        }
    }

    function cargarNecesidadesInspeccion(id) {
        if (!id) return;

        const insp = inspecciones.find(x => String(x.id) === String(id));
        if (!insp) return;

        if (!by("clienteCotizacion").value && insp.clienteId) {
            by("clienteCotizacion").value = insp.clienteId;
            llenarInspecciones(insp.clienteId);
            by("inspeccionCotizacion").value = id;
        }

        const necesidades = Array.isArray(insp.necesidades) ? insp.necesidades : [];
        let agregados = 0;

        necesidades.forEach(n => {
            const texto = (n.descripcion || "").trim();
            if (!texto) return;

            const producto = productos.find(p =>
                String(p.nombre || "").toLowerCase() === texto.toLowerCase() ||
                String(p.codigo || "").toLowerCase() === texto.toLowerCase()
            );

            if (producto) {
                items.push(itemProducto(producto, n.cantidad));
            } else {
                items.push({
                    tipo: "inspeccion",
                    productoId: null,
                    descripcion: texto,
                    unidad: n.unidad || "unidad",
                    cantidad: Number(n.cantidad) || 1,
                    precio: 0,
                    descuento: 0,
                    prioridad: n.prioridad || "normal"
                });
            }

            agregados++;
        });

        renderItems();
        calcular();

        if (agregados) {
            toast(`${agregados} necesidad(es) cargada(s) desde la inspección.`);
        }
    }

    function agregarProducto() {
        const id = by("productoSelector")?.value;

        if (!id) {
            toast("Selecciona un producto o servicio.", "error");
            return;
        }

        const p = productos.find(x => String(x.id) === String(id));
        if (!p) return;

        agregarItem(itemProducto(p, 1));
        by("productoSelector").value = "";
    }

    function itemProducto(p, cantidad = 1) {
        return {
            tipo: "producto",
            productoId: p.id,
            descripcion: p.nombre,
            unidad: p.unidad || "unidad",
            cantidad: Number(cantidad) || 1,
            precio: Number(p.precioVenta) || 0,
            descuento: 0,
            codigo: p.codigo || ""
        };
    }

    function agregarItem(x) {
        items.push(x);
        renderItems();
        calcular();
    }

    function renderItems() {
        const tb = by("itemsCotizacion");
        const empty = by("itemsEmpty");

        if (!tb) return;

        tb.innerHTML = items.map((x, i) => `
            <tr>
                <td>
                    <div class="item-desc">
                        <strong>${esc(x.descripcion || "Sin descripción")}</strong>
                        <small>${esc(x.codigo || x.tipo || "Concepto")}</small>
                    </div>
                </td>

                <td>${esc(cap(x.unidad || "unidad"))}</td>

                <td>
                    <input
                        class="item-input item-number"
                        type="number"
                        min="0.01"
                        step="0.01"
                        data-item="cantidad"
                        data-i="${i}"
                        value="${esc(x.cantidad)}">
                </td>

                <td>
                    <input
                        class="item-input"
                        type="number"
                        min="0"
                        step="0.01"
                        data-item="precio"
                        data-i="${i}"
                        value="${esc(x.precio)}">
                </td>

                <td>
                    <input
                        class="item-input item-number"
                        type="number"
                        min="0"
                        step="0.01"
                        data-item="descuento"
                        data-i="${i}"
                        placeholder="0.00"
                        value="${esc(x.descuento || 0)}">
                </td>

                <td class="item-total" id="total-item-${i}">${money(linea(x))}</td>

                <td>
                    <button
                        type="button"
                        class="remove-item"
                        data-remove="${i}"
                        title="Eliminar">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join("");

        if (empty) {
            empty.hidden = items.length > 0;
        }

        tb.querySelectorAll("[data-item]").forEach(el => {
            el.addEventListener("input", () => {
                const index = Number(el.dataset.i);
                const campo = el.dataset.item;

                if (items[index] === undefined) return;

                items[index][campo] = Number(el.value) || 0;

                // Actualizar solo la celda del total del ítem modificado sin re-renderizar la tabla entera
                const celdaTotal = by(`total-item-${index}`);
                if (celdaTotal) {
                    celdaTotal.textContent = money(linea(items[index]));
                }

                // Recalcular el total general con el descuento global intacto
                calcular();
            });
        });

        tb.querySelectorAll("[data-remove]").forEach(button => {
            button.addEventListener("click", () => {
                items.splice(Number(button.dataset.remove), 1);
                renderItems();
                calcular();
            });
        });
    }

    function calcular() {
        // 1. Subtotal Bruto
        const subtotalBruto = items.reduce((s, x) => 
            s + ((Number(x.cantidad) || 0) * (Number(x.precio) || 0)), 0 
        );

        // 2. Suma de Descuentos por Ítem
        const descuentoItemsMonetario = items.reduce((s, x) => 
            s + (Number(x.descuento) || 0), 0   
        );

        // 3. Subtotal Neto tras Descuento por Ítems
        const subtotalConDescItems = Math.max(0, subtotalBruto - descuentoItemsMonetario);

        // 4. Leer porcentaje global directamente del Input HTML
        const inputDescGlobal = by("descuentoCotizacion");
        const pctGlobal = inputDescGlobal ? (parseFloat(inputDescGlobal.value) || 0) : 0;
        const descuentoGlobalMonetario = subtotalConDescItems * (pctGlobal / 100);

        // 5. Base Gravable Real (Subtotal Neto - Descuento Global)
        const base = Math.max(0, subtotalConDescItems - descuentoGlobalMonetario);
        
        // 6. IVA
        const inputIva = by("ivaCotizacion");
        const ivaP = inputIva ? (parseFloat(inputIva.value) || 0) : 0;
        const iv = base * (ivaP / 100);
        const total = base + iv;

        // Actualizar interfaz
        setText("subtotalCotizacion", money(subtotalBruto));
        setText("descuentoValor", money(descuentoItemsMonetario));
        setText("descuentoGlobal", money(descuentoGlobalMonetario));
        setText("baseCotizacion", money(base));
        setText("ivaValor", money(iv));
        setText("totalCotizacion", money(total));

        return {
            subtotal: Number(subtotalBruto.toFixed(2)),
            descuento: Number(descuentoItemsMonetario.toFixed(2)),
            descuento_global: Number(descuentoGlobalMonetario.toFixed(2)),
            descuentoGlobalPct: pctGlobal,
            base: Number(base.toFixed(2)),
            iva: Number(iv.toFixed(2)),
            total: Number(total.toFixed(2)),
            ivaPct: ivaP
        };
    }

    async function guardarCotizacion(e) {
        e.preventDefault();

        const id = by("cotizacionId")?.value || "";

        const permiso = id
            ? SNICAuth.PERMISOS.COTIZACIONES_EDITAR
            : SNICAuth.PERMISOS.COTIZACIONES_CREAR;

        if (!SNICAuth.tienePermiso(permiso)) {
            toast("No tienes permiso para guardar cotizaciones.", "error");
            return;
        }

        const clienteId = by("clienteCotizacion")?.value || "";

        if (!clienteId) {
            toast("Selecciona un cliente.", "error");
            return;
        }

        if (!items.length) {
            toast("Agrega al menos un concepto.", "error");
            return;
        }

        const existente = editando || cotizaciones.find(c => String(c.id) === String(id));

        if (existente && estaFacturada(existente)) {
            toast(`La cotización ${existente.id} ya fue facturada y no puede modificarse.`, "error");
            return;
        }

        try {
            // Ejecutar el cálculo actual del formulario para obtener las cifras exactas de la UI
            const calc = calcular();

            const usuario = SNICAuth.obtenerUsuarioActual?.() || {};
            const usuarioId = usuario.supabaseUserId || usuario.id || null;

            let numero = id;

            if (!existente && !numero) {
                numero = await generarCodigoCotizacionSupabase();
            }

            // Mapeo directo de valores calculados del formulario hacia la estructura de Supabase
            const cabecera = {
                numero,
                cliente_id: clienteId,
                inspeccion_id: by("inspeccionCotizacion")?.value || null,
                fecha: by("fechaCotizacion")?.value || new Date().toISOString().slice(0, 10),
                validez: Number(by("validezCotizacion")?.value) || 15,
                observaciones: by("observacionesCotizacion")?.value.trim() || null,
                subtotal: calc.subtotal, 
                descuento: calc.descuento, 
                descuento_global: calc.descuento_global, // <-- Se guardará correctamente (44228.20)
                base: calc.base,                         // <-- Base gravable con descuento (840335.80)
                iva: calc.iva,                           // <-- IVA calculado sobre la base reducida (159663.80)
                total: calc.total,                       // <-- Total real comercial (1000000.00)
                estado: existente ? existente.estado : "borrador",
                creado_por: existente?.creadoPor || usuarioId
            };

            if (existente) {
                await actualizarCotizacionEnSupabase(cabecera, existente);
            } else {
                await guardarNuevaCotizacionEnSupabase(cabecera, items);
            }
            await cargar();
            cerrarModal();
            render();
            actualizarStats();
            

            toast(existente
                ? "Cotización actualizada correctamente."
                : `Cotización ${numero} creada correctamente.`
            );

        } catch (error) {
            console.error("SNIC'ELECTRIC - Error guardando cotización:", error);
            toast(error?.message || "No fue posible guardar la cotización en Supabase.", "error");
        }
    }

    async function guardarNuevaCotizacionEnSupabase(obj, itemsNuevos) {
        if (!window.supabaseClient?.from) {
            throw new Error("Supabase no está disponible.");
        }

        const { data, error } = await window.supabaseClient
            .from("cotizaciones")
            .insert(obj)
            .select("id, numero")
            .single();

        if (error) throw error;

        const detalles = construirDetalles(data.id, itemsNuevos);

        try {
            if (detalles.length) {
                const { error: detalleError } = await window.supabaseClient
                    .from("cotizacion_detalles")
                    .insert(detalles);

                if (detalleError) throw detalleError;
            }
        } catch (error) {
            await window.supabaseClient
                .from("cotizaciones")
                .delete()
                .eq("id", data.id);

            throw error;
        }

        return data.id;
    }

    async function actualizarCotizacionEnSupabase(obj, existente) {
    if (!window.supabaseClient?.from) {
        throw new Error("Supabase no está disponible.");
    }

    const supabaseId = existente?.supabaseId || null;

    if (!supabaseId) {
        throw new Error("La cotización no tiene UUID de Supabase.");
    }

    if (estaFacturada(existente)) {
        throw new Error(`La cotización ${existente.id} ya fue facturada y no puede modificarse.`);
    }

    // 1. Extraer los datos de la cabecera para monitoreo
    const payloadCabecera = {
    cliente_id: obj.cliente_id,
    inspeccion_id: obj.inspeccion_id,
    fecha: obj.fecha,
    validez: obj.validez,
    observaciones: obj.observaciones,
    subtotal: Number(obj.subtotal),
    descuento: Number(obj.descuento),             // Descuentos por ítem ($22.997)
    descuento_global: Number(obj.descuento_global), // Descuento global ($44.228,20)
    base: Number(obj.base),                       // Base gravable ($840.335,80)
    iva: Number(obj.iva),                         // IVA ($159.663,80)
    total: Number(obj.total),                     // Total ($1.000.000)
    estado: obj.estado,
    updated_at: new Date().toISOString()
};

    // --- MONITOREO UPDATE CABECERA ---
    console.group(`📤 [Supabase UPDATE] Cotización ID: ${supabaseId}`);
    console.log("Datos enviados en UPDATE (Cabecera):", payloadCabecera);
    console.table(payloadCabecera);
    console.groupEnd();

    const { error: errorCabecera } = await window.supabaseClient
        .from("cotizaciones")
        .update(payloadCabecera)
        .eq("id", supabaseId);

    if (errorCabecera) {
        console.error("❌ Error en UPDATE cabecera:", errorCabecera.message);
        throw errorCabecera;
    }

    if (!SNICAuth.tienePermiso(SNICAuth.PERMISOS.COTIZACIONES_ELIMINAR)) {
        throw new Error("Para reemplazar los conceptos de una cotización se requiere el permiso cotizaciones.eliminar.");
    }

    const { error: errorEliminar } = await window.supabaseClient
        .from("cotizacion_detalles")
        .delete()
        .eq("cotizacion_id", supabaseId);

    if (errorEliminar) {
        console.error("❌ Error al eliminar detalles anteriores:", errorEliminar.message);
        throw errorEliminar;
    }

    const detalles = construirDetalles(supabaseId, items);

    // --- MONITOREO INSERT DETALLES ---
    console.group(`📥 [Supabase INSERT] Detalles (${detalles.length} ítems)`);
    console.log("Datos enviados a cotizacion_detalles:", detalles);
    if (detalles.length) console.table(detalles);
    console.groupEnd();

    if (detalles.length) {
        const { error: errorInsertar } = await window.supabaseClient
            .from("cotizacion_detalles")
            .insert(detalles);

        if (errorInsertar) {
            console.error("❌ Error al insertar nuevos detalles:", errorInsertar.message);
            throw errorInsertar;
        }
    }

    console.log(`✅ Cotización ${supabaseId} actualizada con éxito.`);
    return supabaseId;
}

    function construirDetalles(cotizacionId, listaItems) {
        return (listaItems || []).map(item => ({
            cotizacion_id: cotizacionId,
            producto_id: item.productoId || null,
            codigo: item.codigo || null,
            descripcion: item.descripcion || "Concepto",
            unidad: item.unidad || "unidad",
            cantidad: Number(item.cantidad) || 1,
            precio: Number(item.precio) || 0,
            descuento: Number(item.descuento) || 0,
            subtotal: Number(linea(item)) || 0,
            tipo: item.tipo || "producto"
        }));
    }

    async function generarCodigoCotizacionSupabase() {
        const local = generarCodigoLocal();

        if (!window.supabaseClient?.from) {
            return local;
        }

        const { data, error } = await window.supabaseClient
            .from("cotizaciones")
            .select("numero")
            .like("numero", "COT-%")
            .order("numero", { ascending: false })
            .limit(1);

        if (error) throw error;

        const ultimo = Number(String(data?.[0]?.numero || "").replace(/^COT-/, "")) || 0;
        const localMax = Number(String(local).replace(/^COT-/, "")) || 0;

        return `COT-${String(Math.max(ultimo + 1, localMax)).padStart(5, "0")}`;
    }

    function generarCodigoLocal() {
        const max = cotizaciones.reduce((n, x) => {
            const m = /^COT-(\d+)$/.exec(x.id || "");
            return Math.max(n, m ? Number(m[1]) : 0);
        }, 0);

        return `COT-${String(max + 1).padStart(5, "0")}`;
    }

    function render() {
        const tb = by("cotizacionesTableBody");
        const empty = by("cotizacionesEmpty");

        if (!tb) return;

        const q = (by("buscarCotizacion")?.value || "").toLowerCase();
        const estado = by("filtroEstado")?.value || "";
        const fechaFiltro = by("filtroFecha")?.value || "";
        const now = new Date();

        const list = cotizaciones.filter(x => {
            const text = [
                x.id,
                x.clienteNombre,
                x.clienteDocumento,
                x.creadoPor,
                x.inspeccionCodigo
            ].join(" ").toLowerCase();

            if (q && !text.includes(q)) return false;

            if (estado && normalizarEstado(x.estado) !== normalizarEstado(estado)) {
                return false;
            }

            if (fechaFiltro) {
                const d = new Date(x.fecha);
                const diff = (now - d) / 86400000;

                if (fechaFiltro === "30" && (diff < 0 || diff > 30)) return false;

                if (fechaFiltro === "mes" && (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear())) {
                    return false;
                }
            }

            return true;
        });

        tb.innerHTML = list.map(x => {
            const vencida = cotizacionEstaVencida(x);
            const botonEliminar = vencida && SNICAuth.tienePermiso(SNICAuth.PERMISOS.COTIZACIONES_ELIMINAR)
                ? `
                    <button
                        type="button"
                        class="action-button danger"
                        data-accion="eliminar"
                        data-id="${esc(x.id)}"
                        title="Eliminar cotización vencida">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                `
                : "";

            const bloqueada = estaFacturada(x);

            return `
                <tr>
                    <td>
                        <div class="quote-cell">
                            <strong>${esc(x.id)}</strong>
                            <small>${esc(x.creadoPor || "SNIC'ELECTRIC")}</small>
                        </div>
                    </td>

                    <td>
                        <div class="client-cell">
                            <strong>${esc(x.clienteNombre || "Sin cliente")}</strong>
                            <small>${esc(x.clienteDocumento || "")}</small>
                        </div>
                    </td>

                    <td>${esc(fecha(x.fecha))}</td>

                    <td>
                        ${
                            x.inspeccionCodigo || x.inspeccionId
                                ? `<span class="source-pill">${esc(x.inspeccionCodigo || x.inspeccionId)}</span>`
                                : `<span class="source-pill">Directa</span>`
                        }
                    </td>

                    <td class="amount">${money(x.total)}</td>

                    <td>
                        <span class="status-pill status-${esc(x.estado)}">
                            ${esc(estadoTexto(x.estado))}
                        </span>
                    </td>

                    <td>
                        <div class="actions">
                            <button
                                type="button"
                                class="action-button ver-action"
                                data-accion="ver"
                                data-id="${esc(x.id)}"
                                title="Ver">
                                <i class="fa-solid fa-eye"></i>
                            </button>

                            ${
                                !bloqueada
                                    ? `
                                        <button
                                            type="button"
                                            class="action-button editar-action"
                                            data-accion="editar"
                                            data-id="${esc(x.id)}"
                                            title="Editar">
                                            <i class="fa-solid fa-pen"></i>
                                        </button>
                                    `
                                    : ""
                            }

                            ${
                                !bloqueada
                                    ? `
                                        <button
                                            type="button"
                                            class="action-button estado-action"
                                            data-accion="estado"
                                            data-id="${esc(x.id)}"
                                            title="Cambiar estado">
                                            <i class="fa-solid fa-arrows-rotate"></i>
                                        </button>
                                    `
                                    : ""
                            }

                            ${
                                x.estado === "aprobada"
                                    ? `
                                        <button
                                            type="button"
                                            class="action-button orden-action"
                                            data-accion="orden"
                                            data-id="${esc(x.id)}"
                                            title="Crear orden de servicio">
                                            <i class="fa-solid fa-clipboard-list"></i>
                                        </button>
                                    `
                                    : ""
                            }

                            <button
                                type="button"
                                class="action-button pdf-action"
                                data-accion="pdf"
                                data-id="${esc(x.id)}"
                                title="Generar PDF">
                                <i class="fa-solid fa-file-pdf"></i>
                            </button>

                            ${botonEliminar}
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        if (empty) {
            empty.hidden = list.length > 0;
        }

        const tabla = tb.closest("table");
        if (tabla) {
            tabla.style.display = list.length ? "table" : "none";
        }

        enlazarAccionesTabla(tb);
        SNICAuth.aplicarPermisos();
    }

    function enlazarAccionesTabla(tb) {
        tb.querySelectorAll("[data-accion]").forEach(btn => {
            btn.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();

                const id = this.getAttribute("data-id");
                const accion = this.getAttribute("data-accion");
                const c = cotizaciones.find(x => String(x.id) === String(id));

                if (!c) {
                    toast("No se encontró la cotización seleccionada.", "error");
                    return;
                }

                if (accion === "ver") {
                    detalle(c);
                } else if (accion === "editar") {
                    abrir(c.id);
                } else if (accion === "estado") {
                    abrirEstado(c);
                } else if (accion === "orden") {
                    crearOrdenServicio(c);
                } else if (accion === "eliminar") {
                    eliminar(c);
                } else if (accion === "pdf") {
                    generarPDF(c);
                }
            });
        });
    }

    function actualizarStats() {
        setText("statTotal", cotizaciones.length);
        setText("statBorrador", cotizaciones.filter(x => x.estado === "borrador").length);
        setText("statAprobada", cotizaciones.filter(x => x.estado === "aprobada").length);
        setText("statValor", money(
            cotizaciones
                .filter(x => x.estado === "aprobada")
                .reduce((s, x) => s + Number(x.total || 0), 0)
        ));
    }

    function detalle(c) {
        setText("detalleTitulo", c.id);

        const cont = by("detalleContenido");
        if (!cont) return;
        

        // Buscar el cliente en la lista global en caso de que c.clienteDocumento llegue vacío
        const clienteObj = clientes.find(x => String(x.id) === String(c.clienteId));
        const documento = c.clienteDocumento || clienteObj?.documentoNumero || clienteObj?.documento || clienteObj?.numero_documento || "-";

        cont.innerHTML = `
            <div class="detail-content">
                <div class="detail-header-grid">
                    <div class="detail-panel">
                        <h3>Cliente</h3>
                        <div class="detail-meta">
                            <div>
                                <span>Nombre</span>
                                <strong>${esc(c.clienteNombre)}</strong>
                            </div>
                            <div>
                                <span>Documento</span>
                                <strong>${esc(documento)}</strong>
                            </div>
                            <div>
                                <span>Fecha</span>
                                <strong>${esc(fecha(c.fecha))}</strong>
                            </div>
                        </div>
                    </div>

                    <div class="detail-panel">
                        <h3>Estado</h3>
                        <span class="status-pill status-${esc(c.estado)}">
                            ${esc(estadoTexto(c.estado))}
                        </span>
                        <div style="margin-top:10px">
                            <span style="font-size:9px;color:#8b96a5">Inspección</span>
                            <strong style="display:block;font-size:10px;margin-top:3px">
                                ${esc(c.inspeccionCodigo || c.inspeccionId || "Sin inspección")}
                            </strong>
                        </div>
                    </div>
                </div>

                
                <div class="detail-panel">
                    <h3>Conceptos</h3>
                    <table class="detail-table">
                        <thead>
                            <tr>
                                <th>DESCRIPCIÓN</th>
                                <th>CANT.</th>
                                <th>PRECIO</th>
                                <th>DESC. ($)</th>
                                <th>TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${c.items.map(i => `
                                <tr>
                                    <td>${esc(i.descripcion)}</td>
                                    <td>${esc(i.cantidad)}</td>
                                    <td>${money(i.precio)}</td>
                                    <td>${money(i.descuento || 0)}</td>
                                    <td>${money(linea(i))}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>

                    <div style="margin-top:15px; text-align:right; font-size:11px; line-height:1.6;">
                        <div>Subtotal Bruto: <strong>${money(c.subtotal)}</strong></div>
                        <div>Descuento Ítems: <strong>${money(c.descuento)}</strong></div>
                        <div>Descuento Global: <strong>${money(c.descuento_global || 0)}</strong></div>
                        <div>Base Gravable: <strong>${money(c.base)}</strong></div>
                        <div>IVA: <strong>${money(c.iva)}</strong></div>
                        <div class="detail-total" style="margin-top:5px; font-size:14px;">Total: ${money(c.total)}</div>
                    </div>
                </div>

                <div class="detail-panel">
                    <h3>Condiciones / observaciones</h3>
                    <div style="font-size:10px;color:#657184;line-height:1.6">
                        ${esc(c.observaciones || "Sin observaciones.")}
                    </div>
                </div>

                <div class="detail-actions">
                    ${
                        !estaFacturada(c)
                            ? `
                                <button class="btn-secondary" data-detail-action="edit">
                                    <i class="fa-solid fa-pen"></i> Editar
                                </button>
                            `
                            : ""
                    }
                    <button class="btn-secondary" data-detail-action="pdf">
                        <i class="fa-solid fa-file-pdf"></i> Generar PDF
                    </button>
                    ${
                        c.estado === "aprobada"
                            ? `
                                <button class="btn-primary" data-detail-action="orden">
                                    <i class="fa-solid fa-clipboard-list"></i> Crear orden de servicio
                                </button>
                            `
                            : ""
                    }
                    ${
                        !estaFacturada(c)
                            ? `
                                <button class="btn-primary" data-detail-action="estado">
                                    <i class="fa-solid fa-arrows-rotate"></i> Cambiar estado
                                </button>
                            `
                            : ""
                    }
                </div>
            </div>
        `;

        open("detalleModal");

        // Enlazar eventos de botones del modal
        const editButton = cont.querySelector('[data-detail-action="edit"]');
        if (editButton) {
            editButton.onclick = () => {
                cerrarDetalle();
                abrir(c.id);
            };
        }

        const pdfButton = cont.querySelector('[data-detail-action="pdf"]');
        if (pdfButton) {
            pdfButton.onclick = () => generarPDF(c);
        }

        const btnOS = cont.querySelector('[data-detail-action="orden"]');
        if (btnOS) {
            btnOS.onclick = () => crearOrdenServicio(c);
        }

        const estadoButton = cont.querySelector('[data-detail-action="estado"]');
        if (estadoButton) {
            estadoButton.onclick = () => {
                cerrarDetalle();
                abrirEstado(c);
            };
        }
    }

    function crearOrdenServicio(c) {
        if (!c) return;

        if (c.estado !== "aprobada") {
            toast("Solo una cotización aprobada puede convertirse en orden de servicio.", "error");
            return;
        }

        window.location.href = `ordenes.html?cotizacion=${encodeURIComponent(c.id)}`;
    }

    function abrirEstado(c) {
        if (!c) return;

        if (!SNICAuth.tienePermiso(SNICAuth.PERMISOS.COTIZACIONES_EDITAR)) {
            toast("No tienes permiso para cambiar el estado.", "error");
            return;
        }

        if (estaFacturada(c)) {
            toast(`La cotización ${c.id} ya fue facturada y no puede modificarse.`, "error");
            return;
        }

        by("estadoCotizacionId").value = c.id;
        by("nuevoEstado").value = normalizarEstado(c.estado);

        open("estadoModal");
    }

    async function guardarEstado() {
        const id = by("estadoCotizacionId")?.value;
        const estado = normalizarEstado(by("nuevoEstado")?.value);

        if (!id) {
            toast("No se encontró la cotización seleccionada.", "error");
            return;
        }

        if (!estado) {
            toast("Selecciona un estado.", "error");
            return;
        }

        const c = cotizaciones.find(x => String(x.id) === String(id));

        if (!c) {
            toast("No se encontró la cotización seleccionada.", "error");
            return;
        }

        if (estaFacturada(c)) {
            toast(`La cotización ${c.id} ya fue facturada y no puede modificarse.`, "error");
            cerrarEstado();
            return;
        }

        try {
            const { data, error } = await window.supabaseClient
                .from("cotizaciones")
                .update({
                    estado,
                    updated_at: new Date().toISOString()
                })
                .eq("id", c.supabaseId)
                .select("id, numero, estado, updated_at")
                .single();

            if (error) throw error;

            c.estado = normalizarEstado(data.estado);
            c.actualizadoAt = data.updated_at;

            cerrarEstado();
            render();
            actualizarStats();

            toast(`Cotización ${c.id}: estado actualizado a ${estadoTexto(c.estado)}.`);

        } catch (error) {
            console.error("SNIC'ELECTRIC - Error actualizando estado:", error);
            toast(error?.message || "No fue posible actualizar el estado.", "error");
        }
    }

    function generarPDF(c) {
        if (!c) {
            toast("No se encontró la cotización.", "error");
            return;
        }

        imprimirCotizacion(c);
    }

    async function imprimirCotizacion(c) {
        let empresa = {};
        let detallesEmpresa = {}; // Renombrado para evitar conflicto con la variable detalles

        // Asegúrate de usar la instancia cliente (ej. window.supabaseClient o la variable donde ejecutaste createClient)
        const client = window.supabaseClient || window.supabase;

        try {
            // Verificar si el método .from existe en el cliente seleccionado
            if (client && typeof client.from === 'function') {
                const { data: dataEmpresa } = await client
                    .from('configuracion_empresa')
                    .select('*')
                    .maybeSingle();

                if (dataEmpresa) empresa = dataEmpresa;

                const { data: dataDetalles } = await client
                    .from('configuracion_empresa_detalles')
                    .select('*')
                    .maybeSingle();

                if (dataDetalles) detallesEmpresa = dataDetalles;
            } else {
                console.warn("No se encontró una instancia válida de Supabase con el método .from()");
            }
        } catch (err) {
            console.error("Error al cargar la configuración de la empresa desde Supabase:", err);
        }

        // Mapeo con fallback a los campos de la tabla configuracion_empresa_detalles
        const nombreEmpresa = empresa.nombre || empresa.razon_social || detallesEmpresa.nombre || "SNIC'ELECTRIC S.A.S.";
        const nit = empresa.nit || empresa.identificacion || detallesEmpresa.nit || "1090.415.317-1";
        const regimen = empresa.regimen || detallesEmpresa.regimen || "Régimen Común";
        const slogan = empresa.eslogan || detallesEmpresa.eslogan || "Soluciones Eléctricas Seguras y Confiables";
        const direccion = empresa.direccion || detallesEmpresa.direccion || "";
        const telefono = empresa.telefono || detallesEmpresa.telefono || "";
        const celular = empresa.celular || detallesEmpresa.celular || "";
        const email = empresa.email || detallesEmpresa.email || "";
        const web = empresa.web || empresa.sitio_web || detallesEmpresa.sitio_web || detallesEmpresa.web || "";
        const piePagina = detallesEmpresa.pie_documento || detallesEmpresa.pie_de_pagina || empresa.pie_pagina || "Gracias por su confianza";

        const logoUrl = empresa.logo_url || detallesEmpresa.logo_url || new URL("../img/logo.png", window.location.href).href;

        const w = window.open("", "_blank", "width=1000,height=800");

        if (!w) {
            toast("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.", "error");
            return;
        }

        const clienteObj = clientes.find(x => String(x.id) === String(c.clienteId));
        const cliente = clienteObj ? nombreCliente(clienteObj) : (c.clienteNombre || "Sin cliente");
        const documento = clienteObj 
            ? (clienteObj.documentoNumero || clienteObj.numero_documento || clienteObj.documento || clienteObj.nit || "No registrado")
            : (c.clienteDocumento || "No registrado");

        const itemsHtml = (c.items || []).map(i => {
            const precio = Number(i.precio) || 0;
            const desc = Number(i.descuento) || 0;
            const total = linea(i);

            return `
                <tr>
                    <td>
                        <strong>${esc(i.descripcion || "Sin descripción")}</strong>
                        <small>${esc(i.codigo || i.tipo || "")}</small>
                    </td>
                    <td class="center">${esc(i.cantidad || 0)}</td>
                    <td class="center">${esc(i.unidad || "Unidad")}</td>
                    <td class="right">${money(precio)}</td>
                    <td class="center">${money(desc)}</td>
                    <td class="right strong">${money(total)}</td>
                </tr>
            `;
        }).join("");

        const ivaPorcentaje = Number(c.ivaPct) || calcularIvaPorcentaje(c);

        const html = `
    <!doctype html>
    <html lang="es">
    <head>
    <meta charset="utf-8">
    <title>Cotización ${esc(c.id)}</title>
    <style>
    @page{size:A4;margin:14mm 13mm 16mm}
    *{box-sizing:border-box}
    body{margin:0;background:#fff;color:#17233a;font-family:Arial,Helvetica,sans-serif;font-size:11px}
    .sheet{max-width:190mm;margin:0 auto}
    .toolbar{display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px}
    .toolbar button{border:0;border-radius:6px;padding:9px 14px;font-weight:700;cursor:pointer}
    .print{background:#fbb900;color:#0b2f67}
    .close{background:#eef2f7;color:#0b2f67}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #fbb900;padding-bottom:12px;margin-bottom:18px}
    .brand{display:flex;align-items:center;gap:12px}
    .brand img{width:78px;height:78px;object-fit:contain}
    .brand-info h1{margin:0;color:#0b2f67;font-size:20px}
    .brand-info .slogan{margin:2px 0 6px;color:#fbb900;font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
    .brand-info p{margin:2px 0;color:#69778b;font-size:9px}
    .quote-head{text-align:right}
    .quote-head .label{font-size:9px;color:#b27b00;font-weight:800;letter-spacing:1px}
    .quote-head h2{margin:4px 0;color:#0b2f67;font-size:20px}
    .quote-head p{margin:2px 0;color:#66748a;font-size:10px}
    .section{margin-bottom:16px}
    .section-title{font-size:10px;color:#b27b00;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:7px}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;border:1px solid #dce3ed;border-radius:8px;padding:12px}
    .info-item span{display:block;color:#7a8798;font-size:9px;margin-bottom:3px}
    .info-item strong{color:#17233a;font-size:11px}
    table{width:100%;border-collapse:collapse}
    .items th{background:#0b2f67;color:#fff;text-align:left;font-size:9px;padding:9px 8px}
    .items td{border-bottom:1px solid #e4e9f0;padding:9px 8px;vertical-align:top;font-size:10px}
    .items td small{display:block;color:#8a96a6;font-size:8px;margin-top:2px}
    .center{text-align:center}
    .right{text-align:right}
    .strong{font-weight:700}
    .bottom{display:grid;grid-template-columns:1.25fr .9fr;gap:16px;margin-top:18px}
    .notes{border:1px solid #dce3ed;border-radius:8px;padding:12px;min-height:110px}
    .notes h3{margin:0 0 7px;color:#0b2f67;font-size:11px}
    .notes p{margin:0;color:#66748a;line-height:1.55;white-space:pre-wrap}
    .totals{border:1px solid #dce3ed;border-radius:8px;padding:12px}
    .totals-row{display:flex;justify-content:space-between;padding:5px 2px;color:#34445b}
    .totals-row strong{color:#17233a}
    .total-final{display:flex;justify-content:space-between;border-top:1px solid #dce3ed;margin-top:7px;padding:12px 2px 2px;color:#0b2f67;font-size:13px}
    .total-final strong{font-size:18px}
    .footer{margin-top:25px;padding-top:10px;border-top:1px solid #dce3ed;color:#7b8797;font-size:8px;display:flex;justify-content:space-between;align-items:center}
    .conditions{margin-top:16px;color:#66748a;font-size:9px;line-height:1.5}

    @media print{
        .toolbar{display:none!important}
        .brand img{display:none!important}
        .sheet{max-width:none}
        .header{break-inside:avoid}
        .items{break-inside:auto}
        .bottom{break-inside:avoid}
        .footer{break-inside:avoid}
    }
    </style>
    </head>
    <body>
    <div class="sheet">
        <div class="toolbar">
            <button class="print" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
            <button class="close" onclick="window.close()">Cerrar</button>
        </div>

        <header class="header">
            <div class="brand">
                <img src="${logoUrl}" alt="${esc(nombreEmpresa)}">
                <div class="brand-info">
                    <h1>${esc(nombreEmpresa)}</h1>
                    ${slogan ? `<div class="slogan">${esc(slogan)}</div>` : ''}
                    <p>NIT: ${esc(nit)} ${regimen ? `· ${esc(regimen)}` : ''}</p>
                    ${direccion ? `<p>Dirección: ${esc(direccion)}</p>` : ''}
                    ${(telefono || celular) ? `<p>${telefono ? `Tel: ${esc(telefono)}` : ''} ${celular ? `· Móvil: ${esc(celular)}` : ''}</p>` : ''}
                    ${(email || web) ? `<p>${email ? `Email: ${esc(email)}` : ''} ${web ? `· ${esc(web)}` : ''}</p>` : ''}
                </div>
            </div>
            <div class="quote-head">
                <div class="label">COTIZACIÓN COMERCIAL</div>
                <h2>${esc(c.id)}</h2>
                <p>Fecha: ${esc(fecha(c.fecha))}</p>
                <p>Validez: ${Number(c.validez) || 15} días</p>
                <p>Estado: ${esc(estadoTexto(c.estado))}</p>
            </div>
        </header>

        <section class="section">
            <div class="section-title">Datos del cliente</div>
            <div class="info-grid">
                <div class="info-item">
                    <span>Cliente</span>
                    <strong>${esc(cliente)}</strong>
                </div>
                <div class="info-item">
                    <span>Documento</span>
                    <strong>${esc(documento)}</strong>
                </div>
                <div class="info-item">
                    <span>Inspección relacionada</span>
                    <strong>${esc(c.inspeccionCodigo || c.inspeccionId || "Sin inspección")}</strong>
                </div>
                <div class="info-item">
                    <span>Elaborado por</span>
                    <strong>${esc(c.creadoPor || nombreEmpresa)}</strong>
                </div>
            </div>
        </section>

        <section class="section">
            <div class="section-title">Detalle de la propuesta</div>
            <table class="items">
                <thead>
                    <tr>
                        <th>DESCRIPCIÓN</th>
                        <th style="width:11%">CANT.</th>
                        <th style="width:12%">UNIDAD</th>
                        <th style="width:16%;text-align:right">PRECIO UNIT.</th>
                        <th style="width:12%;text-align:center">DESC. ($)</th>
                        <th style="width:18%;text-align:right">TOTAL</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
        </section>

        <div class="bottom">
            <div class="notes">
                <h3>Observaciones y condiciones comerciales</h3>
                <p>${esc(c.observaciones || "Sin observaciones.")}</p>
                <div class="conditions">
                    Esta cotización corresponde a la propuesta comercial indicada
                    y está sujeta a las condiciones acordadas con el cliente.
                </div>
            </div>

            <div class="totals">
                <div class="totals-row">
                    <span>Subtotal Bruto</span>
                    <strong>${money(c.subtotal)}</strong>
                </div>
                <div class="totals-row">
                    <span>Descuento Ítems</span>
                    <strong>${money(c.descuento || 0)}</strong>
                </div>
                <div class="totals-row">
                    <span>Descuento Global</span>
                    <strong>${money(c.descuento_global || 0)}</strong>
                </div>
                <div class="totals-row">
                    <span>Base gravable</span>
                    <strong>${money(c.base)}</strong>
                </div>
                <div class="totals-row">
                    <span>IVA (${ivaPorcentaje}%)</span>
                    <strong>${money(c.iva)}</strong>
                </div>
                <div class="total-final">
                    <span>TOTAL</span>
                    <strong>${money(c.total)}</strong>
                </div>
            </div>
        </div>

        <footer class="footer">
            <div>
                <strong>${esc(nombreEmpresa)}</strong> · NIT: ${esc(nit)} · Cotización ${esc(c.id)}
            </div>
            <div>
                ${esc(piePagina)} ${web ? `· ${esc(web)}` : ''}
            </div>
        </footer>
    </div>

    <script>
    window.addEventListener("load", () => {
        setTimeout(() => window.print(), 350);
    });
    </script>
    </body>
    </html>
    `;

        w.document.open();
        w.document.write(html);
        w.document.close();
    }

    async function eliminar(c) {
        if (!SNICAuth.tienePermiso(SNICAuth.PERMISOS.COTIZACIONES_ELIMINAR)) {
            toast("No tienes permiso para eliminar cotizaciones.", "error");
            return;
        }

        if (!c?.supabaseId) {
            toast("La cotización no tiene un UUID válido de Supabase.", "error");
            return;
        }

        if (estaFacturada(c)) {
            toast(`La cotización ${c.id} ya fue facturada y no puede eliminarse.`, "error");
            return;
        }

        if (!cotizacionEstaVencida(c)) {
            toast("Solo se pueden eliminar cotizaciones vencidas.", "error");
            return;
        }

        if (!confirm(`¿Eliminar ${c.id}? Esta acción no se puede deshacer.`)) {
            return;
        }

        try {
            const { error: errorDetalles } = await window.supabaseClient
                .from("cotizacion_detalles")
                .delete()
                .eq("cotizacion_id", c.supabaseId);

            if (errorDetalles) throw errorDetalles;

            const { error } = await window.supabaseClient
                .from("cotizaciones")
                .delete()
                .eq("id", c.supabaseId);

            if (error) throw error;

            await cargar();
            render();
            actualizarStats();

            toast("Cotización eliminada correctamente.");

        } catch (error) {
            console.error("SNIC'ELECTRIC - Error eliminando cotización:", error);
            toast(error?.message || "No fue posible eliminar la cotización de Supabase.", "error");
        }
    }

    function estaFacturada(c) {
        return normalizarEstado(c?.estado) === "facturada";
    }

    function cotizacionEstaVencida(c) {
        if (!c?.fecha) return false;

        const fechaCotizacion = new Date(`${c.fecha}T00:00:00`);
        const fechaVencimiento = new Date(fechaCotizacion);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + Number(c.validez || 0));

        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        return fechaVencimiento < hoy;
    }

    function normalizarEstado(v) {
        return String(v || "").trim().toLowerCase();
    }

    function estadoTexto(v) {
        return {
            borrador: "Borrador",
            enviada: "Enviada",
            aprobada: "Aprobada",
            rechazada: "Rechazada",
            vencida: "Vencida",
            facturada: "Facturada"
        }[normalizarEstado(v)] || v || "-";
    }

    function calcularIvaPorcentaje(c) {
        const base = Number(c.base) || 0;
        const iva = Number(c.iva) || 0;

        if (!base) return 0;

        return Math.round((iva / base) * 10000) / 100;
    }

    function cerrarModal() {
        editando = null;
        close("cotizacionModal");
    }

    function cerrarDetalle() {
        close("detalleModal");
    }

    function cerrarEstado() {
        close("estadoModal");
    }

    function cerrarPorId(id) {
        close(id);
    }

    function open(id) {
        by(id)?.classList.add("show");
        by(id)?.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");
    }

    function close(id) {
        by(id)?.classList.remove("show");
        by(id)?.setAttribute("aria-hidden", "true");

        if (!document.querySelector(".modal-overlay.show")) {
            document.body.classList.remove("modal-open");
        }
    }

    function linea(x) {
        const bruto = (Number(x.cantidad) || 0) * (Number(x.precio) || 0);
        const descMonetario = Number(x.descuento) || 0;
        return Math.max(0, bruto - descMonetario);
    }

    function nombreCliente(c) {
        if (!c) return "Sin cliente";

        return (
            [c.nombre, c.apellido]
                .filter(Boolean)
                .join(" ") ||
            c.razonSocial ||
            c.nombreCompleto ||
            "Sin nombre"
        );
    }

    function money(n) {
        return new Intl.NumberFormat("es-CO", {
            style: "currency",
            currency: "COP",
            maximumFractionDigits: 0
        }).format(Number(n) || 0);
    }

    function fecha(v) {
        if (!v) return "-";
        const p = String(v).split("-");
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v;
    }

    function cap(v) {
        const s = String(v || "");
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function by(id) {
        return document.getElementById(id);
    }

    function setText(id, v) {
        const e = by(id);
        if (e) e.textContent = v;
    }

    function esc(v) {
        return String(v ?? "").replace(
            /[&<>"']/g,
            m => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            }[m])
        );
    }

    function toast(msg, type = "success") {
        const b = by("toast");
        const i = by("toastIcon");
        const t = by("toastMessage");

        if (!b) return;

        t.textContent = msg;
        i.className = type === "error"
            ? "fa-solid fa-circle-exclamation"
            : "fa-solid fa-circle-check";

        b.classList.toggle("error", type === "error");
        b.classList.add("show");

        clearTimeout(window.__snicToast);
        window.__snicToast = setTimeout(() => b.classList.remove("show"), 3200);
    }
})();