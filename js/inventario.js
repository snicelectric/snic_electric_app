/* =========================================================
   SNIC'ELECTRIC - INVENTARIO.JS
   Módulo de inventario conectado a Supabase.
========================================================= */
(function () {
    "use strict";

    let productos = [];
    let categorias = [];
    let productoEditando = null;

    document.addEventListener("DOMContentLoaded", iniciarInventario);


    const PREFIJOS_CATEGORIA_POR_DEFECTO = {
        "materiales eléctricos": "MAT",
        "materiales electricos": "MAT",
        "herramientas": "HER",
        "iluminación": "ILU",
        "iluminacion": "ILU",
        "protección eléctrica": "PRO",
        "proteccion electrica": "PRO",
        "servicios": "SRV"
    };

    function normalizarPrefijo(prefijo, nombre = "") {
        let p = String(prefijo || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (!p) {
            const clave = String(nombre || "").trim().toLowerCase();
            p = PREFIJOS_CATEGORIA_POR_DEFECTO[clave] ||
                clave.split(/\s+/).map(x => x[0] || "").join("").slice(0, 4).toUpperCase();
        }
        return (p || "CAT").slice(0, 4);
    }

    function prefijoCategoria(categoria) {
        return normalizarPrefijo(categoria?.prefijo, categoria?.nombre);
    }

    function asegurarPrefijosCategorias() {
        let cambio = false;
        categorias.forEach(c => {
            const prefijo = prefijoCategoria(c);
            if (c.prefijo !== prefijo) {
                c.prefijo = prefijo;
                cambio = true;
            }
        });
        if (cambio) console.info("SNIC'ELECTRIC - Prefijos normalizados en memoria.");
    }

    function generarCodigoCategoria(categoriaId) {
        const categoria = categorias.find(c => c.id === categoriaId);
        if (!categoria) return "";
        const prefijo = prefijoCategoria(categoria);
        const escaped = prefijo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp("^" + escaped + "-(\\d+)$", "i");
        let max = 0;
        productos.forEach(p => {
            const match = regex.exec(String(p.codigo || ""));
            if (match) max = Math.max(max, Number(match[1]) || 0);
        });
        return `${prefijo}-${String(max + 1).padStart(4, "0")}`;
    }

    async function iniciarInventario() {
        if (typeof window.SNICAuth === "undefined") {
            window.location.href = "../login.html";
            return;
        }
        if (!window.SNICAuth.protegerPagina(window.SNICAuth.PERMISOS.INVENTARIO_VER)) return;

        await cargarCategorias();
        asegurarPrefijosCategorias();
        await cargarProductos();
        configurarEventos();
        mostrarUsuario();
        renderizarCategoriasSelect();
        renderizarProductos();
        actualizarEstadisticas();
        renderizarHistorialMovimientos();
        window.SNICAuth.aplicarPermisos();
    }

    async function cargarCategorias() {
        try {
            if (!window.supabaseClient?.from) {
                throw new Error("supabaseClient no está disponible.");
            }

            const { data, error } = await window.supabaseClient
                .from("categorias_inventario")
                .select("id,nombre,prefijo,activa,created_at")
                .eq("activa", true)
                .order("nombre", { ascending: true });

            if (error) throw error;

            categorias = Array.isArray(data)
                ? data.map(c => ({
                    id: c.id,
                    nombre: c.nombre,
                    prefijo: c.prefijo,
                    activa: c.activa !== false,
                    created_at: c.created_at
                }))
                : [];

            console.log(
                "SNIC'ELECTRIC - Categorías cargadas desde Supabase:",
                categorias.length,
                categorias
            );

            return categorias;
        } catch (error) {
            console.error("SNIC'ELECTRIC - Error cargando categorías:", error);
            mostrarToast("No fue posible cargar las categorías desde Supabase.", "error");
            categorias = [];
            return categorias;
        }
    }

    async function cargarProductos() {
        try {
            if (!window.supabaseClient?.from) {
                throw new Error("supabaseClient no está disponible.");
            }

            const { data, error } = await window.supabaseClient
                .from("productos")
                .select(`
                    id,
                    codigo,
                    nombre,
                    categoria_id,
                    unidad,
                    descripcion,
                    stock,
                    stock_minimo,
                    precio_compra,
                    precio_venta,
                    proveedor,
                    ubicacion,
                    estado,
                    created_at,
                    updated_at
                `)
                .order("created_at", { ascending: false });

            if (error) throw error;

            const mapaCategorias = new Map(
                categorias.map(c => [String(c.id), c])
            );

            productos = Array.isArray(data)
                ? data.map(p => {
                    const categoria = mapaCategorias.get(String(p.categoria_id)) || null;

                    return {
                        ...p,
                        categoriaId: p.categoria_id || "",
                        categoriaNombre: categoria?.nombre || "Sin categoría",
                        categoriaPrefijo: categoria?.prefijo || "",
                        stockMinimo: Number(p.stock_minimo) || 0,
                        precioCompra: Number(p.precio_compra) || 0,
                        precioVenta: Number(p.precio_venta) || 0,
                        creadoAt: p.created_at || "",
                        actualizadoAt: p.updated_at || ""
                    };
                })
                : [];

            console.log(
                "SNIC'ELECTRIC - Productos cargados desde Supabase:",
                productos.length,
                productos
            );

            return productos;
        } catch (error) {
            console.error("SNIC'ELECTRIC - Error cargando productos:", error);
            mostrarToast("No fue posible cargar los productos desde Supabase.", "error");
            productos = [];
            return productos;
        }
    }

    function configurarEventos() {
        document.getElementById("btnNuevoProducto")?.addEventListener("click", () => abrirProductoModal());
        document.getElementById("btnCrearPrimerProducto")?.addEventListener("click", () => abrirProductoModal());
        document.getElementById("btnCategorias")?.addEventListener("click", abrirCategoriasModal);
        document.getElementById("btnCerrarCategorias")?.addEventListener("click", cerrarCategoriasModal);
        document.getElementById("btnCrearCategoria")?.addEventListener("click", crearCategoria);
        document.getElementById("nuevaCategoria")?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); crearCategoria(); } });
        document.getElementById("productoForm")?.addEventListener("submit", guardarProductoDesdeFormulario);
        document.getElementById("categoriaProducto")?.addEventListener("change", () => { const id=document.getElementById("productoId")?.value; if(id)return; const c=document.getElementById("codigoProducto"); if(c)c.value=generarCodigoCategoria(document.getElementById("categoriaProducto").value); });
        document.getElementById("unidadProducto")?.addEventListener("change", () => { const id=document.getElementById("productoId")?.value; if(id)return; const c=document.getElementById("codigoProducto"); if(c)c.value=generarCodigoCategoria(document.getElementById("categoriaProducto")?.value||""); });
        document.getElementById("btnCerrarProducto")?.addEventListener("click", cerrarProductoModal);
        document.getElementById("btnCancelarProducto")?.addEventListener("click", cerrarProductoModal);
        document.getElementById("btnCerrarDetalle")?.addEventListener("click", cerrarDetalleModal);
        document.getElementById("movimientoForm")?.addEventListener("submit", registrarMovimiento);
        document.getElementById("btnCerrarMovimiento")?.addEventListener("click", cerrarMovimientoModal);
        document.getElementById("btnCancelarMovimiento")?.addEventListener("click", cerrarMovimientoModal);

        document.getElementById("buscarProducto")?.addEventListener("input", renderizarProductos);
        document.getElementById("filtroCategoria")?.addEventListener("change", renderizarProductos);
        document.getElementById("filtroEstado")?.addEventListener("change", renderizarProductos);
        document.getElementById("filtroStock")?.addEventListener("change", renderizarProductos);

        const tarjetaAgotados = document.getElementById("productosAgotados")?.closest(".stat-card");
        if (tarjetaAgotados) {
            tarjetaAgotados.style.cursor = "pointer";
            tarjetaAgotados.title = "Ver productos agotados";
            tarjetaAgotados.addEventListener("click", () => {
                const filtro = document.getElementById("filtroStock");
                if (!filtro) return;
                filtro.value = "agotado";
                renderizarProductos();
                document.getElementById("inventarioTableBody")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            });
        }
        document.getElementById("buscarMovimiento")?.addEventListener("input", renderizarHistorialMovimientos);
        document.getElementById("filtroMovimientoTipo")?.addEventListener("change", renderizarHistorialMovimientos);
        document.getElementById("filtroMovimientoDesde")?.addEventListener("change", renderizarHistorialMovimientos);
        document.getElementById("filtroMovimientoHasta")?.addEventListener("change", renderizarHistorialMovimientos);
        document.getElementById("btnLimpiarFiltrosMovimientos")?.addEventListener("click", limpiarFiltrosMovimientos);

        document.querySelectorAll("[data-menu-toggle]").forEach(btn => btn.addEventListener("click", () => document.getElementById("sidebar")?.classList.toggle("open")));
        document.querySelectorAll("[data-logout]").forEach(btn => btn.addEventListener("click", () => window.SNICAuth.cerrarSesion()));

        document.addEventListener("click", e => {
            const accion = e.target.closest("[data-accion]");
            if (!accion) return;
            const id = accion.dataset.id;
            const tipo = accion.dataset.accion;
            if (tipo === "ver") verProducto(id);
            if (tipo === "editar") editarProducto(id);
            if (tipo === "movimiento") abrirMovimientoModal(id);
            if (tipo === "estado") cambiarEstadoProducto(id);
        });

        document.querySelectorAll(".modal-overlay").forEach(modal => modal.addEventListener("click", e => {
            if (e.target === modal) cerrarModal(modal);
        }));

        document.addEventListener("keydown", e => {
            if (e.key === "Escape") document.querySelectorAll(".modal-overlay.open").forEach(cerrarModal);
        });
    }

    function mostrarUsuario() {
        const usuario = window.SNICAuth.obtenerUsuarioActual?.();
        if (!usuario) return;
        const nombre = limpiar(usuario.nombre || "");
        const apellido = limpiar(usuario.apellido || "");
        const nombreCompleto = [nombre, apellido].filter(Boolean).join(" ");
        const identificador = nombreCompleto || usuario.email || usuario.usuario || "Usuario";
        document.querySelectorAll("[data-user-name]").forEach(el => el.textContent = identificador);
        document.querySelectorAll("[data-user-role]").forEach(el => el.textContent = capitalizar(usuario.rol || "Usuario"));
        const avatar = document.getElementById("topbarAvatar");
        if (avatar) {
            const fuente = nombreCompleto || usuario.email || usuario.usuario || "US";
            const partes = fuente.trim().split(/\s+/).filter(Boolean);
            let iniciales = "US";
            if (partes.length >= 2) iniciales = (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
            else if (partes.length === 1) iniciales = partes[0].slice(0, 2).toUpperCase();
            avatar.textContent = iniciales;
            avatar.setAttribute("aria-label", `Avatar de ${identificador}`);
            avatar.title = identificador;
        }
    }

    function renderizarCategoriasSelect() {
        const select = document.getElementById("categoriaProducto");
        const filtro = document.getElementById("filtroCategoria");
        if (select) {
            select.innerHTML = '<option value="">Seleccionar categoría</option>' + categorias.filter(c => c.activa !== false).map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.nombre)}</option>`).join("");
        }
        if (filtro) {
            const valorActual = filtro.value;
            filtro.innerHTML = '<option value="">Todas las categorías</option>' + categorias.filter(c => c.activa !== false).map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.nombre)}</option>`).join("");
            filtro.value = valorActual;
        }
    }

    function renderizarProductos() {
        const tbody = document.getElementById("inventarioTableBody");
        const empty = document.getElementById("inventarioEmpty");
        if (!tbody) return;

        const busqueda = (document.getElementById("buscarProducto")?.value || "").trim().toLowerCase();
        const categoria = document.getElementById("filtroCategoria")?.value || "";
        const estado = document.getElementById("filtroEstado")?.value || "";
        const stock = document.getElementById("filtroStock")?.value || "";

        const filtrados = productos.filter(p => {
            const texto = [p.codigo, p.nombre, p.categoriaNombre, p.proveedor, p.descripcion].join(" ").toLowerCase();
            if (busqueda && !texto.includes(busqueda)) return false;
            if (categoria && p.categoriaId !== categoria) return false;
            if (estado && p.estado !== estado) return false;
            if (stock === "bajo" && !(Number(p.stock) > 0 && Number(p.stock) <= Number(p.stockMinimo))) return false;
            if (stock === "agotado" && Number(p.stock) !== 0) return false;
            return true;
        });

        tbody.innerHTML = filtrados.map(productoFila).join("");
        empty.hidden = filtrados.length > 0;
        actualizarEstadisticas();
        window.SNICAuth.aplicarPermisos();
    }

    function productoFila(p) {
        const stock = Number(p.stock) || 0;
        const minimo = Number(p.stockMinimo) || 0;
        const claseStock = stock === 0 ? "out" : (stock <= minimo && minimo > 0 ? "low" : "");
        const estadoClase = p.estado === "activo" ? "active" : "inactive";
        const puedeEditar =
    window.SNICAuth.tienePermiso(
        window.SNICAuth.PERMISOS.INVENTARIO_EDITAR
    );

const puedeMovimiento =
    window.SNICAuth.tienePermiso(
        "inventario.movimientos"
    );
        const unidad = capitalizar(p.unidad || "unidad");
        return `<tr>
            <td><div class="product-cell"><div class="product-icon"><i class="fa-solid ${p.unidad === "servicio" ? "fa-screwdriver-wrench" : "fa-box"}"></i></div><div class="product-main"><strong>${escapeHtml(p.codigo)}</strong></div></div></td>
            <td><div class="product-cell"><div class="product-main"><strong>${escapeHtml(p.nombre)}</strong></div></div></td>
            <td><span class="category-text">${escapeHtml(p.categoriaNombre || "Sin categoría")}</span></td>
            <td><span class="stock-value ${claseStock}">${formatearNumero(stock)}</span><small class="stock-min"> mín. ${formatearNumero(minimo)}</small></td>
            <td><span class="unit-badge">${escapeHtml(unidad)}</span></td>
            <td>${formatearMoneda(p.precioVenta)}</td>
            <td><span class="status-badge ${estadoClase}">${p.estado === "activo" ? "Activo" : "Inactivo"}</span></td>
            <td><div class="action-group">
            <button class="icon-button ver-action" title="Ver" data-accion="ver" data-id="${escapeAttr(p.id)}"><i class="fa-solid fa-eye"></i></button>
            ${puedeMovimiento ? `<button class="icon-button movimiento-action" title="Movimiento" data-accion="movimiento" data-id="${escapeAttr(p.id)}"><i class="fa-solid fa-arrows-rotate"></i></button>` : ""}
            ${puedeEditar ? `<button class="icon-button editar-action" title="Editar" data-accion="editar" data-id="${escapeAttr(p.id)}"><i class="fa-solid fa-pen"></i></button>
            <button class="icon-button estado-action ${p.estado === "activo" ? "red" : ""}" title="${p.estado === "activo" ? "Desactivar" : "Activar"}" data-accion="estado" data-id="${escapeAttr(p.id)}"><i class="fa-solid ${p.estado === "activo" ? "fa-toggle-off" : "fa-toggle-on"}"></i></button>` : ""}</div></td>
        </tr>`;
    }
    
    function actualizarEstadisticas() {
        const activos = productos.filter(p => p.estado === "activo");
        const agotados = productos.filter(p => Number(p.stock) === 0);
        const bajos = productos.filter(p =>
            Number(p.stock) > 0 &&
            Number(p.stockMinimo) > 0 &&
            Number(p.stock) <= Number(p.stockMinimo)
        );

        setText("totalProductos", productos.length);
        setText("productosDisponibles", activos.length);
        setText("productosStockBajo", bajos.length);
        setText("productosAgotados", agotados.length);

        // La tarjeta "Agotados" puede estar presente en el HTML pero el CSS
        // general puede sobrescribir el color del icono. Forzamos únicamente
        // el color del icono según exista o no stock agotado, sin modificar
        // la estructura visual ni app-v2.css.
        const contadorAgotados = document.getElementById("productosAgotados");
        const tarjetaAgotados = contadorAgotados?.closest(".stat-card");
        const iconoAgotados = tarjetaAgotados?.querySelector(".stat-icon i");
        const contenedorIconoAgotados = tarjetaAgotados?.querySelector(".stat-icon");

        if (iconoAgotados) {
            iconoAgotados.style.color = agotados.length > 0 ? "#dc2626" : "";
        }
        if (contenedorIconoAgotados) {
            contenedorIconoAgotados.style.color = agotados.length > 0 ? "#dc2626" : "";
        }

        setText("totalCategorias", categorias.filter(c => c.activa !== false).length);
    }

    function abrirProductoModal(id = null) {
        if (id && !window.SNICAuth.tienePermiso(window.SNICAuth.PERMISOS.INVENTARIO_EDITAR)) return;
        if (!id && !window.SNICAuth.tienePermiso(window.SNICAuth.PERMISOS.INVENTARIO_CREAR)) { mostrarToast("No tienes permiso para crear productos.", "error"); return; }
        productoEditando = id ? productos.find(p => p.id === id) : null;
        const form = document.getElementById("productoForm"); form?.reset();
        document.getElementById("productoId").value = productoEditando?.id || "";
        document.getElementById("modalProductoTitulo").textContent = productoEditando ? "Editar producto" : "Nuevo producto";
        document.getElementById("categoriaProducto").value = productoEditando?.categoriaId || "";
        document.getElementById("unidadProducto").value = productoEditando?.unidad || "unidad";
        document.getElementById("codigoProducto").value = productoEditando?.codigo || generarCodigoCategoria(productoEditando?.categoriaId || "");
        document.getElementById("nombreProducto").value = productoEditando?.nombre || "";
        document.getElementById("descripcionProducto").value = productoEditando?.descripcion || "";
        document.getElementById("stockProducto").value = productoEditando?.stock ?? 0;
        document.getElementById("stockMinimoProducto").value = productoEditando?.stockMinimo ?? 0;
        document.getElementById("precioCompraProducto").value = productoEditando?.precioCompra ?? 0;
        document.getElementById("precioVentaProducto").value = productoEditando?.precioVenta ?? 0;
        document.getElementById("proveedorProducto").value = productoEditando?.proveedor || "";
        document.getElementById("ubicacionProducto").value = productoEditando?.ubicacion || "";
        document.getElementById("estadoProducto").value = productoEditando?.estado || "activo";
        abrirModal(document.getElementById("productoModal"));
    }

    async function actualizarProductoEnSupabase(id, producto) {
        if (!window.supabaseClient?.from) {
            throw new Error("supabaseClient no está disponible.");
        }

        const fila = {
            nombre: producto.nombre,
            categoria_id: producto.categoriaId,
            unidad: producto.unidad,
            descripcion: producto.descripcion || null,
            stock: Number(producto.stock) || 0,
            stock_minimo: Number(producto.stockMinimo) || 0,
            precio_compra: Number(producto.precioCompra) || 0,
            precio_venta: Number(producto.precioVenta) || 0,
            proveedor: producto.proveedor || null,
            ubicacion: producto.ubicacion || null,
            estado: producto.estado || "activo"
        };

        const { data, error } = await window.supabaseClient
            .from("productos")
            .update(fila)
            .eq("id", id)
            .select(`
                id, codigo, nombre, categoria_id, unidad, descripcion,
                stock, stock_minimo, precio_compra, precio_venta,
                proveedor, ubicacion, estado, created_at, updated_at
            `)
            .single();

        if (error) throw error;
        return data;
    }

    async function crearProductoEnSupabase(producto) {
        if (!window.supabaseClient?.from) {
            throw new Error("supabaseClient no está disponible.");
        }

        const fila = {
            codigo: producto.codigo,
            nombre: producto.nombre,
            categoria_id: producto.categoriaId,
            unidad: producto.unidad,
            descripcion: producto.descripcion || null,
            stock: Number(producto.stock) || 0,
            stock_minimo: Number(producto.stockMinimo) || 0,
            precio_compra: Number(producto.precioCompra) || 0,
            precio_venta: Number(producto.precioVenta) || 0,
            proveedor: producto.proveedor || null,
            ubicacion: producto.ubicacion || null,
            estado: producto.estado || "activo"
        };

        const { data, error } = await window.supabaseClient
            .from("productos")
            .insert(fila)
            .select(`
                id,
                codigo,
                nombre,
                categoria_id,
                unidad,
                descripcion,
                stock,
                stock_minimo,
                precio_compra,
                precio_venta,
                proveedor,
                ubicacion,
                estado,
                created_at,
                updated_at
            `)
            .single();

        if (error) throw error;

        return data;
    }

    async function guardarProductoDesdeFormulario(e) {
        e.preventDefault();

        const idProducto = document.getElementById("productoId").value.trim();
        const editando = Boolean(idProducto);

        const permiso = editando
            ? window.SNICAuth.PERMISOS.INVENTARIO_EDITAR
            : window.SNICAuth.PERMISOS.INVENTARIO_CREAR;

        if (!window.SNICAuth.tienePermiso(permiso)) {
            mostrarToast("No tienes permiso para realizar esta acción.", "error");
            return;
        }

        const categoriaId = document.getElementById("categoriaProducto").value;
        const categoria = categorias.find(c => String(c.id) === String(categoriaId));
        if (!categoria) {
            mostrarToast("Selecciona una categoría válida.", "error");
            return;
        }

        const nombre = limpiar(document.getElementById("nombreProducto").value);
        const unidad = document.getElementById("unidadProducto").value;
        const stock = numero("stockProducto");
        const stockMinimo = numero("stockMinimoProducto");
        const precioCompra = numero("precioCompraProducto");
        const precioVenta = numero("precioVentaProducto");
        const proveedor = limpiar(document.getElementById("proveedorProducto").value);
        const ubicacion = limpiar(document.getElementById("ubicacionProducto").value);
        const descripcion = limpiar(document.getElementById("descripcionProducto").value);
        const estado = document.getElementById("estadoProducto").value || "activo";

        if (!nombre || !unidad) {
            mostrarToast("Nombre y unidad son obligatorios.", "error");
            return;
        }

        if (stock < 0 || stockMinimo < 0 || precioCompra < 0 || precioVenta < 0) {
            mostrarToast("Los valores numéricos no pueden ser negativos.", "error");
            return;
        }

        const productoActual = editando
            ? productos.find(p => String(p.id) === String(idProducto))
            : null;

        if (editando && !productoActual) {
            mostrarToast("No se encontró el producto que deseas editar.", "error");
            return;
        }

        // El código se genera al crear y se conserva al editar.
        const codigo = editando
            ? productoActual.codigo
            : generarCodigoCategoria(categoriaId);

        if (!codigo) {
            mostrarToast("No fue posible generar el código del producto.", "error");
            return;
        }

        const btnGuardar = document.getElementById("btnGuardarProducto");
        if (btnGuardar) {
            btnGuardar.disabled = true;
            btnGuardar.dataset.originalText = btnGuardar.innerHTML;
            btnGuardar.innerHTML =
                '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
        }

        const datosProducto = {
            codigo,
            nombre,
            categoriaId,
            unidad,
            descripcion,
            stock,
            stockMinimo,
            precioCompra,
            precioVenta,
            proveedor,
            ubicacion,
            estado
        };

        try {
            const resultado = editando
                ? await actualizarProductoEnSupabase(idProducto, datosProducto)
                : await crearProductoEnSupabase(datosProducto);

            await cargarProductos();

            cerrarProductoModal();
            renderizarProductos();
            renderizarCategoriasSelect();
            actualizarEstadisticas();

            mostrarToast(
                editando
                    ? `Producto ${resultado?.codigo || codigo} actualizado correctamente.`
                    : `Producto ${resultado?.codigo || codigo} creado correctamente.`
            );

            console.log(
                editando
                    ? "SNIC'ELECTRIC - Producto actualizado en Supabase:"
                    : "SNIC'ELECTRIC - Producto creado en Supabase:",
                resultado
            );
        } catch (error) {
            console.error("SNIC'ELECTRIC - Error guardando producto:", error);

            if (error?.code === "42501") {
                mostrarToast("Supabase rechazó la operación por permisos RLS.", "error");
            } else if (error?.code === "PGRST116") {
                mostrarToast("No se encontró el producto en Supabase.", "error");
            } else {
                mostrarToast(error?.message || "No fue posible guardar el producto.", "error");
            }
        } finally {
            if (btnGuardar) {
                btnGuardar.disabled = false;
                btnGuardar.innerHTML =
                    btnGuardar.dataset.originalText ||
                    '<i class="fa-solid fa-floppy-disk"></i> Guardar producto';
                delete btnGuardar.dataset.originalText;
            }
        }
    }

    function generarCodigo() {
        return generarCodigoCategoria(document.getElementById("categoriaProducto")?.value || "");
    }

    function editarProducto(id) { abrirProductoModal(id); }

    async function cambiarEstadoProductoEnSupabase(id, nuevoEstado) {
        if (!window.supabaseClient?.from) {
            throw new Error("supabaseClient no está disponible.");
        }

        const { data, error } = await window.supabaseClient
            .from("productos")
            .update({
                estado: nuevoEstado
            })
            .eq("id", id)
            .select(`
                id,
                codigo,
                nombre,
                categoria_id,
                unidad,
                descripcion,
                stock,
                stock_minimo,
                precio_compra,
                precio_venta,
                proveedor,
                ubicacion,
                estado,
                created_at,
                updated_at
            `)
            .single();

        if (error) throw error;
        return data;
    }

    async function cambiarEstadoProducto(id) {
        if (!window.SNICAuth.tienePermiso(window.SNICAuth.PERMISOS.INVENTARIO_EDITAR)) {
            mostrarToast("No tienes permiso para cambiar el estado del producto.", "error");
            return;
        }

        const producto = productos.find(p => String(p.id) === String(id));

        if (!producto) {
            mostrarToast("No se encontró el producto.", "error");
            return;
        }

        const nuevoEstado = producto.estado === "activo" ? "inactivo" : "activo";

        const confirmar = window.confirm(
            nuevoEstado === "inactivo"
                ? `¿Deseas desactivar el producto ${producto.codigo} - ${producto.nombre}?`
                : `¿Deseas activar nuevamente el producto ${producto.codigo} - ${producto.nombre}?`
        );

        if (!confirmar) return;

        try {
            const actualizado = await cambiarEstadoProductoEnSupabase(
                id,
                nuevoEstado
            );

            await cargarProductos();
            renderizarProductos();
            actualizarEstadisticas();

            mostrarToast(
                nuevoEstado === "activo"
                    ? `Producto ${actualizado.codigo} activado correctamente.`
                    : `Producto ${actualizado.codigo} desactivado correctamente.`
            );

            console.log(
                "SNIC'ELECTRIC - Estado actualizado en Supabase:",
                actualizado
            );
        } catch (error) {
            console.error(
                "SNIC'ELECTRIC - Error actualizando estado en Supabase:",
                error
            );

            if (error?.code === "42501") {
                mostrarToast(
                    "Supabase rechazó la operación por permisos RLS.",
                    "error"
                );
            } else if (error?.code === "PGRST116") {
                mostrarToast(
                    "No se encontró el producto en Supabase.",
                    "error"
                );
            } else {
                mostrarToast(
                    error?.message || "No fue posible cambiar el estado del producto.",
                    "error"
                );
            }
        }
    }

    async function verProducto(id) {
        const p = productos.find(x => String(x.id) === String(id));
        if (!p) return;
        const movimientos = await cargarMovimientosProducto(p.id);
        const contenido = document.getElementById("detalleProductoContent");
        if (!contenido) return;
        const historial = movimientos.length ? `<div class="movement-history"><h3>Últimos movimientos</h3>${movimientos.map(m => {
            const tipoTexto = m.tipo === "entrada" ? "Entrada" : m.tipo === "salida" ? "Salida" : "Ajuste";
            const signo = m.tipo === "entrada" ? "+" : m.tipo === "salida" ? "−" : "→";
            return `<div class="movement-row"><span class="movement-${escapeAttr(m.tipo)}">${signo}${formatearNumero(m.cantidad)}</span><div><strong>${tipoTexto}</strong><small>${escapeHtml(m.motivo || "Sin motivo")} · ${formatearFecha(m.fecha)}</small></div></div>`;
        }).join("")}</div>` : `<div class="movement-history"><h3>Últimos movimientos</h3><p class="category-empty">No hay movimientos registrados para este producto.</p></div>`;
        contenido.innerHTML = `<div class="detail-grid"><div class="detail-item"><span>Código</span><strong>${escapeHtml(p.codigo)}</strong></div><div class="detail-item"><span>Producto</span><strong>${escapeHtml(p.nombre)}</strong></div><div class="detail-item"><span>Categoría</span><strong>${escapeHtml(p.categoriaNombre)}</strong></div><div class="detail-item"><span>Existencia</span><strong>${formatearNumero(p.stock)} ${escapeHtml(p.unidad)}</strong></div><div class="detail-item"><span>Stock mínimo</span><strong>${formatearNumero(p.stockMinimo)}</strong></div><div class="detail-item"><span>Precio venta</span><strong>${formatearMoneda(p.precioVenta)}</strong></div><div class="detail-item"><span>Proveedor</span><strong>${escapeHtml(p.proveedor || "No registrado")}</strong></div><div class="detail-item"><span>Ubicación</span><strong>${escapeHtml(p.ubicacion || "No registrada")}</strong></div><div class="detail-item full"><span>Descripción</span><strong>${escapeHtml(p.descripcion || "Sin descripción")}</strong></div></div>${historial}`;
        abrirModal(document.getElementById("detalleModal"));
    }

    async function cargarMovimientosProducto(productoId) {
        if (!window.supabaseClient?.from) return [];

        const { data, error } = await window.supabaseClient
            .from("movimientos_inventario")
            .select(`
                id,
                producto_id,
                tipo,
                cantidad,
                motivo,
                usuario_id,
                created_at,
                stock_anterior,
                stock_nuevo
            `)
            .eq("producto_id", productoId)
            .order("created_at", { ascending: false })
            .limit(5);

        if (error) {
            console.error(
                "SNIC'ELECTRIC - Error cargando movimientos:",
                error
            );
            return [];
        }

        return Array.isArray(data)
            ? data.map(m => ({
                ...m,
                productoId: m.producto_id,
                fecha: m.created_at
            }))
            : [];
    }

        async function obtenerHistorialMovimientos() {
        if (!window.supabaseClient?.from) return [];

        const { data, error } = await window.supabaseClient
            .from("movimientos_inventario")
            .select(`
                id,
                producto_id,
                tipo,
                cantidad,
                motivo,
                usuario_id,
                created_at,
                stock_anterior,
                stock_nuevo
            `)
            .order("created_at", { ascending: false });

        if (error) {
            console.error(
                "SNIC'ELECTRIC - Error cargando historial de movimientos:",
                error
            );
            mostrarToast(
                "No fue posible cargar el historial de movimientos.",
                "error"
            );
            return [];
        }

        return Array.isArray(data) ? data : [];
    }

    async function renderizarHistorialMovimientos() {
        const tbody = document.getElementById("movimientosTableBody");
        const empty = document.getElementById("movimientosEmpty");
        if (!tbody) return;

        const buscar = limpiar(document.getElementById("buscarMovimiento")?.value || "").toLowerCase();
        const tipo = document.getElementById("filtroMovimientoTipo")?.value || "";
        const desde = document.getElementById("filtroMovimientoDesde")?.value || "";
        const hasta = document.getElementById("filtroMovimientoHasta")?.value || "";

        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center;padding:28px;">
                    <i class="fa-solid fa-spinner fa-spin"></i> Cargando movimientos...
                </td>
            </tr>
        `;

        const movimientos = await obtenerHistorialMovimientos();
        const mapaProductos = new Map(
            productos.map(p => [String(p.id), p])
        );

        const filtrados = movimientos.filter(m => {
            const producto = mapaProductos.get(String(m.producto_id));
            const texto = [
                producto?.codigo,
                producto?.nombre,
                producto?.categoriaNombre,
                m.motivo,
                m.usuario_id
            ].filter(Boolean).join(" ").toLowerCase();

            if (buscar && !texto.includes(buscar)) return false;
            if (tipo && m.tipo !== tipo) return false;

            const fecha = String(m.created_at || "").slice(0, 10);
            if (desde && fecha < desde) return false;
            if (hasta && fecha > hasta) return false;

            return true;
        });

        if (!filtrados.length) {
            tbody.innerHTML = "";
            if (empty) empty.hidden = false;
            return;
        }

        if (empty) empty.hidden = true;

        // Cacheamos los nombres de usuario para no hacer una consulta por fila.
        const usuarioIds = [
            ...new Set(
                filtrados
                    .map(m => m.usuario_id)
                    .filter(Boolean)
            )
        ];

        const usuarios = await obtenerUsuariosMovimientos(usuarioIds);
        const mapaUsuarios = new Map(
            usuarios.map(u => [
                String(u.id),
                u.nombreCompleto || u.email || String(u.id)
            ])
        );

        tbody.innerHTML = filtrados.map(m => {
            const p = mapaProductos.get(String(m.producto_id));
            const tipoTexto =
                m.tipo === "entrada" ? "Entrada" :
                m.tipo === "salida" ? "Salida" : "Ajuste";

            const signo = m.tipo === "entrada" ? "+" :
                m.tipo === "salida" ? "−" : "→";

            const clase = `movement-${m.tipo}`;

            return `
                <tr>
                    <td>${escapeHtml(formatearFecha(m.created_at))}</td>
                    <td>
                        <strong>${escapeHtml(p?.codigo || "—")}</strong>
                        <small style="display:block;">${escapeHtml(p?.nombre || "Producto no encontrado")}</small>
                    </td>
                    <td><span class="${clase}">${tipoTexto}</span></td>
                    <td><strong>${signo}${formatearNumero(m.cantidad)}</strong></td>
                    <td>${m.stock_anterior != null ? formatearNumero(m.stock_anterior) : "—"}</td>
                    <td>${m.stock_nuevo != null ? formatearNumero(m.stock_nuevo) : "—"}</td>
                    <td>${escapeHtml(mapaUsuarios.get(String(m.usuario_id)) || "Usuario no disponible")}</td>
                    <td>${escapeHtml(m.motivo || "Sin motivo")}</td>
                </tr>
            `;
        }).join("");
    }

    async function obtenerUsuariosMovimientos(ids) {
        if (!ids.length || !window.supabaseClient?.from) return [];

        // Intentamos primero perfiles. Si el proyecto usa otra estructura,
        // devolvemos los IDs y no rompemos el historial.
        const { data, error } = await window.supabaseClient
            .from("perfiles")
            .select("id, nombre, apellido, email")
            .in("id", ids);

        if (error || !Array.isArray(data)) {
            console.warn(
                "SNIC'ELECTRIC - No se pudieron resolver usuarios del historial:",
                error
            );
            return ids.map(id => ({ id, nombreCompleto: id }));
        }

        return data.map(u => ({
            ...u,
            nombreCompleto: [u.nombre, u.apellido]
                .filter(Boolean)
                .join(" ") || u.email || String(u.id)
        }));
    }

    function limpiarFiltrosMovimientos() {
        const ids = [
            "buscarMovimiento",
            "filtroMovimientoTipo",
            "filtroMovimientoDesde",
            "filtroMovimientoHasta"
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });

        renderizarHistorialMovimientos();
    }


    function abrirMovimientoModal(id) {
        const p = productos.find(x => x.id === id); if (!p) return;
        document.getElementById("movimientoProductoId").value = id; document.getElementById("movimientoProductoNombre").value = `${p.codigo} · ${p.nombre}`; document.getElementById("cantidadMovimiento").value = ""; document.getElementById("motivoMovimiento").value = ""; document.getElementById("tipoMovimiento").value = "entrada";
        abrirModal(document.getElementById("movimientoModal"));
    }

    async function registrarMovimientoEnSupabase(
    producto,
    tipo,
    cantidad,
    motivo
) {
    if (!window.supabaseClient?.rpc) {
        throw new Error(
            "supabaseClient no está disponible."
        );
    }

    const { data, error } =
        await window.supabaseClient.rpc(
            "registrar_movimiento_inventario",
            {
                p_producto_id: producto.id,
                p_tipo: tipo,
                p_cantidad: Number(cantidad),
                p_motivo: motivo || null
            }
        );

    if (error) {
        throw error;
    }

    return data;
}

    async function registrarMovimiento(e) {
    e.preventDefault();

    // =====================================================
    // 1. VALIDAR PERMISO REAL
    // =====================================================

    if (
        !window.SNICAuth.tienePermiso(
            "inventario.movimientos"
        )
    ) {
        mostrarToast(
            "No tienes permiso para registrar movimientos.",
            "error"
        );
        return;
    }


    // =====================================================
    // 2. OBTENER DATOS DEL FORMULARIO
    // =====================================================

    const id =
        document.getElementById(
            "movimientoProductoId"
        )?.value;

    const producto =
        productos.find(
            p => String(p.id) === String(id)
        );

    const tipo =
        document.getElementById(
            "tipoMovimiento"
        )?.value;

    const cantidad =
        Number(
            document.getElementById(
                "cantidadMovimiento"
            )?.value
        );

    const motivo =
        limpiar(
            document.getElementById(
                "motivoMovimiento"
            )?.value
        );


    // =====================================================
    // 3. VALIDACIONES DEL FRONTEND
    // =====================================================

    if (!producto) {
        mostrarToast(
            "No se encontró el producto.",
            "error"
        );
        return;
    }

    if (
        ![
            "entrada",
            "salida",
            "ajuste"
        ].includes(tipo)
    ) {
        mostrarToast(
            "Selecciona un tipo de movimiento válido.",
            "error"
        );
        return;
    }

    if (
        !Number.isFinite(cantidad) ||
        cantidad <= 0
    ) {
        mostrarToast(
            "Indica una cantidad válida.",
            "error"
        );
        return;
    }


    // =====================================================
    // 4. MOTIVO OBLIGATORIO
    // =====================================================

    if (!motivo) {
        mostrarToast(
            tipo === "entrada"
                ? "Indica el motivo de la entrada."
                : tipo === "salida"
                    ? "Indica el motivo de la salida."
                    : "Indica el motivo del ajuste.",
            "error"
        );
        return;
    }


    // =====================================================
    // 5. VALIDACIÓN VISUAL DE SALIDA
    // =====================================================

    const stockActual =
        Number(producto.stock) || 0;

    if (
        tipo === "salida" &&
        cantidad > stockActual
    ) {
        mostrarToast(
            "La salida no puede superar la existencia disponible.",
            "error"
        );
        return;
    }


    // =====================================================
    // 6. AJUSTE
    //
    // La cantidad representa el stock final.
    // =====================================================

    if (
        tipo === "ajuste" &&
        cantidad < 0
    ) {
        mostrarToast(
            "El ajuste no puede ser negativo.",
            "error"
        );
        return;
    }


    // =====================================================
    // 7. BLOQUEAR BOTÓN
    // =====================================================

    const btn =
        document.querySelector(
            "#movimientoForm button[type='submit']"
        );

    const textoOriginal =
        btn?.innerHTML;

    if (btn) {
        btn.disabled = true;

        btn.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
    }


    // =====================================================
    // 8. REGISTRAR EN SUPABASE
    // =====================================================

    try {

        const resultado =
            await registrarMovimientoEnSupabase(
                producto,
                tipo,
                cantidad,
                motivo
            );


        // =================================================
        // 9. VOLVER A LEER EL STOCK REAL
        // =================================================

        await cargarProductos();


        // =================================================
        // 10. ACTUALIZAR INTERFAZ
        // =================================================

        cerrarMovimientoModal();

        renderizarProductos();

        actualizarEstadisticas();

        await renderizarHistorialMovimientos();


        // =================================================
        // 11. MENSAJE
        // =================================================

        mostrarToast(
            tipo === "entrada"
                ? "Entrada registrada correctamente."
                : tipo === "salida"
                    ? "Salida registrada correctamente."
                    : "Ajuste registrado correctamente."
        );


        console.log(
            "SNIC'ELECTRIC - Movimiento registrado en Supabase:",
            resultado
        );

    } catch (error) {

        console.error(
            "SNIC'ELECTRIC - Error registrando movimiento:",
            error
        );


        if (error?.code === "42501") {

            mostrarToast(
                "Supabase rechazó el movimiento por permisos RLS.",
                "error"
            );

        } else if (error?.code === "P0001") {

            mostrarToast(
                error.message ||
                "No es posible realizar este movimiento.",
                "error"
            );

        } else {

            mostrarToast(
                error?.message ||
                "No fue posible registrar el movimiento.",
                "error"
            );
        }

    } finally {

        if (btn) {

            btn.disabled = false;

            btn.innerHTML =
                textoOriginal ||
                '<i class="fa-solid fa-floppy-disk"></i> Guardar movimiento';
        }
    }
}

    function abrirCategoriasModal() { renderizarCategoriasLista(); abrirModal(document.getElementById("categoriasModal")); }
    function cerrarCategoriasModal() { cerrarModal(document.getElementById("categoriasModal")); }
    function renderizarCategoriasLista() {
        const cont = document.getElementById("categoriasLista");
        cont.innerHTML = categorias.filter(c => c.activa !== false).map(c => `<div class="category-row"><div><strong>${escapeHtml(c.nombre)}</strong><small>${escapeHtml(prefijoCategoria(c))} · ${productos.filter(p => p.categoriaId === c.id).length} producto(s)</small></div><button type="button" title="Desactivar" data-categoria-id="${escapeAttr(c.id)}"><i class="fa-solid fa-trash"></i></button></div>`).join("") || '<p class="category-empty">No hay categorías.</p>';
        cont.querySelectorAll("[data-categoria-id]").forEach(btn => btn.addEventListener("click", () => desactivarCategoria(btn.dataset.categoriaId)));
    }

    async function crearCategoria() {
        if (!window.SNICAuth.tienePermiso(window.SNICAuth.PERMISOS.INVENTARIO_CREAR)) { mostrarToast("No tienes permiso para crear categorías.", "error"); return; }
        const input=document.getElementById("nuevaCategoria"); const prefijoInput=document.getElementById("nuevoPrefijoCategoria"); const nombre=limpiar(input?.value); const prefijo=normalizarPrefijo(prefijoInput?.value,nombre);
        if(!nombre){mostrarToast("Escribe el nombre de la categoría.","error");return;}
        if(categorias.some(c=>c.nombre.toLowerCase()===nombre.toLowerCase()&&c.activa!==false)){mostrarToast("Esa categoría ya existe.","error");return;}
        if(categorias.some(c=>String(c.prefijo||"").toUpperCase()===prefijo&&c.activa!==false)){mostrarToast("Ese prefijo ya está utilizado por otra categoría.","error");return;}
        try {
            const {data,error}=await window.supabaseClient.from("categorias_inventario").insert({nombre,prefijo,activa:true}).select("id,nombre,prefijo,activa,created_at").single();
            if(error) throw error;
            categorias.push({id:data.id,nombre:data.nombre,prefijo:data.prefijo,activa:data.activa!==false,created_at:data.created_at});
            input.value=""; if(prefijoInput) prefijoInput.value=""; renderizarCategoriasLista(); renderizarCategoriasSelect(); actualizarEstadisticas(); mostrarToast("Categoría creada correctamente.");
        } catch(error) {
            console.error("SNIC'ELECTRIC - Error creando categoría:",error);
            if(error?.code==="23505") mostrarToast("El nombre o prefijo de la categoría ya existe.","error");
            else if(error?.code==="42501") mostrarToast("Supabase rechazó la creación por permisos RLS.","error");
            else mostrarToast(error?.message||"No fue posible crear la categoría.","error");
        }
    }

    async function desactivarCategoria(id) {
        if(!window.SNICAuth.tienePermiso(window.SNICAuth.PERMISOS.INVENTARIO_EDITAR)){mostrarToast("No tienes permiso para desactivar categorías.","error");return;}
        const usada=productos.some(p=>String(p.categoriaId)===String(id)); if(usada){mostrarToast("No se puede desactivar una categoría que tiene productos.","error");return;}
        const categoria=categorias.find(c=>String(c.id)===String(id)); if(!categoria)return;
        try {
            const {error}=await window.supabaseClient.from("categorias_inventario").update({activa:false}).eq("id",id);
            if(error) throw error;
            categoria.activa=false; categorias=categorias.filter(c=>c.activa!==false); renderizarCategoriasLista(); renderizarCategoriasSelect(); actualizarEstadisticas(); mostrarToast("Categoría desactivada correctamente.");
        } catch(error) {
            console.error("SNIC'ELECTRIC - Error desactivando categoría:",error);
            if(error?.code==="42501") mostrarToast("Supabase rechazó la operación por permisos RLS.","error"); else mostrarToast(error?.message||"No fue posible desactivar la categoría.","error");
        }
    }

    function abrirModal(modal) { if (!modal) return; modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); document.body.classList.add("modal-open"); }
    function cerrarModal(modal) { if (!modal) return; modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); if (!document.querySelector(".modal-overlay.open")) document.body.classList.remove("modal-open"); }
    function cerrarProductoModal() { cerrarModal(document.getElementById("productoModal")); productoEditando = null; }
    function cerrarDetalleModal() { cerrarModal(document.getElementById("detalleModal")); }
    function cerrarMovimientoModal() { cerrarModal(document.getElementById("movimientoModal")); }
    function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
    function numero(id) { return Number(document.getElementById(id).value) || 0; }
    function limpiar(v) { return String(v || "").trim(); }
    function capitalizar(v) { return String(v || "").charAt(0).toUpperCase() + String(v || "").slice(1); }
    function formatearNumero(v) { return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(Number(v) || 0); }
    function formatearMoneda(v) { return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(v) || 0); }
    function formatearFecha(v) { try { return new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)); } catch { return ""; } }
    function generarId() { return `inv-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }
    function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c])); }
    function escapeAttr(value) { return escapeHtml(value); }
    function mostrarToast(mensaje, tipo = "success") { const toast = document.getElementById("toast"); const icon = document.getElementById("toastIcon"); const message = document.getElementById("toastMessage"); if (!toast) return; toast.classList.toggle("error", tipo === "error"); icon.className = tipo === "error" ? "fa-solid fa-circle-exclamation" : "fa-solid fa-circle-check"; message.textContent = mensaje; toast.classList.add("show"); clearTimeout(window.__snicToast); window.__snicToast = setTimeout(() => toast.classList.remove("show"), 3200); }

    window.SNICInventario = {
        obtenerProductos: () => [...productos],
        obtenerCategorias: () => [...categorias],
        obtenerMovimientos: obtenerHistorialMovimientos
    };
})();
