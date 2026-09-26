/* =========================================================
   SNIC'ELECTRIC
   DASHBOARD.JS
   DASHBOARD CENTRAL
   VERSIÓN CORREGIDA - SUPABASE
========================================================= */

(function () {

    "use strict";


    /* =====================================================
       INICIO
    ===================================================== */

    document.addEventListener(
        "DOMContentLoaded",
        iniciarDashboard
    );


    async function iniciarDashboard() {

        console.log(
            "SNIC'ELECTRIC - Iniciando Dashboard..."
        );

        /* =================================================
           ESPERAR A QUE AUTH.JS TERMINE DE RESTAURAR SUPABASE
        ================================================= */
        try {
            if (window.SNICAuth?.ready) {
                await window.SNICAuth.ready;
            } else if (window.SNICAuth?.restaurarSesionSupabase) {
                await window.SNICAuth.restaurarSesionSupabase();
            }
        } catch (error) {
            console.error(
                "SNIC'ELECTRIC - Error esperando autenticación:",
                error
            );
        }


        /* =================================================
           VERIFICAR AUTH
        ================================================= */

        if (
            typeof window.SNICAuth === "undefined"
        ) {

            console.error(
                "SNIC'ELECTRIC - auth.js no está disponible."
            );

            window.location.href = "login.html";

            return;
        }


        /* =================================================
           VERIFICAR SUPABASE
        ================================================= */

        const supabase =
            window.supabaseClient;


        if (
            !supabase ||
            typeof supabase.from !== "function"
        ) {

            console.error(
                "SNIC'ELECTRIC - supabaseClient no está disponible."
            );

            mostrarErrorEstadisticas();

            return;
        }


        /* =================================================
           PROTEGER DASHBOARD
        ================================================= */

        if (
            typeof window.SNICAuth.protegerPagina ===
            "function"
        ) {

            const permisoInicio =
                window.SNICAuth.PERMISOS?.INICIO_VER ||
                "inicio.ver";

            const acceso =
                window.SNICAuth.protegerPagina(
                    permisoInicio
                );

            if (!acceso) {

                return;

            }

        }


        /* =================================================
           MOSTRAR USUARIO
        ================================================= */

        mostrarUsuario();


        /* =================================================
           APLICAR PERMISOS VISUALES
        ================================================= */

        if (
            typeof window.SNICAuth.aplicarPermisos ===
            "function"
        ) {

            window.SNICAuth.aplicarPermisos();

        }


        /* =================================================
           NAVEGACIÓN
        ================================================= */

        configurarNavegacion();


        /* =================================================
           CERRAR SESIÓN
        ================================================= */

        configurarCerrarSesion();


        /* =================================================
           ESTADÍSTICAS
        ================================================= */

        await actualizarEstadisticas();


        /* =================================================
           RELOJ
        ================================================= */

        iniciarReloj();


        console.log(
            "SNIC'ELECTRIC - Dashboard cargado correctamente."
        );

    }


    /* =====================================================
       MOSTRAR USUARIO
    ===================================================== */
    

    function mostrarUsuario() {
        let usuario = null;

        try {
            usuario = window.SNICAuth?.obtenerUsuarioActual?.() || null;
        } catch (error) {
            console.error(
                "SNIC'ELECTRIC - Error obteniendo usuario:",
                error
            );
        }

        if (!usuario) {
            console.warn(
                "SNIC'ELECTRIC - No se encontró usuario autenticado para el dashboard."
            );
            return;
        }

        const nombre = String(usuario.nombre || "").trim();
        const apellido = String(usuario.apellido || "").trim();
        const nombreCompleto = [nombre, apellido].filter(Boolean).join(" ");
        const nombreMostrar = nombreCompleto || usuario.email || "Usuario";

        document.querySelectorAll("[data-user-name]").forEach(elemento => {
            elemento.textContent = nombreMostrar;
        });

        document.querySelectorAll("[data-user-email]").forEach(elemento => {
            elemento.textContent = usuario.email || "";
        });

        document.querySelectorAll("[data-user-role]").forEach(elemento => {
            elemento.textContent = formatearRol(usuario.rol);
        });

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

        if (!rol) {

            return "";

        }


        const rolNormalizado =
            String(rol)
                .trim()
                .toLowerCase()
                .normalize("NFD")
                .replace(
                    /[\u0300-\u036f]/g,
                    ""
                );


        const roles = {

            administrador:
                "Administrador",

            administrativo:
                "Administrativo",

            tecnico:
                "Técnico"

        };


        return (
            roles[rolNormalizado] ||
            String(rol)
                .replace(/_/g, " ")
                .replace(
                    /\b\w/g,
                    letra =>
                        letra.toUpperCase()
                )
        );

    }


    /* =====================================================
       NAVEGACIÓN
    ===================================================== */

    function configurarNavegacion() {

        const enlaces =
            document.querySelectorAll(
                "[data-permission]"
            );


        enlaces.forEach(enlace => {

            const permiso =
                enlace.dataset.permission;


            if (!permiso) {

                return;

            }


            /*
             * La navegación sí respeta los permisos
             * del usuario.
             *
             * Esto NO bloquea las consultas de las
             * estadísticas.
             */

            try {

                if (
                    typeof window.SNICAuth.tienePermiso ===
                    "function"
                ) {

                    const permitido =
                        window.SNICAuth.tienePermiso(
                            permiso
                        );


                    if (!permitido) {

                        enlace.style.display =
                            "none";

                    }

                }

            } catch (error) {

                console.warn(
                    "SNIC'ELECTRIC - No se pudo aplicar permiso visual:",
                    permiso,
                    error
                );

            }

        });


        /* =================================================
           MENÚ MÓVIL
        ================================================= */

        const menuButton =
            document.querySelector(
                "[data-menu-toggle]"
            );


        const sidebar =
            document.querySelector(
                ".sidebar"
            );


        if (
            menuButton &&
            sidebar
        ) {

            menuButton.addEventListener(
                "click",
                function () {

                    sidebar.classList.toggle(
                        "active"
                    );

                }
            );

        }


        /* =================================================
           CERRAR SIDEBAR
        ================================================= */

        document
            .querySelectorAll(".sidebar a")
            .forEach(enlace => {

                enlace.addEventListener(
                    "click",
                    function () {

                        if (
                            window.innerWidth <=
                            900
                        ) {

                            sidebar?.classList.remove(
                                "active"
                            );

                        }

                    }
                );

            });

    }


    /* =====================================================
       CERRAR SESIÓN
    ===================================================== */

    function configurarCerrarSesion() {

        const botones =
            document.querySelectorAll(
                "[data-logout]"
            );


        botones.forEach(boton => {

            boton.addEventListener(
                "click",
                function (event) {

                    event.preventDefault();


                    const confirmar =
                        window.confirm(
                            "¿Deseas cerrar la sesión?"
                        );


                    if (!confirmar) {

                        return;

                    }


                    if (
                        window.SNICAuth &&
                        typeof window.SNICAuth.cerrarSesion ===
                        "function"
                    ) {

                        window.SNICAuth.cerrarSesion();

                    }

                }
            );

        });


        /* Compatibilidad */

        const logout =
            document.getElementById("logout");


        if (
            logout &&
            !logout.dataset.logoutConfigured
        ) {

            logout.dataset.logoutConfigured =
                "true";


            logout.addEventListener(
                "click",
                function (event) {

                    event.preventDefault();


                    if (
                        window.confirm(
                            "¿Deseas cerrar la sesión?"
                        )
                    ) {

                        if (
                            window.SNICAuth &&
                            typeof window.SNICAuth.cerrarSesion ===
                            "function"
                        ) {

                            window.SNICAuth.cerrarSesion();

                        }

                    }

                }
            );

        }

    }


    /* =====================================================
       ESTADÍSTICAS
    ===================================================== */

    async function actualizarEstadisticas() {

        console.log(
            "SNIC'ELECTRIC - Consultando estadísticas en Supabase..."
        );


        prepararTarjetas();


        /*
         * IMPORTANTE:
         *
         * Aquí NO usamos tienePermiso().
         *
         * Las consultas van directamente a Supabase.
         *
         * Si RLS permite la lectura:
         *      → se muestra el dato.
         *
         * Si RLS la bloquea:
         *      → mostramos 0 y registramos el error.
         */


        await cargarTotalTabla({

            tabla: "clientes",

            ids: [
                "totalClientes",
                "clientesTotal"
            ],

            nombre: "clientes"

        });


        await cargarProductos();


        await cargarTotalTabla({

            tabla: "cotizaciones",

            ids: [
                "totalCotizaciones",
                "cotizacionesTotal"
            ],

            nombre: "cotizaciones"

        });


        await cargarTotalTabla({

            tabla: "facturas",

            ids: [
                "totalFacturas",
                "facturasTotal"
            ],

            nombre: "facturas"

        });


        console.log(
            "SNIC'ELECTRIC - Estadísticas Supabase actualizadas."
        );

    }


    /* =====================================================
       PREPARAR TARJETAS
    ===================================================== */

    function prepararTarjetas() {

        const ids = [

            "totalClientes",
            "clientesTotal",

            "totalProductos",
            "productosTotal",
            "totalInventario",
            "inventarioTotal",

            "totalCotizaciones",
            "cotizacionesTotal",

            "totalFacturas",
            "facturasTotal"

        ];


        ids.forEach(id => {

            const elemento =
                document.getElementById(id);


            if (!elemento) {

                return;

            }


            const texto =
                elemento.textContent
                    .trim()
                    .toLowerCase();


            if (
                texto === "cargando..." ||
                texto === "cargando"
            ) {

                elemento.textContent = "0";

            }

        });

    }


    /* =====================================================
       CONTAR TABLA
    ===================================================== */

    async function cargarTotalTabla(
        configuracion
    ) {

        const {
            tabla,
            ids,
            nombre
        } = configuracion;


        try {

            console.log(
                `SNIC'ELECTRIC - Consultando ${tabla} en Supabase...`
            );


            const {
                count,
                error
            } =
                await window.supabaseClient
                    .from(tabla)
                    .select(
                        "id",
                        {
                            count: "exact",
                            head: true
                        }
                    );


            if (error) {

                console.error(
                    `SNIC'ELECTRIC - Error consultando ${tabla}:`,
                    error
                );


                actualizarNumero(
                    ids,
                    0
                );


                return 0;

            }


            const total =
                Number.isFinite(
                    Number(count)
                )
                    ? Number(count)
                    : 0;


            actualizarNumero(
                ids,
                total
            );


            console.log(
                `SNIC'ELECTRIC - ${nombre || tabla}: ${total}`
            );


            return total;

        } catch (error) {

            console.error(
                `SNIC'ELECTRIC - Error inesperado en ${tabla}:`,
                error
            );


            actualizarNumero(
                ids,
                0
            );


            return 0;

        }

    }


    /* =====================================================
       PRODUCTOS + CATEGORÍAS
    ===================================================== */

    async function cargarProductos() {

        try {

            console.log(
                "SNIC'ELECTRIC - Consultando productos en Supabase..."
            );


            /*
             * -------------------------------------------------
             * PRODUCTOS
             * -------------------------------------------------
             */

            const {
                data: productos,
                error: errorProductos
            } =
                await window.supabaseClient
                    .from("productos")
                    .select(
                        "id,nombre,categoria_id,stock,estado"
                    );


            if (errorProductos) {

                console.error(
                    "SNIC'ELECTRIC - Error consultando productos:",
                    errorProductos
                );


                actualizarNumero(
                    [
                        "totalProductos",
                        "productosTotal",
                        "totalInventario",
                        "inventarioTotal"
                    ],
                    0
                );


                limpiarCategorias();


                return;

            }


            const listaProductos =
                Array.isArray(productos)
                    ? productos
                    : [];


            /*
             * TOTAL DE PRODUCTOS
             */

            const totalProductos =
                listaProductos.length;


            actualizarNumero(
                [
                    "totalProductos",
                    "productosTotal"
                ],
                totalProductos
            );


            /*
             * Si el HTML usa totalInventario como
             * cantidad de productos, mantenemos
             * compatibilidad.
             */

            actualizarNumero(
                [
                    "totalInventario",
                    "inventarioTotal"
                ],
                totalProductos
            );


            console.log(
                `SNIC'ELECTRIC - Productos encontrados: ${totalProductos}`
            );


            /*
             * -------------------------------------------------
             * CATEGORÍAS
             * -------------------------------------------------
             */

            const {
                data: categorias,
                error: errorCategorias
            } =
                await window.supabaseClient
                    .from(
                        "categorias_inventario"
                    )
                    .select(
                        "id,nombre,prefijo,activa"
                    )
                    .order(
                        "nombre",
                        {
                            ascending: true
                        }
                    );


            if (errorCategorias) {

                console.error(
                    "SNIC'ELECTRIC - Error consultando categorias_inventario:",
                    errorCategorias
                );


                limpiarCategorias();


                return;

            }


            const listaCategorias =
                Array.isArray(categorias)
                    ? categorias
                    : [];


            /*
             * -------------------------------------------------
             * CONTADOR POR CATEGORÍA
             * -------------------------------------------------
             */

            const conteoCategorias = {};


            listaCategorias.forEach(
                categoria => {

                    conteoCategorias[
                        String(categoria.id)
                    ] = 0;

                }
            );


            /*
             * Contamos los productos utilizando:
             *
             * productos.categoria_id
             *
             * contra:
             *
             * categorias_inventario.id
             */

            listaProductos.forEach(
                producto => {

                    if (
                        !producto.categoria_id
                    ) {

                        return;

                    }


                    const categoriaId =
                        String(
                            producto.categoria_id
                        );


                    if (
                        Object.prototype.hasOwnProperty.call(
                            conteoCategorias,
                            categoriaId
                        )
                    ) {

                        conteoCategorias[
                            categoriaId
                        ]++;

                    }

                }
            );


            /*
             * -------------------------------------------------
             * RENDERIZAR
             * -------------------------------------------------
             */

            renderizarCategorias(
                listaCategorias,
                conteoCategorias
            );


            console.log(
                "SNIC'ELECTRIC - Categorías de productos procesadas:",
                listaCategorias.length
            );

        } catch (error) {

            console.error(
                "SNIC'ELECTRIC - Error inesperado cargando productos:",
                error
            );


            actualizarNumero(
                [
                    "totalProductos",
                    "productosTotal",
                    "totalInventario",
                    "inventarioTotal"
                ],
                0
            );


            limpiarCategorias();

        }

    }


    /* =====================================================
       RENDERIZAR CATEGORÍAS
    ===================================================== */

    function renderizarCategorias(
        categorias,
        conteo
    ) {

        const contenedor =
            document.getElementById(
                "productosPorCategoria"
            ) ||
            document.getElementById(
                "categoriasProductos"
            ) ||
            document.getElementById(
                "inventarioCategorias"
            ) ||
            document.querySelector(
                "[data-productos-categorias]"
            );


        if (!contenedor) {

            console.warn(
                "SNIC'ELECTRIC - No existe contenedor HTML para productos por categoría."
            );

            return;

        }


        if (
            !Array.isArray(categorias) ||
            categorias.length === 0
        ) {

            contenedor.innerHTML =
                `
                <div class="categoria-vacia">
                    No hay categorías registradas.
                </div>
                `;

            return;

        }


        contenedor.innerHTML =
            categorias
                .map(categoria => {

                    const id =
                        String(
                            categoria.id
                        );


                    const cantidad =
                        Number(
                            conteo[id] || 0
                        );


                    const nombre =
                        categoria.nombre ||
                        "Sin nombre";


                    const prefijo =
                        categoria.prefijo ||
                        "";


                    return `
                        <div
                            class="categoria-productos"
                            data-categoria-id="${escapeHtml(id)}"
                        >

                            <div class="categoria-productos-info">

                                <span class="categoria-productos-nombre">
                                    ${escapeHtml(nombre)}
                                </span>

                                ${
                                    prefijo
                                        ? `
                                            <span class="categoria-productos-prefijo">
                                                ${escapeHtml(prefijo)}
                                            </span>
                                          `
                                        : ""
                                }

                            </div>

                            <strong class="categoria-productos-cantidad">
                                ${cantidad}
                            </strong>

                        </div>
                    `;

                })
                .join("");


        console.log(
            "SNIC'ELECTRIC - Categorías de productos renderizadas correctamente."
        );

    }


    /* =====================================================
       LIMPIAR CATEGORÍAS
    ===================================================== */

    function limpiarCategorias() {

        const contenedor =
            document.getElementById(
                "productosPorCategoria"
            ) ||
            document.getElementById(
                "categoriasProductos"
            ) ||
            document.getElementById(
                "inventarioCategorias"
            ) ||
            document.querySelector(
                "[data-productos-categorias]"
            );


        if (!contenedor) {

            return;

        }


        contenedor.innerHTML =
            `
            <div class="categoria-vacia">
                Sin datos disponibles.
            </div>
            `;

    }


    /* =====================================================
       ACTUALIZAR NÚMERO
    ===================================================== */

    function actualizarNumero(
        ids,
        valor
    ) {

        if (
            !Array.isArray(ids)
        ) {

            return;

        }


        const numero =
            Number.isFinite(
                Number(valor)
            )
                ? Number(valor)
                : 0;


        ids.forEach(id => {

            const elemento =
                document.getElementById(
                    id
                );


            if (elemento) {

                elemento.textContent =
                    numero;

            }

        });

    }


    /* =====================================================
       ERROR GENERAL
    ===================================================== */

    function mostrarErrorEstadisticas() {

        actualizarNumero(
            [
                "totalClientes",
                "clientesTotal",

                "totalProductos",
                "productosTotal",
                "totalInventario",
                "inventarioTotal",

                "totalCotizaciones",
                "cotizacionesTotal",

                "totalFacturas",
                "facturasTotal"
            ],
            0
        );


        limpiarCategorias();

    }


    /* =====================================================
       ESCAPAR HTML
    ===================================================== */

    function escapeHtml(valor) {

        return String(valor ?? "")
            .replace(
                /&/g,
                "&amp;"
            )
            .replace(
                /</g,
                "&lt;"
            )
            .replace(
                />/g,
                "&gt;"
            )
            .replace(
                /"/g,
                "&quot;"
            )
            .replace(
                /'/g,
                "&#039;"
            );

    }


    /* =====================================================
       RELOJ
    ===================================================== */

    function iniciarReloj() {

        const elementos =
            document.querySelectorAll(
                "[data-current-time]"
            );


        if (
            !elementos.length
        ) {

            return;

        }


        function actualizar() {

            const ahora =
                new Date();


            const hora =
                ahora.toLocaleTimeString(
                    "es-CO",
                    {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit"
                    }
                );


            const fecha =
                ahora.toLocaleDateString(
                    "es-CO",
                    {
                        weekday: "long",
                        day: "2-digit",
                        month: "long",
                        year: "numeric"
                    }
                );


            elementos.forEach(
                elemento => {

                    elemento.textContent =
                        `${fecha} · ${hora}`;

                }
            );

        }


        actualizar();


        setInterval(
            actualizar,
            1000
        );

    }


})();

