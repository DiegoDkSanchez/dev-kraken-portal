const catalog = window.DEV_KRAKEN_CATALOG;
if (catalog) {
  const servicesContainer = document.querySelector('[data-services]');
  const demosContainer = document.querySelector('[data-demos]');
  // Contenido editorial local; no se interpola información enviada por visitantes.
  if (servicesContainer) servicesContainer.innerHTML = catalog.services.map(service => `
    <article class="solution-card">
      <div class="solution-meta"><span>${service.number}</span><span class="service-icon" aria-hidden="true">${service.icon}</span></div>
      <h3>${service.name}</h3><p>${service.description}</p>
      <ul>${service.capabilities.slice(0, 3).map(capability => `<li>${capability}</li>`).join('')}</ul>
      <details><summary>Más capacidades</summary><ul>${service.capabilities.slice(3).map(capability => `<li>${capability}</li>`).join('')}</ul></details>
      <a class="btn btn-secondary" href="#contacto" data-consultation-trigger data-source="services" data-service="${service.id}">Consultar solución<span class="visually-hidden">: ${service.name}</span> ↗</a>
    </article>`).join('');
  if (demosContainer) demosContainer.innerHTML = catalog.demos.map(demo => `
    <article class="demo-card"><p class="eyebrow">Próximamente · Acceso bajo solicitud</p>
      <h3>${demo.name}</h3><p>${demo.description}</p>
      <p class="demo-features-label">Alcance previsto</p><ul>${demo.features.map(feature => `<li>${feature}</li>`).join('')}</ul>
      <p class="demo-availability">Todavía no disponible. Registra tu interés para solicitar acceso cuando esté habilitada.</p>
      <a class="btn btn-primary" href="#contacto" data-consultation-trigger data-source="demo" data-demo="${demo.id}">Probar demo<span class="visually-hidden">: ${demo.name}</span> ↗</a>
    </article>`).join('');
}

const header = document.querySelector("[data-header]");

if (header) {
  let wasScrolled;
  const syncHeaderState = () => {
    const isScrolled = window.scrollY > 12;
    if (isScrolled === wasScrolled) return;
    header.classList.toggle("is-scrolled", isScrolled);
    wasScrolled = isScrolled;
  };
  syncHeaderState();
  window.addEventListener("scroll", syncHeaderState, { passive: true });
}

// This short statement uses measured visual lines, not animated individual words.
const manifesto = document.querySelector("[data-manifesto]");
if (manifesto && "IntersectionObserver" in window && "ResizeObserver" in window) {
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const prepareManifesto = () => {
    if (motionPreference.matches || manifesto.getBoundingClientRect().top < window.innerHeight) return;

    const section = manifesto.closest(".manifesto");
    const text = manifesto.textContent;
    const textNode = manifesto.firstChild;
    const range = document.createRange();
    const lines = [];
    let previousTop;

    // Read the browser's existing line breaks before making any DOM changes.
    for (const match of text.matchAll(/\S+/g)) {
      range.setStart(textNode, match.index);
      range.setEnd(textNode, match.index + match[0].length);
      const top = range.getBoundingClientRect().top;
      if (previousTop === undefined || Math.abs(top - previousTop) > 1) {
        lines.push(match.index);
        previousTop = top;
      }
    }
    if (!lines.length) return;
    const width = manifesto.getBoundingClientRect().width;
    const fragment = document.createDocumentFragment();
    const readable = document.createElement("span");
    readable.className = "manifesto-readable";
    readable.textContent = text;
    fragment.append(readable);
    lines.forEach((start, index) => {
      const mask = document.createElement("span");
      mask.className = "manifesto-line";
      mask.setAttribute("aria-hidden", "true");
      const line = document.createElement("span");
      line.textContent = text.slice(start, lines[index + 1] ?? text.length).trimEnd();
      line.style.setProperty("--line-index", index);
      mask.append(line);
      fragment.append(mask);
    });

    const finish = () => {
      observer.disconnect();
      resizeObserver.disconnect();
      motionPreference.removeEventListener("change", onMotionChange);
      manifesto.removeEventListener("animationend", onAnimationEnd);
      section.classList.remove("is-prepared", "is-revealing");
      manifesto.textContent = text;
    };
    const onMotionChange = (event) => { if (event.matches) finish(); };
    const onAnimationEnd = (event) => {
      if (event.animationName === "manifestoLineIn" && event.target === manifesto.lastElementChild.firstElementChild) finish();
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
          section.classList.add("is-revealing");
        } else if (!entry.isIntersecting && section.classList.contains("is-revealing")) {
          finish(); // Fast scrolling should not leave line animations running offscreen.
        }
      });
    }, { threshold: [0, 0.25], rootMargin: "0px 0px -24px 0px" });
    // A resize during the short reveal prioritizes readable natural wrapping.
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.some((entry) => Math.abs(entry.contentRect.width - width) > 1)) finish();
    });

    section.classList.add("is-prepared");
    manifesto.replaceChildren(fragment);
    manifesto.addEventListener("animationend", onAnimationEnd);
    motionPreference.addEventListener("change", onMotionChange);
    resizeObserver.observe(manifesto);
    observer.observe(manifesto);
  };
  if (document.fonts) document.fonts.ready.then(prepareManifesto);
  else prepareManifesto();
}

