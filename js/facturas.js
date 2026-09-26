(function () {
    "use strict";

    let facturas = [];
    let clientes = [];
    let productos = [];
    let cotizaciones = [];
    let cotizacionDetalles = [];
    let inspecciones = [];
    let informesObra = [];
    let usuarios = [];
    let items = [];
    let editando = null;

    document.addEventListener("DOMContentLoaded", init);

    async function init() {
        if (!window.SNICAuth) {
            location.href = "../login.html";
            return;
        }

        if (!window.SNICAuth.protegerPagina(SNICAuth.PERMISOS.FACTURAS_VER)) {
            return;
        }

        await cargar();
        configurar();
        mostrarUsuario();
        llenarClientes();
        llenarCotizaciones();
        llenarInspecciones();
        llenarProductos();
        llenarInformesObra();
        render();
        actualizarStats();
        SNICAuth.aplicarPermisos();

        const params = new URLSearchParams(location.search);
        if (params.get("cotizacion")) {
            abrir(null, params.get("cotizacion"));
        }
    }

    // Helpers para formatear identificadores
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

    function formatearCodigoInformeObra(val) {
        if (!val) return "";
        const strVal = String(val).trim();
        if (strVal.startsWith("IT-")) return strVal;
        const num = Number(strVal);
        if (!isNaN(num) && num > 0) {
            return `IT-${String(num).padStart(5, "0")}`;
        }
        return strVal;
    }

    // Helpers de simulación Facturación Electrónica DIAN
    window.generarCUFE = function(factura) {
        if (factura.cufe) return factura.cufe;
        const semilla = `${factura.id}-${factura.clienteDocumento}-${factura.total}-${factura.fechaEmision}-SNICELECTRIC`;
        let hash = "";
        for (let i = 0; i < semilla.length; i++) {
            hash += semilla.charCodeAt(i).toString(16);
        }
        while (hash.length < 64) {
            hash += Math.floor(Math.random() * 16).toString(16);
        }
        return hash.substring(0, 64);
    };

    window.generarFirmaDigital = function(factura, cufe) {
        return `SignedBy: SNIC'ELECTRIC S.A.S. | Cert: 2026-DIAN-AUT-${cufe.substring(0, 8).toUpperCase()} | KeyID: ${cufe.substring(56)}`;
    };

    window.descargarXMLFactura = function(f, cufe) {
        const xmlContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
    <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
    <cbc:CustomizationID>10</cbc:CustomizationID>
    <cbc:ProfileExecutionID>1</cbc:ProfileExecutionID>
    <cbc:ID>${f.id}</cbc:ID>
    <cbc:UUID schemeName="CUFE-SHA384">${cufe}</cbc:UUID>
    <cbc:IssueDate>${f.fechaEmision}</cbc:IssueDate>
    <cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>
    <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
    
    <cac:AccountingSupplierParty>
        <cac:Party>
            <cac:PartyTaxScheme>
                <cbc:RegistrationName>SNIC'ELECTRIC S.A.S.</cbc:RegistrationName>
                <cbc:CompanyID schemeID="1">1090415317</cbc:CompanyID>
            </cac:PartyTaxScheme>
        </cac:Party>
    </cac:AccountingSupplierParty>

    <cac:AccountingCustomerParty>
        <cac:Party>
            <cac:PartyTaxScheme>
                <cbc:RegistrationName>${f.clienteNombre}</cbc:RegistrationName>
                <cbc:CompanyID>${f.clienteDocumento || '222222222222'}</cbc:CompanyID>
            </cac:PartyTaxScheme>
        </cac:Party>
    </cac:AccountingCustomerParty>

    <cac:TaxTotal>
        <cbc:TaxAmount currencyID="COP">${f.iva}</cbc:TaxAmount>
    </cac:TaxTotal>

    <cac:LegalMonetaryTotal>
        <cbc:LineExtensionAmount currencyID="COP">${f.subtotal}</cbc:LineExtensionAmount>
        <cbc:TaxInclusiveAmount currencyID="COP">${f.total}</cbc:TaxInclusiveAmount>
        <cbc:PayableAmount currencyID="COP">${f.total}</cbc:PayableAmount>
    </cac:LegalMonetaryTotal>

    <ext:UBLExtensions>
        <ext:UBLExtension>
            <ext:ExtensionContent>
                <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
                    <ds:DigestValue>${cufe.substring(0, 28)}=</ds:DigestValue>
                </ds:Signature>
            </ext:ExtensionContent>
        </ext:UBLExtension>
    </ext:UBLExtensions>
</Invoice>`;

        const blob = new Blob([xmlContent], { type: "application/xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Factura_${f.id}_${f.clienteDocumento || 'cliente'}.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    async function cargar() {
        try {
            if (!window.supabaseClient?.from) {
                throw new Error("Supabase no está disponible.");
            }

            // 1. Cargar Usuarios
            const { data: usuariosData, error: usuariosError } = await window.supabaseClient
                .from("perfiles")
                .select("*");
            usuarios = usuariosError ? [] : (usuariosData || []);

            const usuariosMap = new Map(
                usuarios.map(u => [
                    String(u.id),
                    [u.nombre, u.apellido].filter(Boolean).join(" ") || u.nombreCompleto || u.nombre || u.email || "Usuario"
                ])
            );

            // 2. Cargar Clientes
            const { data: clientesData, error: clientesError } = await window.supabaseClient
                .from("clientes")
                .select("*")
                .order("created_at", { ascending: false });

            if (clientesError) throw clientesError;
            clientes = (clientesData || []).map(c => ({
                ...c,
                documentoNumero: c.documentoNumero || c.documento || c.documento_numero || c.nit || "",
                activo: c.activo !== false
            }));

            // 3. Cargar Productos
            const { data: productosData, error: productosError } = await window.supabaseClient
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
            const { data: inspeccionesData } = await window.supabaseClient
                .from("inspecciones")
                .select("*");
            inspecciones = (inspeccionesData || []).map(i => ({
                ...i,
                codigoFormateado: formatearCodigoInspeccion(i.numero || i.codigo || i.id)
            }));

            // 5. Cargar Informes de Obra
            const { data: informesData } = await window.supabaseClient
                .from("informes_obra")
                .select("*")
                .order("created_at", { ascending: false });

            informesObra = (informesData || []).map(inf => ({
                ...inf,
                codigoFormateado: formatearCodigoInformeObra(inf.numero || inf.id)
            }));

            // 6. Cargar Cotizaciones y sus detalles directos
            const { data: cotizacionesData, error: cotizacionError } = await window.supabaseClient
                .from("cotizaciones")
                .select("*");
            if (cotizacionError) throw cotizacionError;

            try {
                const { data: detData } = await window.supabaseClient.from("cotizacion_detalles").select("*");
                cotizacionDetalles = detData || [];
            } catch (e) {
                console.warn("No se encontraron detalles directos de cotizaciones.");
                cotizacionDetalles = [];
            }

            const detallesPorCotizacion = {};
            cotizacionDetalles.forEach(d => {
                const cid = String(d.cotizacion_id);
                if (!detallesPorCotizacion[cid]) detallesPorCotizacion[cid] = [];
                detallesPorCotizacion[cid].push(d);
            });

            cotizaciones = (cotizacionesData || []).map(c => ({
                ...c,
                clienteId: c.cliente_id || c.clienteId,
                detalles: detallesPorCotizacion[String(c.id)] || []
            }));

            // Maps de referencia
            const clientesMap = new Map(clientes.map(c => [String(c.id), c]));
            const productosMap = new Map(productos.map(p => [String(p.id), p]));
            const cotizacionesMap = new Map(cotizaciones.map(c => [String(c.id), c]));
            const inspeccionesMap = new Map(inspecciones.map(i => [String(i.id), i]));
            const informesObraMap = new Map(informesObra.map(inf => [String(inf.id), inf]));

            // 7. Cargar Facturas
            const { data: facturasData, error: facturasError } = await window.supabaseClient
                .from("facturas")
                .select("*")
                .order("created_at", { ascending: false });

            if (facturasError) throw facturasError;

            const facturaIds = (facturasData || []).map(f => f.id);
            let detallesData = [];

            if (facturaIds.length) {
                const { data, error } = await window.supabaseClient
                    .from("factura_detalles")
                    .select("*")
                    .in("factura_id", facturaIds);

                if (error) throw error;
                detallesData = data || [];
            }

            const detallesPorFactura = {};
            detallesData.forEach(detalle => {
                const id = String(detalle.factura_id);
                if (!detallesPorFactura[id]) detallesPorFactura[id] = [];
                detallesPorFactura[id].push(detalle);
            });

            facturas = (facturasData || []).map(factura => {
                const cliente = clientesMap.get(String(factura.cliente_id));
                const docCliente = cliente ? (cliente.documentoNumero || cliente.numero_documento || cliente.documento || cliente.nit || "") : "";
                const detalles = detallesPorFactura[String(factura.id)] || [];

                const cotizacionObj = factura.cotizacion_id ? cotizacionesMap.get(String(factura.cotizacion_id)) : null;
                const cotizacionCodigo = cotizacionObj ? (cotizacionObj.numero || cotizacionObj.codigo || cotizacionObj.id) : null;

                const inspeccionObj = factura.inspeccion_id ? inspeccionesMap.get(String(factura.inspeccion_id)) : null;
                const inspeccionCodigo = inspeccionObj ? inspeccionObj.codigoFormateado : null;

                const informeObraObj = factura.informe_obra_id ? informesObraMap.get(String(factura.informe_obra_id)) : null;
                const informeObraCodigo = informeObraObj ? informeObraObj.codigoFormateado : null;

                const tecnicoNombre = factura.creado_por
                    ? (usuariosMap.get(String(factura.creado_por)) || "SNIC'ELECTRIC")
                    : "SNIC'ELECTRIC";

                const itemsFactura = detalles.map(detalle => {
                    const producto = detalle.producto_id ? productosMap.get(String(detalle.producto_id)) : null;

                    return {
                        id: detalle.id,
                        tipo: detalle.tipo || (producto ? "producto" : "libre"),
                        productoId: detalle.producto_id || null,
                        codigo: detalle.codigo || producto?.codigo || "",
                        descripcion: detalle.descripcion || producto?.nombre || "Sin descripción",
                        unidad: detalle.unidad || producto?.unidad || "unidad",
                        cantidad: Number(detalle.cantidad) || 0,
                        precio: Number(detalle.precio ?? producto?.precioVenta ?? 0),
                        descuento: Number(detalle.descuento) || 0,
                        subtotal: Number(detalle.subtotal) || 0,
                        tipoIva: detalle.tipo_iva || "general",
                        ivaPorcentaje: Number(detalle.iva_porcentaje) || 19,
                        iva: Number(detalle.iva) || 0
                    };
                });

                return {
                    id: factura.numero,
                    supabaseId: factura.id,
                    clienteId: factura.cliente_id,
                    clienteNombre: cliente ? nombreCliente(cliente) : "Sin cliente",
                    clienteDocumento: docCliente,
                    cotizacionId: factura.cotizacion_id || null,
                    cotizacionCodigo: cotizacionCodigo,
                    inspeccionId: factura.inspeccion_id || null,
                    inspeccionCodigo: inspeccionCodigo,
                    informeObraId: factura.informe_obra_id || null,
                    informeObraCodigo: informeObraCodigo,
                    fechaEmision: factura.fecha_emision,
                    fechaVencimiento: factura.fecha_vencimiento,
                    formaPago: factura.forma_pago || "Transferencia bancaria",
                    referenciaPago: factura.referencia_pago || "",
                    observaciones: factura.observaciones || "",
                    items: itemsFactura,
                    subtotal: Number(factura.subtotal) || 0,
                    descuento: Number(factura.descuento) || 0,
                    descuento_global: Number(factura.descuento_global) || 0,
                    base: Number(factura.base) || 0,
                    iva: Number(factura.iva) || 0,
                    total: Number(factura.total) || 0,
                    estado: normalizarEstado(factura.estado),
                    creadoPor: tecnicoNombre,
                    created_at: factura.created_at,
                    updated_at: factura.updated_at
                };
            });

        } catch (error) {
            console.error("SNIC'ELECTRIC - Error cargando datos desde Supabase:", error);
            facturas = [];
            toast(error?.message || "No fue posible cargar la información.", "error");
        }
    }

    function configurar() {
        by("btnNuevaFactura")?.addEventListener("click", () => abrir());
        by("btnCerrarModal")?.addEventListener("click", cerrarModal);
        by("btnCancelar")?.addEventListener("click", cerrarModal);

        by("facturaForm")?.addEventListener("submit", guardarFactura);

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

        by("cotizacionFactura")?.addEventListener("change", e => cargarDatosDesdeCotizacion(e.target.value));

        by("descuentoFactura")?.addEventListener("input", calcular);
        by("ivaFactura")?.addEventListener("input", calcular);

        by("buscarFactura")?.addEventListener("input", render);
        by("filtroEstado")?.addEventListener("change", render);
        by("filtroFecha")?.addEventListener("change", render);

        by("btnCerrarDetalle")?.addEventListener("click", cerrarDetalle);
        by("btnCerrarEstado")?.addEventListener("click", cerrarEstado);
        by("btnCancelarEstado")?.addEventListener("click", cerrarEstado);
        by("btnGuardarEstado")?.addEventListener("click", guardarEstado);

        document.querySelectorAll("[data-menu-toggle]").forEach(b => b.addEventListener("click", () => by("sidebar")?.classList.toggle("open")));
        document.querySelectorAll("[data-logout]").forEach(b => b.addEventListener("click", () => SNICAuth.cerrarSesion()));

        ["facturaModal", "detalleModal", "estadoModal"].forEach(id => {
            by(id)?.addEventListener("click", e => { if (e.target.id === id) cerrarPorId(id); });
        });

        document.addEventListener("keydown", e => {
            if (e.key === "Escape") { cerrarModal(); cerrarDetalle(); cerrarEstado(); }
        });
    }

    function mostrarUsuario() {
        const u = SNICAuth.obtenerUsuarioActual();
        if (!u) return;

        document.querySelectorAll("[data-user-name]").forEach(e => e.textContent = u.nombre || u.email || "Usuario");
        document.querySelectorAll("[data-user-role]").forEach(e => e.textContent = cap(u.rol || "Usuario"));
    }

    function llenarClientes() {
        const s = by("clienteFactura");
        if (!s) return;

        s.innerHTML = '<option value="">Seleccionar cliente...</option>' +
            clientes.filter(c => c.activo !== false).map(c => `
                <option value="${esc(c.id)}">
                    ${esc(nombreCliente(c))}${c.documentoNumero ? ` · ${esc(c.documentoNumero)}` : ""}
                </option>
            `).join("");
    }

    function llenarInspecciones() {
        const s = by("inspeccionFactura");
        if (!s) return;

        s.innerHTML = '<option value="">Seleccionar inspección...</option>' +
            inspecciones.map(i => `
                <option value="${esc(i.id)}">
                    ${esc(i.codigoFormateado)}
                </option>
            `).join("");
    }

    function llenarCotizaciones() {
        const s = by("cotizacionFactura");
        if (!s) return;

        s.innerHTML = '<option value="">Seleccionar cotización...</option>' +
            cotizaciones.map(o => `
                <option value="${esc(o.id)}">
                    ${esc(o.numero || o.codigo || o.id)}
                </option>
            `).join("");
    }

    function llenarProductos() {
        const s = by("productoSelector");
        if (!s) return;

        s.innerHTML = '<option value="">Agregar producto o servicio del inventario...</option>' +
            productos.filter(p => p.estado !== "inactivo").map(p => `
                <option value="${esc(p.id)}">
                    ${esc(p.codigo)} · ${esc(p.nombre)} · ${money(p.precioVenta)}
                </option>
            `).join("");
    }

    function llenarInformesObra() {
        const s = by("informeObraFactura") || by("informeFactura");
        if (!s) return;

        s.innerHTML = '<option value="">Seleccionar informe de obra...</option>' +
            informesObra.map(inf => `
                <option value="${esc(inf.id)}">
                    ${esc(inf.codigoFormateado)}${inf.fecha ? ` · ${esc(fecha(inf.fecha))}` : ""}
                </option>
            `).join("");
    }

    function cargarDatosDesdeCotizacion(cotizacionId) {
        if (!cotizacionId) return;

        const cot = cotizaciones.find(c => String(c.id) === String(cotizacionId));
        if (!cot) return;

        const clienteId = cot.cliente_id || cot.clienteId;
        if (clienteId && by("clienteFactura")) {
            by("clienteFactura").value = clienteId;
        }

        if (cot.observaciones || cot.notas) {
            by("observacionesFactura").value = cot.observaciones || cot.notas || "";
        }

        const detalles = cotizacionDetalles.filter(cd => String(cd.cotizacion_id) === String(cotizacionId));

        if (detalles.length > 0) {
            items = detalles.map(d => {
                const prodId = d.producto_id || d.productoId || null;
                const prod = prodId ? productos.find(p => String(p.id) === String(prodId)) : null;

                return {
                    tipo: d.tipo || (prod ? "producto" : "libre"),
                    productoId: prodId,
                    codigo: d.codigo || prod?.codigo || "",
                    descripcion: d.descripcion || d.nombre || prod?.nombre || "Concepto de Cotización",
                    unidad: d.unidad || prod?.unidad || "unidad",
                    cantidad: Number(d.cantidad) || 1,
                    precio: Number(d.precio ?? d.precio_unitario ?? prod?.precioVenta ?? 0),
                    descuento: Number(d.descuento) || 0
                };
            });
        }

        renderItems();
        calcular();
    }

    function abrir(id = null, cotizacionId = "") {
        editando = id ? facturas.find(x => String(x.id) === String(id) || String(x.supabaseId) === String(id)) : null;

        if (editando && editando.estado === "anulada") {
            toast(`La factura ${editando.id} está anulada y no puede modificarse.`, "error");
            return;
        }

        items = editando ? JSON.parse(JSON.stringify(editando.items || [])) : [];

        by("modalTitulo").textContent = editando ? `Editar ${editando.id}` : "Nueva factura";
        by("facturaId").value = editando?.id || "";
        by("fechaFactura").value = editando?.fechaEmision ? editando.fechaEmision.slice(0, 10) : new Date().toISOString().slice(0, 10);

        if (by("clienteFactura")) by("clienteFactura").value = editando?.clienteId || "";

        const targetCotizacionId = editando?.cotizacionId || cotizacionId || "";
        if (by("cotizacionFactura")) by("cotizacionFactura").value = targetCotizacionId;

        const selectInforme = by("informeObraFactura") || by("informeFactura");
        if (selectInforme) selectInforme.value = editando?.informeObraId || "";

        if (by("estadoFactura")) by("estadoFactura").value = editando?.estado || "borrador";
        if (by("formaPago")) by("formaPago").value = editando?.formaPago || "Transferencia bancaria";
        if (by("referenciaPago")) by("referenciaPago").value = editando?.referenciaPago || "";
        if (by("observacionesFactura")) by("observacionesFactura").value = editando?.observaciones || "";

        if (by("descuentoFactura")) {
            let pctGlobal = 0;
            if (editando) {
                const subtotalBruto = items.reduce((s, x) => s + ((Number(x.cantidad) || 0) * (Number(x.precio) || 0)), 0);
                const descItems = items.reduce((s, x) => s + (Number(x.descuento) || 0), 0);
                const subtotalNeto = Math.max(0, subtotalBruto - descItems);
                const descGlobalGuardado = Number(editando.descuento_global) || 0;
                if (descGlobalGuardado > 0 && subtotalNeto > 0) {
                    pctGlobal = (descGlobalGuardado / subtotalNeto) * 100;
                }
            }
            by("descuentoFactura").value = pctGlobal > 0 ? Number(pctGlobal.toFixed(2)) : 0;
        }

        if (by("ivaFactura")) {
            by("ivaFactura").value = editando?.ivaPct ?? 19;
        }

        if (!editando && targetCotizacionId) {
            cargarDatosDesdeCotizacion(targetCotizacionId);
        } else {
            renderItems();
            calcular();
        }

        open("facturaModal");
    }

    function agregarProducto() {
        const id = by("productoSelector")?.value;
        if (!id) {
            toast("Selecciona un producto o servicio.", "error");
            return;
        }
        const p = productos.find(x => String(x.id) === String(id));
        if (!p) return;

        agregarItem({
            tipo: "producto",
            productoId: p.id,
            descripcion: p.nombre,
            unidad: p.unidad || "unidad",
            cantidad: 1,
            precio: Number(p.precioVenta) || 0,
            descuento: 0,
            codigo: p.codigo || ""
        });
        by("productoSelector").value = "";
    }

    function agregarItem(x) {
        items.push(x);
        renderItems();
        calcular();
    }

    function renderItems() {
        const tb = by("itemsFactura");
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
                    <input class="item-input item-number" type="number" min="0.01" step="0.01" data-item="cantidad" data-i="${i}" value="${esc(x.cantidad)}">
                </td>
                <td>
                    <input class="item-input" type="number" min="0" step="0.01" data-item="precio" data-i="${i}" value="${esc(x.precio)}">
                </td>
                <td>
                    <input class="item-input item-number" type="number" min="0" step="0.01" data-item="descuento" data-i="${i}" placeholder="0.00" value="${esc(x.descuento || 0)}">
                </td>
                <td class="item-total" id="total-item-${i}">${money(linea(x))}</td>
                <td>
                    <button type="button" class="remove-item" data-remove="${i}" title="Eliminar">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join("");

        if (empty) empty.hidden = items.length > 0;

        tb.querySelectorAll("[data-item]").forEach(el => {
            el.addEventListener("input", () => {
                const index = Number(el.dataset.i);
                const campo = el.dataset.item;
                if (items[index] === undefined) return;
                items[index][campo] = Number(el.value) || 0;

                const celdaTotal = by(`total-item-${index}`);
                if (celdaTotal) celdaTotal.textContent = money(linea(items[index]));
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
        const subtotalBruto = items.reduce((s, x) => s + ((Number(x.cantidad) || 0) * (Number(x.precio) || 0)), 0);
        const descuentoItemsMonetario = items.reduce((s, x) => s + (Number(x.descuento) || 0), 0);
        const subtotalConDescItems = Math.max(0, subtotalBruto - descuentoItemsMonetario);

        const inputDescGlobal = by("descuentoFactura");
        const pctGlobal = inputDescGlobal ? (parseFloat(inputDescGlobal.value) || 0) : 0;
        const descuentoGlobalMonetario = subtotalConDescItems * (pctGlobal / 100);

        const base = Math.max(0, subtotalConDescItems - descuentoGlobalMonetario);

        const inputIva = by("ivaFactura");
        const ivaP = inputIva ? (parseFloat(inputIva.value) || 0) : 0;
        const iv = base * (ivaP / 100);
        const total = base + iv;

        setText("subtotalFactura", money(subtotalBruto));
        setText("descuentoValor", money(descuentoItemsMonetario));
        setText("descuentoGlobalValor", money(descuentoGlobalMonetario));
        setText("baseFactura", money(base));
        setText("ivaValor", money(iv));
        setText("totalFactura", money(total));

        return {
            subtotal: Number(subtotalBruto.toFixed(2)),
            descuento: Number(descuentoItemsMonetario.toFixed(2)),
            descuento_global: Number(descuentoGlobalMonetario.toFixed(2)),
            base: Number(base.toFixed(2)),
            iva: Number(iv.toFixed(2)),
            total: Number(total.toFixed(2)),
            ivaPct: ivaP
        };
    }

    async function guardarFactura(e) {
        e.preventDefault();

        const id = by("facturaId")?.value || "";
        const clienteId = by("clienteFactura")?.value || "";

        if (!clienteId) {
            toast("Selecciona un cliente.", "error");
            return;
        }

        if (!items.length) {
            toast("Agrega al menos un concepto a la factura.", "error");
            return;
        }

        const existente = editando || facturas.find(c => String(c.id) === String(id));

        try {
            const calc = calcular();
            const usuario = SNICAuth.obtenerUsuarioActual?.() || {};
            const usuarioId = usuario.supabaseUserId || usuario.id || null;

            let numero = id;
            if (!existente && !numero) {
                numero = await generarCodigoFacturaSupabase();
            }

            const fechaEmision = by("fechaFactura")?.value || new Date().toISOString().slice(0, 10);
            const diasVenc = Number(by("vencimientoFactura")?.value) || 30;
            const fechaVencObj = new Date(fechaEmision);
            fechaVencObj.setDate(fechaVencObj.getDate() + diasVenc);

            const selectInforme = by("informeObraFactura") || by("informeFactura");

            const cabecera = {
                numero,
                cliente_id: clienteId,
                cotizacion_id: by("cotizacionFactura")?.value || null,
                inspeccion_id: by("inspeccionFactura")?.value || null,
                informe_obra_id: selectInforme?.value || null,
                fecha_emision: fechaEmision,
                fecha_vencimiento: fechaVencObj.toISOString().slice(0, 10),
                forma_pago: by("formaPago")?.value || "Transferencia bancaria",
                referencia_pago: by("referenciaPago")?.value || null,
                observaciones: by("observacionesFactura")?.value.trim() || null,
                subtotal: calc.subtotal,
                descuento: calc.descuento,
                descuento_global: calc.descuento_global,
                base: calc.base,
                iva: calc.iva,
                total: calc.total,
                estado: by("estadoFactura")?.value || "borrador",
                creado_por: existente?.creadoPor || usuarioId
            };

            if (existente) {
                await actualizarFacturaEnSupabase(cabecera, existente);
            } else {
                await guardarNuevaFacturaEnSupabase(cabecera, items);
            }

            await cargar();
            cerrarModal();
            render();
            actualizarStats();

            toast(existente ? "Factura actualizada correctamente." : `Factura ${numero} creada correctamente.`);
        } catch (error) {
            console.error("SNIC'ELECTRIC - Error guardando factura:", error);
            toast(error?.message || "No fue posible guardar la factura.", "error");
        }
    }

    async function guardarNuevaFacturaEnSupabase(obj, itemsNuevos) {
        const { data, error } = await window.supabaseClient
            .from("facturas")
            .insert(obj)
            .select("id, numero")
            .single();

        if (error) throw error;

        const detalles = construirDetalles(data.id, itemsNuevos);

        if (detalles.length) {
            const { error: detalleError } = await window.supabaseClient
                .from("factura_detalles")
                .insert(detalles);

            if (detalleError) {
                await window.supabaseClient.from("facturas").delete().eq("id", data.id);
                throw detalleError;
            }
        }
        return data.id;
    }

    async function actualizarFacturaEnSupabase(obj, existente) {
        const supabaseId = existente?.supabaseId;
        if (!supabaseId) throw new Error("La factura no posee UUID de Supabase.");

        const payloadCabecera = {
            cliente_id: obj.cliente_id,
            cotizacion_id: obj.cotizacion_id || null,
            inspeccion_id: obj.inspeccion_id || null,
            informe_obra_id: obj.informe_obra_id || null,
            fecha_emision: obj.fecha_emision,
            fecha_vencimiento: obj.fecha_vencimiento,
            forma_pago: obj.forma_pago,
            referencia_pago: obj.referencia_pago,
            observaciones: obj.observaciones,
            subtotal: obj.subtotal,
            descuento: obj.descuento,
            descuento_global: obj.descuento_global ?? 0,
            base: obj.base,
            iva: obj.iva,
            total: obj.total,
            estado: obj.estado,
            updated_at: new Date().toISOString()
        };

        const { error: errorCabecera } = await window.supabaseClient
            .from("facturas")
            .update(payloadCabecera)
            .eq("id", supabaseId);

        if (errorCabecera) throw errorCabecera;

        const { error: errorEliminar } = await window.supabaseClient
            .from("factura_detalles")
            .delete()
            .eq("factura_id", supabaseId);

        if (errorEliminar) throw errorEliminar;

        const detalles = construirDetalles(supabaseId, items);
        if (detalles.length) {
            const { error: errorInsertar } = await window.supabaseClient
                .from("factura_detalles")
                .insert(detalles);

            if (errorInsertar) throw errorInsertar;
        }
    }

    function construirDetalles(facturaId, listaItems) {
        const inputIva = by("ivaFactura");
        const ivaP = inputIva ? (parseFloat(inputIva.value) || 0) : 19;

        return (listaItems || []).map(item => {
            const subtotalLinea = Number(linea(item)) || 0;
            const ivaMonetario = subtotalLinea * (ivaP / 100);

            let tipoIva = "GRAVADO";
            if (item.tipoIva) {
                const valUpper = String(item.tipoIva).toUpperCase();
                if (valUpper === "EXENTO" || valUpper === "EXCLUIDO") {
                    tipoIva = valUpper;
                } else if (valUpper === "GENERAL") {
                    tipoIva = "GRAVADO";
                }
            }

            return {
                factura_id: facturaId,
                producto_id: item.productoId || null,
                codigo: item.codigo || null,
                descripcion: item.descripcion || "Concepto",
                unidad: item.unidad || "unidad",
                cantidad: Number(item.cantidad) || 1,
                precio: Number(item.precio) || 0,
                descuento: Number(item.descuento) || 0,
                subtotal: subtotalLinea,
                tipo: item.tipo || "producto",
                tipo_iva: tipoIva,
                iva_porcentaje: ivaP,
                iva: Number(ivaMonetario.toFixed(2))
            };
        });
    }

    async function generarCodigoFacturaSupabase() {
        if (!window.supabaseClient?.from) return "FV-0001";

        const { data, error } = await window.supabaseClient
            .from("facturas")
            .select("numero")
            .like("numero", "FV-%")
            .order("numero", { ascending: false })
            .limit(1);

        if (error) throw error;

        const ultimo = Number(String(data?.[0]?.numero || "").replace(/^FV-/, "")) || 0;
        return `FV-${String(ultimo + 1).padStart(4, "0")}`;
    }

    function render() {
        const tb = by("facturasTableBody");
        const empty = by("facturasEmpty");
        if (!tb) return;

        const q = (by("buscarFactura")?.value || "").toLowerCase();
        const estado = by("filtroEstado")?.value || "";

        const list = facturas.filter(x => {
            const text = [x.id, x.clienteNombre, x.clienteDocumento, x.cotizacionCodigo, x.informeObraCodigo].join(" ").toLowerCase();
            if (q && !text.includes(q)) return false;
            if (estado && normalizarEstado(x.estado) !== normalizarEstado(estado)) return false;
            return true;
        });

        tb.innerHTML = list.map(x => `
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
                <td>${esc(fecha(x.fechaEmision))}</td>
                <td>
                    ${x.cotizacionCodigo
                        ? `<span class="source-pill">${esc(x.cotizacionCodigo)}</span>`
                        : (x.informeObraCodigo 
                            ? `<span class="source-pill">${esc(x.informeObraCodigo)}</span>`
                            : `<span class="source-pill">Directa</span>`)}
                </td>
                <td class="amount">${money(x.total)}</td>
                <td>
                    <span class="status-pill status-${esc(x.estado)}">
                        ${esc(estadoTexto(x.estado))}
                    </span>
                </td>
                <td>
                    <div class="actions">
                        <button type="button" class="action-button ver-action" data-accion="ver" data-id="${esc(x.id)}" title="Ver">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button type="button" class="action-button editar-action" data-accion="editar" data-id="${esc(x.id)}" title="Editar">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button type="button" class="action-button estado-action" data-accion="estado" data-id="${esc(x.id)}" title="Cambiar estado">
                            <i class="fa-solid fa-arrows-rotate"></i>
                        </button>
                        <button type="button" class="action-button pdf-action" data-accion="pdf" data-id="${esc(x.id)}" title="Generar Representación Gráfica Electrónica">
                            <i class="fa-solid fa-file-pdf"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join("");

        if (empty) empty.hidden = list.length > 0;
        enlazarAccionesTabla(tb);
    }

    function enlazarAccionesTabla(tb) {
        tb.querySelectorAll("[data-accion]").forEach(btn => {
            btn.addEventListener("click", function (e) {
                e.preventDefault();
                const id = this.getAttribute("data-id");
                const accion = this.getAttribute("data-accion");
                const f = facturas.find(x => String(x.id) === String(id));

                if (!f) return;

                if (accion === "ver") detalle(f);
                else if (accion === "editar") abrir(f.id);
                else if (accion === "estado") abrirEstado(f);
                else if (accion === "pdf") imprimirFactura(f);
            });
        });
    }

    function actualizarStats() {
        setText("statTotal", facturas.length);
        setText("statPendientes", facturas.filter(x => x.estado === "emitida" || x.estado === "borrador").length);
        setText("statPagadas", facturas.filter(x => x.estado === "pagada").length);
        setText("statValor", money(
            facturas.filter(x => x.estado === "pagada" || x.estado === "emitida")
                .reduce((s, x) => s + Number(x.total || 0), 0)
        ));
    }

    function detalle(f) {
        setText("detalleTitulo", f.id);
        const cont = by("detalleContenido");
        if (!cont) return;

        const cliente = clientes.find(c => String(c.id) === String(f.clienteId));
        const docCliente = cliente
            ? (cliente.documentoNumero || cliente.numero_documento || cliente.documento || cliente.nit || "-")
            : (f.clienteDocumento || "-");

        const cufe = window.generarCUFE(f);

        cont.innerHTML = `
            <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:8px 12px; margin-bottom:12px; font-size:10px; word-break:break-all;">
                <strong style="color:#0b2f67; display:block; margin-bottom:2px;">CUFE (Simulado):</strong>
                <code>${esc(cufe)}</code>
            </div>
            <div class="detail-content">
                <div class="detail-header-grid">
                    <div class="detail-panel">
                        <h3>Cliente</h3>
                        <div class="detail-meta">
                            <div><span>Nombre</span><strong>${esc(f.clienteNombre)}</strong></div>
                            <div><span>Documento</span><strong>${esc(docCliente)}</strong></div>
                            <div><span>Fecha Emisión</span><strong>${esc(fecha(f.fechaEmision))}</strong></div>
                        </div>
                    </div>
                    <div class="detail-panel">
                        <h3>Estado</h3>
                        <span class="status-pill status-${esc(f.estado)}">${esc(estadoTexto(f.estado))}</span>
                        <div style="margin-top:10px">
                            <span style="font-size:9px;color:#8b96a5">Cotización Asociada</span>
                            <strong style="display:block;font-size:10px">${esc(f.cotizacionCodigo || "Sin origen")}</strong>
                        </div>
                    </div>
                </div>

                <div class="detail-panel">
                    <h3>Conceptos</h3>
                    <table class="detail-table">
                        <thead>
                            <tr>
                                <th>DESCRIPCIÓN</th><th>CANT.</th><th>PRECIO</th><th>DESC. ($)</th><th>TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${f.items.map(i => `
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
                        <div>Subtotal Bruto: <strong>${money(f.subtotal)}</strong></div>
                        <div>Descuento Ítems: <strong>${money(f.descuento)}</strong></div>
                        <div>Descuento Global: <strong>${money(f.descuento_global || 0)}</strong></div>
                        <div>Base Gravable: <strong>${money(f.base)}</strong></div>
                        <div>IVA: <strong>${money(f.iva)}</strong></div>
                        <div class="detail-total" style="margin-top:5px; font-size:14px;">Total: ${money(f.total)}</div>
                    </div>
                </div>
            </div>
        `;

        open("detalleModal");
    }

    function abrirEstado(f) {
        by("estadoFacturaId").value = f.id;
        by("nuevoEstado").value = normalizarEstado(f.estado);
        open("estadoModal");
    }

    async function guardarEstado() {
        const id = by("estadoFacturaId")?.value;
        const estado = normalizarEstado(by("nuevoEstado")?.value);
        const f = facturas.find(x => String(x.id) === String(id));

        if (!f) return;

        try {
            const { error } = await window.supabaseClient
                .from("facturas")
                .update({ estado, updated_at: new Date().toISOString() })
                .eq("id", f.supabaseId);

            if (error) throw error;

            f.estado = estado;
            cerrarEstado();
            render();
            actualizarStats();
            toast(`Estado de ${f.id} actualizado a ${estadoTexto(estado)}.`);
        } catch (error) {
            toast(error?.message || "No fue posible actualizar el estado.", "error");
        }
    }

    async function imprimirFactura(f) {
        const client = window.supabaseClient || window.supabase;

        let empresa = {};
        let detallesEmpresa = {};

        try {
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

        const nombreEmpresa = empresa.nombre || empresa.razon_social || detallesEmpresa.nombre || "SNIC'ELECTRIC S.A.S.";
        const nit = empresa.nit || empresa.identificacion || detallesEmpresa.nit || "1090.415.317-1";
        const regimen = empresa.regimen || detallesEmpresa.regimen || "Responsable de IVA";
        const slogan = empresa.eslogan || detallesEmpresa.eslogan || "Soluciones Eléctricas Seguras y Confiables";
        const direccion = empresa.direccion || detallesEmpresa.direccion || "";
        const telefono = empresa.telefono || detallesEmpresa.telefono || "";
        const celular = empresa.celular || detallesEmpresa.celular || "";
        const web = empresa.web || empresa.sitio_web || detallesEmpresa.sitio_web || detallesEmpresa.web || "";
        const piePagina = detallesEmpresa.pie_documento || detallesEmpresa.pie_de_pagina || empresa.pie_pagina || "Documento equivalente / Factura";

        const logoUrl = empresa.logo_url || detallesEmpresa.logo_url || new URL("../img/logo.png", window.location.href).href;

        const cufe = window.generarCUFE(f);
        const firmaDigital = window.generarFirmaDigital(f, cufe);

        // Estándar reducido para el QR (evita error length overflow 1588 > 1056)
        const qrData = `NumFac:${f.id}\nFecFac:${f.fechaEmision}\nNitFac:${nit}\nDocAdq:${f.clienteDocumento || ''}\nValFac:${f.base}\nValIva:${f.iva}\nValTot:${f.total}\nCUFE:${cufe}`;

        const w = window.open("", "_blank", "width=1000,height=850");

        if (!w) {
            toast("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.", "error");
            return;
        }

        const clienteObj = clientes.find(c => String(c.id) === String(f.clienteId));
        const cliente = clienteObj ? nombreCliente(clienteObj) : (f.clienteNombre || "Sin cliente");
        const documento = clienteObj 
            ? (clienteObj.documentoNumero || clienteObj.numero_documento || clienteObj.documento || clienteObj.nit || "No registrado")
            : (f.clienteDocumento || "No registrado");

        const itemsHtml = (f.items || []).map(i => {
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

        const inputIva = by("ivaFactura");
        const ivaPorcentaje = inputIva ? (parseFloat(inputIva.value) || 0) : (f.ivaPct ?? 19);

        const html = `
        <!doctype html>
        <html lang="es">
        <head>
        <meta charset="utf-8">
        <title>Factura Electrónica de Venta ${esc(f.id)}</title>
        <style>
        @page{size:A4;margin:12mm 12mm 14mm}
        *{box-sizing:border-box}
        body{margin:0;background:#fff;color:#17233a;font-family:Arial,Helvetica,sans-serif;font-size:10px}
        .sheet{max-width:190mm;margin:0 auto}
        .toolbar{display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px}
        .toolbar button{border:0;border-radius:6px;padding:8px 14px;font-weight:700;cursor:pointer}
        .print{background:#fbb900;color:#0b2f67}
        .xml-btn{background:#0b2f67;color:#fff}
        .close{background:#eef2f7;color:#0b2f67}
        .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0b2f67;padding-bottom:10px;margin-bottom:12px}
        .brand{display:flex;align-items:center;gap:12px}
        .brand img{width:70px;height:70px;object-fit:contain}
        .brand-info h1{margin:0;color:#0b2f67;font-size:18px}
        .brand-info .slogan{margin:2px 0;color:#fbb900;font-size:8px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
        .brand-info p{margin:1px 0;color:#556377;font-size:8.5px}
        .quote-head{text-align:right}
        .quote-head .label{font-size:9px;color:#0b2f67;font-weight:800;letter-spacing:1px}
        .quote-head h2{margin:2px 0;color:#d32f2f;font-size:18px}
        .quote-head p{margin:1px 0;color:#66748a;font-size:9px}

        .cufe-box{background:#f8fafc;border:1px solid #cbd5e1;border-radius:5px;padding:6px 8px;margin-bottom:12px;font-size:8px;word-break:break-all}
        .cufe-box strong{color:#0b2f67;display:block;margin-bottom:2px}

        .section-title{font-size:9px;color:#0b2f67;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px}
        .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;border:1px solid #dce3ed;border-radius:6px;padding:8px;margin-bottom:12px}
        .info-item span{display:block;color:#7a8798;font-size:8.5px}
        .info-item strong{color:#17233a;font-size:10px}

        table{width:100%;border-collapse:collapse}
        .items th{background:#0b2f67;color:#fff;text-align:left;font-size:8.5px;padding:6px 8px}
        .items td{border-bottom:1px solid #e4e9f0;padding:6px 8px;vertical-align:top;font-size:9.5px}
        .center{text-align:center}
        .right{text-align:right}
        .strong{font-weight:700}

        .bottom{display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:10px;margin-top:12px;align-items:start}
        .qr-container{border:1px solid #dce3ed;border-radius:6px;padding:8px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}
        #qrcode img{margin:0 auto}
        .signature-box{border:1px solid #dce3ed;border-radius:6px;padding:8px;font-size:8px;color:#556377}
        .signature-box strong{color:#0b2f67;display:block;margin-bottom:4px}

        .totals{border:1px solid #dce3ed;border-radius:6px;padding:8px}
        .totals-row{display:flex;justify-content:space-between;padding:3px 0;color:#34445b;font-size:9.5px}
        .total-final{display:flex;justify-content:space-between;border-top:1px solid #0b2f67;margin-top:5px;padding-top:6px;color:#0b2f67;font-size:11px}
        .total-final strong{font-size:15px;color:#d32f2f}

        .footer{margin-top:15px;padding-top:8px;border-top:1px solid #dce3ed;color:#7b8797;font-size:7.5px;display:flex;justify-content:space-between}

        @media print{
            .toolbar{display:none!important}
            .sheet{max-width:none}
        }
        </style>
        </head>
        <body>
        <div class="sheet">
            <div class="toolbar">
                <button class="xml-btn" id="btnXml">📄 Descargar XML</button>
                <button class="print" onclick="window.print()">🖨 Imprimir / PDF</button>
                <button class="close" onclick="window.close()">Cerrar</button>
            </div>

            <header class="header">
                <div class="brand">
                    <img src="${logoUrl}" alt="${esc(nombreEmpresa)}">
                    <div class="brand-info">
                        <h1>${esc(nombreEmpresa)}</h1>
                        ${slogan ? `<div class="slogan">${esc(slogan)}</div>` : ''}
                        <p>NIT: ${esc(nit)} · ${esc(regimen)}</p>
                        ${direccion ? `<p>Dirección: ${esc(direccion)}</p>` : ''}
                        <p>${telefono ? `Tel: ${esc(telefono)}` : ''} ${celular ? `· Móvil: ${esc(celular)}` : ''}</p>
                    </div>
                </div>
                <div class="quote-head">
                    <div class="label">FACTURA ELECTRÓNICA DE VENTA</div>
                    <h2>N° ${esc(f.id)}</h2>
                    <p>Fecha Emisión: ${esc(fecha(f.fechaEmision))}</p>
                    <p>Vencimiento: ${esc(fecha(f.fechaVencimiento))}</p>
                    <p>Forma de Pago: ${esc(f.formaPago)}</p>
                </div>
            </header>

            <div class="cufe-box">
                <strong>CUFE (Código Único de Factura Electrónica):</strong>
                <span>${cufe}</span>
            </div>

            <section>
                <div class="section-title">Adquirente / Cliente</div>
                <div class="info-grid">
                    <div class="info-item">
                        <span>Razón Social / Nombre:</span>
                        <strong>${esc(cliente)}</strong>
                    </div>
                    <div class="info-item">
                        <span>NIT / CC:</span>
                        <strong>${esc(documento)}</strong>
                    </div>
                    <div class="info-item">
                        <span>Origen Documento:</span>
                        <strong>${esc(f.cotizacionCodigo || f.informeObraCodigo || "Venta Directa")}</strong>
                    </div>
                    <div class="info-item">
                        <span>Estado Validación DIAN:</span>
                        <strong style="color:green;">✓ AUTORIZADO Y FIRMADO</strong>
                    </div>
                </div>
            </section>

            <section>
                <div class="section-title">Detalle de Bienes y Servicios</div>
                <table class="items">
                    <thead>
                        <tr>
                            <th>DESCRIPCIÓN</th>
                            <th style="width:8%" class="center">CANT.</th>
                            <th style="width:10%" class="center">UNIDAD</th>
                            <th style="width:15%" class="right">VALOR UNIT.</th>
                            <th style="width:12%" class="center">DESC.</th>
                            <th style="width:18%" class="right">TOTAL</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>
            </section>

            <div class="bottom">
                <div class="qr-container">
                    <div id="qrcode"></div>
                    <span style="font-size:7px;margin-top:4px;color:#7a8798;">Validación Electrónica DIAN</span>
                </div>

                <div class="signature-box">
                    <strong>Firma Digital / Certificado:</strong>
                    <p style="margin:0;word-break:break-all;">${firmaDigital}</p>
                    <p style="margin-top:6px;font-style:italic;">Proveedor Tecnológico: SIMULADOR DIAN UBL 2.1 - SNIC'ELECTRIC</p>
                </div>

                <div class="totals">
                    <div class="totals-row">
                        <span>Subtotal Bruto</span>
                        <strong>${money(f.subtotal)}</strong>
                    </div>
                    <div class="totals-row">
                        <span>Descuento</span>
                        <strong>${money((f.descuento || 0) + (f.descuento_global || 0))}</strong>
                    </div>
                    <div class="totals-row">
                        <span>Base Gravable</span>
                        <strong>${money(f.base)}</strong>
                    </div>
                    <div class="totals-row">
                        <span>IVA (${ivaPorcentaje}%)</span>
                        <strong>${money(f.iva)}</strong>
                    </div>
                    <div class="total-final">
                        <span>TOTAL</span>
                        <strong>${money(f.total)}</strong>
                    </div>
                </div>
            </div>

            <footer class="footer">
                <div>
                    <strong>${esc(nombreEmpresa)}</strong> · NIT: ${esc(nit)} · Factura Electrónica ${esc(f.id)}
                </div>
                <div>
                    ${esc(piePagina)} ${web ? `· ${esc(web)}` : ''}
                </div>
            </footer>
        </div>

        <script>
        function generarQR() {
            if (typeof QRCode !== 'undefined') {
                new QRCode(document.getElementById("qrcode"), {
                    text: ${JSON.stringify(qrData)},
                    width: 85,
                    height: 85,
                    correctLevel: QRCode.CorrectLevel.M
                });
            }
        }

        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
        script.onload = generarQR;
        document.head.appendChild(script);

        document.getElementById("btnXml").addEventListener("click", () => {
            window.opener.descargarXMLFactura(${JSON.stringify(f)}, "${cufe}");
        });
        </script>
        </body>
        </html>
        `;

        w.document.open();
        w.document.write(html);
        w.document.close();
    }

    function normalizarEstado(v) { return String(v || "").trim().toLowerCase(); }

    function estadoTexto(v) {
        return {
            borrador: "Borrador",
            emitida: "Emitida",
            pagada: "Pagada",
            anulada: "Anulada"
        }[normalizarEstado(v)] || v || "-";
    }

    function cerrarModal() { editando = null; close("facturaModal"); }
    function cerrarDetalle() { close("detalleModal"); }
    function cerrarEstado() { close("estadoModal"); }
    function cerrarPorId(id) { close(id); }

    function open(id) { by(id)?.classList.add("show"); document.body.classList.add("modal-open"); }
    function close(id) { by(id)?.classList.remove("show"); document.body.classList.remove("modal-open"); }

    function linea(x) {
        const bruto = (Number(x.cantidad) || 0) * (Number(x.precio) || 0);
        return Math.max(0, bruto - (Number(x.descuento) || 0));
    }

    function nombreCliente(c) {
        if (!c) return "Sin cliente";
        return [c.nombre, c.apellido].filter(Boolean).join(" ") || c.razonSocial || c.nombreCompleto || "Sin nombre";
    }

    function money(n) {
        return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(n) || 0);
    }

    function fecha(v) {
        if (!v) return "-";
        const p = String(v).split("T")[0].split("-");
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v;
    }

    function cap(v) { return String(v || "").charAt(0).toUpperCase() + String(v || "").slice(1); }
    function by(id) { return document.getElementById(id); }
    function setText(id, v) { const e = by(id); if (e) e.textContent = v; }
    function esc(v) { return String(v ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])); }

    function toast(msg, type = "success") {
        const b = by("toast"), i = by("toastIcon"), t = by("toastMessage");
        if (!b) return;
        t.textContent = msg;
        i.className = type === "error" ? "fa-solid fa-circle-exclamation" : "fa-solid fa-circle-check";
        b.classList.toggle("error", type === "error");
        b.classList.add("show");
        clearTimeout(window.__snicToast);
        window.__snicToast = setTimeout(() => b.classList.remove("show"), 3200);
    }
})();