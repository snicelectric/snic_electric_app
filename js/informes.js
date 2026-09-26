(() => {
  "use strict";

  // Cache de datos en memoria para los renderizados
  let data = {
    clientes: [],
    inspecciones: [],
    cotizaciones: [],
    ordenes: [],
    informes: [],
    facturas: [],
    productos: [],
    movimientos: []
  };

  document.addEventListener("DOMContentLoaded", init);

  function by(id) { return document.getElementById(id); }
  function money(n) { return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(n) || 0); }
  function num(n) { return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(Number(n) || 0); }
  function esc(v) { return String(v ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])); }
  
  function fecha(v) {
    if (!v) return "-";
    const s = String(v);
    if (s.includes("T")) {
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("es-CO");
    }
    const p = s.split("-");
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
  }

  function dateObj(v) {
    if (!v) return null;
    const d = new Date(String(v).includes("T") ? v : `${v}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function estado(v) {
    return ({
      borrador: "Borrador", enviada: "Enviada", aprobada: "Aprobada",
      rechazada: "Rechazada", vencida: "Vencida", pendiente: "Pendiente",
      programada: "Programada", ejecucion: "En ejecución", finalizada: "Finalizada",
      cancelada: "Cancelada", completada: "Completada", emitida: "Emitida",
      pagada: "Pagada", anulada: "Anulada"
    })[v] || v || "-";
  }

  function toast(msg, type = "success") {
    const t = by("toast"), i = by("toastIcon");
    if (!t) return;
    by("toastMessage").textContent = msg;
    i.className = type === "error" ? "fa-solid fa-circle-exclamation" : "fa-solid fa-circle-check";
    t.classList.toggle("error", type === "error");
    t.classList.add("show");
    clearTimeout(window.__infToast);
    window.__infToast = setTimeout(() => t.classList.remove("show"), 3200);
  }

  async function init() {
    if (!window.SNICAuth) { location.href = "../login.html"; return; }
    if (!SNICAuth.protegerPagina(SNICAuth.PERMISOS.INFORMES_VER)) return;

    mostrarUsuario();
    by("fechaReferencia").value = new Date().toISOString().slice(0, 10);

    ["tipoInforme", "periodoInforme", "fechaReferencia"].forEach(id => {
      by(id)?.addEventListener("change", render);
    });

    by("btnActualizar")?.addEventListener("click", async () => {
      await cargar();
      render();
      toast("Información actualizada.");
    });

    by("btnImprimir")?.addEventListener("click", imprimir);
    by("menuToggle")?.addEventListener("click", () => by("sidebar")?.classList.toggle("open"));
    document.querySelectorAll("[data-menu-toggle]").forEach(b => b.addEventListener("click", () => by("sidebar")?.classList.toggle("open")));
    document.querySelectorAll("[data-logout]").forEach(b => b.addEventListener("click", () => SNICAuth.cerrarSesion()));

    // Cargar datos desde Supabase e inicializar vista
    await cargar();
    render();
    SNICAuth.aplicarPermisos();
  }

  /**
   * Helper seguro para realizar consultas a Supabase
   */
  async function fetchTabla(client, tablaPrincipal, tablaFallback = null) {
    try {
      const { data: resData, error } = await client.from(tablaPrincipal).select("*");
      if (error) {
        if (tablaFallback) {
          const { data: resDataFB, error: errFB } = await client.from(tablaFallback).select("*");
          if (errFB) {
            console.warn(`Error leyendo tabla ${tablaPrincipal} y ${tablaFallback}:`, errFB);
            return [];
          }
          return resDataFB || [];
        }
        console.warn(`Error leyendo tabla ${tablaPrincipal}:`, error);
        return [];
      }
      return resData || [];
    } catch (err) {
      console.warn(`Excepción en fetchTabla (${tablaPrincipal}):`, err);
      return [];
    }
  }

  /**
   * Carga en paralelo todas las tablas necesarias directamente desde Supabase
   */
  async function cargar() {
    try {
      const client = window.supabaseClient;
      if (!client) {
        throw new Error("El cliente de Supabase no está inicializado.");
      }

      const [
        clientes,
        inspecciones,
        cotizaciones,
        ordenes,
        informes,
        facturas,
        productos,
        movimientos
      ] = await Promise.all([
        fetchTabla(client, "clientes"),
        fetchTabla(client, "inspecciones"),
        fetchTabla(client, "cotizaciones"),
        fetchTabla(client, "ordenes_servicio", "ordenes"),
        fetchTabla(client, "informes_obra", "informes_trabajo"),
        fetchTabla(client, "facturas"),
        fetchTabla(client, "productos"),
        fetchTabla(client, "movimientos_inventario", "movimientos")
      ]);

      data = {
        clientes,
        inspecciones,
        cotizaciones,
        ordenes,
        informes,
        facturas,
        productos,
        movimientos
      };
    } catch (err) {
      console.error("Error general en cargar():", err);
      toast("Error de conexión con la base de datos.", "error");
    }
  }

  function mostrarUsuario() {
    const u = SNICAuth.obtenerUsuarioActual?.();
    if (!u) return;
    document.querySelectorAll("[data-user-name]").forEach(e => e.textContent = u.nombre || u.email || "Usuario");
    document.querySelectorAll("[data-user-role]").forEach(e => e.textContent = (u.rol || "Usuario").charAt(0).toUpperCase() + (u.rol || "Usuario").slice(1));
  }

  function rango() {
    const modo = by("periodoInforme").value;
    if (modo === "todo") return { inicio: null, fin: null, texto: "Todo el historial" };
    const ref = dateObj(by("fechaReferencia").value) || new Date();
    if (modo === "mes") {
      const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const fin = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59);
      return { inicio, fin, texto: inicio.toLocaleDateString("es-CO", { month: "long", year: "numeric" }) };
    }
    const q = Math.floor(ref.getMonth() / 3);
    const inicio = new Date(ref.getFullYear(), q * 3, 1);
    const fin = new Date(ref.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
    return { inicio, fin, texto: `Trimestre ${q + 1} · ${ref.getFullYear()}` };
  }

  function enRango(v, r) {
    if (!r.inicio) return true;
    const d = dateObj(v);
    return d && d >= r.inicio && d <= r.fin;
  }

  function filtrar(arr, r) {
    return arr.filter(x => enRango(x.fecha || x.fecha_emision || x.created_at || x.creado_at || x.creadoAt, r));
  }

  function render() {
    const r = rango(), tipo = by("tipoInforme").value;
    by("periodoTexto").textContent = r.texto;
    by("badgePeriodo").textContent = by("periodoInforme").selectedOptions[0].text;
    by("tituloResumen").textContent = ({
      general: "Resumen general", comercial: "Informe comercial", operativo: "Informe operativo",
      financiero: "Informe financiero", inventario: "Informe de inventario"
    })[tipo];

    const clientes = filtrar(data.clientes, r), ins = filtrar(data.inspecciones, r), cot = filtrar(data.cotizaciones, r);
    const os = filtrar(data.ordenes, r), inf = filtrar(data.informes, r), fac = filtrar(data.facturas, r), mov = filtrar(data.movimientos, r);

    by("statClientes").textContent = clientes.length;
    by("statInspecciones").textContent = ins.length;
    by("statCotizaciones").textContent = cot.length;
    by("statFacturado").textContent = money(fac.filter(x => x.estado !== "anulada").reduce((s, x) => s + Number(x.total || 0), 0));

    renderSummary({ clientes, ins, cot, os, inf, fac, mov });
    renderBars({ cot, os, fac, ins });
    renderActivity({ cot, os, ins, inf, fac });
    renderInventory({ productos: data.productos, mov });
    renderRecent({ cot, os, ins, inf, fac });
  }

  function renderSummary(d) {
    const aprob = d.cot.filter(x => x.estado === "aprobada"), emit = d.fac.filter(x => x.estado === "emitida"), pag = d.fac.filter(x => x.estado === "pagada");
    const totalCot = d.cot.reduce((s, x) => s + Number(x.total || 0), 0);
    const totalFac = d.fac.filter(x => x.estado !== "anulada").reduce((s, x) => s + Number(x.total || 0), 0);
    const ordenFin = d.os.filter(x => x.estado === "finalizada").length;
    const trabajoFin = d.inf.filter(x => x.estado === "finalizado" || x.estado === "finalizada").length;

    const items = [
      ["Cotizaciones aprobadas", aprob.length], ["Valor cotizado", money(totalCot)],
      ["Órdenes finalizadas", ordenFin], ["Informes de obra", d.inf.length],
      ["Trabajos completados", trabajoFin], ["Facturas emitidas", emit.length],
      ["Facturas pagadas", pag.length], ["Valor facturado", money(totalFac)]
    ];
    by("summaryGrid").innerHTML = items.map(x => `<div class="summary-item"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong></div>`).join("");
  }

  function renderBars(d) {
    const items = [
      ["Cotizaciones aprobadas", d.cot.filter(x => x.estado === "aprobada").length, "yellow"],
      ["Órdenes finalizadas", d.os.filter(x => x.estado === "finalizada").length, "green"],
      ["Informes completados", d.ins.filter(x => x.estado === "completada").length, "blue"],
      ["Facturas pagadas", d.fac.filter(x => x.estado === "pagada").length, "orange"]
    ];
    const max = Math.max(1, ...items.map(x => x[1]));
    by("statusBars").innerHTML = items.map(x => `<div class="bar-row"><div class="bar-top"><span>${esc(x[0])}</span><strong>${x[1]}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(x[1] / max * 100)}%"></div></div></div>`).join("");
  }

  function renderActivity(d) {
    const rows = [
      ["Inspecciones", d.ins.length, "—", d.ins.filter(x => x.estado === "completada").length ? "Completadas" : "Sin completar"],
      ["Cotizaciones", d.cot.length, money(d.cot.reduce((s, x) => s + Number(x.total || 0), 0)), d.cot.filter(x => x.estado === "aprobada").length + " aprobadas"],
      ["Órdenes de servicio", d.os.length, money(d.os.reduce((s, x) => s + Number(x.total || 0), 0)), d.os.filter(x => x.estado === "finalizada").length + " finalizadas"],
      ["Informes de obra", d.inf.length, "—", d.inf.filter(x => x.estado === "finalizado" || x.estado === "finalizada").length + " finalizados"],
      ["Facturas", d.fac.length, money(d.fac.filter(x => x.estado !== "anulada").reduce((s, x) => s + Number(x.total || 0), 0)), d.fac.filter(x => x.estado === "pagada").length + " pagadas"]
    ];
    by("tablaActividad").innerHTML = rows.map(r => `<tr><td><strong>${esc(r[0])}</strong></td><td>${r[1]}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td></tr>`).join("");
  }

  function renderInventory(d) {
    const totalStock = d.productos.reduce((s, p) => s + Number(p.stock || 0), 0);
    const bajo = d.productos.filter(p => Number(p.stock) > 0 && Number(p.stock) <= Number(p.stock_minimo || p.stockMinimo || 0)).length;
    const agot = d.productos.filter(p => Number(p.stock) === 0).length;
    const entradas = d.mov.filter(m => m.tipo === "entrada").reduce((s, m) => s + Number(m.cantidad || 0), 0);
    const salidas = d.mov.filter(m => m.tipo === "salida").reduce((s, m) => s + Number(m.cantidad || 0), 0);
    const items = [["Productos registrados", d.productos.length], ["Existencias", num(totalStock)], ["Stock bajo", bajo], ["Agotados", agot], ["Entradas del periodo", num(entradas)], ["Salidas del periodo", num(salidas)]];
    by("inventarioResumen").innerHTML = items.map(x => `<div class="inventory-card"><div><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong></div><span class="inventory-value">${x[0].includes("periodo") ? "Control" : "Inventario"}</span></div>`).join("");
  }

  /**
   * Mapea el número o consecutivo visible del registro
   */
  function obtenerNumeroReferencia(item, prefijoDefault = "") {
    if (!item) return "-";
    const numRef = item.numero || item.numero_factura || item.numero_cotizacion || item.numero_orden || item.codigo || item.consecutivo || item.ref;
    if (numRef) return String(numRef);

    if (item.id) {
      const idStr = String(item.id);
      return idStr.length > 8 ? `${prefijoDefault}${idStr.slice(0, 8)}...` : `${prefijoDefault}${idStr}`;
    }
    return "-";
  }

  /**
   * Mapea dinámicamente el nombre del cliente, incluso si el objeto solo tiene cliente_id
   */
  function obtenerNombreCliente(item) {
    if (!item) return "Sin cliente";
    
    // 1. Si ya trae el nombre directamente
    const directo = item.cliente_nombre || item.clienteNombre || item.nombre_cliente || item.cliente;
    if (directo && typeof directo === "string") return directo;
    if (directo && typeof directo === "object" && directo.nombre) return directo.nombre;

    // 2. Si trae cliente_id o id_cliente, buscar en el array global de clientes
    const cId = item.cliente_id || item.clienteId || item.id_cliente;
    if (cId) {
      const clienteEncontrado = data.clientes.find(c => String(c.id) === String(cId));
      if (clienteEncontrado) {
        return clienteEncontrado.nombre || clienteEncontrado.nombre_completo || clienteEncontrado.razon_social || "Cliente sin nombre";
      }
    }

    return "Sin cliente";
  }

  function renderRecent(d) {
    const arr = [
      ...d.cot.map(x => ({ fecha: x.fecha || x.created_at, tipo: "Cotización", ref: obtenerNumeroReferencia(x, "COT-"), cliente: obtenerNombreCliente(x), valor: Number(x.total || 0), estado: x.estado })),
      ...d.os.map(x => ({ fecha: x.fecha || x.created_at, tipo: "Orden de servicio", ref: obtenerNumeroReferencia(x, "OS-"), cliente: obtenerNombreCliente(x), valor: Number(x.total || 0), estado: x.estado })),
      ...d.ins.map(x => ({ fecha: x.fecha || x.created_at, tipo: "Inspección", ref: obtenerNumeroReferencia(x, "INS-"), cliente: obtenerNombreCliente(x), valor: 0, estado: x.estado })),
      ...d.inf.map(x => ({ fecha: x.fecha || x.created_at, tipo: "Informe de obra", ref: obtenerNumeroReferencia(x, "INF-"), cliente: obtenerNombreCliente(x), valor: 0, estado: x.estado })),
      ...d.fac.map(x => ({ fecha: x.fecha || x.fecha_emision || x.created_at, tipo: "Factura", ref: obtenerNumeroReferencia(x, "FAC-"), cliente: obtenerNombreCliente(x), valor: Number(x.total || 0), estado: x.estado }))
    ].sort((a, b) => (dateObj(b.fecha) || 0) - (dateObj(a.fecha) || 0)).slice(0, 15);

    const tb = by("tablaRecientes"), empty = by("emptyRecientes");
    tb.innerHTML = arr.map(x => `<tr><td>${esc(fecha(x.fecha))}</td><td><strong>${esc(x.tipo)}</strong></td><td>${esc(x.ref)}</td><td>${esc(x.cliente)}</td><td>${x.valor ? esc(money(x.valor)) : "—"}</td><td><span class="status-pill ${claseEstado(x.estado)}">${esc(estado(x.estado))}</span></td></tr>`).join("");
    empty.hidden = arr.length !== 0;
    tb.closest("table").style.display = arr.length ? "table" : "none";
  }

  function claseEstado(v) {
    if (["aprobada", "finalizada", "completada", "pagada"].includes(v)) return "status-green";
    if (["enviada", "emitida", "programada"].includes(v)) return "status-blue";
    if (["rechazada", "cancelada", "anulada"].includes(v)) return "status-red";
    if (["borrador", "pendiente"].includes(v)) return "status-gray";
    return "status-yellow";
  }

  function imprimir() {
    const tipo = by("tipoInforme").selectedOptions[0].text;
    const periodo = by("periodoTexto").textContent;
    const logo = new URL("../img/logo.png", location.href).href;
    const resumen = by("summaryGrid").innerHTML;
    const actividad = by("tablaActividad").innerHTML;
    const inventario = by("inventarioResumen").innerHTML;

    const w = window.open("", "_blank", "width=1100,height=800");
    if (!w) { toast("El navegador bloqueó la ventana de impresión.", "error"); return; }

    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe SNIC'ELECTRIC</title>
 <style>
 *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#183252;margin:0;padding:28px;background:#fff}
 .head{display:flex;justify-content:space-between;border-bottom:3px solid #fbb900;padding-bottom:15px}.brand{display:flex;gap:12px;align-items:center}.brand img{width:62px;height:62px;object-fit:contain}.brand h1{margin:0;color:#0b2f67;font-size:21px}.brand p{margin:5px 0 0;font-size:9px;color:#718096}.code{text-align:right}.code .label{color:#bd8300;font-weight:bold;font-size:10px;letter-spacing:1px}.code h2{margin:6px 0;font-size:18px;color:#0b2f67}.code div:last-child{font-size:10px;color:#68778b}
 h2{color:#0b2f67;margin:24px 0 5px}.sub{font-size:10px;color:#6f7c8f;margin-bottom:14px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.card{border:1px solid #dce4ee;border-radius:7px;padding:12px}.card span{display:block;font-size:9px;color:#7b8798}.card strong{display:block;margin-top:6px;color:#0b2f67;font-size:15px}.section{margin-top:22px}.section h3{font-size:12px;color:#0b2f67;border-bottom:1px solid #dce4ee;padding-bottom:7px}.activity{width:100%;border-collapse:collapse;font-size:9px}.activity th{background:#0b2f67;color:#fff;text-align:left;padding:7px}.activity td{border-bottom:1px solid #e5e9ef;padding:7px}.inv{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.inv .card{padding:9px}.footer{margin-top:30px;padding-top:10px;border-top:1px solid #dce4ee;font-size:8px;color:#7b8798;text-align:center}
 @media print{.toolbar{display:none}}button{background:#fbb900;border:0;padding:10px 15px;border-radius:6px;font-weight:bold;cursor:pointer}.toolbar{text-align:right;margin-bottom:10px}
 </style></head><body>
 <div class="toolbar"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
 <div class="head"><div class="brand"><img src="${logo}"><div><h1>SNIC'ELECTRIC</h1><p>MANTENIMIENTO ELÉCTRICO RESIDENCIAL</p></div></div><div class="code"><div class="label">INFORME DE GESTIÓN</div><h2>${esc(tipo)}</h2><div>Periodo: ${esc(periodo)}</div></div></div>
 <h2>${esc(tipo)}</h2><div class="sub">Resumen generado a partir de los registros disponibles en el sistema.</div>
 <div class="grid">${resumen.replaceAll('summary-item', 'card')}</div>
 <div class="section"><h3>ACTIVIDAD DEL PERIODO</h3><table class="activity"><thead><tr><th>TIPO</th><th>CANTIDAD</th><th>VALOR</th><th>ESTADO DESTACADO</th></tr></thead><tbody>${actividad}</tbody></table></div>
 <div class="section"><h3>INVENTARIO</h3><div class="inv">${inventario}</div></div>
 <div class="footer">SNIC'ELECTRIC · Informe generado el ${new Date().toLocaleString("es-CO")}</div>
 <script>addEventListener("load",()=>setTimeout(()=>print(),350))<\/script></body></html>`);
    w.document.close();
  }
})();