const revealElements = document.querySelectorAll("[data-reveal]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (revealElements.length && !reducedMotion.matches && "IntersectionObserver" in window) {
  const pending = new Set();
  const reveal = (element) => {
    element.classList.remove("reveal-pending");
    observer.unobserve(element);
    pending.delete(element);
    if (!pending.size) {
      observer.disconnect();
      document.removeEventListener("focusin", onFocus);
      reducedMotion.removeEventListener("change", onMotionChange);
    }
  };
  const onFocus = (event) => {
    const group = event.target.closest("[data-reveal]");
    if (group && pending.has(group)) reveal(group);
  };
  const onMotionChange = (event) => {
    if (event.matches) pending.forEach(reveal);
  };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) reveal(entry.target);
    });
  }, { threshold: 0, rootMargin: "0px 0px -24px 0px" });

  // Batch measurements before writes. Already-visible content never starts hidden.
  const belowViewport = Array.from(revealElements).filter(
    (element) => element.getBoundingClientRect().top >= window.innerHeight
  );
  belowViewport.forEach((element) => {
    pending.add(element);
    element.classList.add("reveal-ready", "reveal-pending");
    observer.observe(element);
  });
  if (pending.size) {
    document.addEventListener("focusin", onFocus);
    reducedMotion.addEventListener("change", onMotionChange);
  } else {
    observer.disconnect();
  }
}

