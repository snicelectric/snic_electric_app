/* SNIC'ELECTRIC - Recuperación segura de contraseña con Supabase Auth */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const form = document.getElementById("recoveryForm");
    if (!form || !window.supabaseClient?.auth) {
      show("No se pudo inicializar la recuperación. Recarga la página e inténtalo nuevamente.", "error");
      return;
    }

    // Supabase procesa el enlace de recuperación y deja una sesión temporal.
    // Esperamos a que termine el intercambio/restauración antes de permitir el cambio.
    try {
      const { data, error } = await window.supabaseClient.auth.getSession();
      if (error) throw error;

      if (!data?.session?.user) {
        show("El enlace de recuperación no es válido, ha expirado o ya fue utilizado. Solicita un nuevo enlace.", "error");
        form.style.display = "none";
        return;
      }
    } catch (error) {
      console.error("SNIC'ELECTRIC - Error validando recuperación:", error);
      show("No se pudo validar el enlace de recuperación. Solicita uno nuevo.", "error");
      form.style.display = "none";
      return;
    }

    form.addEventListener("submit", updatePassword);
  }

  async function updatePassword(event) {
    event.preventDefault();

    const pass1 = document.getElementById("newPassword")?.value || "";
    const pass2 = document.getElementById("confirmPassword")?.value || "";
    const button = document.getElementById("savePasswordButton");

    if (pass1.length < 8) return show("La contraseña debe tener al menos 8 caracteres.", "error");
    if (pass1 !== pass2) return show("Las contraseñas no coinciden.", "error");

    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Actualizando...';

    try {
      const { error } = await window.supabaseClient.auth.updateUser({ password: pass1 });
      if (error) throw error;

      show("Contraseña actualizada correctamente. Ya puedes iniciar sesión con tu nueva contraseña.", "success");
      document.getElementById("recoveryForm").reset();

      // Cerramos la sesión de recuperación después de actualizar la contraseña.
      await window.supabaseClient.auth.signOut({ scope: "local" });

      setTimeout(() => {
        window.location.replace("login.html");
      }, 1800);
    } catch (error) {
      console.error("SNIC'ELECTRIC - Error actualizando contraseña:", error);
      show(error?.message || "No fue posible actualizar la contraseña.", "error");
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="fa-solid fa-key"></i> Actualizar contraseña';
    }
  }

  function show(message, type) {
    const box = document.getElementById("recoveryMessage");
    if (!box) return;
    box.textContent = message;
    box.className = "recovery-message " + type;
  }
})();
