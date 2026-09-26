/* =========================================================
   SNIC'ELECTRIC
   AUTH.JS
   SISTEMA CENTRAL DE AUTENTICACIÓN Y PERMISOS

   IMPORTANTE:
   Este archivo es utilizado por:

   - login.js
   - dashboard.js
   - clientes.js
   - administracion.js
   - futuros módulos

   NO crear otro sistema de sesión en cada módulo.
========================================================= */

(function (window) {

    "use strict";


    /* =====================================================
       CONFIGURACIÓN CENTRAL
    ===================================================== */

    const AUTH = {

        USERS_KEY:
            "snic_electric_usuarios",

        SESSION_KEY:
            "snic_electric_usuario",

        REMEMBER_KEY:
            "snic_electric_usuario_recordado"

    };

    /* =====================================================
       ETAPA 1E · ESTADO DE AUTENTICACIÓN REAL
       Supabase Auth es la única fuente de verdad para la
       sesión. Los datos locales de usuarios siguen existiendo
       únicamente para compatibilidad funcional de Administración.
    ===================================================== */

    let CURRENT_USER = null;
    let AUTH_READY = false;
    let AUTH_BOOTSTRAP_STARTED = false;
    let AUTH_BOOTSTRAP_PROMISE = null;


    /* =====================================================
       PERMISOS DEL SISTEMA
    ===================================================== */

    const PERMISOS = {

        INICIO_VER:
            "inicio.ver",

        CLIENTES_VER:
            "clientes.ver",

        CLIENTES_CREAR:
            "clientes.crear",

        CLIENTES_EDITAR:
            "clientes.editar",

        CLIENTES_ELIMINAR:
            "clientes.eliminar",

        INVENTARIO_VER:
            "inventario.ver",

        INVENTARIO_CREAR:
            "inventario.crear",

        INVENTARIO_EDITAR:
            "inventario.editar",

        COTIZACIONES_VER:
            "cotizaciones.ver",

        COTIZACIONES_CREAR:
            "cotizaciones.crear",

        COTIZACIONES_EDITAR:
            "cotizaciones.editar",

        COTIZACIONES_ELIMINAR:
            "cotizaciones.eliminar",

        FACTURAS_VER:
            "facturas.ver",

        FACTURAS_CREAR:
            "facturas.crear",

        FACTURAS_EDITAR:
            "facturas.editar",

        ORDENES_VER:
            "ordenes.ver",

        ORDENES_CREAR:
            "ordenes.crear",

        ORDENES_EDITAR:
            "ordenes.editar",

        INSPECCIONES_VER:
            "inspecciones.ver",

        INSPECCIONES_CREAR:
            "inspecciones.crear",

        INSPECCIONES_EDITAR:
            "inspecciones.editar",

        INFORME_OBRA_VER:
            "informe_obra.ver",

        INFORME_OBRA_CREAR:
            "informe_obra.crear",

        INFORME_OBRA_EDITAR:
            "informe_obra.editar",

        INFORMES_VER:
            "informes.ver",

        ADMINISTRACION_VER:
            "administracion.ver",

        USUARIOS_VER:
            "usuarios.ver",

        USUARIOS_CREAR:
            "usuarios.crear",

        USUARIOS_EDITAR:
            "usuarios.editar",

        USUARIOS_ELIMINAR:
            "usuarios.eliminar",

        CONFIGURACION_VER:
            "configuracion.ver"

    };


    /* =====================================================
       UTILIDADES
    ===================================================== */

    function leerJSON(storage, key) {

        try {

            const data =
                storage.getItem(key);

            if (!data) {

                return null;

            }

            return JSON.parse(data);

        } catch (error) {

            console.error(
                "SNIC'ELECTRIC Auth - Error leyendo:",
                key,
                error
            );

            return null;

        }

    }


    function guardarJSON(
        storage,
        key,
        value
    ) {

        try {

            storage.setItem(
                key,
                JSON.stringify(value)
            );

            return true;

        } catch (error) {

            console.error(
                "SNIC'ELECTRIC Auth - Error guardando:",
                key,
                error
            );

            return false;

        }

    }

    /* =====================================================
   AVATAR CENTRAL DEL USUARIO
   ===================================================== */

/**
 * Obtiene las iniciales del usuario actual.
 *
 * Ejemplos:
 * "Luis Francisco" -> "LF"
 * "Luis"            -> "LU"
 * "Luis Francisco Espinel" -> "LE"
 */
function obtenerInicialesUsuario(usuario = null) {

    const user =
        usuario ||
        obtenerUsuarioActual();

    if (!user) {
        return "US";
    }

    const nombre =
        String(user.nombre || "").trim();

    const apellido =
        String(user.apellido || "").trim();

    /*
     * Primero usamos nombre + apellido.
     */
    const partes = [
        nombre,
        apellido
    ].filter(Boolean);

    if (partes.length >= 2) {

        return (
            partes[0].charAt(0) +
            partes[1].charAt(0)
        ).toUpperCase();

    }

    /*
     * Si solamente tenemos una cadena,
     * intentamos obtener las dos primeras letras.
     */
    if (partes.length === 1) {

        const texto =
            partes[0]
                .replace(/\s+/g, " ")
                .trim();

        const palabras =
            texto.split(" ").filter(Boolean);

        if (palabras.length >= 2) {

            return (
                palabras[0].charAt(0) +
                palabras[palabras.length - 1].charAt(0)
            ).toUpperCase();

        }

        return texto
            .substring(0, 2)
            .toUpperCase();

    }

    /*
     * Como respaldo usamos el correo.
     */
    const email =
        String(
            user.email ||
            user.usuario ||
            ""
        ).trim();

    if (email) {

        const parteEmail =
            email.split("@")[0]
                .replace(/[._-]+/g, " ")
                .trim();

        const palabrasEmail =
            parteEmail
                .split(/\s+/)
                .filter(Boolean);

        if (palabrasEmail.length >= 2) {

            return (
                palabrasEmail[0].charAt(0) +
                palabrasEmail[
                    palabrasEmail.length - 1
                ].charAt(0)
            ).toUpperCase();

        }

        if (parteEmail.length >= 2) {

            return parteEmail
                .substring(0, 2)
                .toUpperCase();

        }

        if (parteEmail.length === 1) {

            return (
                parteEmail + "U"
            ).toUpperCase();

        }

    }

    return "US";
}


/**
 * Obtiene el nombre completo que se utilizará
 * para identificar al usuario en el avatar.
 */
function obtenerNombreCompletoUsuario(usuario = null) {

    const user =
        usuario ||
        obtenerUsuarioActual();

    if (!user) {
        return "Usuario";
    }

    const nombre =
        String(user.nombre || "").trim();

    const apellido =
        String(user.apellido || "").trim();

    const nombreCompleto =
        [nombre, apellido]
            .filter(Boolean)
            .join(" ")
            .trim();

    if (nombreCompleto) {

        return nombreCompleto;

    }

    return (
        user.email ||
        user.usuario ||
        "Usuario"
    );

}


/**
 * Actualiza todos los avatares encontrados
 * en la página actual.
 */
function actualizarAvatarUsuario(usuario = null) {

    const user =
        usuario ||
        obtenerUsuarioActual();

    const iniciales =
        obtenerInicialesUsuario(user);

    const nombreMostrar =
        obtenerNombreCompletoUsuario(user);

    /*
     * Avatar superior.
     */
    document
        .querySelectorAll("#topbarAvatar")
        .forEach(function (avatar) {

            avatar.textContent = iniciales;

            avatar.setAttribute(
                "aria-label",
                `Avatar de ${nombreMostrar}`
            );

            avatar.setAttribute(
                "title",
                nombreMostrar
            );

        });


    /*
     * Avatar grande del perfil.
     *
     * Actualmente Dashboard utiliza #profileAvatar.
     * Si otro módulo lo utiliza en el futuro,
     * quedará soportado automáticamente.
     */
    document
        .querySelectorAll("#profileAvatar")
        .forEach(function (avatar) {

            avatar.textContent = iniciales;

            avatar.setAttribute(
                "aria-label",
                `Avatar de ${nombreMostrar}`
            );

            avatar.setAttribute(
                "title",
                nombreMostrar
            );

        });


    /*
     * Soporte adicional para cualquier elemento
     * que declare data-user-avatar.
     *
     * Ejemplo:
     *
     * <div data-user-avatar></div>
     */
    document
        .querySelectorAll("[data-user-avatar]")
        .forEach(function (avatar) {

            avatar.textContent = iniciales;

            avatar.setAttribute(
                "aria-label",
                `Avatar de ${nombreMostrar}`
            );

            avatar.setAttribute(
                "title",
                nombreMostrar
            );

        });

    return iniciales;

}


    /* =====================================================
       OBTENER USUARIOS
    ===================================================== */

    function obtenerUsuarios() {

        const usuarios =
            leerJSON(
                localStorage,
                AUTH.USERS_KEY
            );

        if (!Array.isArray(usuarios)) {

            return [];

        }

        return usuarios;

    }


    /* =====================================================
       GUARDAR USUARIOS
    ===================================================== */

    function guardarUsuarios(usuarios) {

        if (!Array.isArray(usuarios)) {

            return false;

        }

        return guardarJSON(
            localStorage,
            AUTH.USERS_KEY,
            usuarios
        );

    }


    /* =====================================================
       OBTENER SESIÓN ACTUAL
    ===================================================== */

    function obtenerUsuarioActual() {

        /* Desde Etapa 1E, la sesión vive en memoria y proviene
           de Supabase Auth. No se lee localStorage/sessionStorage
           para decidir quién está autenticado. */
        return CURRENT_USER ? { ...CURRENT_USER } : null;

    }


    /* =====================================================
       GUARDAR SESIÓN
    ===================================================== */

    function iniciarSesion(
        usuario,
        recordar = false
    ) {

        if (!usuario) return false;

        CURRENT_USER = {
            id: usuario.id || "",
            nombre: usuario.nombre || "",
            apellido: usuario.apellido || "",
            usuario: usuario.usuario || usuario.email || "",
            email: usuario.email || usuario.correo || "",
            rol: usuario.rol || "",
            estado: usuario.estado || "activo",
            autorizado: usuario.autorizado !== false,
            permisos: usuario.permisos || {},
            supabaseUserId: usuario.supabaseUserId || usuario.id || "",
            loginAt: usuario.loginAt || new Date().toISOString()
        };

        return true;
    }


    /* =====================================================
       CERRAR SESIÓN
    ===================================================== */

    async function cerrarSesion() {
        if (window.__SNIC_LOGOUT_IN_PROGRESS) return;
        window.__SNIC_LOGOUT_IN_PROGRESS = true;

        try {
            if (window.supabaseClient?.auth) {
                await window.supabaseClient.auth.signOut({ scope: "local" });
            }
        } catch (error) {
            console.error("SNIC'ELECTRIC: error cerrando Supabase Auth:", error);
        } finally {
            CURRENT_USER = null;
            AUTH_READY = false;

            /* Limpiamos únicamente restos de versiones anteriores.
               No se borran los datos funcionales de los módulos. */
            [
                AUTH.SESSION_KEY,
                AUTH.REMEMBER_KEY,
                "snic_user",
                "snic_electric_auth",
                "snic_electric_session",
                "snic_electric_permisos",
                "snic_logout_in_progress"
            ].forEach(function (key) {
                try { localStorage.removeItem(key); } catch (_) {}
                try { sessionStorage.removeItem(key); } catch (_) {}
            });

            try {
                Object.keys(localStorage)
                    .filter(key => key.startsWith("sb-"))
                    .forEach(key => localStorage.removeItem(key));
            } catch (_) {}

            window.location.replace(obtenerRutaLogin());
        }
    }

    /* =====================================================
       RUTA LOGIN
    ===================================================== */

    function obtenerRutaLogin() {

        const path =
            window.location.pathname;

        /*
         * Si estamos dentro de /admin/
         */

        if (
            path.includes("/admin/")
        ) {

            return "../login.html";

        }

        return "login.html";

    }


    /* =====================================================
       ¿ESTÁ AUTENTICADO?
    ===================================================== */

    function estaAutenticado() {

        if (!CURRENT_USER) return false;
        if (!CURRENT_USER.id) return false;
        if (CURRENT_USER.estado && CURRENT_USER.estado !== "activo") return false;
        if (CURRENT_USER.autorizado === false) return false;

        return true;
    }


    /* =====================================================
       OBTENER ROL
    ===================================================== */

    function obtenerRolActual() {

        const usuario =
            obtenerUsuarioActual();

        return usuario
            ? usuario.rol || null
            : null;

    }


    /* =====================================================
       OBTENER EMAIL
    ===================================================== */

    function obtenerEmailActual() {

        const usuario =
            obtenerUsuarioActual();

        return usuario
            ? usuario.email || null
            : null;

    }


    /* =====================================================
       OBTENER NOMBRE
    ===================================================== */

    function obtenerNombreActual() {

        const usuario =
            obtenerUsuarioActual();

        return usuario
            ? usuario.nombre || ""
            : "";

    }


    /* =====================================================
       OBTENER PERMISOS
    ===================================================== */

    function obtenerPermisosActuales() {

        const usuario =
            obtenerUsuarioActual();

        if (!usuario) {
            return {};
        }

        /*
         * Supabase Auth + RPC mis_permisos son la fuente de verdad
         * de los permisos efectivos de la sesión actual.
         * No se sobreescriben con una copia local antigua.
         */
        return usuario.permisos || {};
    }

    /* =====================================================
       COMPROBAR PERMISO
    ===================================================== */

    function tienePermiso(
        permiso
    ) {

        if (!estaAutenticado()) {

            return false;

        }


        /*
         * El administrador tiene acceso total.
         */

        const rol = String(
            obtenerRolActual() || ""
        )
            .trim()
            .toLowerCase();

        if (rol === "administrador") {
            return true;
        }


        /*
         * Los permisos efectivos vienen de Supabase mediante
         * cargarPerfilDesdeSupabase() -> RPC mis_permisos.
         */
        const permisos = obtenerPermisosActuales();

        /*
         * Compatibilidad con dashboard antiguo:
         * informeObra -> informe_obra.
         */
        if (permiso === "informeObra.ver") {
            permiso = "informe_obra.ver";
        }


        /*
         * Formato nuevo:
         *
         * clientes.ver = true
         *
         */

        if (
            permisos[permiso] === true
        ) {

            return true;

        }


        /*
         * Compatibilidad con la estructura
         * anterior:
         *
         * clientes = true
         *
         * Esto permite migrar gradualmente
         * los usuarios existentes.
         */

        const modulo =
            permiso.split(".")[0];

        if (
            permisos[modulo] === true
        ) {

            return true;

        }


        return false;

    }


    /* =====================================================
       COMPROBAR CUALQUIER PERMISO
    ===================================================== */

    function tieneAlgunPermiso(
        listaPermisos
    ) {

        if (
            !Array.isArray(listaPermisos)
        ) {

            return false;

        }

        return listaPermisos.some(
            permiso =>
                tienePermiso(permiso)
        );

    }


    /* =====================================================
       COMPROBAR TODOS LOS PERMISOS
    ===================================================== */

    function tieneTodosLosPermisos(
        listaPermisos
    ) {

        if (
            !Array.isArray(listaPermisos)
        ) {

            return false;

        }

        return listaPermisos.every(
            permiso =>
                tienePermiso(permiso)
        );

    }


    /* =====================================================
       PROTEGER PÁGINA
    ===================================================== */

    function protegerPagina(
        permiso = null
    ) {

        /*
         * V10: los módulos ejecutan su propio DOMContentLoaded al
         * mismo tiempo que auth.js restaura la sesión de Supabase.
         * Mientras AUTH_READY sea false no debemos redirigir al login:
         * todavía no sabemos si existe una sesión válida.
         *
         * El authGate central realizará la validación cuando termine
         * restaurarSesionSupabase().
         */
        if (!AUTH_READY) {
            return true;
        }

        if (!estaAutenticado()) {

            window.location.replace(
                obtenerRutaLogin()
            );

            return false;

        }

        if (
            permiso &&
            !tienePermiso(permiso)
        ) {

            mostrarAccesoDenegado();

            return false;

        }

        return true;

    }


    /* =====================================================
       MOSTRAR ACCESO DENEGADO
    ===================================================== */

    function mostrarAccesoDenegado() {

        document.documentElement.style.visibility =
            "visible";


        /*
         * Evitamos crear múltiples mensajes.
         */

        if (
            document.getElementById(
                "authAccessDenied"
            )
        ) {

            return;

        }


        const contenedor =
            document.createElement("div");

        contenedor.id =
            "authAccessDenied";


        contenedor.innerHTML = `

            <div style="
                min-height:100vh;
                display:flex;
                align-items:center;
                justify-content:center;
                padding:30px;
                background:#f5f7fa;
                font-family:Arial,sans-serif;
            ">

                <div style="
                    width:min(500px,100%);
                    padding:40px;
                    background:#fff;
                    border-radius:16px;
                    text-align:center;
                    box-shadow:0 15px 45px rgba(0,0,0,.12);
                ">

                    <div style="
                        width:70px;
                        height:70px;
                        margin:0 auto 20px;
                        border-radius:50%;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        background:#fff3cd;
                        color:#f4b400;
                        font-size:28px;
                    ">
                        🔒
                    </div>

                    <h2 style="
                        margin:0 0 10px;
                        color:#0a2f6b;
                    ">
                        Acceso no autorizado
                    </h2>

                    <p style="
                        color:#667085;
                        line-height:1.6;
                        margin-bottom:25px;
                    ">
                        No tienes permisos suficientes
                        para acceder a este módulo.
                    </p>

                    <button
                        onclick="history.back()"
                        style="
                            border:0;
                            padding:12px 20px;
                            border-radius:8px;
                            background:#f4b400;
                            color:#000;
                            font-weight:700;
                            cursor:pointer;
                        "
                    >
                        Regresar
                    </button>

                </div>

            </div>

        `;


        document.body.innerHTML = "";

        document.body.appendChild(
            contenedor
        );

    }


    /* =====================================================
       APLICAR PERMISOS A ELEMENTOS HTML
    ===================================================== */

    function aplicarPermisos() {

        if (!estaAutenticado()) {

            return;

        }


        const elementos =
            document.querySelectorAll(
                "[data-permission]"
            );


        elementos.forEach(
            elemento => {

                const permiso =
                    elemento.dataset.permission;


                if (!tienePermiso(permiso)) {
                    // Algunos estilos globales del dashboard usan
                    // display:flex!important para los elementos del sidebar.
                    // Un display:none normal queda sobrescrito por esos estilos.
                    // Usamos una regla inline !important SOLO mientras el
                    // elemento esté bloqueado por permisos.
                    elemento.style.setProperty("display", "none", "important");
                    elemento.dataset.snicPermissionHidden = "1";
                } else if (elemento.dataset.snicPermissionHidden === "1") {
                    elemento.style.removeProperty("display");
                    delete elemento.dataset.snicPermissionHidden;
                }

            }
        );

    }


    /* =====================================================
       ACTUALIZAR DATOS DE USUARIO
    ===================================================== */

    function actualizarSesion(
        cambios = {}
    ) {

        if (!CURRENT_USER) return false;

        CURRENT_USER = {
            ...CURRENT_USER,
            ...cambios,
            permisos: cambios.permisos || CURRENT_USER.permisos || {}
        };

        return true;
    }


    /* =====================================================
       BUSCAR USUARIO POR EMAIL
    ===================================================== */

    function buscarUsuarioPorEmail(
        email
    ) {

        if (!email) {

            return null;

        }


        const usuarios =
            obtenerUsuarios();


        const correo =
            email
                .trim()
                .toLowerCase();


        return (
            usuarios.find(
                usuario =>
                    String(
                        usuario.email ||
                        usuario.correo ||
                        ""
                    )
                    .trim()
                    .toLowerCase() ===
                    correo
            ) || null
        );

    }


    /* =====================================================
       BUSCAR USUARIO POR ID
    ===================================================== */

    function buscarUsuarioPorId(
        id
    ) {

        if (!id) {

            return null;

        }


        const usuarios =
            obtenerUsuarios();


        return (
            usuarios.find(
                usuario =>
                    usuario.id === id
            ) || null
        );

    }


    /* =====================================================
       ACTUALIZAR USUARIO
    ===================================================== */

    function actualizarUsuario(
        id,
        cambios
    ) {

        const usuarios =
            obtenerUsuarios();


        const indice =
            usuarios.findIndex(
                usuario =>
                    usuario.id === id
            );


        if (indice === -1) {

            return false;

        }


        usuarios[indice] = {

            ...usuarios[indice],

            ...cambios

        };


        const resultado =
            guardarUsuarios(
                usuarios
            );


        /*
         * Si estamos modificando
         * al usuario actualmente conectado,
         * actualizamos su sesión.
         */

        const actual =
            obtenerUsuarioActual();


        if (
            resultado &&
            actual &&
            actual.id === id
        ) {

            actualizarSesion(
                usuarios[indice]
            );

        }


        return resultado;

    }


    /* =====================================================
       ELIMINAR USUARIO
    ===================================================== */

    function eliminarUsuario(
        id
    ) {

        const actual =
            obtenerUsuarioActual();


        /*
         * No permitimos que un usuario
         * se elimine a sí mismo.
         */

        if (
            actual &&
            actual.id === id
        ) {

            return false;

        }


        const usuarios =
            obtenerUsuarios();


        const nuevosUsuarios =
            usuarios.filter(
                usuario =>
                    usuario.id !== id
            );


        if (
            nuevosUsuarios.length ===
            usuarios.length
        ) {

            return false;

        }


        return guardarUsuarios(
            nuevosUsuarios
        );

    }


    /* =====================================================
       USUARIO ADMINISTRADOR INICIAL

       Mientras el sistema funciona en modo local,
       se crea automáticamente un administrador si
       todavía no existe. Esta parte será reemplazada
       por Supabase Auth en la siguiente etapa.
    ===================================================== */

    function inicializarUsuarioAdministrador() {
        /* Etapa 1E: eliminado el administrador local automático.
           Los usuarios reales pertenecen a Supabase Auth. */
        return false;
    }

    /* =====================================================
       BOOTSTRAP V2 · NAVEGACIÓN, PERMISOS Y USUARIO
    ===================================================== */

    function permisoDePaginaActual() {

        const path = String(window.location.pathname || "").toLowerCase();

        if (!path.includes("/admin/")) return null;
        if (path.endsWith("/modulo-pendiente.html")) return null;

        const archivo = path.split("/").pop();

        const mapa = {
            "clientes.html": PERMISOS.CLIENTES_VER,
            "inventario.html": PERMISOS.INVENTARIO_VER,
            "cotizaciones.html": PERMISOS.COTIZACIONES_VER,
            "facturas.html": PERMISOS.FACTURAS_VER,
            "ordenes.html": PERMISOS.ORDENES_VER,
            "inspecciones.html": PERMISOS.INSPECCIONES_VER,
            "informe-obra.html": PERMISOS.INFORME_OBRA_VER,
            "informes.html": PERMISOS.INFORMES_VER,
            "administracion.html": PERMISOS.ADMINISTRACION_VER,
            "configuracion.html": PERMISOS.CONFIGURACION_VER
        };

        return mapa[archivo] || null;
    }


    function iniciarSistemaV2() {

        if (!estaAutenticado()) return;

        const permisoPagina = permisoDePaginaActual();

        if (permisoPagina && !tienePermiso(permisoPagina)) {
            mostrarAccesoDenegado();
            return;
        }

        aplicarPermisos();

        const usuario = obtenerUsuarioActual();

        document.querySelectorAll("[data-user-name], #sidebarUserName").forEach(elemento => {
            elemento.textContent =
                usuario?.nombre ||
                usuario?.email ||
                "Usuario";
        });

        document.querySelectorAll("[data-user-role], #sidebarUserRole").forEach(elemento => {
            elemento.textContent =
                usuario?.rol ||
                "";
        });

        /* =====================================================
        AVATAR CENTRAL
        ===================================================== */

        actualizarAvatarUsuario(usuario);

        document.querySelectorAll("[data-logout]").forEach(elemento => {
            if (elemento.dataset.authBound === "1") return;
            elemento.dataset.authBound = "1";
            elemento.addEventListener("click", cerrarSesion);
        });

        document.querySelectorAll("[data-menu-toggle]").forEach(elemento => {
            if (elemento.dataset.authBound === "1") return;
            elemento.dataset.authBound = "1";
            elemento.addEventListener("click", () => {
                document.getElementById("sidebar")?.classList.toggle("active");
            });
        });

        document.querySelectorAll("#sidebarClose").forEach(elemento => {
            if (elemento.dataset.authBound === "1") return;
            elemento.dataset.authBound = "1";
            elemento.addEventListener("click", () => {
                document.getElementById("sidebar")?.classList.remove("active");
            });
        });
    }

    /* =====================================================
       ETAPA 1E · RESTAURAR SESIÓN DESDE SUPABASE
    ===================================================== */

    async function cargarPerfilDesdeSupabase(authUser) {

        if (!window.supabaseClient?.from) return null;

        const { data: perfil, error: perfilError } =
            await window.supabaseClient
                .from("perfiles")
                .select("id,nombre,apellido,documento,telefono,email,foto_url,activo,rol_id,roles(id,nombre)")
                .eq("id", authUser.id)
                .maybeSingle();

        if (perfilError) throw perfilError;
        if (!perfil) throw new Error("El usuario autenticado no tiene perfil en SNIC'ELECTRIC.");
        if (perfil.activo === false) throw new Error("Este usuario se encuentra inactivo.");
        if (!perfil.roles?.nombre) throw new Error("El usuario no tiene un rol asignado.");

        const { data: permisos, error: permisosError } =
            await window.supabaseClient.rpc("mis_permisos");

        if (permisosError) throw permisosError;

        const permisosMapa = {};
        (permisos || []).forEach(p => {
            if (p?.codigo) permisosMapa[p.codigo] = true;
        });

        return {
            id: perfil.id,
            nombre: perfil.nombre || "",
            apellido: perfil.apellido || "",
            usuario: perfil.email || authUser.email || "",
            email: perfil.email || authUser.email || "",
            rol: perfil.roles.nombre,
            estado: perfil.activo === false ? "inactivo" : "activo",
            autorizado: true,
            permisos: permisosMapa,
            supabaseUserId: authUser.id,
            loginAt: new Date().toISOString()
        };
    }

    async function restaurarSesionSupabase() {

        if (AUTH_BOOTSTRAP_PROMISE) return AUTH_BOOTSTRAP_PROMISE;

        AUTH_BOOTSTRAP_STARTED = true;

        AUTH_BOOTSTRAP_PROMISE = (async () => {
            try {
                if (!window.supabaseClient?.auth) {
                    CURRENT_USER = null;
                    return null;
                }

                const { data, error } =
                    await window.supabaseClient.auth.getSession();

                if (error) throw error;

                if (!data?.session?.user) {
                    CURRENT_USER = null;
                    return null;
                }

                const usuario = await cargarPerfilDesdeSupabase(data.session.user);
                CURRENT_USER = usuario;
                return usuario;

            } catch (error) {
                console.error("SNIC'ELECTRIC: no se pudo restaurar la sesión Supabase:", error);
                CURRENT_USER = null;
                try { await window.supabaseClient?.auth?.signOut({ scope: "local" }); } catch (_) {}
                return null;
            } finally {
                AUTH_READY = true;
            }
        })();

        return AUTH_BOOTSTRAP_PROMISE;
    }

    function notificarAuthReady() {
        window.addEventListener("snic:auth-ready", function (event) {

    const usuario =
        event.detail?.usuario;

    if (usuario) {
        SNICAuth.actualizarAvatarUsuario(usuario);
    }

});
    }

    /* =====================================================
       EXPONER API GLOBAL
    ===================================================== */

    window.SNICAuth = {

        AUTH,

        PERMISOS,

        obtenerUsuarios,

        guardarUsuarios,

        obtenerUsuarioActual,

        iniciarSesion,

        cerrarSesion,

        estaAutenticado,

        obtenerRolActual,

        obtenerEmailActual,

        obtenerNombreActual,

        obtenerInicialesUsuario,

        obtenerNombreCompletoUsuario,

        actualizarAvatarUsuario,

        obtenerPermisosActuales,

        tienePermiso,

        tieneAlgunPermiso,

        tieneTodosLosPermisos,

        protegerPagina,

        aplicarPermisos,

        actualizarSesion,

        buscarUsuarioPorEmail,

        buscarUsuarioPorId,

        actualizarUsuario,

        eliminarUsuario,

        restaurarSesionSupabase,

        cargarPerfilDesdeSupabase,

        get authReady() { return AUTH_READY; },

        get ready() { return AUTH_BOOTSTRAP_PROMISE || Promise.resolve(CURRENT_USER); }

    };


    /* =====================================================
       COMPATIBILIDAD GLOBAL

       Algunos módulos antiguos utilizan PERMISOS directamente.
       Lo exponemos globalmente para mantener compatibilidad sin
       duplicar la configuración central.
    ===================================================== */

    window.PERMISOS = PERMISOS;


    /* =====================================================
       FUNCIONES DE COMPATIBILIDAD
    ===================================================== */

    window.obtenerUsuarioActual =
        obtenerUsuarioActual;

    window.obtenerRolActual =
        obtenerRolActual;

    window.tienePermiso =
        tienePermiso;

    window.protegerPagina =
        protegerPagina;

    window.cerrarSesion =
        cerrarSesion;

    window.obtenerPermisosActuales =
        obtenerPermisosActuales;


    /* =====================================================
       INICIALIZACIÓN · ETAPA 1E
    ===================================================== */

    /* El evento DOMContentLoaded se libera solo después de que
       Supabase haya restaurado y validado la sesión. Así los
       módulos no dependen de localStorage para arrancar. */
    let DOM_READY = false;
    let DOM_RELEASED = false;

    document.addEventListener("DOMContentLoaded", async function authGate() {
        if (DOM_RELEASED) return;
        DOM_READY = true;

        await restaurarSesionSupabase();

        if (CURRENT_USER) {
            iniciarSistemaV2();
        }

        DOM_RELEASED = true;
        notificarAuthReady();

    }, { once: true });

    /* En esta etapa el listener anterior sigue permitiendo a los módulos
       arrancar por compatibilidad; el estado de autenticación ya no se
       obtiene de almacenamiento local. */


    console.log(
        "SNIC'ELECTRIC - Auth.js cargado correctamente."
    );


})(window);

// V3: cierre de sesión robusto para la migración a Supabase.


