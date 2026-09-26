/* =========================================================
   SNIC'ELECTRIC - LOGIN CON SUPABASE AUTH
========================================================= */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", iniciarLogin);

  function iniciarLogin() {
    const formulario = document.getElementById("loginForm");
    if (!formulario) return;

    if (!window.supabaseClient) {
      mostrarMensaje("No se pudo conectar con Supabase. Verifica la configuración.", "error");
      return;
    }

    formulario.addEventListener("submit", procesarLogin);
    configurarMostrarPassword();

    // Recuperar una sesión existente solo si Supabase confirma que sigue activa.
    // El logout V3 espera signOut antes de redirigir, evitando el rebote al Dashboard.
    window.supabaseClient.auth.getSession().then(async ({ data }) => {
      if (!data?.session?.user) return;

      try {
        const usuario = await cargarPerfilYCrearSesion(data.session.user, false);
        if (usuario) {
          window.location.replace("dashboard.html");
        }
      } catch (error) {
        console.warn("Sesión Supabase existente sin perfil válido:", error);
        try {
          await window.supabaseClient.auth.signOut({ scope: "local" });
        } catch (_) {}
      }
    });
  }

  async function procesarLogin(event) {
    event.preventDefault();

    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const recordarInput = document.getElementById("remember");
    const boton = event.submitter || document.querySelector("#loginForm button[type=submit]");

    const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
    const password = passwordInput ? passwordInput.value : "";
    const recordar = recordarInput ? recordarInput.checked : false;

    if (!email) return mostrarMensaje("Ingresa tu correo electrónico.", "error");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return mostrarMensaje("Ingresa un correo electrónico válido.", "error");
    if (!password) return mostrarMensaje("Ingresa tu contraseña.", "error");

    if (!window.supabaseClient) {
      return mostrarMensaje("Supabase no está disponible. Recarga la página.", "error");
    }

    if (boton) {
      boton.disabled = true;
      boton.dataset.originalText = boton.textContent;
      boton.textContent = "Ingresando...";
    }

    try {
      const { data, error } = await window.supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      if (!data || !data.user) throw new Error("Supabase no devolvió el usuario autenticado.");

      const usuario = await cargarPerfilYCrearSesion(data.user, recordar);

      if (!usuario) throw new Error("El usuario autenticó correctamente, pero no tiene un perfil en SNIC'ELECTRIC.");

      mostrarMensaje("Inicio de sesión correcto. Redirigiendo...", "success");

      setTimeout(() => { window.location.replace("dashboard.html"); }, 350);
    } catch (error) {
      console.error("SNIC'ELECTRIC - Error de login Supabase:", error);
      try { await window.supabaseClient.auth.signOut(); } catch (_) {}

      let mensaje = "No fue posible iniciar sesión.";
      const code = String(error?.code || "");
      const msg = String(error?.message || "");

      if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) {
        mensaje = "El correo o la contraseña son incorrectos.";
      } else if (/email not confirmed/i.test(msg)) {
        mensaje = "El correo del usuario todavía no está confirmado en Supabase.";
      } else if (/perfil/i.test(msg)) {
        mensaje = msg;
      } else if (msg) {
        mensaje = msg;
      }

      mostrarMensaje(mensaje, "error");
    } finally {
      if (boton) {
        boton.disabled = false;
        boton.textContent = boton.dataset.originalText || "Ingresar";
      }
    }
  }

  async function cargarPerfilYCrearSesion(authUser, recordar = false) {
    const usuario = await window.SNICAuth.cargarPerfilDesdeSupabase(authUser);
    if (!usuario) return null;

    if (!window.SNICAuth.iniciarSesion(usuario, false)) {
      throw new Error("No fue posible establecer la sesión en memoria de SNIC'ELECTRIC.");
    }

    return usuario;
  }

  function configurarMostrarPassword() {
    const passwordInput = document.getElementById("password");
    if (!passwordInput) return;
    document.querySelectorAll("[data-toggle-password], .toggle-password, #togglePassword").forEach(boton => {
      boton.addEventListener("click", function () {
        const visible = passwordInput.type === "text";
        passwordInput.type = visible ? "password" : "text";
        const icono = boton.querySelector("i");
        if (icono) {
          icono.classList.toggle("fa-eye", visible);
          icono.classList.toggle("fa-eye-slash", !visible);
        }
      });
    });
  }

  function mostrarMensaje(mensaje, tipo = "error") {
    const contenedor = document.getElementById("loginMessage") || document.getElementById("mensaje");
    if (contenedor) {
      contenedor.textContent = mensaje;
      contenedor.className = contenedor.id === "loginMessage" ? "login-message " + tipo : "mensaje " + tipo;
      contenedor.style.display = "block";
      return;
    }
    alert(mensaje);
  }
})();