const consultationModal = document.querySelector('[data-consultation-modal]');
if (consultationModal && catalog) {
  const form = consultationModal.querySelector('form');
  const steps = [...form.querySelectorAll('[data-step]')];
  const title = consultationModal.querySelector('[data-step-title]');
  const subtitle = consultationModal.querySelector('[data-step-subtitle]');
  const error = form.querySelector('[data-form-error]');
  const confirmation = form.querySelector('[data-confirmation]');
  const submit = form.querySelector('[type="submit"]');
  const contact = window.DEV_KRAKEN_CONTACT;
  const serviceSelect = form.elements.serviceId;
  const demoSelect = form.elements.demoId;
  const demoRequested = form.elements.demoRequested;
  const fallback = form.querySelector('[data-email-fallback]');
  const background = [...document.querySelectorAll('body > header, body > main, body > footer, body > .skip-link')];
  let currentStep = 1;
  let selectedNeed = '';
  let source = 'contact';
  let lastFocused;
  let sending = false;
  let controller;
  let requestGeneration = 0;
  const copy = [
    ['Tu desafío empresarial', '¿Qué desafío quieres resolver?', 'Cuéntanos qué necesita mejorar tu empresa para ayudarte a encontrar la solución adecuada.'],
    ['Información empresarial', 'Conozcamos un poco más de tu empresa.', 'Comparte tus datos y el contexto de tu necesidad.'],
    ['Confirmación y preferencias', 'Estamos listos para conocer tu proyecto.', 'Revisa tu información antes de enviar la solicitud.']
  ];
  const options = form.querySelector('[data-service-options]');
  options.innerHTML = [...catalog.services].sort((a,b) => ['automation','enterprise-software','integrations','cloud','consulting','support'].indexOf(a.id) - ['automation','enterprise-software','integrations','cloud','consulting','support'].indexOf(b.id)).map(s => `<button type="button" class="consultation-option" data-service-need="${s.id}" aria-pressed="false"><strong>${s.need}</strong><span aria-hidden="true">↗</span></button>`).join('') + '<button type="button" class="consultation-option" data-service-need="demo" aria-pressed="false"><strong>Quiero probar una demostración</strong><span aria-hidden="true">↗</span></button>';
  serviceSelect.innerHTML = '<option value="">Solo una demostración</option>' + catalog.services.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  demoSelect.innerHTML += catalog.demos.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  const setError = message => { error.textContent = message; error.hidden = !message; };
  const syncSelection = () => options.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.serviceNeed === selectedNeed)));
  const payload = () => ({
    fullName: form.elements.fullName.value.trim(), email: form.elements.email.value.trim(),
    company: form.elements.company.value.trim(), phone: form.elements.phone.value.trim() || null,
    industry: form.elements.industry.value || null, companySize: form.elements.companySize.value || null,
    serviceId: serviceSelect.value || 'demo', description: form.elements.description.value.trim() || null,
    demoRequested: demoRequested.checked, demoId: demoRequested.checked ? demoSelect.value || null : null, source
  });
  const syncDemo = () => {
    form.querySelector('[data-demo-choice]').hidden = !demoRequested.checked;
    form.querySelector('[data-demo-notice]').hidden = !demoRequested.checked;
    demoSelect.required = demoRequested.checked;
  };
  const updateFallback = () => {
    const data = payload();
    const service = catalog.services.find(s => s.id === data.serviceId)?.name || 'Demostración';
    const demo = catalog.demos.find(d => d.id === data.demoId)?.name || 'No solicitada';
    const body = `Nombre: ${data.fullName}\nCorreo: ${data.email}\nEmpresa: ${data.company}\nTeléfono: ${data.phone || '—'}\nSector: ${data.industry || '—'}\nTamaño: ${data.companySize || '—'}\nServicio: ${service} (${data.serviceId})\nNecesidad: ${data.description || '—'}\nDemo: ${demo}\nOrigen: ${data.source}`;
    fallback.href = `mailto:diegodksanchez@gmail.com?subject=${encodeURIComponent('Solicitud empresarial — DEV KRAKEN')}&body=${encodeURIComponent(body)}`;
  };
  const showStep = step => {
    currentStep = step;
    setError('');
    steps.forEach(item => { item.hidden = Number(item.dataset.step) !== step; });
    [consultationModal.querySelector('[data-step-kicker]').textContent, title.textContent, subtitle.textContent] = copy[step - 1];
    consultationModal.querySelector('[data-progress-label]').textContent = `${step} de 3`;
    consultationModal.querySelector('[data-progress-bar]').style.width = `${step / 3 * 100}%`;
    if (step === 3) {
      const data = payload();
      const summary = form.querySelector('[data-summary]');
      summary.replaceChildren();
      for (const [label, value] of [['Solución', catalog.services.find(s => s.id === data.serviceId)?.name || 'Solicitud de demostración'], ['Contacto', `${data.fullName} · ${data.email}`], ['Empresa', data.company], ['Necesidad', data.description || 'Sin descripción adicional']]) {
        const term = document.createElement('dt'); term.textContent = label;
        const detail = document.createElement('dd'); detail.textContent = value;
        summary.append(term, detail);
      }
      syncDemo(); updateFallback();
      form.querySelector('[data-integration-notice]').hidden = Boolean(contact.endpoint);
      fallback.hidden = Boolean(contact.endpoint);
      submit.disabled = !contact.endpoint;
    }
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
    consultationModal.querySelector('.consultation-panel').scrollTop = 0;
  };
  const validateBusiness = () => {
    for (const name of ['fullName','email','company']) {
      const field = form.elements[name];
      field.value = field.value.trim();
    }
    const invalid = [...steps[1].querySelectorAll('input, select, textarea')].find(field => !field.checkValidity());
    if (invalid) { showStep(2); invalid.reportValidity(); return false; }
    if (!serviceSelect.value && !demoRequested.checked) {
      showStep(2); setError('Selecciona un servicio o solicita una demostración desde el primer paso.'); serviceSelect.focus(); return false;
    }
    return true;
  };
  const setSending = value => {
    sending = value;
    form.setAttribute('aria-busy', String(value));
    form.querySelector('[data-submit-label]').hidden = value;
    form.querySelector('[data-submit-loading]').hidden = !value;
    form.querySelectorAll('button, input, select, textarea').forEach(control => { control.disabled = value; });
    submit.disabled = value || !contact.endpoint;
    fallback.hidden = value || Boolean(contact.endpoint);
  };
  const close = () => {
    requestGeneration++;
    controller?.abort();
    consultationModal.hidden = true;
    document.body.classList.remove('modal-open');
    background.forEach(element => { element.inert = false; });
    setSending(false);
    form.reset();
    selectedNeed = '';
    confirmation.hidden = true;
    lastFocused?.focus({ preventScroll: true });
  };
  document.querySelectorAll('[data-consultation-trigger]').forEach(trigger => trigger.addEventListener('click', event => {
    event.preventDefault(); lastFocused = trigger;
    source = trigger.dataset.source || 'contact';
    selectedNeed = trigger.dataset.demo ? 'demo' : trigger.dataset.service || '';
    serviceSelect.value = trigger.dataset.service || '';
    demoRequested.checked = Boolean(trigger.dataset.demo);
    demoSelect.value = trigger.dataset.demo || '';
    syncSelection(); syncDemo();
    consultationModal.hidden = false;
    document.body.classList.add('modal-open');
    background.forEach(element => { element.inert = true; });
    showStep(1);
  }));
  consultationModal.querySelectorAll('[data-consultation-close]').forEach(button => button.addEventListener('click', close));
  options.addEventListener('click', event => {
    const option = event.target.closest('[data-service-need]');
    if (!option) return;
    selectedNeed = option.dataset.serviceNeed;
    serviceSelect.value = selectedNeed === 'demo' ? '' : selectedNeed;
    demoRequested.checked = selectedNeed === 'demo';
    syncSelection(); syncDemo(); setError('');
  });
  serviceSelect.addEventListener('change', () => {
    selectedNeed = serviceSelect.value || 'demo';
    if (!serviceSelect.value) demoRequested.checked = true;
    syncSelection(); syncDemo();
  });
  form.querySelectorAll('[data-next]').forEach(button => button.addEventListener('click', () => {
    if (currentStep === 1 && !selectedNeed) { setError('Selecciona el desafío que quieres resolver.'); return; }
    if (currentStep === 2 && !validateBusiness()) return;
    showStep(currentStep + 1);
  }));
  form.querySelectorAll('[data-consultation-back]').forEach(button => button.addEventListener('click', () => showStep(currentStep - 1)));
  demoRequested.addEventListener('change', () => { syncDemo(); updateFallback(); });
  demoSelect.addEventListener('change', updateFallback);
  fallback.addEventListener('click', event => {
    if (!validateBusiness() || (demoRequested.checked && !demoSelect.reportValidity())) event.preventDefault();
    else updateFallback();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    if (currentStep < 3) { form.querySelector(`[data-step="${currentStep}"] [data-next]`).click(); return; }
    if (!validateBusiness() || (demoRequested.checked && !demoSelect.reportValidity())) return;
    if (!contact.endpoint) { setError('El envío en línea todavía no está configurado. Usa la opción de correo.'); return; }
    const data = payload();
    setError(''); setSending(true);
    controller = new AbortController();
    const generation = ++requestGeneration;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      await contact.submit(data, controller.signal);
      if (generation !== requestGeneration) return;
      steps.forEach(step => { step.hidden = true; });
      confirmation.hidden = false;
      form.querySelector('[data-access-status]').hidden = !data.demoRequested;
      title.textContent = 'Solicitud recibida';
      subtitle.textContent = 'Gracias por compartir las necesidades de tu empresa.';
      confirmation.focus();
    } catch {
      if (generation === requestGeneration) setError('No pudimos enviar tu solicitud. Inténtalo nuevamente.');
    } finally {
      clearTimeout(timeout);
      if (generation === requestGeneration) setSending(false);
    }
  });
  document.addEventListener('keydown', event => {
    if (consultationModal.hidden) return;
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      const focusable = [...consultationModal.querySelectorAll('button, input, select, textarea, a[href]')].filter(element => !element.disabled && !element.closest('[hidden]'));
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
  });
}
