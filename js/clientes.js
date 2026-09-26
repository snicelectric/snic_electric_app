/* =========================================================
   SNIC'ELECTRIC
   CLIENTES.JS
   MÓDULO CENTRAL DE CLIENTES
========================================================= */

(function () {

    "use strict";

    /* =====================================================
       SELECTORES
    ===================================================== */

    const SELECTORS = {
        form: "clienteForm",
        table: "clientesTableBody",
        empty: "clientesEmpty",
        search: "buscarCliente",
        filterType: "filtroTipo",
        filterStatus: "filtroEstado",
        modal: "clienteModal",
        detailModal: "detalleModal"
    };


    /* =====================================================
       ESTADO
    ===================================================== */

    let clientes = [];
    let clienteEditando = null;


    /* =====================================================
       INICIO
    ===================================================== */

    document.addEventListener("DOMContentLoaded", iniciarClientes);


    async function iniciarClientes() {

        /* -----------------------------------------------
           ESPERAR AUTH
        ------------------------------------------------ */
        if (window.SNICAuth && window.SNICAuth.ready) {
            await window.SNICAuth.ready;
        }

        /* -----------------------------------------------
           VERIFICAR AUTH
        ------------------------------------------------ */
        if (typeof window.SNICAuth === "undefined") {
            console.error("SNIC'ELECTRIC: auth.js no está cargado.");
            window.location.href = "../login.html";
            return;
        }

        /* -----------------------------------------------
           PROTECCIÓN DE PÁGINA
        ------------------------------------------------ */
        if (!window.SNICAuth.protegerPagina(window.SNICAuth.PERMISOS.CLIENTES_VER)) {
            return;
        }

        /* -----------------------------------------------
           CARGAR DATOS
        ------------------------------------------------ */
        await cargarClientes();

        /* -----------------------------------------------
           EVENTOS
        ------------------------------------------------ */
        configurarEventos();

        /* -----------------------------------------------
           USUARIO
        ------------------------------------------------ */
        mostrarUsuario();

        /* -----------------------------------------------
           RENDER
        ------------------------------------------------ */
        renderizarClientes();
        actualizarEstadisticas();

        console.log("SNIC'ELECTRIC - Clientes cargado correctamente.");
    }


    /* =====================================================
       SUPABASE
    ===================================================== */

    function obtenerSupabase() {
        if (!window.supabaseClient) {
            mostrarToast("No fue posible conectar con Supabase.", "error");
            return null;
        }
        return window.supabaseClient;
    }


    /* =====================================================
       CARGAR CLIENTES
    ===================================================== */

    async function cargarClientes() {
        const supabase = obtenerSupabase();

        if (!supabase) {
            clientes = [];
            renderizarClientes();
            actualizarEstadisticas();
            return false;
        }

        try {
            const { data, error } = await supabase
                .from("clientes")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) {
                console.error("SNIC'ELECTRIC - Error cargando clientes:", error);
                mostrarToast("No fue posible cargar los clientes.", "error");
                clientes = [];
                return false;
            }

            clientes = (data || []).map(mapearClienteDesdeSupabase);
            console.log("SNIC'ELECTRIC - SELECT clientes completado:", clientes.length);

            return true;

        } catch (error) {
            console.error("SNIC'ELECTRIC - Error cargando clientes:", error);
            mostrarToast("No fue posible cargar los clientes.", "error");
            clientes = [];
            return false;
        }
    }


    /* =====================================================
       RECARGAR CLIENTES
    ===================================================== */

    async function recargarClientes() {
        const cargados = await cargarClientes();
        renderizarClientes();
        actualizarEstadisticas();
        return cargados;
    }


    /* =====================================================
       MAPEAR CLIENTE DESDE SUPABASE
    ===================================================== */

    function mapearClienteDesdeSupabase(cliente) {
        const esEmpresa = String(cliente.tipo_cliente || "").toLowerCase() === "empresa";

        // Nombre de visualización principal en listas y tablas
        const nombreCompletoPersona = [cliente.nombre, cliente.apellido].filter(Boolean).join(" ");
        const nombreMostrar = esEmpresa
            ? (cliente.razon_social || cliente.nombre || "Sin Razón Social")
            : (nombreCompletoPersona || "Sin Nombre");

        return {
            ...cliente,
            id: cliente.id || null,
            tipo: esEmpresa ? "empresa" : "persona",
            nombre: cliente.nombre || "",
            apellido: cliente.apellido || "",
            razonSocial: cliente.razon_social || "",
            nombreMostrar: nombreMostrar,
            documentoTipo: cliente.tipo_documento || "",
            documentoNumero: cliente.numero_documento || "",
            telefono: cliente.telefono || "",
            correo: cliente.email || "",
            direccion: cliente.direccion || "",
            ciudad: cliente.ciudad || "",
            departamento: cliente.departamento || "",
            estado: cliente.activo === false ? "inactivo" : "activo",
            observaciones: cliente.observaciones || "",
            creado: cliente.created_at || null,
            actualizado: cliente.updated_at || null
        };
    }


    /* =====================================================
       PREPARAR CLIENTE PARA SUPABASE
    ===================================================== */

    function prepararClienteParaSupabase(datos) {
        const esEmpresa = datos.tipo === "empresa";

        return {
            tipo_cliente: esEmpresa ? "Empresa" : "Persona",
            nombre: esEmpresa ? null : (datos.nombre || null),
            apellido: esEmpresa ? null : (datos.apellido || null),
            razon_social: esEmpresa ? (datos.razonSocial || null) : null,
            tipo_documento: datos.documentoTipo || null,
            numero_documento: datos.documentoNumero || null,
            telefono: datos.telefono || null,
            email: datos.correo || null,
            direccion: datos.direccion || null,
            ciudad: datos.ciudad || null,
            departamento: datos.departamento || null,
            observaciones: datos.observaciones || null,
            activo: datos.estado !== "inactivo",
            updated_at: new Date().toISOString()
        };
    }


    /* =====================================================
       MANEJAR ERROR SUPABASE
    ===================================================== */

    function manejarErrorSupabase(error, mensaje = "No fue posible completar la operación.") {
        console.error("SNIC'ELECTRIC - Error Supabase:", error);

        if (error?.code === "23505") {
            mostrarToast("Ya existe un registro con esos datos.", "error");
            return;
        }

        if (error?.code === "23503") {
            mostrarToast("No se puede realizar la operación porque existen registros relacionados.", "error");
            return;
        }

        mostrarToast(mensaje, "error");
    }


    /* =====================================================
       ALTERNAR CAMPOS SEGÚN TIPO DE CLIENTE
    ===================================================== */

    function alternarCamposTipoCliente() {
        const tipo = document.getElementById("tipoCliente")?.value;
        const groupNombre = document.getElementById("groupNombre");
        const groupApellido = document.getElementById("groupApellido");
        const groupRazonSocial = document.getElementById("groupRazonSocial");

        const inputNombre = document.getElementById("nombreCliente");
        const inputApellido = document.getElementById("apellidoCliente");
        const inputRazonSocial = document.getElementById("razonSocialCliente");

        if (tipo === "empresa") {
            if (groupNombre) groupNombre.style.display = "none";
            if (groupApellido) groupApellido.style.display = "none";
            if (groupRazonSocial) groupRazonSocial.style.display = "block";

            if (inputNombre) inputNombre.required = false;
            if (inputApellido) inputApellido.required = false;
            if (inputRazonSocial) inputRazonSocial.required = true;
        } else {
            // Persona natural o selección inicial
            if (groupNombre) groupNombre.style.display = "block";
            if (groupApellido) groupApellido.style.display = "block";
            if (groupRazonSocial) groupRazonSocial.style.display = "none";

            if (inputNombre) inputNombre.required = true;
            if (inputApellido) inputApellido.required = true;
            if (inputRazonSocial) inputRazonSocial.required = false;
        }
    }


    /* =====================================================
       EVENTOS
    ===================================================== */

    function configurarEventos() {

        /* -----------------------------------------------
           TIPO CLIENTE (ALTERNAR INPUTS)
        ------------------------------------------------ */
        const tipoSelect = document.getElementById("tipoCliente");
        if (tipoSelect) {
            tipoSelect.addEventListener("change", alternarCamposTipoCliente);
        }

        /* -----------------------------------------------
           FORMULARIO
        ------------------------------------------------ */
        const form = document.getElementById(SELECTORS.form);
        if (form) {
            form.addEventListener("submit", guardarCliente);
        }

        /* -----------------------------------------------
           BUSCAR
        ------------------------------------------------ */
        const buscar = document.getElementById(SELECTORS.search);
        if (buscar) {
            buscar.addEventListener("input", renderizarClientes);
        }

        /* -----------------------------------------------
           FILTRO TIPO
        ------------------------------------------------ */
        const filtroTipo = document.getElementById(SELECTORS.filterType);
        if (filtroTipo) {
            filtroTipo.addEventListener("change", renderizarClientes);
        }

        /* -----------------------------------------------
           FILTRO ESTADO
        ------------------------------------------------ */
        const filtroEstado = document.getElementById(SELECTORS.filterStatus);
        if (filtroEstado) {
            filtroEstado.addEventListener("change", renderizarClientes);
        }

        /* -----------------------------------------------
           NUEVO CLIENTE
        ------------------------------------------------ */
        const nuevo = document.getElementById("btnNuevoCliente");
        if (nuevo) {
            nuevo.addEventListener("click", () => {
                if (!window.SNICAuth.tienePermiso(window.SNICAuth.PERMISOS.CLIENTES_CREAR)) {
                    mostrarToast("No tienes permiso para crear clientes.", "error");
                    return;
                }
                abrirModalCliente();
            });
        }

        /* -----------------------------------------------
           PRIMER CLIENTE
        ------------------------------------------------ */
        const primerCliente = document.getElementById("btnCrearPrimerCliente");
        if (primerCliente) {
            primerCliente.addEventListener("click", () => {
                if (!window.SNICAuth.tienePermiso(window.SNICAuth.PERMISOS.CLIENTES_CREAR)) {
                    mostrarToast("No tienes permiso para crear clientes.", "error");
                    return;
                }
                abrirModalCliente();
            });
        }

        /* -----------------------------------------------
           CERRAR MODAL
        ------------------------------------------------ */
        const cerrar = document.getElementById("btnCerrarModal");
        if (cerrar) cerrar.addEventListener("click", cerrarModalCliente);

        const cancelar = document.getElementById("btnCancelarCliente");
        if (cancelar) cancelar.addEventListener("click", cerrarModalCliente);

        /* -----------------------------------------------
           CERRAR DETALLE
        ------------------------------------------------ */
        const cerrarDetalle = document.getElementById("btnCerrarDetalle");
        if (cerrarDetalle) cerrarDetalle.addEventListener("click", cerrarDetalleCliente);

        /* -----------------------------------------------
           CLICK FUERA DEL MODAL
        ------------------------------------------------ */
        const modal = document.getElementById(SELECTORS.modal);
        if (modal) {
            modal.addEventListener("click", event => {
                if (event.target === modal) cerrarModalCliente();
            });
        }

        const detalle = document.getElementById(SELECTORS.detailModal);
        if (detalle) {
            detalle.addEventListener("click", event => {
                if (event.target === detalle) cerrarDetalleCliente();
            });
        }

        /* -----------------------------------------------
           ESC
        ------------------------------------------------ */
        document.addEventListener("keydown", event => {
            if (event.key !== "Escape") return;
            cerrarModalCliente();
            cerrarDetalleCliente();
        });
    }


    /* =====================================================
       ABRIR MODAL
    ===================================================== */

    function abrirModalCliente(cliente = null) {
        const modal = document.getElementById(SELECTORS.modal);
        if (!modal) return;

        clienteEditando = cliente;
        limpiarFormulario();

        const titulo = document.getElementById("modalClienteTitulo");
        const boton = document.getElementById("btnGuardarCliente");

        if (cliente) {
            if (!window.SNICAuth.tienePermiso(window.SNICAuth.PERMISOS.CLIENTES_EDITAR)) {
                mostrarToast("No tienes permiso para editar clientes.", "error");
                clienteEditando = null;
                return;
            }

            if (titulo) titulo.textContent = "Editar cliente";
            if (boton) {
                boton.innerHTML = `
                    <i class="fa-solid fa-pen"></i>
                    Actualizar cliente
                `;
            }

            cargarClienteFormulario(cliente);
        } else {
            if (titulo) titulo.textContent = "Nuevo cliente";
            if (boton) {
                boton.innerHTML = `
                    <i class="fa-solid fa-floppy-disk"></i>
                    Guardar cliente
                `;
            }
            alternarCamposTipoCliente();
        }

        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");

        setTimeout(() => {
            const inputEnfocar = (cliente?.tipo === "empresa") 
                ? document.getElementById("razonSocialCliente") 
                : document.getElementById("nombreCliente");

            if (inputEnfocar) inputEnfocar.focus();
        }, 100);
    }


    /* =====================================================
       CERRAR MODAL
    ===================================================== */

    function cerrarModalCliente() {
        const modal = document.getElementById(SELECTORS.modal);
        if (!modal) return;

        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");

        clienteEditando = null;
        limpiarFormulario();
    }


    /* =====================================================
       LIMPIAR FORMULARIO
    ===================================================== */

    function limpiarFormulario() {
        const form = document.getElementById(SELECTORS.form);
        if (!form) return;

        form.reset();

        establecerValor("clienteId", "");
        establecerValor("ciudadCliente", "Cúcuta");
        establecerValor("departamentoCliente", "Norte de Santander");
        establecerValor("estadoCliente", "activo");

        alternarCamposTipoCliente();
    }


    /* =====================================================
       CARGAR CLIENTE EN FORMULARIO
    ===================================================== */

    function cargarClienteFormulario(cliente) {
        establecerValor("clienteId", cliente.id);
        establecerValor("tipoCliente", cliente.tipo);

        alternarCamposTipoCliente();

        establecerValor("documentoTipo", cliente.documentoTipo);
        establecerValor("documentoNumero", cliente.documentoNumero);
        establecerValor("nombreCliente", cliente.nombre);
        establecerValor("apellidoCliente", cliente.apellido);
        establecerValor("razonSocialCliente", cliente.razonSocial);
        establecerValor("telefonoCliente", cliente.telefono);
        establecerValor("correoCliente", cliente.correo);
        establecerValor("direccionCliente", cliente.direccion);
        establecerValor("ciudadCliente", cliente.ciudad);
        establecerValor("departamentoCliente", cliente.departamento);
        establecerValor("estadoCliente", cliente.estado);
        establecerValor("observacionesCliente", cliente.observaciones);
    }


    function establecerValor(id, valor) {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.value = valor || "";
        }
    }


    /* =====================================================
       GUARDAR CLIENTE
    ===================================================== */

    async function guardarCliente(event) {
        event.preventDefault();

        const esEdicion = Boolean(clienteEditando);
        const permiso = esEdicion
            ? window.SNICAuth.PERMISOS.CLIENTES_EDITAR
            : window.SNICAuth.PERMISOS.CLIENTES_CREAR;

        if (!window.SNICAuth.tienePermiso(permiso)) {
            mostrarToast("No tienes permiso para realizar esta operación.", "error");
            return;
        }

        const datos = obtenerDatosFormulario();
        const validacion = validarCliente(datos);

        if (!validacion.ok) {
            mostrarToast(validacion.mensaje, "error");
            return;
        }

        /* -----------------------------------------------
           DUPLICADO DOCUMENTO
        ------------------------------------------------ */
        const documentoNormalizado = normalizarTexto(datos.documentoNumero);
        const duplicado = clientes.find(cliente =>
            normalizarTexto(cliente.documentoNumero) === documentoNormalizado &&
            (!clienteEditando || cliente.id !== clienteEditando.id)
        );

        if (duplicado) {
            mostrarToast("Ya existe un cliente con ese número de documento.", "error");
            return;
        }

        /* -----------------------------------------------
           DUPLICADO CORREO
        ------------------------------------------------ */
        if (datos.correo) {
            const correoNormalizado = datos.correo.trim().toLowerCase();

            const correoDuplicado = clientes.find(cliente =>
                String(cliente.correo || "").trim().toLowerCase() === correoNormalizado &&
                (!clienteEditando || cliente.id !== clienteEditando.id)
            );

            if (correoDuplicado) {
                mostrarToast("Ya existe un cliente con ese correo electrónico.", "error");
                return;
            }
        }

        const supabase = obtenerSupabase();
        if (!supabase) return;

        const payload = prepararClienteParaSupabase(datos);

        try {
            /* -------------------------------------------
               ACTUALIZAR
            -------------------------------------------- */
            if (clienteEditando) {
                const { data, error } = await supabase
                    .from("clientes")
                    .update(payload)
                    .eq("id", clienteEditando.id)
                    .select()
                    .single();

                if (error) {
                    manejarErrorSupabase(error, "No fue posible actualizar el cliente.");
                    return;
                }

                const indice = clientes.findIndex(c => c.id === clienteEditando.id);
                if (indice !== -1) {
                    clientes[indice] = mapearClienteDesdeSupabase(data);
                }

                mostrarToast("Cliente actualizado correctamente.", "success");
            }
            /* -------------------------------------------
               CREAR
            -------------------------------------------- */
            else {
                const { data, error } = await supabase
                    .from("clientes")
                    .insert(payload)
                    .select()
                    .single();

                if (error) {
                    manejarErrorSupabase(error, "No fue posible crear el cliente.");
                    return;
                }

                clientes.unshift(mapearClienteDesdeSupabase(data));
                mostrarToast("Cliente creado correctamente.", "success");
            }

            cerrarModalCliente();
            renderizarClientes();
            actualizarEstadisticas();

        } catch (error) {
            manejarErrorSupabase(error);
        }
    }


    /* =====================================================
       OBTENER DATOS FORMULARIO
    ===================================================== */

    function obtenerDatosFormulario() {
        return {
            tipo: obtenerValor("tipoCliente"),
            documentoTipo: obtenerValor("documentoTipo"),
            documentoNumero: obtenerValor("documentoNumero"),
            nombre: obtenerValor("nombreCliente"),
            apellido: obtenerValor("apellidoCliente"),
            razonSocial: obtenerValor("razonSocialCliente"),
            telefono: obtenerValor("telefonoCliente"),
            correo: obtenerValor("correoCliente"),
            direccion: obtenerValor("direccionCliente"),
            ciudad: obtenerValor("ciudadCliente"),
            departamento: obtenerValor("departamentoCliente"),
            estado: obtenerValor("estadoCliente") || "activo",
            observaciones: obtenerValor("observacionesCliente")
        };
    }


    function obtenerValor(id) {
        const elemento = document.getElementById(id);
        return elemento ? elemento.value.trim() : "";
    }


    /* =====================================================
       VALIDAR CLIENTE
    ===================================================== */

    function validarCliente(datos) {
        if (!datos.tipo) {
            return { ok: false, mensaje: "Selecciona el tipo de cliente." };
        }

        if (!datos.documentoTipo) {
            return { ok: false, mensaje: "Selecciona el tipo de documento." };
        }

        if (!datos.documentoNumero) {
            return { ok: false, mensaje: "Ingresa el número de documento." };
        }

        if (datos.documentoNumero.length < 4) {
            return { ok: false, mensaje: "El número de documento no es válido." };
        }

        if (datos.tipo === "empresa") {
            if (!datos.razonSocial) {
                return { ok: false, mensaje: "Ingresa la razón social de la empresa." };
            }
        } else {
            if (!datos.nombre) {
                return { ok: false, mensaje: "Ingresa el nombre del cliente." };
            }
            if (!datos.apellido) {
                return { ok: false, mensaje: "Ingresa el apellido del cliente." };
            }
        }

        if (!datos.telefono) {
            return { ok: false, mensaje: "Ingresa el teléfono del cliente." };
        }

        if (datos.correo && !validarEmail(datos.correo)) {
            return { ok: false, mensaje: "El correo electrónico no es válido." };
        }

        return { ok: true };
    }


    /* =====================================================
       VALIDAR EMAIL
    ===================================================== */

    function validarEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }


    /* =====================================================
       RENDERIZAR CLIENTES
    ===================================================== */

    function renderizarClientes() {
        const tbody = document.getElementById(SELECTORS.table);
        const empty = document.getElementById(SELECTORS.empty);

        if (!tbody) return;

        const texto = obtenerValor(SELECTORS.search).toLowerCase();
        const tipo = obtenerValor(SELECTORS.filterType);
        const estado = obtenerValor(SELECTORS.filterStatus);

        const filtrados = clientes.filter(cliente => {
            const contenido = [
                cliente.nombreMostrar,
                cliente.documentoNumero,
                cliente.telefono,
                cliente.correo,
                cliente.ciudad
            ].join(" ").toLowerCase();

            const coincideTexto = !texto || contenido.includes(texto);
            const coincideTipo = !tipo || cliente.tipo === tipo;
            const coincideEstado = !estado || cliente.estado === estado;

            return coincideTexto && coincideTipo && coincideEstado;
        });

        tbody.innerHTML = "";

        if (!filtrados.length) {
            if (empty) empty.classList.add("show");
            return;
        }

        if (empty) empty.classList.remove("show");

        filtrados.forEach(cliente => {
            tbody.appendChild(crearFilaCliente(cliente));
        });
    }


    /* =====================================================
       CREAR FILA CLIENTE
    ===================================================== */  

    function crearFilaCliente(cliente) {
        const tr = document.createElement("tr");

        const tipoTexto = cliente.tipo === "empresa" ? "Empresa" : "Persona";
        const inicial = obtenerInicial(cliente.nombreMostrar);
        const estadoTexto = cliente.estado === "activo" ? "Activo" : "Inactivo";

        // Determina el subtítulo descriptivo en lugar de un ID
        const esEmpresa = cliente.tipo === "empresa";
        const subtituloNombre = esEmpresa 
            ? "Razón Social" 
            : ([cliente.nombre, cliente.apellido].filter(Boolean).join(" ") || "Persona Natural");

        const puedeEditar = window.SNICAuth.tienePermiso(window.SNICAuth.PERMISOS.CLIENTES_EDITAR);
        const puedeEliminar = window.SNICAuth.tienePermiso(window.SNICAuth.PERMISOS.CLIENTES_ELIMINAR);

        tr.innerHTML = `
            <td>
                <div class="client-cell">
                    <div class="client-avatar">
                        ${escapeHTML(inicial)}
                    </div>
                    <div>
                        <strong>
                            ${escapeHTML(cliente.nombreMostrar)}
                        </strong>
                        <small style="display: block; color: var(--text-muted, #6c757d); font-size: 0.8rem;">
                            ${escapeHTML(subtituloNombre)}
                        </small>
                    </div>
                </div>
            </td>

            <td>
                <div class="document-cell">
                    <strong>
                        ${escapeHTML(cliente.documentoTipo || "")}
                    </strong>
                    <span>
                        ${escapeHTML(cliente.documentoNumero || "")}
                    </span>
                </div>
            </td>

            <td>
                <div class="contact-cell">
                    <span>
                        ${escapeHTML(cliente.telefono || "Sin teléfono")}
                    </span>
                    <span>
                        ${escapeHTML(cliente.correo || "Sin correo")}
                    </span>
                </div>
            </td>

            <td>
                <span class="type-badge ${escapeHTML(cliente.tipo)}">
                    <i class="fa-solid ${cliente.tipo === "empresa" ? "fa-building" : "fa-user"}"></i>
                    ${tipoTexto}
                </span>
            </td>

            <td>
                <span class="status-badge ${escapeHTML(cliente.estado)}">
                    <span class="status-dot"></span>
                    ${estadoTexto}
                </span>
            </td>

            <td>
                <div class="action-buttons">
                    <!-- VER -->
                    <button
                        type="button"
                        class="action-btn view"
                        title="Ver cliente"
                        data-action="view"
                        data-id="${escapeHTML(cliente.id)}"
                    >
                        <i class="fa-solid fa-eye"></i>
                    </button>

                    <!-- EDITAR -->
                    ${puedeEditar ? `
                        <button
                            type="button"
                            class="action-btn edit"
                            title="Editar cliente"
                            data-action="edit"
                            data-id="${escapeHTML(cliente.id)}"
                        >
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    ` : ""}

                    <!-- DESACTIVAR -->
                    ${puedeEliminar && cliente.estado === "activo" ? `
                        <button
                            type="button"
                            class="action-btn delete"
                            title="Desactivar cliente"
                            data-action="delete"
                            data-id="${escapeHTML(cliente.id)}"
                        >
                            <i class="fa-solid fa-user-slash"></i>
                        </button>
                    ` : ""}
                </div>
            </td>
        `;

        tr.querySelectorAll("[data-action]").forEach(boton => {
            boton.addEventListener("click", manejarAccionCliente);
        });

        return tr;
    }


    /* =====================================================
       ACCIONES CLIENTE
    ===================================================== */

    function manejarAccionCliente(event) {
        const boton = event.currentTarget;
        const accion = boton.dataset.action;
        const id = boton.dataset.id;

        const cliente = clientes.find(item => item.id === id);

        if (!cliente) {
            mostrarToast("No se encontró el cliente.", "error");
            return;
        }

        switch (accion) {
            case "view":
                mostrarDetalleCliente(cliente);
                break;

            case "edit":
                abrirModalCliente(cliente);
                break;

            case "delete":
                eliminarCliente(cliente);
                break;
        }
    }


    /* =====================================================
       DETALLE CLIENTE
    ===================================================== */

    async function mostrarDetalleCliente(cliente) {
        const modal = document.getElementById(SELECTORS.detailModal);
        const contenido = document.getElementById("clienteDetailContent");

        if (!modal || !contenido) return;

        contenido.innerHTML = `
            <div class="detail-loading">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Cargando información del cliente...</span>
            </div>
        `;

        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");

        const documentos = await contarDocumentosCliente(cliente.id);

        contenido.innerHTML = `
            <div class="detail-hero">
                <div class="detail-avatar">
                    ${escapeHTML(obtenerInicial(cliente.nombreMostrar))}
                </div>

                <div>
                    <h3>${escapeHTML(cliente.nombreMostrar)}</h3>
                </div>
            </div>

            <div class="detail-grid">
                <div class="detail-item">
                    <span>Tipo</span>
                    <strong>${cliente.tipo === "empresa" ? "Empresa" : "Persona natural"}</strong>
                </div>

                <div class="detail-item">
                    <span>Documento</span>
                    <strong>${escapeHTML([cliente.documentoTipo, cliente.documentoNumero].filter(Boolean).join(" "))}</strong>
                </div>

                <div class="detail-item">
                    <span>Teléfono</span>
                    <strong>${escapeHTML(cliente.telefono || "No registrado")}</strong>
                </div>

                <div class="detail-item">
                    <span>Correo</span>
                    <strong>${escapeHTML(cliente.correo || "No registrado")}</strong>
                </div>

                <div class="detail-item">
                    <span>Dirección</span>
                    <strong>${escapeHTML(cliente.direccion || "No registrada")}</strong>
                </div>

                <div class="detail-item">
                    <span>Ubicación</span>
                    <strong>${escapeHTML([cliente.ciudad, cliente.departamento].filter(Boolean).join(", ") || "No registrada")}</strong>
                </div>

                <div class="detail-item">
                    <span>Estado</span>
                    <strong>${cliente.estado === "activo" ? "Activo" : "Inactivo"}</strong>
                </div>
            </div>

            <div class="detail-documents">
                <h4>Documentos relacionados</h4>
                <div class="related-grid">
                    <div>
                        <strong>${documentos.cotizaciones}</strong>
                        <span>Cotizaciones</span>
                    </div>
                    <div>
                        <strong>${documentos.ordenes}</strong>
                        <span>Órdenes</span>
                    </div>
                    <div>
                        <strong>${documentos.inspecciones}</strong>
                        <span>Inspecciones</span>
                    </div>
                    <div>
                        <strong>${documentos.facturas}</strong>
                        <span>Facturas</span>
                    </div>
                </div>
            </div>

            ${cliente.observaciones ? `
                <div class="detail-observations">
                    <span>Observaciones</span>
                    <p>${escapeHTML(cliente.observaciones)}</p>
                </div>
            ` : ""}

            <div class="detail-meta">
                <span>Creado: ${formatearFecha(cliente.creado)}</span>
                <span>Actualizado: ${formatearFecha(cliente.actualizado)}</span>
            </div>
        `;
    }


    /* =====================================================
       CERRAR DETALLE
    ===================================================== */

    function cerrarDetalleCliente() {
        const modal = document.getElementById(SELECTORS.detailModal);
        if (!modal) return;

        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
    }


    /* =====================================================
       DOCUMENTOS RELACIONADOS
    ===================================================== */

    async function contarDocumentosCliente(clienteId) {
        const supabase = obtenerSupabase();

        if (!supabase || !clienteId) {
            return { cotizaciones: 0, ordenes: 0, inspecciones: 0, facturas: 0 };
        }

        try {
            const [resultadoCotizaciones, resultadoOrdenes, resultadoInspecciones] = await Promise.all([
                supabase.from("cotizaciones").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId),
                supabase.from("ordenes_servicio").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId),
                supabase.from("inspecciones").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId)
            ]);

            return {
                cotizaciones: resultadoCotizaciones.count || 0,
                ordenes: resultadoOrdenes.count || 0,
                inspecciones: resultadoInspecciones.count || 0,
                facturas: 0
            };

        } catch (error) {
            console.error("SNIC'ELECTRIC - Error contando documentos relacionados:", error);
            return { cotizaciones: 0, ordenes: 0, inspecciones: 0, facturas: 0 };
        }
    }


    /* =====================================================
       DESACTIVAR CLIENTE
    ===================================================== */

    async function eliminarCliente(cliente) {
        if (!window.SNICAuth.tienePermiso(window.SNICAuth.PERMISOS.CLIENTES_ELIMINAR)) {
            mostrarToast("No tienes permiso para desactivar clientes.", "error");
            return;
        }

        if (cliente.estado === "inactivo") {
            mostrarToast("El cliente ya está inactivo.", "error");
            return;
        }

        const confirmar = window.confirm(
            `¿Deseas desactivar al cliente "${cliente.nombreMostrar}"?\n\n` +
            "El cliente no será eliminado físicamente y su historial permanecerá disponible."
        );

        if (!confirmar) return;

        const supabase = obtenerSupabase();
        if (!supabase) return;

        try {
            const { data, error } = await supabase
                .from("clientes")
                .update({
                    activo: false,
                    updated_at: new Date().toISOString()
                })
                .eq("id", cliente.id)
                .select()
                .single();

            if (error) {
                manejarErrorSupabase(error, "No fue posible desactivar el cliente.");
                return;
            }

            const indice = clientes.findIndex(item => item.id === cliente.id);
            if (indice !== -1) {
                clientes[indice] = mapearClienteDesdeSupabase(data);
            }

            renderizarClientes();
            actualizarEstadisticas();
            mostrarToast("Cliente desactivado correctamente.", "success");

        } catch (error) {
            manejarErrorSupabase(error, "No fue posible desactivar el cliente.");
        }
    }


    /* =====================================================
       ESTADÍSTICAS
    ===================================================== */

    function actualizarEstadisticas() {
        const total = clientes.length;
        const activos = clientes.filter(c => c.estado === "activo").length;
        const empresas = clientes.filter(c => c.tipo === "empresa").length;
        const personas = clientes.filter(c => c.tipo === "persona").length;

        actualizarNumero("totalClientes", total);
        actualizarNumero("clientesActivos", activos);
        actualizarNumero("clientesEmpresas", empresas);
        actualizarNumero("clientesPersonas", personas);
    }


    function actualizarNumero(id, numero) {
        const elemento = document.getElementById(id);
        if (elemento) elemento.textContent = numero;
    }


    /* =====================================================
       USUARIO
    ===================================================== */

    function mostrarUsuario() {
        let usuario = null;

        try {
            usuario = window.SNICAuth?.obtenerUsuarioActual?.() || null;
        } catch (error) {
            console.error("SNIC'ELECTRIC - Error obteniendo usuario:", error);
        }

        if (!usuario) return;

        const nombre = String(usuario.nombre || "").trim();
        const apellido = String(usuario.apellido || "").trim();
        const nombreCompleto = [nombre, apellido].filter(Boolean).join(" ");
        const nombreMostrar = nombreCompleto || usuario.email || "Usuario";

        document.querySelectorAll("[data-user-name]").forEach(e => e.textContent = nombreMostrar);
        document.querySelectorAll("[data-user-email]").forEach(e => e.textContent = usuario.email || "");
        document.querySelectorAll("[data-user-role]").forEach(e => e.textContent = formatearRol(usuario.rol));

        const userName = document.getElementById("userName");
        if (userName) userName.textContent = nombreMostrar;

        const userEmail = document.getElementById("userEmail");
        if (userEmail) userEmail.textContent = usuario.email || "";

        const userRole = document.getElementById("userRole");
        if (userRole) userRole.textContent = formatearRol(usuario.rol);
    }


    /* =====================================================
       FORMATEAR ROL
    ===================================================== */

    function formatearRol(rol) {
        const roles = {
            administrador: "Administrador",
            administrativo: "Administrativo",
            supervisor: "Supervisor",
            tecnico: "Técnico",
            facturacion: "Facturación"
        };

        return roles[String(rol || "").toLowerCase()] || rol || "";
    }


    /* =====================================================
       UTILIDADES
    ===================================================== */

    function obtenerInicial(nombre) {
        if (!nombre) return "C";
        return String(nombre).trim().charAt(0).toUpperCase();
    }


    function normalizarTexto(texto) {
        return String(texto || "").trim().toLowerCase().replace(/\s+/g, " ");
    }


    function formatearFecha(fecha) {
        if (!fecha) return "No disponible";

        try {
            const fechaObjeto = new Date(fecha);
            if (Number.isNaN(fechaObjeto.getTime())) return "No disponible";

            return fechaObjeto.toLocaleDateString("es-CO", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
            });
        } catch (error) {
            return "No disponible";
        }
    }


    /* =====================================================
       ESCAPE HTML
    ===================================================== */

    function escapeHTML(valor) {
        return String(valor ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    /* =====================================================
       TOAST
    ===================================================== */

    function mostrarToast(mensaje, tipo = "success") {
        const toast = document.getElementById("toast");
        const texto = document.getElementById("toastMessage");
        const icono = document.getElementById("toastIcon");

        if (!toast || !texto) {
            alert(mensaje);
            return;
        }

        texto.textContent = mensaje;
        toast.className = `toast ${tipo}`;

        if (icono) {
            icono.className = tipo === "success"
                ? "fa-solid fa-circle-check"
                : "fa-solid fa-circle-exclamation";
        }

        toast.classList.add("show");

        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.classList.remove("show");
        }, 3500);
    }


    /* =====================================================
       API PÚBLICA
    ===================================================== */

    window.SNICClientes = {
        obtenerTodos: () => [...clientes],
        obtenerPorId: id => clientes.find(cliente => cliente.id === id) || null,
        obtenerActivos: () => clientes.filter(cliente => cliente.estado === "activo"),
        existe: id => clientes.some(cliente => cliente.id === id),
        buscar: texto => {
            const busqueda = normalizarTexto(texto);
            if (!busqueda) return [...clientes];

            return clientes.filter(cliente =>
                normalizarTexto([
                    cliente.nombreMostrar,
                    cliente.documentoNumero,
                    cliente.telefono,
                    cliente.correo,
                    cliente.ciudad
                ].join(" ")).includes(busqueda)
            );
        },
        recargar: recargarClientes
    };

})();