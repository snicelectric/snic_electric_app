/* =========================================================
   SNIC'ELECTRIC - INSPECCIONES
   Supabase + RLS + Storage

   VERSIÓN COMPLETA CORREGIDA

   Correcciones incluidas:
   - resultado compatible con CHECK de Supabase
   - manejo de archivos
   - Storage bucket snic-electric
   - manejo PGRST205
   - manejo Bucket not found
   - checklist
   - fotografías
   - necesidades
   - edición
   - eliminación
   - permisos
   ========================================================= */

(function () {

    "use strict";

    /* =========================================================
       CONFIGURACIÓN
    ========================================================= */

    const MAX_FOTOS = 6;

    const STORAGE_BUCKET = "snic-electric";

    const RESULTADOS_VALIDOS = [
        "sin_novedades",
        "requiere_intervencion",
        "no_conforme",
        "pendiente"
    ];

    const ESTADOS_VALIDOS = [
        "pendiente",
        "en_proceso",
        "completada",
        "cancelada"
    ];

    const PRIORIDADES_VALIDAS = [
        "baja",
        "normal",
        "media",
        "alta",
        "urgente"
    ];

    const CHECKLIST = [

        {
            id: "tablero",
            label: "Tablero eléctrico",
            icon: "fa-table-cells-large"
        },

        {
            id: "cableado",
            label: "Cableado e instalaciones",
            icon: "fa-bolt"
        },

        {
            id: "tomas",
            label: "Tomacorrientes e interruptores",
            icon: "fa-plug"
        },

        {
            id: "iluminacion",
            label: "Iluminación",
            icon: "fa-lightbulb"
        },

        {
            id: "protecciones",
            label: "Protecciones eléctricas",
            icon: "fa-shield-halved"
        },

        {
            id: "puesta_tierra",
            label: "Puesta a tierra",
            icon: "fa-arrows-to-circle"
        },

        {
            id: "canalizacion",
            label: "Canalización y tubería",
            icon: "fa-grip-lines-vertical"
        },

        {
            id: "seguridad",
            label: "Seguridad y condiciones de riesgo",
            icon: "fa-triangle-exclamation"
        }

    ];


    /* =========================================================
       ESTADO
    ========================================================= */

    let supabase = null;

    let usuarioAuth = null;

    let inspecciones = [];

    let clientes = [];

    let editando = null;

    let fotos = [];

    let fotosEliminadas = [];

    let necesidades = [];


    /* =========================================================
       INICIO
    ========================================================= */

    document.addEventListener(
        "DOMContentLoaded",
        iniciar
    );


    async function iniciar() {

        try {

            if (!window.SNICAuth) {

                console.error(
                    "SNICAuth no está disponible."
                );

                location.href = "../login.html";

                return;
            }


            supabase =
                window.supabaseClient;


            if (!supabase) {

                toast(
                    "Supabase no está disponible.",
                    "error"
                );

                return;
            }


            /* -------------------------------------------------
               Diagnóstico del proyecto Supabase
               ------------------------------------------------- */

            console.log(
                "SNIC'ELECTRIC - Supabase URL:",
                supabase.supabaseUrl
            );

            console.log(
                "SNIC'ELECTRIC - Storage bucket:",
                STORAGE_BUCKET
            );


            /* -------------------------------------------------
               Usuario autenticado
               ------------------------------------------------- */

            const {
                data: {
                    user
                },
                error
            } =
                await supabase.auth.getUser();


            if (error) {

                console.error(
                    "Error obteniendo usuario:",
                    error
                );

                location.href =
                    "../login.html";

                return;
            }


            if (!user) {

                location.href =
                    "../login.html";

                return;
            }


            usuarioAuth = user;


            /* -------------------------------------------------
               Protección de página
               ------------------------------------------------- */

            if (
                !SNICAuth.protegerPagina(
                    SNICAuth.PERMISOS.INSPECCIONES_VER
                )
            ) {

                return;
            }


            /* -------------------------------------------------
               Interfaz
               ------------------------------------------------- */

            renderChecklist();

            configurarEventos();

            mostrarUsuario();


            /* -------------------------------------------------
               Datos
               ------------------------------------------------- */

            await cargarClientes();

            await cargarInspecciones();

            estadisticas();


            if (
                SNICAuth.aplicarPermisos
            ) {

                SNICAuth.aplicarPermisos();
            }


            console.log(
                "SNIC'ELECTRIC - Inspecciones Supabase cargado correctamente."
            );


        } catch (error) {

            console.error(
                "SNIC'ELECTRIC - Error iniciando inspecciones:",
                error
            );

            toast(
                traducirError(error),
                "error"
            );

        }

    }


    /* =========================================================
       CLIENTE SUPABASE
    ========================================================= */

    function obtenerSupabase() {

        if (!window.supabaseClient) {

            toast(
                "No fue posible conectar con Supabase.",
                "error"
            );

            return null;
        }


        return window.supabaseClient;
    }


    /* =========================================================
       CLIENTES
    ========================================================= */

    async function cargarClientes() {

        const sb =
            obtenerSupabase();

        if (!sb) return;


        try {

            const {
                data,
                error
            } =
                await sb
                    .from("clientes")
                    .select(`
                        id,
                        nombre,
                        apellido,
                        razon_social,
                        numero_documento,
                        telefono,
                        email,
                        direccion,
                        ciudad,
                        activo
                    `)
                    .eq(
                        "activo",
                        true
                    )
                    .order(
                        "nombre",
                        {
                            ascending: true
                        }
                    );


            if (error) {

                console.error(
                    "Error cargando clientes:",
                    error
                );

                toast(
                    traducirError(error),
                    "error"
                );

                clientes = [];

                renderClientes();

                return;
            }


            clientes =
                data || [];


            renderClientes();


        } catch (error) {

            console.error(
                "Error inesperado cargando clientes:",
                error
            );

            toast(
                traducirError(error),
                "error"
            );

        }

    }


    function renderClientes() {

        const select =
            document.getElementById(
                "clienteInspeccion"
            );


        if (!select) return;


        select.innerHTML =
            '<option value="">Selecciona un cliente</option>';


        clientes.forEach(
            cliente => {

                const option =
                    document.createElement(
                        "option"
                    );


                option.value =
                    cliente.id;


                const nombre =
                    cliente.razon_social ||
                    [
                        cliente.nombre,
                        cliente.apellido
                    ]
                        .filter(Boolean)
                        .join(" ")
                        .trim() ||
                    "Sin nombre";


                const documento =
                    cliente.numero_documento ||
                    "Sin documento";


                option.textContent =
                    `${nombre} — ${documento}`;


                select.appendChild(
                    option
                );

            }
        );

    }


    function obtenerCliente(id) {

        return clientes.find(
            cliente =>
                String(cliente.id) ===
                String(id)
        ) || null;

    }


    function rellenarDatosCliente() {

        const id =
            get(
                "clienteInspeccion"
            );


        const cliente =
            obtenerCliente(id);


        if (!cliente) return;


        const direccion =
            get(
                "direccionInspeccion"
            );


        if (!direccion) {

            set(
                "direccionInspeccion",
                cliente.direccion || ""
            );

        }


        const ciudad =
            get(
                "ciudadInspeccion"
            );


        if (!ciudad) {

            set(
                "ciudadInspeccion",
                cliente.ciudad || ""
            );

        }


        const contacto =
            get(
                "contactoObra"
            );


        if (!contacto) {

            set(
                "contactoObra",
                [
                    cliente.telefono,
                    cliente.email
                ]
                    .filter(Boolean)
                    .join(" · ")
            );

        }

    }


    /* =========================================================
       CARGAR INSPECCIONES
    ========================================================= */

    async function cargarInspecciones() {

        const sb =
            obtenerSupabase();

        if (!sb) return;


        try {

            const {
                data,
                error
            } =
                await sb
                    .from("inspecciones")
                    .select(`
                        id,
                        numero,
                        cliente_id,
                        tecnico_id,
                        fecha_inspeccion,
                        tipo_inspeccion,
                        motivo,
                        estado,
                        observaciones,
                        direccion,
                        ciudad,
                        contacto,
                        resultado,
                        prioridad,
                        hallazgos,
                        recomendaciones,
                        necesidades,
                        created_at,
                        updated_at
                    `)
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    );


            if (error) {

                console.error(
                    "Error cargando inspecciones:",
                    error
                );

                toast(
                    traducirError(error),
                    "error"
                );

                inspecciones = [];

                render();

                estadisticas();

                return;
            }


            const ids =
                (data || [])
                    .map(
                        x => x.id
                    )
                    .filter(Boolean);


            let items = [];


            /* -------------------------------------------------
               Checklist
               ------------------------------------------------- */

            if (ids.length) {

                const respuestaItems =
                    await sb
                        .from(
                            "inspeccion_items"
                        )
                        .select(`
                            id,
                            inspeccion_id,
                            orden,
                            categoria,
                            pregunta,
                            respuesta,
                            observacion
                        `)
                        .in(
                            "inspeccion_id",
                            ids
                        )
                        .order(
                            "orden",
                            {
                                ascending: true
                            }
                        );


                if (
                    respuestaItems.error
                ) {

                    console.error(
                        "Error cargando checklist:",
                        respuestaItems.error
                    );

                } else {

                    items =
                        respuestaItems.data ||
                        [];

                }

            }


            /* -------------------------------------------------
               Archivos
               ------------------------------------------------- */

            const archivos =
                await cargarArchivosInspecciones(
                    ids
                );


            /* -------------------------------------------------
               Construcción
               ------------------------------------------------- */

            inspecciones =
                (data || [])
                    .map(
                        inspeccion => {

                            const cliente =
                                obtenerCliente(
                                    inspeccion.cliente_id
                                );


                            const nombreCliente =
                                cliente
                                    ? (
                                        cliente.razon_social ||
                                        [
                                            cliente.nombre,
                                            cliente.apellido
                                        ]
                                            .filter(Boolean)
                                            .join(" ")
                                            .trim()
                                    )
                                    : "Sin cliente";


                            const necesidadesInspeccion =
                                Array.isArray(
                                    inspeccion.necesidades
                                )
                                    ? inspeccion.necesidades
                                    : [];


                            return {

                                ...inspeccion,
                                numero: inspeccion.numero || "",
                                clienteNombre:
                                    nombreCliente,

                                clienteDocumento:
                                    cliente
                                        ? (
                                            cliente.numero_documento ||
                                            ""
                                        )
                                        : "",

                                tecnico:
                                    inspeccion.tecnico_id ===
                                    usuarioAuth?.id
                                        ? (
                                            SNICAuth.obtenerNombreActual?.() ||
                                            "Técnico"
                                        )
                                        : "Técnico",

                                fecha:
                                    inspeccion.fecha_inspeccion,

                                tipo:
                                    inspeccion.tipo_inspeccion,

                                contactoObra:
                                    inspeccion.contacto,

                                hallazgos:
                                    inspeccion.hallazgos,

                                necesidades:
                                    necesidadesInspeccion,

                                checklist:
                                    items
                                        .filter(
                                            item =>
                                                item.inspeccion_id ===
                                                inspeccion.id
                                        )
                                        .map(
                                            item => ({

                                                id:
                                                    item.categoria ||
                                                    item.id,

                                                nombre:
                                                    item.pregunta,

                                                estado:
                                                    item.respuesta,

                                                observacion:
                                                    item.observacion

                                            })
                                        ),

                                fotos:
                                    archivos
                                        .filter(
                                            archivo =>
                                                archivo.inspeccion_id ===
                                                inspeccion.id
                                        )

                            };

                        }
                    );


            render();

            estadisticas();


        } catch (error) {

            console.error(
                "Error inesperado cargando inspecciones:",
                error
            );

            toast(
                traducirError(error),
                "error"
            );

        }

    }


    /* =========================================================
       ARCHIVOS / FOTOGRAFÍAS
    ========================================================= */

    async function cargarArchivosInspecciones(
        ids
    ) {

        if (
            !Array.isArray(ids) ||
            !ids.length
        ) {

            return [];
        }


        const sb =
            obtenerSupabase();

        if (!sb) return [];


        try {

            const {
                data,
                error
            } =
                await sb
                    .from("archivos")
                    .select(`
                        id,
                        bucket,
                        ruta,
                        nombre_archivo,
                        tipo,
                        mime_type,
                        tamano,
                        cliente_id,
                        inspeccion_id,
                        usuario_id,
                        created_at
                    `)
                    .in(
                        "inspeccion_id",
                        ids
                    )
                    .order(
                        "created_at",
                        {
                            ascending: true
                        }
                    );


            if (error) {

                console.error(
                    "Error cargando archivos:",
                    error
                );


                if (
                    error.code ===
                    "PGRST205"
                ) {

                    console.warn(
                        "La tabla archivos existe en Supabase pero PostgREST aún puede estar usando un schema cache antiguo. Ejecuta NOTIFY pgrst, 'reload schema';"
                    );

                }


                return [];
            }


            const resultado = [];


            for (
                const archivo
                of data || []
            ) {

                if (
                    !archivo.ruta
                ) {

                    continue;
                }


                const bucket =
                    archivo.bucket ||
                    STORAGE_BUCKET;


                try {

                    const {
                        data: signed,
                        error: signedError
                    } =
                        await sb.storage
                            .from(bucket)
                            .createSignedUrl(
                                archivo.ruta,
                                3600
                            );


                    if (
                        signedError
                    ) {

                        console.warn(
                            "No fue posible generar URL firmada:",
                            signedError
                        );

                        resultado.push({

                            ...archivo,

                            url: "",

                            storage_error:
                                signedError

                        });

                        continue;
                    }


                    resultado.push({

                        ...archivo,

                        url:
                            signed?.signedUrl ||
                            ""

                    });


                } catch (
                    storageError
                ) {

                    console.warn(
                        "Error Storage obteniendo fotografía:",
                        storageError
                    );


                    resultado.push({

                        ...archivo,

                        url: "",

                        storage_error:
                            storageError

                    });

                }

            }


            return resultado;


        } catch (error) {

            console.error(
                "Error obteniendo fotografías:",
                error
            );

            return [];
        }

    }


    /* =========================================================
       EVENTOS
    ========================================================= */

    function configurarEventos() {

        on(
            "btnNuevaInspeccion",
            "click",
            () => abrir()
        );


        on(
            "btnCrearPrimeraInspeccion",
            "click",
            () => abrir()
        );


        on(
            "btnCerrarInspeccion",
            "click",
            cerrar
        );


        on(
            "btnCancelarInspeccion",
            "click",
            cerrar
        );


        on(
            "btnCerrarDetalle",
            "click",
            cerrarDetalle
        );


        on(
            "inspeccionForm",
            "submit",
            guardarFormulario
        );


        on(
            "buscarInspeccion",
            "input",
            render
        );


        on(
            "filtroEstado",
            "change",
            render
        );


        on(
            "filtroResultado",
            "change",
            render
        );


        on(
            "btnAgregarNecesidad",
            "click",
            () => agregarNecesidad()
        );


        on(
            "fotosInspeccion",
            "change",
            manejarFotos
        );


        on(
            "clienteInspeccion",
            "change",
            rellenarDatosCliente
        );


        document.addEventListener(
            "click",
            manejarAcciones
        );


        document.addEventListener(
            "keydown",
            e => {

                if (
                    e.key ===
                    "Escape"
                ) {

                    cerrar();

                    cerrarDetalle();

                }

            }
        );

    }


    function on(
        id,
        event,
        fn
    ) {

        const element =
            document.getElementById(
                id
            );


        if (element) {

            element.addEventListener(
                event,
                fn
            );

        }

    }


    /* =========================================================
       USUARIO
    ========================================================= */

    function mostrarUsuario() {

        const nombre =
            SNICAuth.obtenerNombreActual?.() ||
            usuarioAuth?.email ||
            "Usuario";


        const rol =
            SNICAuth.obtenerRolActual?.() ||
            "";


        document
            .querySelectorAll(
                "[data-user-name]"
            )
            .forEach(
                element =>
                    element.textContent =
                        nombre
            );


        document
            .querySelectorAll(
                "[data-user-role]"
            )
            .forEach(
                element =>
                    element.textContent =
                        rol
            );

    }


    /* =========================================================
       CHECKLIST
    ========================================================= */

    function renderChecklist() {

        const box =
            document.getElementById(
                "inspectionChecklist"
            );


        if (!box) return;


        box.innerHTML =
            CHECKLIST
                .map(
                    item => `

                        <div class="check-row">

                            <div class="check-name">

                                <i
                                    class="fa-solid ${item.icon}"
                                ></i>

                                ${esc(
                                    item.label
                                )}

                            </div>


                            <select
                                data-check-status="${esc(
                                    item.id
                                )}"
                            >

                                <option value="bueno">
                                    Bueno
                                </option>

                                <option value="regular">
                                    Regular
                                </option>

                                <option value="malo">
                                    Malo
                                </option>

                                <option value="no_aplica">
                                    No aplica
                                </option>

                            </select>


                            <input
                                type="text"
                                data-check-note="${esc(
                                    item.id
                                )}"
                                placeholder="Observación específica..."
                            >

                        </div>

                    `
                )
                .join("");

    }


    /* =========================================================
       ABRIR / EDITAR
    ========================================================= */

    function abrir(
        id = null
    ) {

        if (
            !id &&
            !SNICAuth.tienePermiso(
                SNICAuth.PERMISOS.INSPECCIONES_CREAR
            )
        ) {

            toast(
                "No tienes permiso para crear inspecciones.",
                "error"
            );

            return;
        }


        if (
            id &&
            !SNICAuth.tienePermiso(
                SNICAuth.PERMISOS.INSPECCIONES_EDITAR
            )
        ) {

            toast(
                "No tienes permiso para editar inspecciones.",
                "error"
            );

            return;
        }


        editando =
            id
                ? inspecciones.find(
                    x =>
                        x.id === id
                )
                : null;


        if (
            id &&
            !editando
        ) {

            toast(
                "No se encontró la inspección.",
                "error"
            );

            return;
        }


        limpiarForm();


        renderClientes();


        const hoy =
            new Date()
                .toISOString()
                .slice(
                    0,
                    10
                );


        set(
            "fechaInspeccion",
            editando?.fecha_inspeccion ||
            editando?.fecha ||
            hoy
        );


        set(
            "tecnicoInspeccion",
            editando?.tecnico ||
            SNICAuth.obtenerNombreActual?.() ||
            usuarioAuth?.email ||
            ""
        );


        if (editando) {

            cargarEdicion(
                editando
            );

        }


        const titulo =
            document.getElementById(
                "modalInspeccionTitulo"
            );


        if (titulo) {

            titulo.textContent =
                editando
                    ? "Editar inspección"
                    : "Nueva inspección";

        }


        const modal =
            document.getElementById(
                "inspeccionModal"
            );


        if (!modal) return;


        modal.classList.add(
            "show"
        );


        modal.setAttribute(
            "aria-hidden",
            "false"
        );


        document.body.classList.add(
            "modal-open"
        );

    }


    function cargarEdicion(x) {

        set(
            "inspeccionId",
            x.id
        );


        set(
            "clienteInspeccion",
            x.cliente_id
        );


        set(
            "fechaInspeccion",
            x.fecha_inspeccion ||
            x.fecha ||
            ""
        );


        set(
            "tipoInspeccion",
            x.tipo_inspeccion ||
            x.tipo ||
            "inicial"
        );


        set(
            "direccionInspeccion",
            x.direccion ||
            ""
        );


        set(
            "ciudadInspeccion",
            x.ciudad ||
            ""
        );


        set(
            "contactoObra",
            x.contacto ||
            x.contactoObra ||
            ""
        );


        set(
            "estadoInspeccion",
            x.estado ||
            "pendiente"
        );


        set(
            "hallazgosInspeccion",
            x.hallazgos ||
            ""
        );


        set(
            "recomendacionesInspeccion",
            x.recomendaciones ||
            ""
        );


        set(
            "resultadoInspeccion",
            normalizarResultado(
                x.resultado
            )
        );


        set(
            "prioridadInspeccion",
            normalizarPrioridad(
                x.prioridad
            )
        );


        (
            x.checklist ||
            []
        )
            .forEach(
                item => {

                    set(
                        `[data-check-status="${item.id}"]`,
                        item.estado ||
                        "bueno"
                    );


                    set(
                        `[data-check-note="${item.id}"]`,
                        item.observacion ||
                        ""
                    );

                }
            );


        necesidades =
            Array.isArray(
                x.necesidades
            )
                ? JSON.parse(
                    JSON.stringify(
                        x.necesidades
                    )
                )
                : [];


        renderNecesidades();


        fotos =
            Array.isArray(
                x.fotos
            )
                ? JSON.parse(
                    JSON.stringify(
                        x.fotos
                    )
                )
                : [];


        fotosEliminadas = [];


        renderFotos();

    }


    function limpiarForm() {

        const form =
            document.getElementById(
                "inspeccionForm"
            );


        if (form) {

            form.reset();

        }


        set(
            "inspeccionId",
            ""
        );


        fotos = [];

        fotosEliminadas = [];

        necesidades = [];


        renderNecesidades();

        renderFotos();


        document
            .querySelectorAll(
                "[data-check-status]"
            )
            .forEach(
                element =>
                    element.value =
                        "bueno"
            );


        document
            .querySelectorAll(
                "[data-check-note]"
            )
            .forEach(
                element =>
                    element.value =
                        ""
            );


        set(
            "resultadoInspeccion",
            "pendiente"
        );


        set(
            "estadoInspeccion",
            "pendiente"
        );


        set(
            "prioridadInspeccion",
            "normal"
        );

    }


    function cerrar() {

        const modal =
            document.getElementById(
                "inspeccionModal"
            );


        if (!modal) return;


        modal.classList.remove(
            "show"
        );


        modal.setAttribute(
            "aria-hidden",
            "true"
        );


        document.body.classList.remove(
            "modal-open"
        );


        editando = null;

        fotosEliminadas = [];

    }


    /* =========================================================
       NORMALIZADORES
    ========================================================= */

    function normalizarResultado(
        valor
    ) {

        const resultado =
            String(
                valor ?? ""
            )
                .trim()
                .toLowerCase();


        const mapa = {

            favorable:
                "sin_novedades",

            sin_novedades:
                "sin_novedades",


            intervencion:
                "requiere_intervencion",

            requiere_intervencion:
                "requiere_intervencion",


            riesgo:
                "no_conforme",

            no_conforme:
                "no_conforme",


            pendiente:
                "pendiente"

        };


        const resultadoFinal =
            mapa[resultado] ||
            "pendiente";


        if (
            !RESULTADOS_VALIDOS.includes(
                resultadoFinal
            )
        ) {

            return "pendiente";
        }


        return resultadoFinal;

    }


    function normalizarEstado(
        valor
    ) {

        const estado =
            String(
                valor ?? ""
            )
                .trim()
                .toLowerCase();


        return ESTADOS_VALIDOS.includes(
            estado
        )
            ? estado
            : "pendiente";

    }


    function normalizarPrioridad(
        valor
    ) {

        const prioridad =
            String(
                valor ?? ""
            )
                .trim()
                .toLowerCase();


        return PRIORIDADES_VALIDAS.includes(
            prioridad
        )
            ? prioridad
            : "normal";

    }


    /* =========================================================
       GUARDAR INSPECCIÓN
    ========================================================= */

    async function guardarFormulario(
        e
    ) {

        e.preventDefault();


        const sb =
            obtenerSupabase();


        if (!sb) return;


        /* -------------------------------------------------
           Cliente
           ------------------------------------------------- */

        const clienteId =
            get(
                "clienteInspeccion"
            );


        if (!clienteId) {

            toast(
                "Debes seleccionar un cliente registrado.",
                "error"
            );

            return;
        }


        if (!usuarioAuth?.id) {

            toast(
                "No fue posible identificar al usuario autenticado.",
                "error"
            );

            return;
        }


        const cliente =
            obtenerCliente(
                clienteId
            );


        if (!cliente) {

            toast(
                "El cliente seleccionado ya no está disponible.",
                "error"
            );

            return;
        }


        /* -------------------------------------------------
           Permisos
           ------------------------------------------------- */

        const permiso =
            editando
                ? SNICAuth.PERMISOS.INSPECCIONES_EDITAR
                : SNICAuth.PERMISOS.INSPECCIONES_CREAR;


        if (
            !SNICAuth.tienePermiso(
                permiso
            )
        ) {

            toast(
                "No tienes permiso para guardar esta inspección.",
                "error"
            );

            return;
        }


        /* -------------------------------------------------
           Resultado
           ------------------------------------------------- */

        const resultadoFormulario =
            get(
                "resultadoInspeccion"
            );


        const resultadoNormalizado =
            normalizarResultado(
                resultadoFormulario
            );


        if (
            !RESULTADOS_VALIDOS.includes(
                resultadoNormalizado
            )
        ) {

            toast(
                "El resultado seleccionado no es válido.",
                "error"
            );

            console.error(
                "Resultado inválido:",
                resultadoFormulario,
                resultadoNormalizado
            );

            return;
        }


        /* -------------------------------------------------
           Estado
           ------------------------------------------------- */

        const estado =
            normalizarEstado(
                get(
                    "estadoInspeccion"
                )
            );


        /* -------------------------------------------------
           Prioridad
           ------------------------------------------------- */

        const prioridad =
            normalizarPrioridad(
                get(
                    "prioridadInspeccion"
                )
            );


        /* -------------------------------------------------
           Necesidades
           ------------------------------------------------- */

        const necesidadesLimpias =
            Array.isArray(
                necesidades
            )
                ? necesidades
                    .map(
                        necesidad => ({

                            descripcion:
                                String(
                                    necesidad.descripcion ||
                                    ""
                                ).trim(),

                            cantidad:
                                Number(
                                    necesidad.cantidad ||
                                    0
                                ),

                            unidad:
                                String(
                                    necesidad.unidad ||
                                    "unidad"
                                ),

                            prioridad:
                                String(
                                    necesidad.prioridad ||
                                    "normal"
                                )

                        })
                    )
                    .filter(
                        necesidad =>
                            necesidad.descripcion
                    )
                : [];


        /* -------------------------------------------------
           Payload
           ------------------------------------------------- */

        const payload = {
            numero: 
                get("numeroInspeccion") || null,
                
            cliente_id:
                clienteId,


            tecnico_id:
                editando?.tecnico_id ||
                usuarioAuth.id,


            fecha_inspeccion:
                get(
                    "fechaInspeccion"
                ) ||
                new Date()
                    .toISOString()
                    .slice(
                        0,
                        10
                    ),


            tipo_inspeccion:
                get(
                    "tipoInspeccion"
                ) ||
                "inicial",


            motivo:
                null,


            estado:
                estado,


            observaciones:
                null,


            direccion:
                get(
                    "direccionInspeccion"
                ) ||
                null,


            ciudad:
                get(
                    "ciudadInspeccion"
                ) ||
                null,


            contacto:
                get(
                    "contactoObra"
                ) ||
                null,


            /* IMPORTANTE:
               Solo valores permitidos por
               inspecciones_resultado_check
            */
            resultado:
                resultadoNormalizado,


            prioridad:
                prioridad,


            hallazgos:
                get(
                    "hallazgosInspeccion"
                ) ||
                null,


            recomendaciones:
                get(
                    "recomendacionesInspeccion"
                ) ||
                null,


            necesidades:
                necesidadesLimpias,


            updated_at:
                new Date()
                    .toISOString()

        };


        console.group(
            "SNIC'ELECTRIC - Guardando inspección"
        );


        console.log(
            "Supabase:",
            supabase?.supabaseUrl
        );


        console.log(
            "Resultado formulario:",
            resultadoFormulario
        );


        console.log(
            "Resultado normalizado:",
            resultadoNormalizado
        );


        console.log(
            "Estado:",
            estado
        );


        console.log(
            "Prioridad:",
            prioridad
        );


        console.log(
            "Payload:",
            payload
        );


        console.groupEnd();


        try {

            let inspeccionId;


            /* =================================================
               ACTUALIZAR
            ================================================= */

            if (editando) {

                const {
                    data,
                    error
                } =
                    await sb
                        .from(
                            "inspecciones"
                        )
                        .update(
                            payload
                        )
                        .eq(
                            "id",
                            editando.id
                        )
                        .select(
                            "id"
                        )
                        .single();


                if (error) {

                    throw error;
                }


                inspeccionId =
                    data.id;


            }

            /* =================================================
               INSERTAR
            ================================================= */

            else {

                const {
                    data,
                    error
                } =
                    await sb
                        .from(
                            "inspecciones"
                        )
                        .insert(
                            payload
                        )
                        .select(
                            "id"
                        )
                        .single();


                if (error) {

                    throw error;
                }


                inspeccionId =
                    data.id;

            }


            /* =================================================
               CHECKLIST
            ================================================= */

            await guardarChecklist(
                inspeccionId
            );


            /* =================================================
               FOTOGRAFÍAS ELIMINADAS
            ================================================= */

            if (
                fotosEliminadas.length
            ) {

                await eliminarFotosMarcadas();

            }


            /* =================================================
               FOTOGRAFÍAS NUEVAS
            ================================================= */

            let erroresFotos = [];


            const fotosNuevas =
                fotos.filter(
                    foto =>
                        foto.local &&
                        foto.file
                );


            if (
                fotosNuevas.length
            ) {

                for (
                    const foto
                    of fotosNuevas
                ) {

                    try {

                        await subirUnaFoto(
                            foto.file,
                            inspeccionId,
                            clienteId
                        );


                    } catch (
                        fotoError
                    ) {

                        console.error(
                            "Error subiendo fotografía:",
                            fotoError
                        );


                        erroresFotos.push(
                            fotoError
                        );

                    }

                }

            }


            /* =================================================
               RECARGAR
            ================================================= */

            await cargarInspecciones();


            cerrar();


            /* =================================================
               RESULTADO
            ================================================= */

            if (
                erroresFotos.length
            ) {

                toast(
                    editando
                        ? "Inspección actualizada, pero algunas fotografías no pudieron guardarse."
                        : "Inspección creada, pero algunas fotografías no pudieron guardarse.",
                    "error"
                );


                console.warn(
                    "Errores de fotografías:",
                    erroresFotos
                );


            } else {

                toast(
                    editando
                        ? "Inspección actualizada correctamente."
                        : "Inspección creada correctamente.",
                    "success"
                );

            }


        } catch (error) {

            console.error(
                "Error guardando inspección:",
                error
            );


            toast(
                traducirError(error),
                "error"
            );

        }

    }


    /* =========================================================
       CHECKLIST SUPABASE
    ========================================================= */

    async function guardarChecklist(
        inspeccionId
    ) {

        const sb =
            obtenerSupabase();


        if (!sb) {

            throw new Error(
                "Supabase no está disponible."
            );

        }


        /* -------------------------------------------------
           Eliminar checklist anterior
           ------------------------------------------------- */

        if (editando) {

            const {
                error
            } =
                await sb
                    .from(
                        "inspeccion_items"
                    )
                    .delete()
                    .eq(
                        "inspeccion_id",
                        inspeccionId
                    );


            if (error) {

                throw error;
            }

        }


        /* -------------------------------------------------
           Crear nuevo checklist
           ------------------------------------------------- */

        const rows =
            CHECKLIST.map(
                (
                    item,
                    index
                ) => ({

                    inspeccion_id:
                        inspeccionId,

                    orden:
                        index + 1,

                    categoria:
                        item.id,

                    pregunta:
                        item.label,

                    respuesta:
                        get(
                            `[data-check-status="${item.id}"]`
                        ) ||
                        "bueno",

                    observacion:
                        get(
                            `[data-check-note="${item.id}"]`
                        ) ||
                        null

                })
            );


        const {
            error
        } =
            await sb
                .from(
                    "inspeccion_items"
                )
                .insert(
                    rows
                );


        if (error) {

            throw error;
        }

    }


    /* =========================================================
       FOTOGRAFÍAS
    ========================================================= */

    async function manejarFotos(
        e
    ) {

        const cantidadDisponible =
            MAX_FOTOS -
            fotos.length;


        if (
            cantidadDisponible <= 0
        ) {

            toast(
                `Solo puedes registrar ${MAX_FOTOS} fotografías por inspección.`,
                "error"
            );

            e.target.value = "";

            return;
        }


        const archivos =
            Array.from(
                e.target.files || []
            )
                .slice(
                    0,
                    cantidadDisponible
                );


        if (
            !archivos.length
        ) {

            return;
        }


        for (
            const file
            of archivos
        ) {

            try {

                if (
                    !file.type.startsWith(
                        "image/"
                    )
                ) {

                    console.warn(
                        "Archivo ignorado porque no es una imagen:",
                        file.name
                    );

                    continue;
                }


                const preview =
                    await comprimir(
                        file
                    );


                fotos.push({

                    local:
                        true,

                    file:
                        preview,

                    nombre:
                        preview.name,

                    mime_type:
                        preview.type,

                    tamano:
                        preview.size,

                    data:
                        URL.createObjectURL(
                            preview
                        )

                });


            } catch (error) {

                console.error(
                    "Error procesando foto:",
                    error
                );

                toast(
                    `No fue posible procesar ${file.name}.`,
                    "error"
                );

            }

        }


        e.target.value = "";


        renderFotos();

    }


    async function subirUnaFoto(
        file,
        inspeccionId,
        clienteId
    ) {

        const sb =
            obtenerSupabase();


        if (!sb) {

            throw new Error(
                "Supabase no está disponible."
            );

        }


        if (!file) {

            throw new Error(
                "No se recibió el archivo."
            );

        }


        const extension =
            obtenerExtension(
                file.name,
                file.type
            );


        const nombre =
            `${Date.now()}_${Math.random()
                .toString(36)
                .slice(
                    2,
                    9
                )}.${extension}`;


        const ruta =
            `inspecciones/${usuarioAuth.id}/${inspeccionId}/${nombre}`;


        console.log(
            "Subiendo fotografía:",
            {
                bucket:
                    STORAGE_BUCKET,

                ruta:
                    ruta,

                tipo:
                    file.type,

                tamaño:
                    file.size
            }
        );


        /* -------------------------------------------------
           STORAGE
           ------------------------------------------------- */

        const {
            error:
                uploadError
        } =
            await sb.storage
                .from(
                    STORAGE_BUCKET
                )
                .upload(
                    ruta,
                    file,
                    {

                        cacheControl:
                            "3600",

                        upsert:
                            false,

                        contentType:
                            file.type

                    }
                );


        if (
            uploadError
        ) {

            console.error(
                "Error Storage:",
                uploadError
            );


            if (
                uploadError.message?.includes(
                    "Bucket not found"
                ) ||
                uploadError.name ===
                    "StorageApiError" &&
                uploadError.statusCode ===
                    "404"
            ) {

                throw new Error(
                    `No se encontró el bucket "${STORAGE_BUCKET}". Verifica que este navegador esté conectado al mismo proyecto Supabase donde existe ese bucket.`
                );

            }


            throw uploadError;

        }


        /* -------------------------------------------------
           REGISTRO EN archivos
           ------------------------------------------------- */

        const {
            error:
                archivoError
        } =
            await sb
                .from(
                    "archivos"
                )
                .insert({

                    bucket:
                        STORAGE_BUCKET,

                    ruta:
                        ruta,

                    nombre_archivo:
                        file.name,

                    tipo:
                        "foto",

                    mime_type:
                        file.type,

                    tamano:
                        file.size,

                    cliente_id:
                        clienteId,

                    inspeccion_id:
                        inspeccionId,

                    usuario_id:
                        usuarioAuth.id

                });


        if (
            archivoError
        ) {

            console.error(
                "Error registrando archivo:",
                archivoError
            );


            /* ---------------------------------------------
               Rollback Storage
            --------------------------------------------- */

            try {

                await sb.storage
                    .from(
                        STORAGE_BUCKET
                    )
                    .remove([
                        ruta
                    ]);

            } catch (
                rollbackError
            ) {

                console.warn(
                    "No fue posible eliminar el archivo después del error:",
                    rollbackError
                );

            }


            throw archivoError;

        }


        console.log(
            "Fotografía guardada correctamente:",
            ruta
        );

    }


    async function eliminarFotosMarcadas() {

        const sb =
            obtenerSupabase();


        if (!sb) return;


        if (
            !fotosEliminadas.length
        ) {

            return;
        }


        for (
            const foto
            of fotosEliminadas
        ) {

            try {

                const bucket =
                    foto.bucket ||
                    STORAGE_BUCKET;


                if (
                    foto.ruta
                ) {

                    const {
                        error:
                            storageError
                    } =
                        await sb.storage
                            .from(
                                bucket
                            )
                            .remove([
                                foto.ruta
                            ]);


                    if (
                        storageError
                    ) {

                        console.warn(
                            "No fue posible eliminar foto de Storage:",
                            storageError
                        );

                    }

                }


                if (
                    foto.id
                ) {

                    const {
                        error:
                            archivoError
                    } =
                        await sb
                            .from(
                                "archivos"
                            )
                            .delete()
                            .eq(
                                "id",
                                foto.id
                            );


                    if (
                        archivoError
                    ) {

                        console.warn(
                            "No fue posible eliminar registro de archivo:",
                            archivoError
                        );

                    }

                }


            } catch (
                error
            ) {

                console.warn(
                    "Error eliminando fotografía:",
                    error
                );

            }

        }


        fotosEliminadas = [];

    }


    function comprimir(
        file
    ) {

        return new Promise(
            (
                resolve,
                reject
            ) => {

                const reader =
                    new FileReader();


                reader.onload =
                    () => {

                        const img =
                            new Image();


                        img.onload =
                            () => {

                                const max =
                                    1280;


                                const scale =
                                    Math.min(
                                        1,
                                        max /
                                            img.width,
                                        max /
                                            img.height
                                    );


                                const canvas =
                                    document.createElement(
                                        "canvas"
                                    );


                                canvas.width =
                                    Math.round(
                                        img.width *
                                        scale
                                    );


                                canvas.height =
                                    Math.round(
                                        img.height *
                                        scale
                                    );


                                const context =
                                    canvas.getContext(
                                        "2d"
                                    );


                                context.drawImage(
                                    img,
                                    0,
                                    0,
                                    canvas.width,
                                    canvas.height
                                );


                                canvas.toBlob(
                                    blob => {

                                        if (
                                            !blob
                                        ) {

                                            reject(
                                                new Error(
                                                    "No fue posible comprimir la imagen."
                                                )
                                            );

                                            return;
                                        }


                                        const fileComprimido =
                                            new File(
                                                [
                                                    blob
                                                ],
                                                file.name.replace(
                                                    /\.[^.]+$/,
                                                    ".jpg"
                                                ),
                                                {

                                                    type:
                                                        "image/jpeg"

                                                }
                                            );


                                        resolve(
                                            fileComprimido
                                        );

                                    },
                                    "image/jpeg",
                                    0.72
                                );

                            };


                        img.onerror =
                            reject;


                        img.src =
                            reader.result;

                    };


                reader.onerror =
                    reject;


                reader.readAsDataURL(
                    file
                );

            }
        );

    }


    function obtenerExtension(
        nombre,
        mime
    ) {

        if (
            mime ===
            "image/jpeg"
        ) {

            return "jpg";
        }


        if (
            mime ===
            "image/png"
        ) {

            return "png";
        }


        if (
            mime ===
            "image/webp"
        ) {

            return "webp";
        }


        const partes =
            String(
                nombre || ""
            ).split(".");


        return (
            partes.pop() ||
            "jpg"
        )
            .toLowerCase();

    }


    function renderFotos() {

        const box =
            document.getElementById(
                "photoPreview"
            );


        if (!box) return;


        box.innerHTML =
            fotos
                .map(
                    (
                        foto,
                        index
                    ) => `

                        <div class="photo-item">

                            <img
                                src="${esc(
                                    foto.url ||
                                    foto.data ||
                                    ""
                                )}"
                                alt="${attr(
                                    foto.nombre ||
                                    foto.nombre_archivo ||
                                    "Evidencia"
                                )}"
                            >


                            <button
                                type="button"
                                class="photo-remove"
                                data-remove-photo="${index}"
                                title="Eliminar"
                            >

                                <i
                                    class="fa-solid fa-xmark"
                                ></i>

                            </button>

                        </div>

                    `
                )
                .join("");


        box
            .querySelectorAll(
                "[data-remove-photo]"
            )
            .forEach(
                button => {

                    button.addEventListener(
                        "click",
                        () => {

                            const index =
                                Number(
                                    button.dataset
                                        .removePhoto
                                );


                            const foto =
                                fotos[index];


                            if (
                                foto &&
                                !foto.local &&
                                foto.id
                            ) {

                                fotosEliminadas.push(
                                    foto
                                );

                            }


                            if (
                                foto?.data
                            ) {

                                try {

                                    URL.revokeObjectURL(
                                        foto.data
                                    );

                                } catch (
                                    error
                                ) {}

                            }


                            fotos.splice(
                                index,
                                1
                            );


                            renderFotos();

                        }
                    );

                }
            );

    }


    /* =========================================================
       RENDER TABLA
    ========================================================= */

    function render() {

        const body =
            document.getElementById(
                "inspeccionesTableBody"
            );


        const empty =
            document.getElementById(
                "inspeccionesEmpty"
            );


        if (!body) return;


        const q =
            get(
                "buscarInspeccion"
            )
                .toLowerCase();


        const estado =
            get(
                "filtroEstado"
            );


        const resultado =
            get(
                "filtroResultado"
            );


        const rows =
            inspecciones.filter(
                inspeccion => {

                    const texto =
                        [

                            inspeccion.id,

                            inspeccion.clienteNombre,

                            inspeccion.clienteDocumento,

                            inspeccion.direccion,

                            inspeccion.ciudad,

                            inspeccion.tecnico

                        ]
                            .join(" ")
                            .toLowerCase();


                    return (

                        (
                            !q ||
                            texto.includes(
                                q
                            )
                        )

                        &&

                        (
                            !estado ||
                            inspeccion.estado ===
                            estado
                        )

                        &&

                        (
                            !resultado ||
                            inspeccion.resultado ===
                            resultado
                        )

                    );

                }
            );


        body.innerHTML =
            rows
                .map(
                    inspeccion => `

                        <tr>

                            <td>

                                <div class="record-main">

                                    <strong>

                                        ${esc(
                                            codigoInspeccion(
                                                inspeccion
                                            )
                                        )}

                                    </strong>


                                    <span>

                                        ${esc(
                                            tipoTexto(
                                                inspeccion.tipo_inspeccion
                                            )
                                        )}

                                    </span>

                                </div>

                            </td>


                            <td>

                                <div class="record-main">

                                    <strong>

                                        ${esc(
                                            inspeccion.clienteNombre ||
                                            "Sin cliente"
                                        )}

                                    </strong>


                                    <span>

                                        ${esc(
                                            inspeccion.clienteDocumento ||
                                            ""
                                        )}

                                    </span>

                                </div>

                            </td>


                            <td>

                                ${esc(
                                    formatearFecha(
                                        inspeccion.fecha_inspeccion
                                    )
                                )}

                            </td>


                            <td>

                                ${esc(
                                    inspeccion.tecnico ||
                                    "Técnico"
                                )}

                            </td>


                            <td>

                                <span
                                    class="result-pill result-${esc(
                                        inspeccion.resultado
                                    )}"
                                >

                                    ${esc(
                                        resultadoTexto(
                                            inspeccion.resultado
                                        )
                                    )}

                                </span>

                            </td>


                            <td>

                                <span
                                    class="status-pill status-${esc(
                                        inspeccion.estado
                                    )}"
                                >

                                    <i
                                        class="fa-solid fa-circle"
                                    ></i>

                                    ${esc(
                                        estadoTexto(
                                            inspeccion.estado
                                        )
                                    )}

                                </span>

                            </td>


                            <td>

                                <div class="row-actions">

                                    <button
                                        type="button"
                                        class="action-button"
                                        data-action="view"
                                        data-id="${esc(
                                            inspeccion.id
                                        )}"
                                        title="Ver"
                                    >

                                        <i
                                            class="fa-solid fa-eye"
                                        ></i>

                                    </button>


                                    <button
                                        type="button"
                                        class="action-button"
                                        data-action="edit"
                                        data-id="${esc(
                                            inspeccion.id
                                        )}"
                                        data-permission="inspecciones.editar"
                                        title="Editar"
                                    >

                                        <i
                                            class="fa-solid fa-pen"
                                        ></i>

                                    </button>


                                    <button
                                        type="button"
                                        class="action-button danger"
                                        data-action="delete"
                                        data-id="${esc(
                                            inspeccion.id
                                        )}"
                                        title="Eliminar"
                                    >

                                        <i
                                            class="fa-solid fa-trash"
                                        ></i>

                                    </button>

                                </div>

                            </td>

                        </tr>

                    `
                )
                .join("");


        if (empty) {

            empty.hidden =
                rows.length !== 0;

        }


        const table =
            body.closest(
                "table"
            );


        if (table) {

            table.style.display =
                rows.length
                    ? "table"
                    : "none";

        }


        if (
            SNICAuth.aplicarPermisos
        ) {

            SNICAuth.aplicarPermisos();

        }

    }


    function codigoInspeccion(
        inspeccion
    ) {

        return `INSP-${String(
            inspeccion.id || ""
        )
            .replace(
                /-/g,
                ""
            )
            .slice(
                0,
                8
            )
            .toUpperCase()}`;

    }


    /* =========================================================
       ESTADÍSTICAS
    ========================================================= */

    function estadisticas() {

        setText(
            "totalInspecciones",
            inspecciones.length
        );


        setText(
            "inspeccionesCompletadas",
            inspecciones.filter(
                x =>
                    x.estado ===
                    "completada"
            ).length
        );


        setText(
            "inspeccionesIntervencion",
            inspecciones.filter(
                x =>
                    x.resultado ===
                    "requiere_intervencion"
            ).length
        );


        setText(
            "inspeccionesPendientes",
            inspecciones.filter(
                x =>
                    x.estado !==
                    "completada"
            ).length
        );

    }


    /* =========================================================
       ACCIONES
    ========================================================= */

    function manejarAcciones(
        e
    ) {

        const button =
            e.target.closest(
                "[data-action]"
            );


        if (!button) return;


        const id =
            button.dataset.id;


        const inspeccion =
            inspecciones.find(
                x =>
                    x.id === id
            );


        if (!inspeccion) return;


        switch (
            button.dataset.action
        ) {

            case "view":

                detalle(
                    inspeccion
                );

                break;


            case "edit":

                abrir(
                    id
                );

                break;


            case "delete":

                eliminar(
                    inspeccion
                );

                break;

        }

    }


    /* =========================================================
       ELIMINAR INSPECCIÓN
       SOLO ADMINISTRADOR
    ========================================================= */

    async function eliminar(
        inspeccion
    ) {

        const rol =
            String(
                SNICAuth.obtenerRolActual?.() ||
                ""
            )
                .trim()
                .toLowerCase();


        if (
            rol !==
            "administrador"
        ) {

            toast(
                "Solo el Administrador puede eliminar inspecciones.",
                "error"
            );

            return;
        }


        if (
            !confirm(
                `¿Eliminar la inspección ${codigoInspeccion(
                    inspeccion
                )}? Esta acción no se puede deshacer.`
            )
        ) {

            return;
        }


        const sb =
            obtenerSupabase();


        if (!sb) return;


        try {

            /* -------------------------------------------------
               Buscar archivos
               ------------------------------------------------- */

            const {
                data:
                    listaArchivos,
                error:
                    archivosConsultaError
            } =
                await sb
                    .from(
                        "archivos"
                    )
                    .select(
                        "id,ruta,bucket"
                    )
                    .eq(
                        "inspeccion_id",
                        inspeccion.id
                    );


            if (
                archivosConsultaError
            ) {

                throw archivosConsultaError;

            }


            const lista =
                listaArchivos ||
                [];


            /* -------------------------------------------------
               Eliminar archivos de Storage
               ------------------------------------------------- */

            const buckets =
                [
                    ...new Set(
                        lista
                            .map(
                                archivo =>
                                    archivo.bucket ||
                                    STORAGE_BUCKET
                            )
                            .filter(Boolean)
                    )
                ];


            for (
                const bucket
                of buckets
            ) {

                const rutasBucket =
                    lista
                        .filter(
                            archivo =>
                                (
                                    archivo.bucket ||
                                    STORAGE_BUCKET
                                ) ===
                                bucket
                        )
                        .map(
                            archivo =>
                                archivo.ruta
                        )
                        .filter(Boolean);


                if (
                    !rutasBucket.length
                ) {

                    continue;
                }


                const {
                    error:
                        storageError
                } =
                    await sb.storage
                        .from(
                            bucket
                        )
                        .remove(
                            rutasBucket
                        );


                if (
                    storageError
                ) {

                    console.warn(
                        "No fue posible eliminar algunas fotografías:",
                        storageError
                    );

                }

            }


            /* -------------------------------------------------
               Eliminar registros archivos
               ------------------------------------------------- */

            const {
                error:
                    archivosDeleteError
            } =
                await sb
                    .from(
                        "archivos"
                    )
                    .delete()
                    .eq(
                        "inspeccion_id",
                        inspeccion.id
                    );


            if (
                archivosDeleteError
            ) {

                throw archivosDeleteError;

            }


            /* -------------------------------------------------
               Eliminar checklist
               ------------------------------------------------- */

            const {
                error:
                    itemsError
            } =
                await sb
                    .from(
                        "inspeccion_items"
                    )
                    .delete()
                    .eq(
                        "inspeccion_id",
                        inspeccion.id
                    );


            if (
                itemsError
            ) {

                throw itemsError;

            }


            /* -------------------------------------------------
               Eliminar inspección
               ------------------------------------------------- */

            const {
                error:
                    inspeccionError
            } =
                await sb
                    .from(
                        "inspecciones"
                    )
                    .delete()
                    .eq(
                        "id",
                        inspeccion.id
                    );


            if (
                inspeccionError
            ) {

                throw inspeccionError;

            }


            await cargarInspecciones();


            toast(
                "Inspección eliminada correctamente.",
                "success"
            );


        } catch (error) {

            console.error(
                "Error eliminando inspección:",
                error
            );


            toast(
                traducirError(error),
                "error"
            );

        }

    }


    /* =========================================================
       DETALLE
    ========================================================= */

    function detalle(
        inspeccion
    ) {

        const box =
            document.getElementById(
                "detalleInspeccionContenido"
            );


        if (!box) return;


        const checks =
            (
                inspeccion.checklist ||
                []
            )
                .map(
                    check => `

                        <div class="detail-check">

                            <strong>

                                ${esc(
                                    check.nombre
                                )}

                            </strong>


                            <span>

                                ${esc(
                                    estadoChecklist(
                                        check.estado
                                    )
                                )}

                                ${
                                    check.observacion
                                        ? " · " +
                                            esc(
                                                check.observacion
                                            )
                                        : ""
                                }

                            </span>

                        </div>

                    `
                )
                .join("");


        const needs =
            (
                inspeccion.necesidades ||
                []
            )
                .map(
                    necesidad => `

                        <tr>

                            <td>

                                ${esc(
                                    necesidad.descripcion
                                )}

                            </td>


                            <td>

                                ${esc(
                                    necesidad.cantidad
                                )}

                            </td>


                            <td>

                                ${esc(
                                    necesidad.unidad
                                )}

                            </td>


                            <td>

                                ${esc(
                                    necesidad.prioridad
                                )}

                            </td>

                        </tr>

                    `
                )
                .join("");


        const photos =
            (
                inspeccion.fotos ||
                []
            )
                .filter(
                    foto =>
                        foto.url
                )
                .map(
                    foto => `

                        <a
                            href="${esc(
                                foto.url
                            )}"
                            target="_blank"
                            rel="noopener noreferrer"
                        >

                            <img
                                src="${esc(
                                    foto.url
                                )}"
                                alt="${attr(
                                    foto.nombre_archivo ||
                                    foto.nombre ||
                                    "Evidencia"
                                )}"
                            >

                        </a>

                    `
                )
                .join("");


        box.innerHTML = `

            <div class="detail-body">


                <div class="detail-hero">


                    <div class="detail-panel">


                        <h3>

                            ${esc(
                                codigoInspeccion(
                                    inspeccion
                                )
                            )}

                            ·

                            ${esc(
                                inspeccion.clienteNombre ||
                                ""
                            )}

                        </h3>


                        <div class="detail-meta-grid">


                            <div class="detail-meta-item">

                                <span>
                                    Fecha
                                </span>


                                <strong>

                                    ${esc(
                                        formatearFecha(
                                            inspeccion.fecha_inspeccion
                                        )
                                    )}

                                </strong>

                            </div>


                            <div class="detail-meta-item">

                                <span>
                                    Técnico
                                </span>


                                <strong>

                                    ${esc(
                                        inspeccion.tecnico ||
                                        "Técnico"
                                    )}

                                </strong>

                            </div>


                            <div class="detail-meta-item">

                                <span>
                                    Dirección
                                </span>


                                <strong>

                                    ${esc(
                                        inspeccion.direccion ||
                                        "-"
                                    )}

                                </strong>

                            </div>


                            <div class="detail-meta-item">

                                <span>
                                    Ciudad
                                </span>


                                <strong>

                                    ${esc(
                                        inspeccion.ciudad ||
                                        "-"
                                    )}

                                </strong>

                            </div>


                        </div>

                    </div>


                    <div class="detail-panel">


                        <h3>
                            Resultado
                        </h3>


                        <p>

                            <span
                                class="result-pill result-${esc(
                                    inspeccion.resultado
                                )}"
                            >

                                ${esc(
                                    resultadoTexto(
                                        inspeccion.resultado
                                    )
                                )}

                            </span>

                        </p>


                        <div
                            class="detail-meta-item"
                            style="margin-top:12px"
                        >

                            <span>
                                Prioridad
                            </span>


                            <strong>

                                ${esc(
                                    inspeccion.prioridad ||
                                    "normal"
                                )}

                            </strong>

                        </div>


                        <div
                            style="margin-top:8px"
                        >

                            <span
                                class="status-pill status-${esc(
                                    inspeccion.estado
                                )}"
                            >

                                ${esc(
                                    estadoTexto(
                                        inspeccion.estado
                                    )
                                )}

                            </span>

                        </div>


                    </div>


                </div>


                <div class="detail-panel">


                    <h3>
                        Estado de la instalación
                    </h3>


                    <div class="detail-checklist">

                        ${
                            checks ||
                            '<div class="mini-empty">Sin checklist registrado.</div>'
                        }

                    </div>


                </div>


                <div class="detail-panel">


                    <h3>
                        Hallazgos
                    </h3>


                    <div class="detail-text">

                        ${esc(
                            inspeccion.hallazgos ||
                            "Sin hallazgos registrados."
                        )}

                    </div>


                    <h3
                        style="margin-top:16px"
                    >
                        Recomendaciones
                    </h3>


                    <div class="detail-text">

                        ${esc(
                            inspeccion.recomendaciones ||
                            "Sin recomendaciones registradas."
                        )}

                    </div>


                </div>


                <div class="detail-panel">


                    <h3>
                        Necesidades detectadas
                    </h3>


                    ${
                        needs
                            ? `

                                <div class="table-wrapper">

                                    <table class="inspecciones-table">

                                        <thead>

                                            <tr>

                                                <th>
                                                    DESCRIPCIÓN
                                                </th>

                                                <th>
                                                    CANT.
                                                </th>

                                                <th>
                                                    UNIDAD
                                                </th>

                                                <th>
                                                    PRIORIDAD
                                                </th>

                                            </tr>

                                        </thead>


                                        <tbody>

                                            ${needs}

                                        </tbody>

                                    </table>

                                </div>

                            `
                            : `

                                <div class="mini-empty">

                                    No se registraron necesidades.

                                </div>

                            `
                    }


                </div>


                <div class="detail-panel">


                    <h3>
                        Evidencia fotográfica
                    </h3>


                    ${
                        photos
                            ? `

                                <div class="detail-photos">

                                    ${photos}

                                </div>

                            `
                            : `

                                <div class="mini-empty">

                                    No hay fotografías.

                                </div>

                            `
                    }


                </div>


                <div class="modal-footer detail-footer">


                    <button
                        type="button"
                        class="btn-secondary"
                        data-detail-edit="${esc(
                            inspeccion.id
                        )}"
                        data-permission="inspecciones.editar"
                    >

                        <i
                            class="fa-solid fa-pen"
                        ></i>

                        Editar

                    </button>


                    <button
                        type="button"
                        class="btn-primary quote-disabled"
                        disabled
                        title="Se habilitará al construir Cotizaciones"
                    >

                        <i
                            class="fa-solid fa-file-signature"
                        ></i>

                        Preparar cotización

                    </button>


                </div>


            </div>

        `;


        const modal =
            document.getElementById(
                "detalleInspeccionModal"
            );


        if (!modal) return;


        modal.classList.add(
            "show"
        );


        modal.setAttribute(
            "aria-hidden",
            "false"
        );


        document.body.classList.add(
            "modal-open"
        );


        const editButton =
            box.querySelector(
                "[data-detail-edit]"
            );


        if (editButton) {

            editButton.addEventListener(
                "click",
                () => {

                    cerrarDetalle();

                    abrir(
                        inspeccion.id
                    );

                }
            );

        }


        if (
            SNICAuth.aplicarPermisos
        ) {

            SNICAuth.aplicarPermisos();

        }

    }


    function cerrarDetalle() {

        const modal =
            document.getElementById(
                "detalleInspeccionModal"
            );


        if (!modal) return;


        modal.classList.remove(
            "show"
        );


        modal.setAttribute(
            "aria-hidden",
            "true"
        );


        document.body.classList.remove(
            "modal-open"
        );

    }


    /* =========================================================
       NECESIDADES
    ========================================================= */

    function agregarNecesidad(
        data = {}
    ) {

        necesidades.push({

            descripcion:
                data.descripcion ||
                "",

            cantidad:
                data.cantidad ||
                1,

            unidad:
                data.unidad ||
                "unidad",

            prioridad:
                data.prioridad ||
                "normal"

        });


        renderNecesidades();

    }


    function renderNecesidades() {

        const box =
            document.getElementById(
                "necesidadesContainer"
            );


        const empty =
            document.getElementById(
                "necesidadesEmpty"
            );


        if (!box) return;


        box.innerHTML =
            necesidades
                .map(
                    (
                        n,
                        i
                    ) => `

                        <div class="need-row">


                            <input
                                type="text"
                                data-need="descripcion"
                                data-index="${i}"
                                value="${attr(
                                    n.descripcion
                                )}"
                                placeholder="Ej. Cambio de cableado"
                            >


                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                data-need="cantidad"
                                data-index="${i}"
                                value="${attr(
                                    n.cantidad
                                )}"
                            >


                            <select
                                data-need="unidad"
                                data-index="${i}"
                            >

                                <option
                                    value="unidad"
                                    ${
                                        n.unidad ===
                                        "unidad"
                                            ? "selected"
                                            : ""
                                    }
                                >
                                    Unidad
                                </option>


                                <option
                                    value="metro"
                                    ${
                                        n.unidad ===
                                        "metro"
                                            ? "selected"
                                            : ""
                                    }
                                >
                                    Metro
                                </option>


                                <option
                                    value="rollo"
                                    ${
                                        n.unidad ===
                                        "rollo"
                                            ? "selected"
                                            : ""
                                    }
                                >
                                    Rollo
                                </option>


                                <option
                                    value="servicio"
                                    ${
                                        n.unidad ===
                                        "servicio"
                                            ? "selected"
                                            : ""
                                    }
                                >
                                    Servicio
                                </option>


                                <option
                                    value="otro"
                                    ${
                                        n.unidad ===
                                        "otro"
                                            ? "selected"
                                            : ""
                                    }
                                >
                                    Otro
                                </option>


                            </select>


                            <select
                                data-need="prioridad"
                                data-index="${i}"
                            >

                                <option
                                    value="normal"
                                    ${
                                        n.prioridad ===
                                        "normal"
                                            ? "selected"
                                            : ""
                                    }
                                >
                                    Normal
                                </option>


                                <option
                                    value="alta"
                                    ${
                                        n.prioridad ===
                                        "alta"
                                            ? "selected"
                                            : ""
                                    }
                                >
                                    Alta
                                </option>


                                <option
                                    value="urgente"
                                    ${
                                        n.prioridad ===
                                        "urgente"
                                            ? "selected"
                                            : ""
                                    }
                                >
                                    Urgente
                                </option>


                            </select>


                            <button
                                type="button"
                                class="remove-need"
                                data-remove-need="${i}"
                                title="Eliminar"
                            >

                                <i
                                    class="fa-solid fa-trash"
                                ></i>

                            </button>


                        </div>

                    `
                )
                .join("");


        if (empty) {

            empty.hidden =
                necesidades.length > 0;

        }


        box
            .querySelectorAll(
                "[data-need]"
            )
            .forEach(
                element => {

                    element.addEventListener(
                        "input",
                        () => {

                            const index =
                                Number(
                                    element.dataset
                                        .index
                                );


                            const campo =
                                element.dataset
                                    .need;


                            if (
                                necesidades[index]
                            ) {

                                necesidades[index][
                                    campo
                                ] =
                                    element.value;

                            }

                        }
                    );

                }
            );


        box
            .querySelectorAll(
                "[data-remove-need]"
            )
            .forEach(
                button => {

                    button.addEventListener(
                        "click",
                        () => {

                            const index =
                                Number(
                                    button.dataset
                                        .removeNeed
                                );


                            necesidades.splice(
                                index,
                                1
                            );


                            renderNecesidades();

                        }
                    );

                }
            );

    }


    /* =========================================================
       UTILIDADES
    ========================================================= */

    function set(
        selector,
        value
    ) {

        const element =
            typeof selector ===
                "string" &&
            selector.startsWith("[")
                ? document.querySelector(
                    selector
                )
                : document.getElementById(
                    selector
                );


        if (element) {

            element.value =
                value ?? "";

        }

    }


    function get(
        selector
    ) {

        const element =
            typeof selector ===
                "string" &&
            selector.startsWith("[")
                ? document.querySelector(
                    selector
                )
                : document.getElementById(
                    selector
                );


        return element
            ? String(
                element.value || ""
            ).trim()
            : "";

    }


    function setText(
        id,
        value
    ) {

        const element =
            document.getElementById(
                id
            );


        if (element) {

            element.textContent =
                value;

        }

    }


    function formatearFecha(
        value
    ) {

        if (!value) {

            return "-";
        }


        const partes =
            String(
                value
            ).split("-");


        return partes.length === 3
            ? `${partes[2]}/${partes[1]}/${partes[0]}`
            : value;

    }


    function tipoTexto(
        value
    ) {

        return {

            inicial:
                "Inspección inicial",

            mantenimiento:
                "Mantenimiento",

            diagnostico:
                "Diagnóstico de falla",

            seguimiento:
                "Seguimiento"

        }[
            value
        ] ||
            value ||
            "-";

    }


    function resultadoTexto(
        value
    ) {

        return {

            sin_novedades:
                "Sin novedades",

            requiere_intervencion:
                "Requiere intervención",

            no_conforme:
                "No conforme",

            pendiente:
                "Pendiente"

        }[
            value
        ] ||
            value ||
            "-";

    }


    function estadoTexto(
        value
    ) {

        return {

            pendiente:
                "Pendiente",

            en_proceso:
                "En proceso",

            completada:
                "Completada",

            cancelada:
                "Cancelada"

        }[
            value
        ] ||
            value ||
            "-";

    }


    function estadoChecklist(
        value
    ) {

        return {

            bueno:
                "Bueno",

            regular:
                "Regular",

            malo:
                "Malo",

            no_aplica:
                "No aplica"

        }[
            value
        ] ||
            value ||
            "-";

    }


    function esc(
        value
    ) {

        return String(
            value ?? ""
        ).replace(
            /[&<>"']/g,
            character =>
                ({
                    "&":
                        "&amp;",

                    "<":
                        "&lt;",

                    ">":
                        "&gt;",

                    '"':
                        "&quot;",

                    "'":
                        "&#039;"

                })[
                    character
                ]
        );

    }


    function attr(
        value
    ) {

        return esc(
            value
        );

    }


    /* =========================================================
       ERRORES
    ========================================================= */

    function traducirError(
        error
    ) {

        if (!error) {

            return (
                "No fue posible completar la operación."
            );

        }


        console.error(
            "Error original:",
            error
        );


        /* -------------------------------------------------
           CHECK CONSTRAINT
        ------------------------------------------------- */

        if (
            error.code ===
            "23514"
        ) {

            if (
                error.message?.includes(
                    "inspecciones_resultado_check"
                )
            ) {

                return (
                    "El resultado de la inspección no es válido. Usa: Sin novedades, Requiere intervención, No conforme o Pendiente."
                );

            }


            if (
                error.message?.includes(
                    "inspecciones_estado_check"
                )
            ) {

                return (
                    "El estado de la inspección no es válido."
                );

            }


            if (
                error.message?.includes(
                    "inspecciones_prioridad_check"
                )
            ) {

                return (
                    "La prioridad de la inspección no es válida."
                );

            }


            return (
                "Uno de los valores seleccionados no es válido para la base de datos."
            );

        }


        /* -------------------------------------------------
           RLS
        ------------------------------------------------- */

        if (
            error.code ===
            "42501"
        ) {

            return (
                "Supabase rechazó la operación por permisos RLS."
            );

        }


        /* -------------------------------------------------
           FK
        ------------------------------------------------- */

        if (
            error.code ===
            "23503"
        ) {

            return (
                "El cliente, usuario o registro relacionado no es válido."
            );

        }


        /* -------------------------------------------------
           UNIQUE
        ------------------------------------------------- */

        if (
            error.code ===
            "23505"
        ) {

            return (
                "Ya existe un registro con esos datos."
            );

        }


        /* -------------------------------------------------
           ARCHIVOS NO EN SCHEMA CACHE
        ------------------------------------------------- */

        if (
            error.code ===
            "PGRST205"
        ) {

            if (
                error.message?.includes(
                    "archivos"
                )
            ) {

                return (
                    "Supabase no está mostrando la tabla archivos en el schema cache. La tabla existe, pero es necesario recargar el schema de PostgREST."
                );

            }


            return (
                "Supabase no encuentra una tabla en el schema actual."
            );

        }


        /* -------------------------------------------------
           STORAGE BUCKET
        ------------------------------------------------- */

        if (
            error.message?.includes(
                "Bucket not found"
            )
        ) {

            return (
                `No se encontró el bucket "${STORAGE_BUCKET}". Verifica que el proyecto Supabase usado por la aplicación sea el mismo donde existe el bucket.`
            );

        }


        if (
            error.name ===
            "StorageApiError"
        ) {

            return (
                error.message ||
                "Supabase Storage rechazó la operación."
            );

        }


        /* -------------------------------------------------
           MENSAJE NORMAL
        ------------------------------------------------- */

        return (
            error.message ||
            "No fue posible completar la operación."
        );

    }


    /* =========================================================
       TOAST
    ========================================================= */

    function toast(
        message,
        type = "success"
    ) {

        const box =
            document.getElementById(
                "toast"
            );


        const icon =
            document.getElementById(
                "toastIcon"
            );


        const text =
            document.getElementById(
                "toastMessage"
            );


        if (
            !box ||
            !icon ||
            !text
        ) {

            console[type === "error"
                ? "error"
                : "log"](
                message
            );

            return;
        }


        text.textContent =
            message;


        icon.className =
            type === "error"
                ? "fa-solid fa-circle-exclamation"
                : "fa-solid fa-circle-check";


        box.classList.remove(
            "success",
            "error"
        );


        box.classList.add(
            type,
            "show"
        );


        clearTimeout(
            window.__snicToast
        );


        window.__snicToast =
            setTimeout(
                () =>
                    box.classList.remove(
                        "show"
                    ),
                3200
            );

    }


})();
