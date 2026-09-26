/* =========================================================
   SNIC'ELECTRIC · CONFIGURACIÓN (SUPABASE)
   Integrado con `configuracion_empresa`, `configuracion_empresa_detalles` y `consecutivos`.
========================================================= */
(function(window){
  "use strict";

  let empresaRecordId = null;

  // Valores por defecto en caso de no existir registro previo en la BD
  const DEFAULTS = {
    empresa: {
      nombre: "SNIC'ELECTRIC",
      nit: "1090415317-1",
      telefono: "3054044326",
      correo: "snicelectric@gmail.com",
      direccion: "",
      descripcion: "Soluciones eléctricas residenciales y comerciales con seguridad y eficiencia."
    },
    documentos: {
      moneda: "COP",
      iva: 19,
      prefijoCotizacion: "COT-",
      prefijoFactura: "FV-",
      mostrarLogoPdf: true,
      pieDocumento: "Documento equivalente / Factura"
    }
  };

  function el(id){ return document.getElementById(id); }

  function toast(msg, error = false){
    const box = el("configToast");
    const text = el("configToastText");
    if(!box || !text) return;
    text.textContent = msg;
    box.classList.toggle("error", error);
    box.classList.add("show");
    clearTimeout(window.__snicConfigToast);
    window.__snicConfigToast = setTimeout(() => box.classList.remove("show"), 3200);
  }

  /**
   * Carga la configuración desde Supabase
   */
  async function cargarConfiguracion() {
    try {
      const client = window.supabaseClient;
      if (!client) throw new Error("El cliente de Supabase no está disponible.");

      // 1. Cargar datos de la empresa y relacionar con detalles
      const { data: configData, error: configError } = await client
        .from("configuracion_empresa")
        .select(`
          *,
          configuracion_empresa_detalles (
            eslogan,
            pie_documento,
            mostrar_logo
          )
        `)
        .limit(1)
        .maybeSingle();

      if (configError) console.warn("Error leyendo configuracion_empresa:", configError);

      if (configData) {
        empresaRecordId = configData.id;
        el("empresaNombre").value = configData.nombre_empresa || "";
        el("empresaNit").value = configData.nit || "";
        el("empresaTelefono").value = configData.telefono || "";
        el("empresaCorreo").value = configData.email || "";
        el("empresaDireccion").value = configData.direccion || "";
        
        // --- ASIGNACIÓN DE CIUDAD Y DEPARTAMENTO ---
        if (el("empresaCiudad")) el("empresaCiudad").value = configData.ciudad || "";
        if (el("empresaDepartamento")) el("empresaDepartamento").value = configData.departamento || "";
        
        el("moneda").value = configData.moneda || "COP";
        el("iva").value = configData.iva_porcentaje !== undefined ? configData.iva_porcentaje : 19;

        // Cargar detalles desde Supabase
        const detalles = Array.isArray(configData.configuracion_empresa_detalles) 
          ? configData.configuracion_empresa_detalles[0] 
          : configData.configuracion_empresa_detalles;

        if (el("empresaDescripcion")) el("empresaDescripcion").value = detalles?.eslogan || DEFAULTS.empresa.descripcion;
        if (el("mostrarLogoPdf")) el("mostrarLogoPdf").checked = detalles?.mostrar_logo ?? DEFAULTS.documentos.mostrarLogoPdf;
        if (el("pieDocumento")) el("pieDocumento").value = detalles?.pie_documento || DEFAULTS.documentos.pieDocumento;

      } else {
        el("empresaNombre").value = DEFAULTS.empresa.nombre;
        el("empresaNit").value = DEFAULTS.empresa.nit;
        el("empresaTelefono").value = DEFAULTS.empresa.telefono;
        el("empresaCorreo").value = DEFAULTS.empresa.correo;
        el("empresaDireccion").value = DEFAULTS.empresa.direccion;
        if (el("empresaCiudad")) el("empresaCiudad").value = "Cúcuta";
        if (el("empresaDepartamento")) el("empresaDepartamento").value = "Norte De Santander";
        el("moneda").value = DEFAULTS.documentos.moneda;
        el("iva").value = DEFAULTS.documentos.iva;

        if (el("empresaDescripcion")) el("empresaDescripcion").value = DEFAULTS.empresa.descripcion;
        if (el("mostrarLogoPdf")) el("mostrarLogoPdf").checked = DEFAULTS.documentos.mostrarLogoPdf;
        if (el("pieDocumento")) el("pieDocumento").value = DEFAULTS.documentos.pieDocumento;
      }

      // 2. Cargar prefijos desde la tabla consecutivos
      const { data: consecData, error: consecError } = await client
        .from("consecutivos")
        .select("*");

      if (consecError) console.warn("Error leyendo consecutivos:", consecError);

      if (consecData && consecData.length > 0) {
        const cot = consecData.find(c => c.tipo === "cotizacion" || c.tipo === "cotizaciones");
        const fac = consecData.find(c => c.tipo === "factura" || c.tipo === "facturas");

        el("prefijoCotizacion").value = cot ? cot.prefijo : "COT-";
        el("prefijoFactura").value = fac ? fac.prefijo : "FV-";
      } else {
        el("prefijoCotizacion").value = DEFAULTS.documentos.prefijoCotizacion;
        el("prefijoFactura").value = DEFAULTS.documentos.prefijoFactura;
      }

    } catch (err) {
      console.error("Error en cargarConfiguracion:", err);
      toast("Error al cargar la configuración desde la base de datos.", true);
    }
  }

  /**
   * Guarda o actualiza la configuración en Supabase
   */
  async function guardarConfiguracion() {
    const client = window.supabaseClient;
    if (!client) {
      toast("Error de conexión con Supabase.", true);
      return;
    }

    const nombre = el("empresaNombre").value.trim();
    if (!nombre) {
      toast("El nombre comercial es obligatorio.", true);
      el("empresaNombre").focus();
      return;
    }

    try {
      const payloadEmpresa = {
        nombre_empresa: nombre,
        nit: el("empresaNit").value.trim(),
        telefono: el("empresaTelefono").value.trim(),
        email: el("empresaCorreo").value.trim(),
        direccion: el("empresaDireccion").value.trim(),
        ciudad: el("empresaCiudad") ? el("empresaCiudad").value.trim() : "",
        departamento: el("empresaDepartamento") ? el("empresaDepartamento").value.trim() : "",
        moneda: el("moneda").value,
        tipo_iva_predeterminado: "GRAVADO",
        iva_porcentaje: parseFloat(el("iva").value) || 0,
        updated_at: new Date().toISOString()
      };

      const targetId = empresaRecordId || "54424dd6-878c-4570-a8d4-037a7104ba6a";

      // 1. Guardar o actualizar la empresa principal
      const { error: errEmpresa } = await client
        .from("configuracion_empresa")
        .update(payloadEmpresa)
        .eq("id", targetId);

      if (errEmpresa) throw errEmpresa;
      empresaRecordId = targetId;

      // 2. Guardar detalles en configuracion_empresa_detalles (Upsert por empresa_id)
      const payloadDetalles = {
        empresa_id: empresaRecordId,
        eslogan: el("empresaDescripcion") ? el("empresaDescripcion").value.trim() : "",
        pie_documento: el("pieDocumento") ? el("pieDocumento").value.trim() : "",
        mostrar_logo: el("mostrarLogoPdf") ? el("mostrarLogoPdf").checked : true,
        updated_at: new Date().toISOString()
      };

      const { error: errDetalles } = await client
        .from("configuracion_empresa_detalles")
        .upsert(payloadDetalles, { onConflict: "empresa_id" });

      if (errDetalles) throw errDetalles;

      // 3. Guardar prefijos en consecutivos
      const prefijoCot = el("prefijoCotizacion").value.trim() || "COT-";
      const prefijoFac = el("prefijoFactura").value.trim() || "FV-";

      const upsertConsecutivo = async (tipo, prefijo) => {
        const { data: exist } = await client.from("consecutivos").select("id").eq("tipo", tipo).maybeSingle();
        if (exist) {
          await client.from("consecutivos").update({ prefijo, updated_at: new Date().toISOString() }).eq("id", exist.id);
        } else {
          await client.from("consecutivos").insert([{ tipo, prefijo, ultimo_numero: 0 }]);
        }
      };

      await upsertConsecutivo("cotizacion", prefijoCot);
      await upsertConsecutivo("factura", prefijoFac);

      toast("Configuración guardada correctamente.");
    } catch (err) {
      console.error("Error guardando configuración:", err);
      toast("No se pudieron guardar los cambios: " + (err.message || "Error de base de datos"), true);
    }
  }

  /**
   * Exporta un respaldo local en formato JSON consultando directamente las tablas clave de Supabase
   */
  async function exportarRespaldoLocal() {
    try {
      toast("Generando copia de respaldo...");
      const client = window.supabaseClient;

      // Obtener datos de tablas de la base de datos
      const tablas = [
        "configuracion_empresa", 
        "configuracion_empresa_detalles", 
        "consecutivos", 
        "clientes", 
        "productos", 
        "cotizaciones", 
        "facturas", 
        "ordenes_servicio", 
        "inspecciones"
      ];
      
      const backupData = {
        app: "SNIC'ELECTRIC",
        exportedAt: new Date().toISOString(),
        tablas: {}
      };

      if (client) {
        for (const tabla of tablas) {
          const { data } = await client.from(tabla).select("*");
          backupData.tablas[tabla] = data || [];
        }
      }

      backupData.localStorage = { ...localStorage };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `snic-electric-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast("Respaldo local descargado correctamente.");
    } catch (err) {
      console.error("Error al exportar respaldo:", err);
      toast("Error al generar el archivo de respaldo.", true);
    }
  }

  /**
   * Importa un archivo de respaldo JSON generado localmente
   */
  function importarRespaldoLocal(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const content = JSON.parse(reader.result);
        if (!content || typeof content !== "object") throw new Error("Archivo inválido.");

        if (!confirm("Esta acción restaurará la configuración local. ¿Deseas continuar?")) return;

        if (content.localStorage) {
          Object.entries(content.localStorage).forEach(([k, v]) => localStorage.setItem(k, v));
        }

        await cargarConfiguracion();
        toast("Respaldo importado con éxito.");
      } catch (err) {
        console.error("Error importando archivo:", err);
        toast("El archivo seleccionado no es un respaldo válido.", true);
      }
    };
    reader.readAsText(file);
  }

  /**
   * Inicialización del módulo
   */
  async function inicializar() {
    if (!window.SNICAuth || !window.SNICAuth.protegerPagina(window.SNICAuth.PERMISOS.CONFIGURACION_VER)) return;

    window.SNICAuth.aplicarPermisos();

    // 1. Obtener el usuario activo
    let u = window.SNICAuth.obtenerUsuarioActual?.() || {};
    const client = window.supabaseClient;

    if ((!u || !u.email) && client) {
      const { data: { user } } = await client.auth.getUser();
      if (user) {
        u = { ...user, ...u, email: user.email };
      }
    }

    const userId = u.id || u.user?.id;
    const correoUsuario = u.email || u.correo || u.user?.email || "No registrado";
    const metadata = u.user_metadata || u.raw_user_meta_data || {};
    let nombreUsuario = u.nombre || metadata.full_name || metadata.nombre || correoUsuario.split("@")[0] || "Usuario";
    
    // 2. Determinar el rol real consultando la base de datos de Supabase
    let rolUsuario = u.rol || metadata.rol || metadata.role;

    if ((!rolUsuario || rolUsuario === "authenticated") && client && userId) {
      try {
        const { data: perfil } = await client
          .from("perfiles")
          .select("nombre, apellido, roles(nombre)")
          .eq("id", userId)
          .maybeSingle();

        if (perfil) {
          const nombreCompleto = [perfil.nombre, perfil.apellido].filter(Boolean).join(" ");
          if (nombreCompleto) nombreUsuario = nombreCompleto;
          if (perfil.roles?.nombre) rolUsuario = perfil.roles.nombre;
        }
      } catch (err) {
        console.warn("No se pudo obtener el rol desde la tabla de usuarios:", err);
      }
    }

    if (!rolUsuario || rolUsuario === "authenticated") {
      rolUsuario = "Administrador";
    }

    // 3. Asignar los datos a la interfaz
    document.querySelectorAll("[data-user-name]").forEach(x => x.textContent = nombreUsuario);
    document.querySelectorAll("[data-user-role]").forEach(x => x.textContent = rolUsuario);
    document.querySelectorAll("[data-user-role-card]").forEach(x => x.textContent = rolUsuario);
    document.querySelectorAll("[data-user-email]").forEach(x => x.textContent = correoUsuario);

    // Cargar la configuración general
    await cargarConfiguracion();

    // Eventos
    el("btnGuardar")?.addEventListener("click", guardarConfiguracion);
    el("btnRestaurar")?.addEventListener("click", async () => {
      if (confirm("¿Deseas recargar la configuración guardada desde Supabase?")) {
        await cargarConfiguracion();
        toast("Configuración recargada.");
      }
    });

    el("btnExportar")?.addEventListener("click", exportarRespaldoLocal);
    el("btnImportar")?.addEventListener("click", () => el("archivoRespaldo")?.click());
    el("archivoRespaldo")?.addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (file) importarRespaldoLocal(file);
      e.target.value = "";
    });

    el("configForm")?.addEventListener("submit", e => e.preventDefault());

    document.querySelector("[data-menu-toggle]")?.addEventListener("click", () => {
      document.getElementById("sidebar")?.classList.toggle("open");
    });

    document.querySelector("[data-logout]")?.addEventListener("click", () => {
      window.SNICAuth.cerrarSesion();
    });
  }

  document.addEventListener("DOMContentLoaded", inicializar);
})(window);