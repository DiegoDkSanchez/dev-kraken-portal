// Configurar únicamente cuando exista un receptor real compatible con este contrato.
// No hay proveedor de envío ni servidor de demos en este repositorio.
window.DEV_KRAKEN_CONTACT = {
  endpoint: "",
  async submit(payload, signal) {
    if (!this.endpoint) throw new Error("CONTACT_NOT_CONFIGURED");
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal
    });
    if (!response.ok) throw new Error("CONTACT_FAILED");
    const result = await response.json();
    // El receptor solo confirma accepted después de validar y registrar la solicitud.
    if (result.accepted !== true) throw new Error("CONTACT_NOT_ACCEPTED");
    return result;
  }
};
